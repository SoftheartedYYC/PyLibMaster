const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  // Environment
  detectEnvironments: () => ipcRenderer.invoke('env:detect'),
  getCurrentEnv: () => ipcRenderer.invoke('env:getCurrent'),
  switchEnvironment: (envPath) => ipcRenderer.invoke('env:switch', envPath),

  // Query
  listInstalled: () => ipcRenderer.invoke('pip:list'),
  listInstalledCached: () => ipcRenderer.invoke('pip:listCached'),
  listOutdated: () => ipcRenderer.invoke('pip:outdated'),
  searchPackage: (keyword) => ipcRenderer.invoke('pip:search', keyword),

  // Operations
  installPackages: (packages, options) => ipcRenderer.invoke('pip:install', packages, options),
  installFromFile: (filePath, options) => ipcRenderer.invoke('pip:installFromFile', filePath, options),
  uninstallPackages: (packages, options) => ipcRenderer.invoke('pip:uninstall', packages, options),
  updatePackages: (packages, options) => ipcRenderer.invoke('pip:update', packages, options),
  cancelPipOperation: (operationId) => ipcRenderer.invoke('pip:cancel', operationId),

  // Backup
  createBackup: () => ipcRenderer.invoke('backup:create'),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (backupId) => ipcRenderer.invoke('backup:restore', backupId),
  deleteBackup: (backupId) => ipcRenderer.invoke('backup:delete', backupId),

  // Mirrors
  getMirrors: () => ipcRenderer.invoke('mirror:list'),
  testMirrorSpeed: (url) => ipcRenderer.invoke('mirror:test', url),
  testAllMirrors: () => ipcRenderer.invoke('mirror:testAll'),
  setDefaultMirror: (url) => ipcRenderer.invoke('mirror:setDefault', url),
  addCustomMirror: (name, url, remark) => ipcRenderer.invoke('mirror:addCustom', name, url, remark),
  updateMirror: (url, updates) => ipcRenderer.invoke('mirror:update', url, updates),
  removeCustomMirror: (url) => ipcRenderer.invoke('mirror:removeCustom', url),
  restoreDefaultMirrors: () => ipcRenderer.invoke('mirror:restoreDefaults'),
  setSmartRoute: (enabled) => ipcRenderer.invoke('mirror:smartRoute', enabled),
  getSmartRoute: () => ipcRenderer.invoke('mirror:getSmartRoute'),
  writePipMirrorConfig: () => ipcRenderer.invoke('mirror:writePipConfig'),

  // Logs
  getLogs: (filter) => ipcRenderer.invoke('log:get', filter),
  clearLogs: () => ipcRenderer.invoke('log:clear'),
  addLog: (entry) => ipcRenderer.invoke('log:add', entry),

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  setConfigBulk: (updates) => ipcRenderer.invoke('config:setBulk', updates),

  // System
  getAppVersion: () => ipcRenderer.invoke('system:version'),
  browseDirectory: () => ipcRenderer.invoke('system:browseDirectory'),
  browseFile: (filters) => ipcRenderer.invoke('system:browseFile', filters),
  openPath: (filePath) => ipcRenderer.invoke('system:openPath', filePath),

  // Progress events
  onProgress: (callback) => {
    ipcRenderer.removeAllListeners('pip:progress');
    ipcRenderer.on('pip:progress', (event, payload) => callback(payload));
  },
  removeProgressListener: (callback) => ipcRenderer.removeListener('pip:progress', callback),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterChecking: (callback) => {
    ipcRenderer.removeAllListeners('updater:checking');
    ipcRenderer.on('updater:checking', () => callback());
  },
  onUpdaterAvailable: (callback) => {
    ipcRenderer.removeAllListeners('updater:available');
    ipcRenderer.on('updater:available', (event, info) => callback(info));
  },
  onUpdaterNotAvailable: (callback) => {
    ipcRenderer.removeAllListeners('updater:not-available');
    ipcRenderer.on('updater:not-available', (event, info) => callback(info));
  },
  onUpdaterProgress: (callback) => {
    ipcRenderer.removeAllListeners('updater:progress');
    ipcRenderer.on('updater:progress', (event, progress) => callback(progress));
  },
  onUpdaterDownloaded: (callback) => {
    ipcRenderer.removeAllListeners('updater:downloaded');
    ipcRenderer.on('updater:downloaded', (event, info) => callback(info));
  },
  onUpdaterError: (callback) => {
    ipcRenderer.removeAllListeners('updater:error');
    ipcRenderer.on('updater:error', (event, err) => callback(err));
  }
});
