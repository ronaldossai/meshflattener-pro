const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  saveFileDialog: (opts) => ipcRenderer.invoke('save-file-dialog', opts),
});
