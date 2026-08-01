/**
 * @file explorerManager.js
 * @description Windows 资源管理器右键菜单集成
 * 
 * 职责：
 * - 管理 Windows 资源管理器右键菜单的注册/注销
 * - 通过 HKCU 注册表项实现（无需管理员权限）
 * - 提供「用 PyLibMaster 打开」和「在此创建虚拟环境」两个菜单项
 */

const { execSync } = require('child_process');
const path = require('path');
const logManager = require('./logManager');

// 注册表路径（HKCU 不需要管理员权限）
const REG_BASE = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\PyLibMaster';
const REG_OPEN = `${REG_BASE}\\command`;
const REG_VENV = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\PyLibMasterVenv';
const REG_VENV_CMD = `${REG_VENV}\\command`;

/**
 * 获取当前应用的可执行文件路径
 * @returns {string} exe 路径
 */
function getExePath() {
  if (process.platform !== 'win32') return '';
  // 打包后使用 process.execPath，开发时使用 electron.exe
  const { app } = require('electron');
  if (app.isPackaged) {
    return process.execPath;
  }
  // 开发模式：使用 electron 运行 main.js
  return `"${process.execPath}" "${path.join(__dirname, '..', 'main.js')}"`;
}

/**
 * 检查右键菜单是否已启用
 * @returns {boolean}
 */
function isContextMenuEnabled() {
  if (process.platform !== 'win32') return false;
  try {
    execSync(`reg query "${REG_BASE}" /ve`, { windowsHide: true, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 启用右键菜单
 * @returns {{ success: boolean, message: string }}
 */
function enableContextMenu() {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Only supported on Windows' };
  }

  try {
    const exePath = getExePath();
    const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'icon.ico');

    // 主菜单项：用 PyLibMaster 打开
    execSync(`reg add "${REG_BASE}" /ve /d "用 PyLibMaster 打开" /f`, { windowsHide: true, timeout: 5000 });
    execSync(`reg add "${REG_BASE}" /v "Icon" /d "${iconPath}" /f`, { windowsHide: true, timeout: 5000 });
    execSync(`reg add "${REG_OPEN}" /ve /d "${exePath} --open-dir \\"%V\\"" /f`, { windowsHide: true, timeout: 5000 });

    // 子菜单项：在此创建虚拟环境
    execSync(`reg add "${REG_VENV}" /ve /d "在此创建虚拟环境" /f`, { windowsHide: true, timeout: 5000 });
    execSync(`reg add "${REG_VENV}" /v "Icon" /d "${iconPath}" /f`, { windowsHide: true, timeout: 5000 });
    execSync(`reg add "${REG_VENV_CMD}" /ve /d "${exePath} --create-venv \\"%V\\"" /f`, { windowsHide: true, timeout: 5000 });

    logManager.addLog({ action: 'Enable Explorer context menu', status: 'ok', type: 'system' });
    return { success: true, message: '右键菜单已启用' };
  } catch (err) {
    logManager.addLog({ action: 'Enable Explorer context menu failed', status: 'failed', type: 'system', detail: err.message });
    return { success: false, message: `启用失败: ${err.message}` };
  }
}

/**
 * 禁用右键菜单
 * @returns {{ success: boolean, message: string }}
 */
function disableContextMenu() {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Only supported on Windows' };
  }

  try {
    // /f 强制删除，不确认
    try { execSync(`reg delete "${REG_BASE}" /f`, { windowsHide: true, timeout: 5000 }); } catch { /* 可能不存在 */ }
    try { execSync(`reg delete "${REG_VENV}" /f`, { windowsHide: true, timeout: 5000 }); } catch { /* 可能不存在 */ }

    logManager.addLog({ action: 'Disable Explorer context menu', status: 'ok', type: 'system' });
    return { success: true, message: '右键菜单已禁用' };
  } catch (err) {
    logManager.addLog({ action: 'Disable Explorer context menu failed', status: 'failed', type: 'system', detail: err.message });
    return { success: false, message: `禁用失败: ${err.message}` };
  }
}

/**
 * 获取右键菜单状态
 * @returns {{ enabled: boolean, platform: string }}
 */
function getStatus() {
  return {
    enabled: isContextMenuEnabled(),
    platform: process.platform
  };
}

module.exports = {
  isContextMenuEnabled,
  enableContextMenu,
  disableContextMenu,
  getStatus
};
