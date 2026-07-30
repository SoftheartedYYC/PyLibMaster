const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

const pipManager = require('./core/pipManager');
const mirrorManager = require('./core/mirrorManager');
const envManager = require('./core/envManager');
const backupManager = require('./core/backupManager');
const logManager = require('./core/logManager');
const configManager = require('./core/configManager');
const { isAllowedOpenPath } = require('./utils/security');
const updater = require('./core/updater');

let mainWindow;

function createWindow() {
  const savedBounds = configManager.getConfig().windowBounds || {};
  const defaultBounds = { width: 1200, height: 760 };
  const bounds = { ...defaultBounds, ...savedBounds };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'renderer', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  function saveWindowBounds() {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    configManager.setConfig('windowBounds', { x, y, width, height });
  }

  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);
  mainWindow.on('closed', () => {
    saveWindowBounds();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  updater.initUpdater(mainWindow);
  envManager.startDetection();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  const { cancelAllProcesses } = require('./utils/processRunner');
  const count = cancelAllProcesses();
  if (count > 0) {
    console.log(`[shutdown] Cancelled ${count} active process(es) before quit`);
  }
});

// ============ Window controls ============
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

// ============ Environment ============
ipcMain.handle('env:detect', async () => envManager.detectEnvironments());
ipcMain.handle('env:getCurrent', () => envManager.getCurrent());
ipcMain.handle('env:switch', (event, envPath) => envManager.switchEnvironment(envPath));

// ============ Query ============
ipcMain.handle('pip:list', async () => pipManager.listInstalled());
ipcMain.handle('pip:listCached', async () => pipManager.listInstalledCached());
ipcMain.handle('pip:outdated', async () => pipManager.listOutdated());
ipcMain.handle('pip:search', async (event, keyword) => pipManager.searchPackage(keyword));

// ============ Install / Uninstall / Update ============
ipcMain.handle('pip:install', async (event, packages, options) => {
  return pipManager.installPackages(packages, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'install', data, type });
  });
});

ipcMain.handle('pip:installFromFile', async (event, filePath, options) => {
  return pipManager.installFromFile(filePath, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'install', data, type });
  });
});

ipcMain.handle('pip:uninstall', async (event, packages, options) => {
  return pipManager.uninstallPackages(packages, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'uninstall', data, type });
  });
});

ipcMain.handle('pip:update', async (event, packages, options) => {
  return pipManager.updatePackages(packages, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'update', data, type });
  });
});
ipcMain.handle('pip:cancel', async (event, operationId) => {
  return pipManager.cancelPipOperation(operationId);
});

// ============ Backup / Rollback ============
ipcMain.handle('backup:create', async () => backupManager.createBackup(envManager.getCurrent()));
ipcMain.handle('backup:list', async () => backupManager.listBackups());
ipcMain.handle('backup:restore', async (event, backupId) => {
  return backupManager.restoreBackup(backupId, envManager.getCurrent(), (data, type) => {
    event.sender.send('pip:progress', { operation: 'rollback', data, type });
  });
});
ipcMain.handle('backup:delete', async (event, backupId) => backupManager.deleteBackup(backupId));

// ============ Mirrors ============
ipcMain.handle('mirror:list', () => mirrorManager.getMirrors());
ipcMain.handle('mirror:test', async (event, url) => mirrorManager.testMirrorSpeed(url));
ipcMain.handle('mirror:testAll', async () => mirrorManager.testAllMirrors());
ipcMain.handle('mirror:setDefault', (event, url) => mirrorManager.setDefaultMirror(url));
ipcMain.handle('mirror:addCustom', (event, name, url, remark) => mirrorManager.addCustomMirror(name, url, remark));
ipcMain.handle('mirror:update', (event, url, updates) => mirrorManager.updateMirror(url, updates));
ipcMain.handle('mirror:removeCustom', (event, url) => mirrorManager.removeCustomMirror(url));
ipcMain.handle('mirror:restoreDefaults', () => mirrorManager.restoreDefaultMirrors());
ipcMain.handle('mirror:smartRoute', (event, enabled) => mirrorManager.setSmartRoute(enabled));
ipcMain.handle('mirror:getSmartRoute', () => mirrorManager.getSmartRoute());
ipcMain.handle('mirror:writePipConfig', async () => mirrorManager.writePipConfig(envManager.getCurrent()));

// ============ Logs ============
ipcMain.handle('log:get', async (event, filter) => logManager.getLogs(filter));
ipcMain.handle('log:clear', async () => logManager.clearLogs());
ipcMain.handle('log:add', async (event, entry) => logManager.addLog(entry));

// ============ Config ============
ipcMain.handle('config:get', () => configManager.getConfig());
ipcMain.handle('config:set', (event, key, value) => configManager.setConfig(key, value));
ipcMain.handle('config:setBulk', (event, updates) => configManager.setBulk(updates));

// ============ Updater ============
ipcMain.handle('updater:check', async () => updater.checkForUpdates());
ipcMain.handle('updater:install', () => updater.quitAndInstall());

// ============ System ============

ipcMain.handle('system:version', () => ({ version: app.getVersion(), name: app.getName() }));
ipcMain.handle('system:browseDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('system:browseFile', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('system:openPath', async (event, filePath) => {
  const allowedDirs = [
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('userData')
  ];
  if (!isAllowedOpenPath(filePath, allowedDirs)) {
    console.warn(`Blocked attempt to open path outside allowed directories: ${filePath}`);
    return false;
  }
  try {
    await shell.openPath(filePath);
    return true;
  } catch (err) {
    return false;
  }
});
