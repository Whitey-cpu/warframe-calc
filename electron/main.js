const { app, BrowserWindow, ipcMain, net, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { fetchLatest } = require('./updater.js');
const { diffData } = require('../src/build-data.js');

// Accounts API and site (overridable for local testing)
const API = process.env.WF_API || 'https://warframe-api.hardn.net';
const SITE = process.env.WF_SITE || 'https://warframe.hardn.net';
const RELEASES_API = 'https://api.github.com/repos/Whitey-cpu/warframe-calc/releases/latest';

const ROOT = path.join(__dirname, '..');
const userDataFile = () => path.join(app.getPath('userData'), 'game-data.json');
const bundledFile = path.join(ROOT, 'data', 'game-data.json');

// Use the downloaded dataset if it exists and parses; otherwise the one shipped with the app.
function loadData() {
  for (const f of [userDataFile(), bundledFile]) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* try next */ }
  }
  return null;
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 950, minWidth: 420, minHeight: 500,
    title: 'Warframe Damage Calc',
    backgroundColor: '#0f1115',
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.loadFile(path.join(ROOT, 'index.html'));
  // open external links (wiki etc.) in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
}

ipcMain.on('wf:get-data', e => { e.returnValue = loadData(); });
ipcMain.handle('wf:update-data', async () => {
  const cur = loadData();
  // Chromium networking first (uses Windows proxy/cert settings), Node fetch as a fallback.
  const fetchFn = async url => {
    try { return await net.fetch(url); } catch (e) { return await fetch(url); }
  };
  const res = await fetchLatest(fetchFn, cur && cur.meta && cur.meta.version);
  if (res.upToDate) return { upToDate: true, version: res.version };
  if (cur && cur.meta) {
    try { res.data.meta.changes = diffData(cur, res.data); res.data.meta.previousVersion = cur.meta.version; } catch (e) { /* diff is optional */ }
  }
  fs.mkdirSync(path.dirname(userDataFile()), { recursive: true });
  const tmp = userDataFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(res.data));
  fs.renameSync(tmp, userDataFile());
  return { upToDate: false, version: res.version, weapons: res.data.weapons.length, mods: res.data.mods.length };
});
ipcMain.handle('wf:app-version', () => app.getVersion());

// ---- app update check (GitHub releases) ----
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; }
  return false;
}
ipcMain.handle('wf:check-app-update', async () => {
  try {
    const r = await net.fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'warframe-calc-desktop' } });
    if (!r.ok) return { ok: false };
    const j = await r.json();
    const asset = (j.assets || []).find(a => /\.exe$/i.test(a.name));
    return { ok: true, current: app.getVersion(), latest: String(j.tag_name || '').replace(/^v/, ''), available: newer(j.tag_name, app.getVersion()) && !!asset, url: j.html_url };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('wf:open-external', (e, url) => { if (/^https:\/\/(github\.com|warframe\.hardn\.net|wiki\.warframe\.com)\//.test(url)) shell.openExternal(url); });

// ---- Discord sign-in + API calls from the main process (cookies live in the default session) ----
ipcMain.handle('wf:login', () => new Promise(resolve => {
  const w = new BrowserWindow({ width: 520, height: 780, parent: win, modal: true, title: 'Sign in with Discord', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  let done = false;
  const finish = ok => { if (done) return; done = true; resolve(ok); if (!w.isDestroyed()) w.close(); };
  const check = url => {
    if (url.startsWith(SITE)) finish(!/login-error/.test(url));
  };
  w.webContents.on('will-redirect', (e, url) => { if (url.startsWith(SITE)) { e.preventDefault(); check(url); } });
  w.webContents.on('will-navigate', (e, url) => { if (url.startsWith(SITE)) { e.preventDefault(); check(url); } });
  w.webContents.on('did-navigate', (e, url) => check(url));
  w.on('closed', () => finish(false));
  w.loadURL(`${API}/auth/discord/login?return=${encodeURIComponent(SITE + '/#desktop-login')}`);
}));
ipcMain.handle('wf:api', async (e, path, opts = {}) => {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('bad path');
  const headers = { 'X-WF-Client': 'desktop' };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const r = await session.defaultSession.fetch(API + path, { method: opts.method || 'GET', body: opts.body, headers, credentials: 'include' });
  let body = null; try { body = await r.json(); } catch (err) { /* empty */ }
  return { status: r.status, ok: r.ok, body };
});
ipcMain.handle('wf:config', () => ({ api: API, site: SITE }));

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'File', submenu: [{ role: 'reload', label: 'Reload' }, { type: 'separator' }, { role: 'quit' }] },
  { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
  { label: 'Help', submenu: [
    { label: 'WARFRAME Wiki: Damage calculation', click: () => shell.openExternal('https://wiki.warframe.com/w/Damage_calculation') },
    { label: 'Patch notes', click: () => shell.openExternal('https://www.warframe.com/en/patch-notes') },
    { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) }
  ] }
]));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
