/*
 * Warframe Damage Calc API (Cloudflare Worker + D1)
 *
 * Auth:   GET  /auth/discord/login      -> redirect to Discord
 *         GET  /auth/discord/callback   -> sets session cookie, redirects back to the site
 *         POST /auth/logout
 * User:   GET  /me                      -> { user } or 401
 *         DELETE /me                    -> deletes the account and everything stored for it
 * Builds: GET  /builds                  -> { builds: [{ name, data, updatedAt }] }
 *         PUT  /builds/:name            -> body { data }
 *         DELETE /builds/:name
 * Owned:  GET  /owned                   -> { mods: [...] }
 *         PUT  /owned                   -> body { mods: [...] }
 * Shares: POST /shares                  -> body { data } -> { id }
 *         GET  /shares/:id              -> { data, createdAt }   (public, no login)
 *         GET  /shares                  -> list of your shares
 *         DELETE /shares/:id
 *
 * Security notes
 * - Session token: 32 random bytes in an HttpOnly, Secure, SameSite=Lax cookie; only its SHA-256 hash is stored.
 * - OAuth "state" is checked against a short-lived HttpOnly cookie (CSRF protection on login).
 * - Writes require the request Origin to be the site and a JSON body (blocks cross-site form posts).
 * - Discord scope is "identify" only: Discord ID, username, avatar. No email.
 */

const SESSION_COOKIE = 'wf_session';
const STATE_COOKIE = 'wf_oauth_state';
const SESSION_DAYS = 30;
const MAX_BODY = 64 * 1024;
const MAX_BUILDS = 300;
const MAX_SHARES = 200;
const MAX_OWNED = 3000;

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
  if (p === '/auth/discord/callback' && m === 'GET') return discordCallback(request, env, url);

  // public share read
  let mm = p.match(/^\/shares\/([A-Za-z0-9]{6,16})$/);
  if (mm && m === 'GET') {
    const row = await env.DB.prepare('SELECT data, created_at FROM shares WHERE id = ?').bind(mm[1]).first();
    if (!row) throw httpError(404, 'Share not found');
    return json({ data: JSON.parse(row.data), createdAt: row.created_at }, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  // everything below needs a session; writes also need a trusted Origin + JSON
  if (m !== 'GET') requireTrustedWrite(request, origin, allowed);
  const user = await currentUser(request, env);

  if (p === '/auth/logout' && m === 'POST') {
    if (user) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.tokenHash).run();
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(SESSION_COOKIE, env) });
  }

  if (!user) throw httpError(401, 'Not signed in');

  if (p === '/me' && m === 'GET') return json({ user: publicUser(user) });
  if (p === '/me' && m === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM builds WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM owned WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM shares WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
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
    const { results } = await env.DB.prepare('SELECT id, data, created_at FROM shares WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all();
    return json({ shares: results.map(r => { const d = JSON.parse(r.data); return { id: r.id, weapon: d.weapon, createdAt: r.created_at }; }) });
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
      if (r.meta && r.meta.changes) return json({ ok: true, id });
    }
    throw httpError(500, 'Could not create share');
  }
  mm = p.match(/^\/shares\/([A-Za-z0-9]{6,16})$/);
  if (mm && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?').bind(mm[1], user.id).run();
    return json({ ok: true });
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
      Location: `https://discord.com/oauth2/authorize?${q}`,
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
  if (!origin || !allowed.includes(origin)) throw httpError(403, 'Origin not allowed');
  const ct = request.headers.get('Content-Type') || '';
  if (request.method !== 'DELETE' && !ct.includes('application/json')) throw httpError(415, 'Use application/json');
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
