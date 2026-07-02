const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  defaults: () => ipcRenderer.invoke('defaults'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  checkLogin: () => ipcRenderer.invoke('check-login'),
  login: () => ipcRenderer.invoke('login'),
  buildQueue: (source, opts) => ipcRenderer.invoke('build-queue', { source, opts }),
  getQueue: (source) => ipcRenderer.invoke('get-queue', source),
  run: (source, opts) => ipcRenderer.invoke('run', { source, opts }),
  openOutput: (source) => ipcRenderer.invoke('open-output', source),
  slug: (source) => ipcRenderer.invoke('slug', source),
  onLog: (cb) => ipcRenderer.on('log', (_e, line) => cb(line)),
  onRunState: (cb) => ipcRenderer.on('run-state', (_e, s) => cb(s)),
});
