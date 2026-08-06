/**
 * @file updater.js
 * @description 应用自动更新管理器
 * 
 * 职责：
 * - 基于 electron-updater 实现应用自动更新功能
 * - 监听更新事件（检查、下载、完成、错误）并转发给渲染进程
 * - 记录更新相关日志
 * - 提供检查更新和安装更新的 API
 * 
 * 更新流程：
 * 1. 检查更新 → 2. 发现新版本 → 3. 自动下载 → 4. 下载完成 → 5. 用户确认安装 → 6. 重启应用
 */

const { autoUpdater } = require('electron-updater');
const logManager = require('./logManager');

// 配置 autoUpdater：发现新版本后自动下载安装包
autoUpdater.autoDownload = true;          // 自动下载更新
autoUpdater.autoInstallOnAppQuit = false; // 不自动安装，等待用户确认
autoUpdater.autoRunAppAfterInstall = true; // 安装后自动启动应用

// 主窗口引用，用于发送更新事件
let mainWindow = null;
// 防止重复检查更新的标志
let checkInProgress = false;

/**
 * 向渲染进程发送更新事件
 * @param {string} channel - IPC 频道名称
 * @param {*} data - 事件数据
 */
function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * 提取更新信息中的可序列化字段
 * - 避免将 electron-updater 原始对象（可能含内部引用）直接通过 IPC 传输
 * @param {Object} info - electron-updater 的 updateInfo 对象
 * @returns {Object} 纯 JSON 可序列化对象
 */
function sanitizeUpdateInfo(info) {
  if (!info) return {};
  return {
    version: info.version || '',
    releaseDate: info.releaseDate || '',
    releaseName: info.releaseName || '',
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
  };
}

/**
 * 提取下载进度中的可序列化字段
 * @param {Object} progress - electron-updater 的 download-progress 对象
 * @returns {Object} 纯 JSON 可序列化对象
 */
function sanitizeProgress(progress) {
  if (!progress) return { percent: 0 };
  return {
    percent: Number(progress.percent) || 0,
    bytesPerSecond: Number(progress.bytesPerSecond) || 0,
    transferred: Number(progress.transferred) || 0,
    total: Number(progress.total) || 0
  };
}

/**
 * 初始化更新器，绑定所有更新事件
 * @param {BrowserWindow} win - 主窗口实例
 */
function initUpdater(win) {
  mainWindow = win;

  // 正在检查是否有新版本
  autoUpdater.on('checking-for-update', () => {
    send('updater:checking');
  });

  // 发现新版本可用，开始自动下载
  autoUpdater.on('update-available', (info) => {
    send('updater:available', sanitizeUpdateInfo(info));
    logManager.addLog({ action: 'Update available', status: 'ok', type: 'system', detail: `v${info.version}` });
  });

  // 当前已是最新版本，无需更新
  autoUpdater.on('update-not-available', (info) => {
    send('updater:not-available', sanitizeUpdateInfo(info));
    checkInProgress = false;
  });

  // 下载进度更新（包含百分比、速度等信息）
  autoUpdater.on('download-progress', (progress) => {
    send('updater:progress', sanitizeProgress(progress));
  });

  // 更新包已下载完成，等待用户确认安装
  autoUpdater.on('update-downloaded', (info) => {
    send('updater:downloaded', sanitizeUpdateInfo(info));
    logManager.addLog({ action: 'Update downloaded', status: 'ok', type: 'system', detail: `v${info.version}` });
    checkInProgress = false;
    // 下载完成后发送系统通知提醒用户安装
    try {
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: '更新已就绪',
          body: `v${info.version} 安装包已下载完成，点击应用内“立即安装”按钮即可升级。`
        });
        notification.show();
      }
    } catch { /* 通知发送失败时静默处理 */ }
  });

  // 更新过程中发生错误
  autoUpdater.on('error', (err) => {
    send('updater:error', { message: err.message });
    logManager.addLog({ action: 'Updater error', status: 'failed', type: 'system', detail: err.message });
    checkInProgress = false;
  });
}

/**
 * 检查是否有新版本可用
 * - 防止重复检查（checkInProgress 标志）
 * - 返回纯 JSON 可序列化对象（避免 IPC "object could not be cloned" 错误）
 * - 异常时抛出纯字符串 Error，避免原始错误对象含不可序列化属性导致 IPC 传输失败
 * @returns {Promise<Object>} 检查结果（仅含可序列化字段）
 */
async function checkForUpdates() {
  if (checkInProgress) return { checking: true };
  checkInProgress = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    // 仅提取可序列化的 updateInfo 字段，避免返回含内部引用的对象
    if (result && result.updateInfo) {
      return {
        checking: false,
        updateInfo: {
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate || '',
          releaseName: result.updateInfo.releaseName || '',
          releaseNotes: typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : ''
        }
      };
    }
    return { checking: false };
  } catch (err) {
    checkInProgress = false;
    // 重要：抛出纯错误消息，避免原始 Error 对象上挂着的不可序列化属性
    // （如 electron-updater 内部引用）导致 IPC "object could not be cloned" 错误
    throw new Error(err && err.message ? String(err.message) : '检查更新失败');
  }
}

/**
 * 退出应用并安装已下载的更新
 * 会立即关闭应用并启动更新安装程序
 */
function quitAndInstall() {
  autoUpdater.quitAndInstall();
}

module.exports = { initUpdater, checkForUpdates, quitAndInstall };
