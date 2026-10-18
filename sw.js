/*
 * Offline support for warframe.hardn.net.
 * App files: served from cache, refreshed in the background (stale-while-revalidate).
 * Item images (cdn.warframestat.us): cache-first, capped. The accounts API is never cached.
 */
const VERSION = 'wfcalc-v21';
const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest', 'favicon.svg', 'favicon-32.png', 'icon-192.png', 'icon-512.png',
  'ui/style.css', 'ui/app.js', 'ui/features.js', 'ui/layout.js', 'ui/background.js', 'ui/news.js', 'ui/changelog.js', 'ui/riven.js', 'ui/teshin.js', 'ui/sim.js', 'ui/tips.js', 'src/sim.js', 'learn.html', 'data/changelog.js',
  'src/static.js', 'src/parser.js', 'src/engine.js', 'src/optimizer.js', 'src/enemy.js', 'src/capacity.js', 'src/incarnon.js', 'src/riven.js', 'src/teshin.js',
  'data/game-data.js'
];
const IMG_CACHE = 'wfcalc-img';
const IMG_MAX = 600;

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser HTTP cache so a new version never stores old files
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'warframe-api.hardn.net') return; // never cache account data
  if (url.hostname === 'api.warframestat.us') return; // live world state, always from the network
  if (url.hostname === 'cdn.warframestat.us') {
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') {
        c.put(req, res.clone());
        c.keys().then(k => { if (k.length > IMG_MAX) c.delete(k[0]); });
      }
      return res;
    }).catch(() => fetch(req)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/vendor/')) return; // the 11 MB text reader: browser HTTP cache only, loaded on demand
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    // revalidate past the HTTP cache, and store under the plain path so cache-busting query strings do not pile up
    const net = fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) c.put(url.origin + url.pathname, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
