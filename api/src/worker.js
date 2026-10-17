/*
 * Warframe Damage Calc API (Cloudflare Worker + D1)
 *
 * Auth:   GET  /auth/discord/login      -> redirect to Discord
 *         GET  /auth/discord/callback   -> sets session cookie, redirects back to the site
 *         POST /auth/logout
 * User:   GET  /me                      -> { user } or 401 (user.twitch when a Twitch account is linked)
 *         DELETE /me                    -> deletes the account and everything stored for it
 * Twitch: GET  /auth/twitch/link        -> (signed in) redirect to Twitch to link a channel
 *         GET  /auth/twitch/callback    -> stores the Twitch ID, login, display name and avatar, redirects back
 *         PATCH /me/twitch              -> body { public } show/hide the channel on your public builds
 *         DELETE /me/twitch             -> unlink
 * Builds: GET  /builds                  -> { builds: [{ name, data, updatedAt }] }
 *         PUT  /builds/:name            -> body { data }
 *         DELETE /builds/:name
 * Owned:  GET  /owned                   -> { mods: [...] }
 *         PUT  /owned                   -> body { mods: [...] }
 * Shares: POST /shares                  -> body { data, public?, title?, meta? { image, dps, summary } } -> { id }
 *         GET  /s/:id                   -> HTML page with Discord/Open Graph preview tags, redirects to the site
 *         GET  /public?sort=top|new&weapon=  -> community (public) builds
 *         POST /shares/:id/like         -> toggle like
 *         POST /shares/:id/report       -> report (3 reports hide a build)
 *         PATCH /shares/:id             -> body { public?, title? }
 * Market: GET  /market/price?names=A,B&refs=/Lotus/...  -> plat prices from warframe.market (public, cached)
 * Admin:  GET /admin/reports, DELETE /admin/shares/:id   (Discord IDs listed in ADMIN_IDS)
 *         GET  /shares/:id              -> { data, createdAt }   (public, no login)
 *         GET  /shares                  -> list of your shares
 *         DELETE /shares/:id
 *
 * Security notes
 * - Session token: 32 random bytes in an HttpOnly, Secure, SameSite=Lax cookie; only its SHA-256 hash is stored.
 * - OAuth "state" is checked against a short-lived HttpOnly cookie (CSRF protection on login).
 * - Writes require the request Origin to be the site (or the desktop app header with no Origin) and a JSON body.
 * - Discord scope is "identify" only: Discord ID, username, avatar. No email.
 * - Twitch linking asks for no scopes (public profile only). The user token is used once to read the profile
 *   and then revoked; only an app token (client credentials) is kept in memory to check who is live.
 */

const SESSION_COOKIE = 'wf_session';
const STATE_COOKIE = 'wf_oauth_state';
const TWITCH_STATE_COOKIE = 'wf_twitch_state';
const LIVE_TTL = 120;   // seconds between Twitch live checks per channel
const SESSION_DAYS = 30;
const MAX_BODY = 64 * 1024;
const MAX_BUILDS = 300;
const MAX_SHARES = 200;
const MAX_OWNED = 3000;
const REPORTS_TO_HIDE = 3;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = allowedOrigins(env);
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const res = await route(request, env, url, origin, allowed);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      res.headers.set('X-Content-Type-Options', 'nosniff');
      res.headers.set('Cache-Control', res.headers.get('Cache-Control') || 'no-store');
      return res;
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err && err.stack || err);
      return json({ error: status === 500 ? 'Server error' : err.message }, status, cors);
    }
  }
};

// ---------------- routing ----------------
async function route(request, env, url, origin, allowed) {
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;

  if (p === '/' || p === '/health') return json({ ok: true, service: 'warframe-calc-api' });

  if (p === '/auth/discord/login' && m === 'GET') return discordLogin(env, url);
  if (p === '/market/price' && m === 'GET') return marketPrices(env, url);
  if (p === '/auth/discord/callback' && m === 'GET') return discordCallback(request, env, url);

  // public share read
  let mm = p.match(/^\/shares\/([A-Za-z0-9]{6,16})$/);
  if (mm && m === 'GET') {
    const row = await env.DB.prepare('SELECT data, created_at FROM shares WHERE id = ?').bind(mm[1]).first();
    if (!row) throw httpError(404, 'Share not found');
    return json({ data: JSON.parse(row.data), createdAt: row.created_at }, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  // link preview page for Discord / social apps
  mm = p.match(/^\/s\/([A-Za-z0-9]{6,16})$/);
  if (mm && m === 'GET') return sharePreview(env, mm[1]);

  // community builds (public); shows whether the current user liked each one when signed in
  if (p === '/public' && m === 'GET') {
    const viewer = await currentUser(request, env);
    const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';
    const weapon = (url.searchParams.get('weapon') || '').slice(0, 60);
    const offset = Math.max(0, Math.min(1000, parseInt(url.searchParams.get('offset') || '0', 10) || 0));
    const where = ['sm.public = 1', 'sm.hidden = 0'];
    const binds = [];
    if (weapon) { where.push('sm.weapon LIKE ?'); binds.push('%' + weapon.replace(/[%_]/g, '') + '%'); }
    const order = sort === 'new' ? 's.created_at DESC' : 'likes DESC, s.created_at DESC';
    const sql = `SELECT s.id, s.created_at, sm.title, sm.weapon, sm.image, sm.dps, sm.summary,
        tl.twitch_id, tl.login AS tw_login, tl.display_name AS tw_name, tl.live AS tw_live, tl.live_game AS tw_game, tl.live_checked AS tw_checked,
        (SELECT COUNT(*) FROM likes l WHERE l.share_id = s.id) AS likes
        ${viewer ? ', EXISTS(SELECT 1 FROM likes l2 WHERE l2.share_id = s.id AND l2.user_id = ?) AS liked' : ''}
      FROM shares s JOIN share_meta sm ON sm.id = s.id LEFT JOIN twitch_links tl ON tl.user_id = s.user_id AND tl.public = 1
      WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 50 OFFSET ?`;
    const args = (viewer ? [viewer.id] : []).concat(binds, [offset]);
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    const live = await refreshLive(env, results.filter(r => r.twitch_id && now() - r.tw_checked > LIVE_TTL).map(r => r.twitch_id));
    return json({ builds: results.map(r => ({ id: r.id, title: r.title, weapon: r.weapon, image: r.image, dps: r.dps, summary: r.summary, likes: r.likes, liked: !!r.liked, createdAt: r.created_at,
      twitch: r.twitch_id ? twitchPublic(r, live) : null })) });
  }

  // everything below needs a session; writes also need a trusted Origin + JSON
  if (m !== 'GET') requireTrustedWrite(request, origin, allowed);
  const user = await currentUser(request, env);

  if (p === '/auth/logout' && m === 'POST') {
    if (user) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.tokenHash).run();
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(SESSION_COOKIE, env) });
  }

  if (p === '/auth/twitch/link' && m === 'GET') return twitchLink(env, url, user);
  if (p === '/auth/twitch/callback' && m === 'GET') return twitchCallback(request, env, url, user);

  if (!user) throw httpError(401, 'Not signed in');

  if (p === '/me' && m === 'GET') {
    const tw = await env.DB.prepare('SELECT login, display_name, avatar, public FROM twitch_links WHERE user_id = ?').bind(user.id).first();
    return json({ user: Object.assign(publicUser(user), { twitch: tw ? { login: tw.login, displayName: tw.display_name || tw.login, avatarUrl: tw.avatar, public: !!tw.public, url: `https://www.twitch.tv/${tw.login}` } : null, twitchEnabled: !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) }) });
  }
  if (p === '/me/twitch' && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM twitch_links WHERE user_id = ?').bind(user.id).run();
    return json({ ok: true });
  }
  if (p === '/me/twitch' && m === 'PATCH') {
    const body = await readJson(request);
    await env.DB.prepare('UPDATE twitch_links SET public = ? WHERE user_id = ?').bind(body.public ? 1 : 0, user.id).run();
    return json({ ok: true, public: !!body.public });
  }
  if (p === '/me' && m === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM builds WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM owned WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM likes WHERE user_id = ? OR share_id IN (SELECT id FROM shares WHERE user_id = ?)').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM reports WHERE user_id = ? OR share_id IN (SELECT id FROM shares WHERE user_id = ?)').bind(user.id, user.id),
      env.DB.prepare('DELETE FROM share_meta WHERE id IN (SELECT id FROM shares WHERE user_id = ?)').bind(user.id),
      env.DB.prepare('DELETE FROM shares WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM twitch_links WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id)
    ]);
    return json({ ok: true, deleted: true }, 200, { 'Set-Cookie': clearCookie(SESSION_COOKIE, env) });
  }

  // builds
  if (p === '/builds' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT name, data, updated_at FROM builds WHERE user_id = ? ORDER BY name').bind(user.id).all();
    return json({ builds: results.map(r => ({ name: r.name, data: JSON.parse(r.data), updatedAt: r.updated_at })) });
  }
  mm = p.match(/^\/builds\/(.+)$/);
  if (mm) {
    const name = cleanName(decodeURIComponent(mm[1]));
    if (m === 'PUT') {
      const body = await readJson(request);
      const data = JSON.stringify(validateBuild(body.data));
      const exists = await env.DB.prepare('SELECT 1 FROM builds WHERE user_id = ? AND name = ?').bind(user.id, name).first();
      if (!exists) {
        const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM builds WHERE user_id = ?').bind(user.id).first();
        if (c.n >= MAX_BUILDS) throw httpError(400, `Build limit reached (${MAX_BUILDS})`);
      }
      await env.DB.prepare(`INSERT INTO builds (user_id, name, data, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
        .bind(user.id, name, data, now()).run();
      return json({ ok: true, name });
    }
    if (m === 'DELETE') {
      await env.DB.prepare('DELETE FROM builds WHERE user_id = ? AND name = ?').bind(user.id, name).run();
      return json({ ok: true });
    }
  }

  // owned mods
  if (p === '/owned' && m === 'GET') {
    const row = await env.DB.prepare('SELECT data FROM owned WHERE user_id = ?').bind(user.id).first();
    return json({ mods: row ? JSON.parse(row.data) : [] });
  }
  if (p === '/owned' && m === 'PUT') {
    const body = await readJson(request);
    if (!Array.isArray(body.mods)) throw httpError(400, 'mods must be an array');
    const mods = [...new Set(body.mods.filter(x => typeof x === 'string' && x.length <= 80))].slice(0, MAX_OWNED);
    await env.DB.prepare(`INSERT INTO owned (user_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind(user.id, JSON.stringify(mods), now()).run();
    return json({ ok: true, count: mods.length });
  }

  // shares
  if (p === '/shares' && m === 'GET') {
    const { results } = await env.DB.prepare(`SELECT s.id, s.data, s.created_at, sm.public, sm.title, sm.hidden FROM shares s LEFT JOIN share_meta sm ON sm.id = s.id
      WHERE s.user_id = ? ORDER BY s.created_at DESC`).bind(user.id).all();
    return json({ shares: results.map(r => { const d = JSON.parse(r.data); return { id: r.id, weapon: d.weapon, title: r.title, public: !!r.public, hidden: !!r.hidden, createdAt: r.created_at }; }) });
  }
  if (p === '/shares' && m === 'POST') {
    const body = await readJson(request);
    const data = JSON.stringify(validateBuild(body.data));
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM shares WHERE user_id = ?').bind(user.id).first();
    if (c.n >= MAX_SHARES) throw httpError(400, `Share limit reached (${MAX_SHARES}). Delete old shares first.`);
    let id;
    for (let i = 0; i < 5; i++) {
      id = randomId(8);
      const r = await env.DB.prepare('INSERT OR IGNORE INTO shares (id, user_id, data, created_at) VALUES (?, ?, ?, ?)').bind(id, user.id, data, now()).run();
      if (r.meta && r.meta.changes) {
        const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
        await env.DB.prepare('INSERT INTO share_meta (id, public, hidden, title, weapon, image, dps, summary) VALUES (?, ?, 0, ?, ?, ?, ?, ?)')
          .bind(id, body.public ? 1 : 0, cleanText(body.title, 60), cleanText(body.data.weapon, 80), cleanImage(meta.image),
            Number.isFinite(+meta.dps) ? Math.max(0, Math.min(1e12, Math.round(+meta.dps))) : null, cleanText(meta.summary, 160)).run();
        return json({ ok: true, id });
      }
    }
    throw httpError(500, 'Could not create share');
  }
  mm = p.match(/^\/shares\/([A-Za-z0-9]{6,16})$/);
  if (mm && m === 'DELETE') {
    const own = await env.DB.prepare('SELECT 1 FROM shares WHERE id = ? AND user_id = ?').bind(mm[1], user.id).first();
    if (own) await deleteShare(env, mm[1]);
    return json({ ok: true });
  }
  if (mm && m === 'PATCH') {
    const own = await env.DB.prepare('SELECT 1 FROM shares WHERE id = ? AND user_id = ?').bind(mm[1], user.id).first();
    if (!own) throw httpError(404, 'Share not found');
    const body = await readJson(request);
    if (body.public != null) await env.DB.prepare('UPDATE share_meta SET public = ? WHERE id = ?').bind(body.public ? 1 : 0, mm[1]).run();
    if (body.title != null) await env.DB.prepare('UPDATE share_meta SET title = ? WHERE id = ?').bind(cleanText(body.title, 60), mm[1]).run();
    return json({ ok: true });
  }
  mm = p.match(/^\/shares\/([A-Za-z0-9]{6,16})\/(like|report)$/);
  if (mm && m === 'POST') {
    const [, id, action] = mm;
    const exists = await env.DB.prepare('SELECT 1 FROM share_meta WHERE id = ? AND public = 1').bind(id).first();
    if (!exists) throw httpError(404, 'Build not found');
    if (action === 'like') {
      const had = await env.DB.prepare('SELECT 1 FROM likes WHERE share_id = ? AND user_id = ?').bind(id, user.id).first();
      if (had) await env.DB.prepare('DELETE FROM likes WHERE share_id = ? AND user_id = ?').bind(id, user.id).run();
      else await env.DB.prepare('INSERT INTO likes (share_id, user_id, created_at) VALUES (?, ?, ?)').bind(id, user.id, now()).run();
      return json({ ok: true, liked: !had });
    }
    await env.DB.prepare('INSERT OR IGNORE INTO reports (share_id, user_id, created_at) VALUES (?, ?, ?)').bind(id, user.id, now()).run();
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE share_id = ?').bind(id).first();
    if (c.n >= REPORTS_TO_HIDE) await env.DB.prepare('UPDATE share_meta SET hidden = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // admin (moderation)
  if (p.startsWith('/admin/')) {
    const admins = String(env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!admins.includes(user.id)) throw httpError(403, 'Admins only');
    if (p === '/admin/reports' && m === 'GET') {
      const { results } = await env.DB.prepare(`SELECT r.share_id, COUNT(*) AS reports, sm.title, sm.weapon, sm.hidden FROM reports r
        JOIN share_meta sm ON sm.id = r.share_id GROUP BY r.share_id ORDER BY reports DESC LIMIT 100`).all();
      return json({ reports: results });
    }
    mm = p.match(/^\/admin\/shares\/([A-Za-z0-9]{6,16})$/);
    if (mm && m === 'DELETE') { await deleteShare(env, mm[1]); return json({ ok: true }); }
    mm = p.match(/^\/admin\/shares\/([A-Za-z0-9]{6,16})\/unhide$/);
    if (mm && m === 'POST') {
      await env.DB.batch([
        env.DB.prepare('UPDATE share_meta SET hidden = 0 WHERE id = ?').bind(mm[1]),
        env.DB.prepare('DELETE FROM reports WHERE share_id = ?').bind(mm[1])
      ]);
      return json({ ok: true });
    }
  }

  throw httpError(404, 'Not found');
}

// ---------------- Discord OAuth ----------------
function redirectUri(env, url) { return env.DISCORD_REDIRECT_URI || `${url.origin}/auth/discord/callback`; }

function discordLogin(env, url) {
  if (!env.DISCORD_CLIENT_ID) throw httpError(500, 'Discord is not configured');
  const state = randomId(24);
  const returnTo = safeReturn(url.searchParams.get('return'), env);
  const q = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify',
    redirect_uri: redirectUri(env, url), state
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.DISCORD_AUTHORIZE_URL || 'https://discord.com/oauth2/authorize'}?${q}`,
      'Set-Cookie': cookie(STATE_COOKIE, `${state}|${encodeURIComponent(returnTo)}`, 600, env)
    }
  });
}

async function discordCallback(request, env, url) {
  const site = siteUrl(env);
  const fail = (why) => new Response(null, { status: 302, headers: { Location: `${site}#login-error=${encodeURIComponent(why)}`, 'Set-Cookie': clearCookie(STATE_COOKIE, env) } });
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error')) return fail(url.searchParams.get('error'));
  const saved = getCookie(request, STATE_COOKIE) || '';
  const [savedState, savedReturn] = saved.split('|');
  if (!code || !state || !savedState || !timingSafeEqual(state, savedState)) return fail('state');

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code', code, redirect_uri: redirectUri(env, url)
    })
  });
  if (!tokenRes.ok) return fail('token');
  const tok = await tokenRes.json();
  const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!meRes.ok) return fail('profile');
  const me = await meRes.json();
  if (!me || !me.id) return fail('profile');

  const t = now();
  await env.DB.prepare(`INSERT INTO users (id, username, display_name, avatar, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET username = excluded.username, display_name = excluded.display_name, avatar = excluded.avatar, last_login = excluded.last_login`)
    .bind(me.id, me.username || '', me.global_name || me.username || '', me.avatar || null, t, t).run();

  const token = randomToken();
  const hash = await sha256(token);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(hash, me.id, t, t + SESSION_DAYS * 86400).run();
  // opportunistic cleanup of expired sessions
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t).run();

  const headers = new Headers({ Location: safeReturn(savedReturn ? decodeURIComponent(savedReturn) : null, env) });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400, env));
  headers.append('Set-Cookie', clearCookie(STATE_COOKIE, env));
  return new Response(null, { status: 302, headers });
}

// ---------------- Twitch link (optional, on top of a Discord sign-in) ----------------
// Docs: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/ (authorization code + client credentials)
//       https://dev.twitch.tv/docs/api/reference/#get-users , #get-streams
function twitchRedirectUri(env, url) { return env.TWITCH_REDIRECT_URI || `${url.origin}/auth/twitch/callback`; }
function twitchLink(env, url, user) {
  const site = siteUrl(env);
  if (!user) return new Response(null, { status: 302, headers: { Location: `${site}#twitch-error=signin` } });
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return new Response(null, { status: 302, headers: { Location: `${site}#twitch-error=not-configured` } });
  const state = randomId(24);
  const returnTo = safeReturn(url.searchParams.get('return'), env);
  const q = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, redirect_uri: twitchRedirectUri(env, url), response_type: 'code', scope: '', state });
  return new Response(null, { status: 302, headers: {
    Location: `${env.TWITCH_AUTHORIZE_URL || 'https://id.twitch.tv/oauth2/authorize'}?${q}`,
    'Set-Cookie': cookie(TWITCH_STATE_COOKIE, `${state}|${user.id}|${encodeURIComponent(returnTo)}`, 600, env)
  } });
}

async function twitchCallback(request, env, url, user) {
  const site = siteUrl(env);
  const saved = getCookie(request, TWITCH_STATE_COOKIE) || '';
  const [savedState, savedUser, savedReturn] = saved.split('|');
  const back = savedReturn ? safeReturn(decodeURIComponent(savedReturn), env) : site;
  const go = (frag) => {
    const h = new Headers({ Location: back.split('#')[0] + '#' + frag });
    h.append('Set-Cookie', clearCookie(TWITCH_STATE_COOKIE, env));
    return new Response(null, { status: 302, headers: h });
  };
  if (url.searchParams.get('error')) return go('twitch-error=' + encodeURIComponent(url.searchParams.get('error')));
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  if (!user) return go('twitch-error=signin');
  if (!code || !state || !savedState || !timingSafeEqual(state, savedState) || savedUser !== user.id) return go('twitch-error=state');

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: twitchRedirectUri(env, url) })
  });
  if (!tokenRes.ok) return go('twitch-error=token');
  const tok = await tokenRes.json();
  const meRes = await fetch('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${tok.access_token}`, 'Client-Id': env.TWITCH_CLIENT_ID } });
  // the user token is not needed again: revoke it straight away (best effort)
  await fetch('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, token: tok.access_token }) }).catch(() => {});
  if (!meRes.ok) return go('twitch-error=profile');
  const tw = ((await meRes.json()).data || [])[0];
  if (!tw || !/^\d{1,20}$/.test(String(tw.id)) || !/^[A-Za-z0-9_]{1,25}$/.test(String(tw.login || ''))) return go('twitch-error=profile');
  const avatar = /^https:\/\/static-cdn\.jtvnw\.net\/[\w./%-]+$/.test(String(tw.profile_image_url || '')) ? tw.profile_image_url : null;
  // a Twitch channel belongs to one site account: proving ownership again moves the link
  await env.DB.batch([
    env.DB.prepare('DELETE FROM twitch_links WHERE twitch_id = ? OR user_id = ?').bind(String(tw.id), user.id),
    env.DB.prepare('INSERT INTO twitch_links (user_id, twitch_id, login, display_name, avatar, public, linked_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .bind(user.id, String(tw.id), tw.login.toLowerCase(), cleanText(tw.display_name, 40), avatar, now())
  ]);
  return go('twitch-linked');
}

// App access token for Get Streams, cached per Worker instance until shortly before it expires
let appToken = null;
async function twitchAppToken(env) {
  if (appToken && appToken.exp > Date.now() + 60000) return appToken.token;
  const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }) });
  if (!r.ok) throw new Error('twitch app token ' + r.status);
  const j = await r.json();
  appToken = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return appToken.token;
}
// Refresh live status for up to 100 channels; returns Map twitch_id -> { live, game } for the ones checked now
async function refreshLive(env, ids) {
  const out = new Map();
  const uniq = [...new Set(ids)].slice(0, 100);
  if (!uniq.length || !env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return out;
  try {
    const token = await twitchAppToken(env);
    const r = await fetch('https://api.twitch.tv/helix/streams?' + uniq.map(id => 'user_id=' + encodeURIComponent(id)).join('&') + '&first=100',
      { headers: { Authorization: `Bearer ${token}`, 'Client-Id': env.TWITCH_CLIENT_ID } });
    if (!r.ok) throw new Error('twitch streams ' + r.status);
    const live = new Map(((await r.json()).data || []).filter(s => s.type === 'live').map(s => [String(s.user_id), s]));
    const t = now();
    await env.DB.batch(uniq.map(id => {
      const s = live.get(id);
      out.set(id, { live: !!s, game: s ? cleanText(s.game_name, 60) : null });
      return env.DB.prepare('UPDATE twitch_links SET live = ?, live_title = ?, live_game = ?, live_checked = ? WHERE twitch_id = ?')
        .bind(s ? 1 : 0, s ? cleanText(s.title, 140) : null, s ? cleanText(s.game_name, 60) : null, t, id);
    }));
  } catch (e) { console.error(e && e.message || e); }
  return out;
}
function twitchPublic(r, fresh) {
  const f = fresh.get(r.twitch_id);
  return { login: r.tw_login, displayName: r.tw_name || r.tw_login, url: `https://www.twitch.tv/${r.tw_login}`,
    live: f ? f.live : !!r.tw_live, game: f ? f.game : (r.tw_live ? r.tw_game : null) };
}

// ---------------- warframe.market prices ----------------
// Public data from the warframe.market API (https://docs.warframe.market). Following their Rules page:
// a descriptive User-Agent, caching (items list 24 h, prices 10 min, shared by every visitor through the
// Cloudflare cache), at most ~3 upstream requests per second, and only the items a build actually shows.
// The browser cannot call warframe.market directly (no CORS), which is why this goes through the Worker.
const WFM = 'https://api.warframe.market';
const WFM_UA = 'warframe-calc/1.0 (+https://warframe.hardn.net; Info@hardn.net)';
const WFM_ITEMS_TTL = 86400, WFM_PRICE_TTL = 600, WFM_MAX_NAMES = 12;
let wfmCatalog = null;   // per-instance copy of the items map
const cacheKey = k => new Request('https://warframe-api.hardn.net/__cache/wfm/' + encodeURIComponent(k));
async function cacheGet(k) {
  try { const r = await caches.default.match(cacheKey(k)); return r ? await r.json() : null; } catch (e) { return null; }
}
async function cachePut(k, obj, ttl) {
  try { await caches.default.put(cacheKey(k), new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } })); } catch (e) { /* cache unavailable */ }
}
function wfmFetch(path) { return fetch(WFM + path, { headers: { 'User-Agent': WFM_UA, Accept: 'application/json' } }); }

async function wfmItems() {
  if (wfmCatalog && wfmCatalog.at > Date.now() - WFM_ITEMS_TTL * 1000) return wfmCatalog;
  let cat = await cacheGet('items');
  if (!cat) {
    const r = await wfmFetch('/v2/items');
    if (!r.ok) {
      // say why (a Cloudflare challenge from their side looks different from an API error)
      const why = r.headers.get('cf-mitigated') ? 'challenge' : ((await r.text().catch(() => '')).match(/<title>([^<]{0,60})/) || [])[1] || '';
      throw httpError(502, `warframe.market items list unavailable (${r.status}${why ? ', ' + why : ''})`);
    }
    const list = ((await r.json()) || {}).data || [];
    cat = { at: Date.now(), names: {}, refs: {}, info: {} };
    for (const it of list) {
      if (!it || !it.slug) continue;
      const name = it.i18n && it.i18n.en && it.i18n.en.name;
      if (name) cat.names[name.toLowerCase()] = it.slug;
      if (it.gameRef) cat.refs[it.gameRef] = it.slug;
      cat.info[it.slug] = [name || it.slug, it.maxRank != null ? it.maxRank : null, (it.tags || []).includes('set') ? 1 : 0];
    }
    await cachePut('items', cat, WFM_ITEMS_TTL);
  }
  wfmCatalog = cat;
  return cat;
}

// Summary of one item's orders: online sellers only (status ingame/online), grouped by mod rank,
// "typical" = median of the 5 cheapest online sell orders (one 1p order does not set the price).
function summarizeOrders(orders) {
  const sell = {}, buy = {};
  for (const o of orders || []) {
    if (!o || !o.visible || !o.user || (o.user.status !== 'ingame' && o.user.status !== 'online')) continue;
    if (o.subtype && o.subtype !== 'regular') continue;   // e.g. Atragraph variants are priced separately
    const k = o.rank == null ? 'any' : String(o.rank);
    const p = +o.platinum; if (!(p > 0)) continue;
    (o.type === 'sell' ? (sell[k] = sell[k] || []) : (buy[k] = buy[k] || [])).push(p);
  }
  const out = { sell: {}, buy: {} };
  for (const [k, arr] of Object.entries(sell)) {
    arr.sort((a, b) => a - b);
    const low = arr.slice(0, 5);
    out.sell[k] = { min: low[0], typical: low[Math.floor((low.length - 1) / 2)], n: arr.length };
  }
  for (const [k, arr] of Object.entries(buy)) { arr.sort((a, b) => b - a); out.buy[k] = { max: arr[0], n: arr.length }; }
  return out;
}

async function marketPrices(env, url) {
  const split = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
  const names = split(url.searchParams.get('names')).slice(0, WFM_MAX_NAMES);
  const refs = split(url.searchParams.get('refs')).filter(r => /^\/Lotus\/[\w/]+$/.test(r)).slice(0, 4);
  if (!names.length && !refs.length) throw httpError(400, 'names or refs required');
  const cat = await wfmItems();
  const prices = {};
  let upstream = 0;
  for (const key of names.concat(refs)) {
    const slug = key.startsWith('/Lotus/') ? cat.refs[key] : cat.names[key.toLowerCase()];
    if (!slug) { prices[key] = { missing: true }; continue; }
    const [name, maxRank, isSet] = cat.info[slug] || [slug, null, 0];
    let sum = await cacheGet('p:' + slug);
    if (!sum) {
      if (upstream > 0) await new Promise(r => setTimeout(r, 350));   // stay under ~3 requests per second
      upstream++;
      const r = await wfmFetch('/v2/orders/item/' + encodeURIComponent(slug));
      if (!r.ok) { prices[key] = { slug, name, error: r.status === 429 ? 'busy' : 'unavailable' }; continue; }
      sum = Object.assign(summarizeOrders(((await r.json()) || {}).data), { at: new Date().toISOString() });
      await cachePut('p:' + slug, sum, WFM_PRICE_TTL);
    }
    prices[key] = Object.assign({ slug, name, maxRank, set: !!isSet, url: `https://warframe.market/items/${slug}` }, sum);
  }
  return json({ source: 'https://warframe.market', platform: 'pc', prices }, 200, { 'Cache-Control': 'public, max-age=120' });
}

// ---------------- sessions ----------------
async function currentUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length < 20 || token.length > 100) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id, u.username, u.display_name, u.avatar, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).bind(hash).first();
  if (!row || row.expires_at < now()) return null;
  return { id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar, tokenHash: hash };
}
function publicUser(u) {
  return {
    id: u.id, username: u.username, displayName: u.displayName,
    avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null
  };
}

// ---------------- validation ----------------
function validateBuild(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw httpError(400, 'Build must be an object');
  if (typeof b.weapon !== 'string' || !b.weapon || b.weapon.length > 80) throw httpError(400, 'Build needs a weapon name');
  const s = JSON.stringify(b);
  if (s.length > 32 * 1024) throw httpError(400, 'Build is too large');
  return b;
}
function cleanName(n) {
  const s = String(n || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 80);
  if (!s) throw httpError(400, 'Build name is required');
  return s;
}
async function readJson(request) {
  const len = +(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) throw httpError(413, 'Body too large');
  const text = await request.text();
  if (text.length > MAX_BODY) throw httpError(413, 'Body too large');
  try { return JSON.parse(text || '{}'); } catch (e) { throw httpError(400, 'Invalid JSON'); }
}
function requireTrustedWrite(request, origin, allowed) {
  // The desktop app calls from its main process, which sends no Origin. Browsers always send Origin on
  // cross-site writes and cannot add the custom header without a CORS preflight this API refuses, so
  // "no Origin + X-WF-Client: desktop" cannot be forged from a web page.
  const desktop = !origin && request.headers.get('X-WF-Client') === 'desktop';
  if (!desktop && (!origin || !allowed.includes(origin))) throw httpError(403, 'Origin not allowed');
  const ct = request.headers.get('Content-Type') || '';
  if (request.method !== 'DELETE' && !ct.includes('application/json')) throw httpError(415, 'Use application/json');
}

// ---------------- shares: helpers and preview page ----------------
async function deleteShare(env, id) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM likes WHERE share_id = ?').bind(id),
    env.DB.prepare('DELETE FROM reports WHERE share_id = ?').bind(id),
    env.DB.prepare('DELETE FROM share_meta WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(id)
  ]);
}
function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
}
function cleanImage(v) {
  const s = String(v || '');
  return /^[A-Za-z0-9._-]{1,120}\.(png|jpg|jpeg|webp)$/i.test(s) ? s : null;
}
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function sharePreview(env, id) {
  const site = siteUrl(env);
  const target = `${site}#share=${id}`;
  const row = await env.DB.prepare(`SELECT s.data, sm.title, sm.weapon, sm.image, sm.dps, sm.summary, sm.hidden FROM shares s
    LEFT JOIN share_meta sm ON sm.id = s.id WHERE s.id = ?`).bind(id).first();
  let title = 'Warframe build', desc = 'Open this build in Warframe Damage Calc.', image = null;
  if (row && !row.hidden) {
    let weapon = row.weapon;
    try { weapon = weapon || JSON.parse(row.data).weapon; } catch (e) { /* ignore */ }
    title = row.title || `${weapon} build`;
    const bits = [];
    if (row.dps) bits.push(`${Number(row.dps).toLocaleString('en-US')} sustained DPS`);
    if (row.summary) bits.push(row.summary);
    desc = (bits.join(' | ') || `${weapon} build`) + ' | Warframe Damage Calc';
    if (row.image) image = `https://cdn.warframestat.us/img/${encodeURIComponent(row.image)}`;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Warframe Damage Calc">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${escHtml(target)}">
${image ? `<meta property="og:image" content="${escHtml(image)}"><meta name="twitter:image" content="${escHtml(image)}">` : ''}
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#e0b04a">
<meta http-equiv="refresh" content="0; url=${escHtml(target)}">
</head><body><p><a href="${escHtml(target)}">Open the build</a></p><script>location.replace(${JSON.stringify(target)})</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" } });
}

// ---------------- helpers ----------------
function allowedOrigins(env) { return String(env.ALLOWED_ORIGINS || 'https://warframe.hardn.net').split(',').map(s => s.trim()).filter(Boolean); }
function siteUrl(env) { return allowedOrigins(env)[0] + '/'; }
function safeReturn(r, env) {
  const site = siteUrl(env);
  if (!r) return site;
  try {
    const u = new URL(r, site);
    return allowedOrigins(env).includes(u.origin) ? u.href : site;
  } catch (e) { return site; }
}
function corsHeaders(origin, allowed) {
  const h = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Credentials'] = 'true';
    h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers) });
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function now() { return Math.floor(Date.now() / 1000); }
function cookie(name, value, maxAge, env) {
  const secure = env.INSECURE_COOKIES === '1' ? '' : '; Secure';
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}
function clearCookie(name, env) { return cookie(name, '', 0, env); }
function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomId(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const b of bytes) s += ALPHA[b % ALPHA.length];
  return s;
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
