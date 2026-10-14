const { app, BrowserWindow, ipcMain, net, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { fetchLatest } = require('./updater.js');

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
  fs.mkdirSync(path.dirname(userDataFile()), { recursive: true });
  const tmp = userDataFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(res.data));
  fs.renameSync(tmp, userDataFile());
  return { upToDate: false, version: res.version, weapons: res.data.weapons.length, mods: res.data.mods.length };
});
ipcMain.handle('wf:app-version', () => app.getVersion());

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
