const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wfApp', {
  isDesktop: true,
  data: ipcRenderer.sendSync('wf:get-data'),
  updateData: () => ipcRenderer.invoke('wf:update-data'),
  appVersion: () => ipcRenderer.invoke('wf:app-version'),
  checkAppUpdate: () => ipcRenderer.invoke('wf:check-app-update'),
  updateStatus: () => ipcRenderer.invoke('wf:update-status'),
  installUpdate: () => ipcRenderer.invoke('wf:install-update'),
  onUpdateStatus: cb => { ipcRenderer.on('wf:update-status', (e, s) => cb(s)); },
  openExternal: url => ipcRenderer.invoke('wf:open-external', url),
  login: () => ipcRenderer.invoke('wf:login'),
  linkTwitch: () => ipcRenderer.invoke('wf:link-twitch'),
  api: (path, opts) => ipcRenderer.invoke('wf:api', path, opts),
  config: () => ipcRenderer.invoke('wf:config')
});
