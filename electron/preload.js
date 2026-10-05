'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectPhotoFolder: () => ipcRenderer.invoke('dialog:selectPhotoFolder'),
  selectWatermark: () => ipcRenderer.invoke('dialog:selectWatermark'),
  listImages: (folder) => ipcRenderer.invoke('fs:listImages', folder),
  loadImage: (filePath, lossless) => ipcRenderer.invoke('img:load', filePath, lossless),
  prepareOutputDir: (sourceFolder) => ipcRenderer.invoke('fs:prepareOutputDir', sourceFolder),
  saveImage: (outDir, filename, arrayBuffer) =>
    ipcRenderer.invoke('img:save', outDir, filename, arrayBuffer),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Auto-update
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, d) => cb(d)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, d) => cb(d)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, d) => cb(d))
});
