const { autoUpdater } = require('electron-updater');
const logManager = require('./logManager');

let mainWindow = null;
let checkInProgress = false;

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function initUpdater(win) {
  mainWindow = win;

  autoUpdater.on('checking-for-update', () => {
    send('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    send('updater:available', info);
    logManager.addLog({ action: 'Update available', status: 'ok', type: 'system', detail: `v${info.version}` });
  });

  autoUpdater.on('update-not-available', (info) => {
    send('updater:not-available', info);
    checkInProgress = false;
  });

  autoUpdater.on('download-progress', (progress) => {
    send('updater:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    send('updater:downloaded', info);
    logManager.addLog({ action: 'Update downloaded', status: 'ok', type: 'system', detail: `v${info.version}` });
    checkInProgress = false;
  });

  autoUpdater.on('error', (err) => {
    send('updater:error', { message: err.message });
    logManager.addLog({ action: 'Updater error', status: 'failed', type: 'system', detail: err.message });
    checkInProgress = false;
  });
}

async function checkForUpdates() {
  if (checkInProgress) return { checking: true };
  checkInProgress = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    return result || { checking: false };
  } catch (err) {
    checkInProgress = false;
    throw err;
  }
}

function quitAndInstall() {
  autoUpdater.quitAndInstall();
}

module.exports = { initUpdater, checkForUpdates, quitAndInstall };
