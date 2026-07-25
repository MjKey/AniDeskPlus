const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('titleBarAPI', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
});

contextBridge.exposeInMainWorld('analytics', {
  trackEvent: () => {}
});

contextBridge.exposeInMainWorld('winApi', {
  openLink: (link) => ipcRenderer.invoke('winApi:openLink', link),
});

contextBridge.exposeInMainWorld('systemPower', {
  sleep: () => ipcRenderer.invoke('power:sleep'),
  shutdown: () => ipcRenderer.invoke('power:shutdown'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
});

contextBridge.exposeInMainWorld('Sibnet', {
  Parse: (link) => ipcRenderer.invoke('sibnet:parse', link),
});

contextBridge.exposeInMainWorld('elecWindow', {
  getSize: () => ipcRenderer.invoke('window:getSize'),
  exitFullscreen: () => ipcRenderer.invoke('window:leaveFullScreen'),
  enterFullscreen: () => ipcRenderer.invoke('window:enterFullScreen'),
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  onFullscreenChange: (callback) => {
    const handler = (_, isFs) => callback(isFs);
    ipcRenderer.on('fullscreen:changed', handler);
    return () => ipcRenderer.removeListener('fullscreen:changed', handler);
  }
});

contextBridge.exposeInMainWorld('netElec', {
  fetch: (url, requestInfo) => ipcRenderer.invoke('netElec:fetch', url, requestInfo),
});

contextBridge.exposeInMainWorld('prc', {
  getVersions: () => ipcRenderer.invoke('prc:getVersions'),
  isDebug: () => ipcRenderer.invoke('prc:isDebug'),
});

contextBridge.exposeInMainWorld('notify', {
  send: (data) => ipcRenderer.invoke('notify:send', data),
  onNavigateRelease: (callback) => {
    const handler = (_, releaseId) => callback(releaseId);
    ipcRenderer.on('navigate:release', handler);
    return () => ipcRenderer.removeListener('navigate:release', handler);
  }
});

contextBridge.exposeInMainWorld('debugApi', {
  onLog: (callback) => {
    const handler = (_, log) => callback(log);
    ipcRenderer.on('debug:log', handler);
    return () => ipcRenderer.removeListener('debug:log', handler);
  },
  sendLog: (type, message, data) => ipcRenderer.invoke('debug:send', { type, message, data })
});

contextBridge.exposeInMainWorld('shikimoriAuth', {
  exchangeCode: (authCode, domain) =>
    ipcRenderer.invoke('shikimori:exchangeCode', { authCode, domain }),
  refreshToken: (refreshToken, domain) =>
    ipcRenderer.invoke('shikimori:refreshToken', { refreshToken, domain }),
});

contextBridge.exposeInMainWorld('discordRPC', {
  setActivity: (activity) => ipcRenderer.invoke('discordRPC:setActivity', activity),
});

contextBridge.exposeInMainWorld('settings', {
  getAll: () => ipcRenderer.invoke('settings:getAll'),
  get: (key) => ipcRenderer.invoke('settings:get', key),
  set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
});

contextBridge.exposeInMainWorld('updater', {
  check: () => ipcRenderer.invoke('updater:check'),
  install: () => ipcRenderer.invoke('updater:install'),
  onStatus: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  }
});

contextBridge.exposeInMainWorld('episodeDownloader', {
  download: (url, defaultFileName, referer) =>
    ipcRenderer.invoke('download:episode', { url, defaultFileName, referer }),
  onProgress: (callback) => {
    const handler = (_, progress) => callback(progress);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  }
});