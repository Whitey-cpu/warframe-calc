const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wfApp', {
  isDesktop: true,
  data: ipcRenderer.sendSync('wf:get-data'),
  updateData: () => ipcRenderer.invoke('wf:update-data'),
  appVersion: () => ipcRenderer.invoke('wf:app-version')
});
