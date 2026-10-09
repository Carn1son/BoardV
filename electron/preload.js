// Exposes one safe bridge to the page: boards opened from Windows (double-click / "Open with") and app updates.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bvDesktop', {
  onOpenFiles: (cb) => ipcRenderer.on('open-files', (_e, files) => cb(files)),
  ready: () => ipcRenderer.send('renderer-ready'),
  share: {
    start: (blob) => ipcRenderer.invoke('share-start', blob),
    decide: (id, ok) => ipcRenderer.send('share-decide', { id, ok }),
    stop: () => ipcRenderer.send('share-stop'),
    on: (cb) => ipcRenderer.on('share', (_e, m) => cb(m)),
  },
  update: {
    check: () => ipcRenderer.invoke('upd-check'),
    download: () => ipcRenderer.invoke('upd-download'),
    install: () => ipcRenderer.send('upd-install'),
    on: (cb) => ipcRenderer.on('upd', (_e, m) => cb(m)),
  },
});
