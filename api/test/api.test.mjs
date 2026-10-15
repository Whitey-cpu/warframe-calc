import { Miniflare } from 'miniflare';
import fs from 'fs';
const W = new URL('..', import.meta.url).pathname;
const mf = new Miniflare({
  modules: true, script: fs.readFileSync(`${W}/src/worker.js`, 'utf8'), scriptPath: 'worker.js', compatibilityDate: '2026-08-01',
  d1Databases: { DB: 'test-db' },
  bindings: { ALLOWED_ORIGINS: 'https://warframe.hardn.net', DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'secret', DISCORD_REDIRECT_URI: 'https://warframe-api.hardn.net/auth/discord/callback' },
  outboundService: async (req) => {
    const u = new URL(req.url);
    if (u.pathname === '/api/oauth2/token') { const b = new URLSearchParams(await req.text()); if (b.get('code') !== 'good' || b.get('client_secret') !== 'secret') return new Response('bad', { status: 400 }); return Response.json({ access_token: 'at' }); }
    if (u.pathname === '/api/users/@me') return Response.json({ id: '1234567890', username: 'ethan', global_name: 'Ethan', avatar: 'abc' });
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
r = await W8('DELETE', '/builds/' + encodeURIComponent('Soma SP')); check('delete build', r.status === 200);
r = await W8('DELETE', '/me'); check('delete account', r.status === 200);
const left = await db.prepare('SELECT (SELECT COUNT(*) FROM users)+(SELECT COUNT(*) FROM sessions)+(SELECT COUNT(*) FROM shares)+(SELECT COUNT(*) FROM owned) AS n').first();
check('account delete removes all data', left.n === 0);
r = await go('/me', { headers: C }); check('session invalid after delete', r.status === 401);
r = await go('/me', { method: 'OPTIONS', headers: { Origin: SITE } }); check('CORS preflight', r.status === 204 && r.headers.get('access-control-allow-credentials') === 'true');
console.log(`\n${pass} passed, ${fail} failed`);
await mf.dispose();
process.exit(fail ? 1 : 0);
