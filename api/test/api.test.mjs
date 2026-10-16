import { Miniflare } from 'miniflare';
import fs from 'fs';
let twitchRevoked = null, streamCalls = 0;
const W = new URL('..', import.meta.url).pathname;
const mf = new Miniflare({
  modules: true, script: fs.readFileSync(`${W}/src/worker.js`, 'utf8'), scriptPath: 'worker.js', compatibilityDate: '2026-08-01',
  d1Databases: { DB: 'test-db' },
  bindings: { ADMIN_IDS: '1234567890', ALLOWED_ORIGINS: 'https://warframe.hardn.net', DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'secret', DISCORD_REDIRECT_URI: 'https://warframe-api.hardn.net/auth/discord/callback', TWITCH_CLIENT_ID: 'tcid', TWITCH_CLIENT_SECRET: 'tsecret' },
  outboundService: async (req) => {
    const u = new URL(req.url);
    if (u.pathname === '/api/oauth2/token') { const b = new URLSearchParams(await req.text()); if (b.get('code') !== 'good' || b.get('client_secret') !== 'secret') return new Response('bad', { status: 400 }); return Response.json({ access_token: 'at' }); }
    if (u.pathname === '/api/users/@me') return Response.json({ id: '1234567890', username: 'ethan', global_name: 'Ethan', avatar: 'abc' });
    // Twitch (mocked)
    if (u.hostname === 'id.twitch.tv' && u.pathname === '/oauth2/token') {
      const b = new URLSearchParams(await req.text());
      if (b.get('client_secret') !== 'tsecret') return new Response('bad', { status: 400 });
      if (b.get('grant_type') === 'client_credentials') return Response.json({ access_token: 'app', expires_in: 3600 });
      if (b.get('code') !== 'twgood') return new Response('bad', { status: 400 });
      return Response.json({ access_token: 'usertok' });
    }
    if (u.hostname === 'id.twitch.tv' && u.pathname === '/oauth2/revoke') { twitchRevoked = new URLSearchParams(await req.text()).get('token'); return new Response(null, { status: 200 }); }
    if (u.hostname === 'api.twitch.tv' && u.pathname === '/helix/users') {
      if (req.headers.get('authorization') !== 'Bearer usertok' || req.headers.get('client-id') !== 'tcid') return new Response('no', { status: 401 });
      return Response.json({ data: [{ id: '4242', login: 'HardnTV', display_name: 'HardnTV', profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/x-profile_image-300x300.png' }] });
    }
    if (u.hostname === 'api.twitch.tv' && u.pathname === '/helix/streams') {
      streamCalls++;
      if (req.headers.get('authorization') !== 'Bearer app') return new Response('no', { status: 401 });
      return Response.json({ data: u.searchParams.getAll('user_id').includes('4242') ? [{ user_id: '4242', type: 'live', title: 'Torid testing', game_name: 'Warframe' }] : [] });
    }
    return new Response('nope', { status: 404 });
  }
});
const db = await mf.getD1Database('DB');
for (const stmt of fs.readFileSync(`${W}/schema.sql`, 'utf8').split(';').map(s => s.replace(/--.*$/gm,'').trim()).filter(Boolean)) await db.prepare(stmt).run();
const BASE = 'https://warframe-api.hardn.net';
const SITE = 'https://warframe.hardn.net';
let pass = 0, fail = 0;
const check = (n, c, extra='') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${extra}`); };
const go = (path, opts = {}) => mf.dispatchFetch(BASE + path, Object.assign({ redirect: 'manual' }, opts));

let r = await go('/health'); check('health', r.status === 200);
r = await go('/me'); check('me without session = 401', r.status === 401);
r = await go('/auth/discord/login?return=' + encodeURIComponent(SITE + '/#x'));
check('login redirects to discord', r.status === 302 && r.headers.get('location').startsWith('https://discord.com/oauth2/authorize'));
const stateCookie = r.headers.get('set-cookie').split(';')[0];
const state = new URL(r.headers.get('location')).searchParams.get('state');
r = await go(`/auth/discord/callback?code=good&state=WRONG`, { headers: { Cookie: stateCookie } });
check('bad state rejected', r.status === 302 && r.headers.get('location').includes('login-error=state'));
r = await go(`/auth/discord/callback?code=good&state=${state}`, { headers: { Cookie: stateCookie } });
const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')];
const sess = cookies.find(c => c.startsWith('wf_session=') && !c.startsWith('wf_session=;'));
check('callback sets session + returns to site', r.status === 302 && r.headers.get('location') === SITE + '/#x' && !!sess, r.headers.get('location'));
check('session cookie flags', /HttpOnly/.test(sess) && /Secure/.test(sess) && /SameSite=Lax/.test(sess));
const C = { Cookie: sess.split(';')[0] };
const stored = await db.prepare('SELECT token_hash FROM sessions').first();
check('token stored only as hash', stored.token_hash.length === 64 && !sess.includes(stored.token_hash));
r = await go('/me', { headers: { ...C, Origin: SITE } }); let j = await r.json();
check('me ok', r.status === 200 && j.user.username === 'ethan' && r.headers.get('access-control-allow-origin') === SITE, JSON.stringify(j));
const W8 = (method, path, body, origin = SITE) => go(path, { method, headers: { ...C, Origin: origin, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
r = await W8('PUT', '/builds/' + encodeURIComponent('Soma SP'), { data: { weapon: 'Soma Prime', mods: ['Serration'] } }); check('save build', r.status === 200);
r = await W8('PUT', '/builds/x', { data: { weapon: 'Soma Prime' } }, 'https://evil.example'); check('evil origin blocked', r.status === 403);
r = await go('/builds/x', { method: 'PUT', headers: { ...C, Origin: SITE, 'Content-Type': 'text/plain' }, body: '{"data":{"weapon":"x"}}' }); check('non-json blocked', r.status === 415);
r = await W8('PUT', '/builds/bad', { data: { nope: 1 } }); check('invalid build rejected', r.status === 400);
r = await go('/builds', { headers: { ...C, Origin: SITE } }); j = await r.json(); check('list builds', j.builds.length === 1 && j.builds[0].name === 'Soma SP' && j.builds[0].data.mods[0] === 'Serration');
r = await W8('PUT', '/owned', { mods: ['Serration', 'Serration', 'Point Strike', 5] }); j = await r.json(); check('owned save dedups', j.count === 2);
r = await go('/owned', { headers: C }); j = await r.json(); check('owned get', j.mods.length === 2);
r = await W8('POST', '/shares', { data: { weapon: 'Soma Prime', mods: ['Serration'] } }); j = await r.json(); const sid = j.id; check('create share', r.status === 200 && /^[A-Za-z0-9]{8}$/.test(sid), sid);
r = await go('/shares/' + sid); j = await r.json(); check('public share read without login', r.status === 200 && j.data.weapon === 'Soma Prime');
r = await go('/auth/discord/login?return=' + encodeURIComponent('https://evil.example/')); const st2 = r.headers.get('set-cookie'); check('open redirect blocked', decodeURIComponent(st2).includes('https://warframe.hardn.net/') && !st2.includes('evil'));
// public builds, likes, reports, preview page
r = await W8('POST', '/shares', { data: { weapon: 'Soma Prime', mods: ['Serration'] }, public: true, title: 'My <b>Soma</b>', meta: { image: 'SomaPrime.png', dps: 56537, summary: 'Serration, Split Chamber' } });
j = await r.json(); const pid = j.id; check('create public share', r.status === 200 && !!pid);
r = await go('/public'); j = await r.json(); check('public list (signed out)', r.status === 200 && j.builds.length === 1 && j.builds[0].title === 'My <b>Soma</b>' && j.builds[0].liked === false, JSON.stringify(j.builds[0]));
r = await go('/public?weapon=soma', { headers: C }); j = await r.json(); check('public filter by weapon', j.builds.length === 1);
r = await go('/public?weapon=braton'); j = await r.json(); check('public filter excludes', j.builds.length === 0);
r = await W8('POST', `/shares/${pid}/like`, {}); j = await r.json(); check('like', j.liked === true);
r = await go('/public', { headers: C }); j = await r.json(); check('like counted + liked flag', j.builds[0].likes === 1 && j.builds[0].liked === true);
r = await W8('POST', `/shares/${pid}/like`, {}); j = await r.json(); check('unlike toggles', j.liked === false);
r = await W8('POST', `/shares/${sid}/like`, {}); check('cannot like private share', r.status === 404);
r = await go('/s/' + pid); let html = await r.text();
check('preview page has OG tags + escaped title', r.status === 200 && html.includes('og:title" content="My &lt;b&gt;Soma&lt;/b&gt;"') && html.includes('og:image" content="https://cdn.warframestat.us/img/SomaPrime.png"') && html.includes('56,537 sustained DPS') && html.includes('#share=' + pid));
r = await go('/s/NOPE1234'); html = await r.text(); check('preview for missing share still redirects', r.status === 200 && html.includes('#share=NOPE1234'));
r = await W8('POST', '/shares', { data: { weapon: 'Soma Prime' }, meta: { image: '../../evil.svg"><script>' } }); j = await r.json();
const bad = await db.prepare('SELECT image FROM share_meta WHERE id = ?').bind(j.id).first(); check('bad image name rejected', bad.image === null);
r = await W8('POST', `/shares/${pid}/report`, {}); check('report ok', r.status === 200);
r = await go('/admin/reports', { headers: { ...C, Origin: SITE } }); j = await r.json(); check('admin sees reports', r.status === 200 && j.reports.length === 1 && j.reports[0].reports === 1);
await db.prepare("INSERT INTO reports (share_id, user_id, created_at) VALUES (?, 'u2', 1), (?, 'u3', 1)").bind(pid, pid).run();
r = await W8('POST', `/shares/${pid}/report`, {}); r = await go('/public'); j = await r.json(); check('3 reports hide build', j.builds.length === 0);
r = await W8('POST', `/admin/shares/${pid}/unhide`, {}); r = await go('/public'); j = await r.json(); check('admin unhide', j.builds.length === 1);
r = await W8('PATCH', `/shares/${pid}`, { public: false }); r = await go('/public'); j = await r.json(); check('owner can unpublish', j.builds.length === 0);
r = await W8('DELETE', `/admin/shares/${pid}`); r = await go('/s/' + pid); html = await r.text(); check('admin delete', !html.includes('My &lt;b&gt;'));

r = await go('/owned', { method: 'PUT', headers: { ...C, 'Content-Type': 'application/json', 'X-WF-Client': 'desktop' }, body: JSON.stringify({ mods: ['Serration'] }) });
check('desktop write (no Origin + header) allowed', r.status === 200);
r = await go('/owned', { method: 'PUT', headers: { ...C, 'Content-Type': 'application/json' }, body: JSON.stringify({ mods: [] }) });
check('write with no Origin and no header blocked', r.status === 403);
r = await go('/owned', { method: 'PUT', headers: { ...C, Origin: 'https://evil.example', 'Content-Type': 'application/json', 'X-WF-Client': 'desktop' }, body: JSON.stringify({ mods: [] }) });
check('desktop header with foreign Origin blocked', r.status === 403);
// Twitch link
r = await go('/auth/twitch/link?return=' + encodeURIComponent(SITE + '/'));
check('twitch link needs sign-in', r.status === 302 && r.headers.get('location').includes('twitch-error=signin'));
r = await go('/auth/twitch/link?return=' + encodeURIComponent(SITE + '/'), { headers: C });
const twLoc = r.headers.get('location') || '';
check('twitch link redirects to Twitch with no scopes', r.status === 302 && twLoc.startsWith('https://id.twitch.tv/oauth2/authorize') && new URL(twLoc).searchParams.get('scope') === '' && new URL(twLoc).searchParams.get('client_id') === 'tcid', twLoc);
const twState = new URL(twLoc).searchParams.get('state');
const twCookie = r.headers.get('set-cookie').split(';')[0];
r = await go(`/auth/twitch/callback?code=twgood&state=WRONG`, { headers: { Cookie: `${C.Cookie}; ${twCookie}` } });
check('twitch bad state rejected', r.headers.get('location').includes('twitch-error=state'));
r = await go(`/auth/twitch/callback?code=twgood&state=${twState}`, { headers: { Cookie: twCookie } });
check('twitch callback without session rejected', r.headers.get('location').includes('twitch-error=signin'));
r = await go(`/auth/twitch/callback?code=twgood&state=${twState}`, { headers: { Cookie: `${C.Cookie}; ${twCookie}` } });
check('twitch callback links + returns to site', r.status === 302 && r.headers.get('location') === SITE + '/#twitch-linked', r.headers.get('location'));
check('twitch user token revoked after use', twitchRevoked === 'usertok');
r = await go('/me', { headers: C }); j = await r.json();
check('me shows linked twitch', j.user.twitchEnabled === true && j.user.twitch && j.user.twitch.login === 'hardntv' && j.user.twitch.public === true && j.user.twitch.url === 'https://www.twitch.tv/hardntv', JSON.stringify(j.user.twitch));
const twRow = await db.prepare('SELECT * FROM twitch_links').first();
check('no twitch token stored', !JSON.stringify(twRow).includes('usertok'));
r = await W8('POST', '/shares', { data: { weapon: 'Torid' }, public: true, title: 'Torid' }); const tid = (await r.json()).id;
r = await go('/public'); j = await r.json();
check('public build shows creator twitch + live', j.builds[0].twitch && j.builds[0].twitch.login === 'hardntv' && j.builds[0].twitch.live === true && j.builds[0].twitch.game === 'Warframe', JSON.stringify(j.builds[0].twitch));
const calls = streamCalls; r = await go('/public'); await r.json();
check('live status cached (no second Twitch call within 2 min)', streamCalls === calls);
r = await W8('PATCH', '/me/twitch', { public: false }); r = await go('/public'); j = await r.json();
check('hide twitch on public builds', j.builds[0].twitch === null);
r = await W8('DELETE', '/me/twitch'); r = await go('/me', { headers: C }); j = await r.json();
check('unlink twitch', j.user.twitch === null);
r = await W8('DELETE', `/shares/${tid}`);

r = await W8('DELETE', '/builds/' + encodeURIComponent('Soma SP')); check('delete build', r.status === 200);
r = await W8('DELETE', '/me'); check('delete account', r.status === 200);
const left = await db.prepare("SELECT (SELECT COUNT(*) FROM users)+(SELECT COUNT(*) FROM sessions)+(SELECT COUNT(*) FROM shares)+(SELECT COUNT(*) FROM owned)+(SELECT COUNT(*) FROM share_meta)+(SELECT COUNT(*) FROM likes WHERE user_id='1234567890') AS n").first();
check('account delete removes all data', left.n === 0);
r = await go('/me', { headers: C }); check('session invalid after delete', r.status === 401);
r = await go('/me', { method: 'OPTIONS', headers: { Origin: SITE } });
check('CORS preflight', r.status === 204 && r.headers.get('access-control-allow-credentials') === 'true');
r = await go('/me', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Headers': 'x-wf-client' } });
check('preflight from other origin gets no CORS grant', !r.headers.get('access-control-allow-origin'));
console.log(`\n${pass} passed, ${fail} failed`);
await mf.dispose();
process.exit(fail ? 1 : 0);
