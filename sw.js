/*
 * Offline support for warframe.hardn.net.
 * App files: served from cache, refreshed in the background (stale-while-revalidate).
 * Item images (cdn.warframestat.us): cache-first, capped. The accounts API is never cached.
 */
const VERSION = 'wfcalc-v11';
const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest', 'favicon.svg', 'favicon-32.png', 'icon-192.png', 'icon-512.png',
  'ui/style.css', 'ui/app.js', 'ui/features.js', 'ui/layout.js', 'ui/background.js', 'ui/changelog.js', 'data/changelog.js',
  'src/static.js', 'src/parser.js', 'src/engine.js', 'src/optimizer.js', 'src/enemy.js', 'src/capacity.js', 'src/incarnon.js',
  'data/game-data.js'
];
const IMG_CACHE = 'wfcalc-img';
const IMG_MAX = 600;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'warframe-api.hardn.net') return; // never cache account data
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
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
