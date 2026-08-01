/**
 * @file undoManager.js
 * @description 操作撤销管理器
 * 
 * 职责：
 * - 记录安装/卸载/更新操作的历史栈
 * - 提供撤销功能（执行逆向操作）
 * - 最多保留 20 条操作记录
 */

const logManager = require('../system/logManager');

const MAX_UNDO_STACK = 20;
const undoStack = [];

/**
 * 记录一次操作到撤销栈
 * @param {string} type - 操作类型: install | uninstall | update
 * @param {Array} packages - 涉及的包列表 [{name, version}]
 * @param {Object} [meta] - 附加信息（如更新前的旧版本）
 */
function recordOperation(type, packages, meta = {}) {
  if (!packages || packages.length === 0) return;
  undoStack.push({
    type,
    packages: packages.map(p => ({ name: p.name, version: p.version || '' })),
    meta,
    time: new Date().toISOString()
  });
  if (undoStack.length > MAX_UNDO_STACK) {
    undoStack.shift();
  }
}

/**
 * 是否可以撤销
 * @returns {{ available: boolean, lastAction: string|null }}
 */
function canUndo() {
  if (undoStack.length === 0) return { available: false, lastAction: null };
  const last = undoStack[undoStack.length - 1];
  const typeMap = { install: '安装', uninstall: '卸载', update: '更新' };
  const names = last.packages.slice(0, 3).map(p => p.name).join(', ');
  const suffix = last.packages.length > 3 ? ` 等${last.packages.length}个包` : '';
  return {
    available: true,
    lastAction: `撤销${typeMap[last.type] || last.type}: ${names}${suffix}`,
    type: last.type,
    time: last.time
  };
}

/**
 * 获取最近一条操作记录
 * @returns {Object|null}
 */
function getLastOperation() {
  return undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
}

/**
 * 执行撤销操作
 * @param {Function} [onOutput] - 进度回调
 * @returns {Promise<Object>} 撤销结果
 */
async function performUndo(onOutput) {
  if (undoStack.length === 0) throw new Error('No operation to undo');

  const pipManager = require('./pipManager');
  const operation = undoStack.pop();
  const { type, packages, meta } = operation;

  if (onOutput) onOutput(`[UNDO] Reverting ${type}: ${packages.map(p => p.name).join(', ')}\n`, 'stdout');

  try {
    let result;
    if (type === 'install') {
      // 撤销安装 → 卸载这些包
      const names = packages.map(p => p.name);
      result = await pipManager.uninstallPackages(names, { safe: true, backup: false, rollback: false }, onOutput);
      logManager.addLog({ action: `[Undo] Uninstall ${names.join(', ')}`, status: 'ok', type: 'uninstall', detail: 'Undo install' });
    } else if (type === 'uninstall') {
      // 撤销卸载 → 重新安装（带版本号）
      const specs = packages.map(p => p.version ? `${p.name}==${p.version}` : p.name);
      result = await pipManager.installPackages(specs, { parallel: true, retry: true, rollback: false }, onOutput);
      logManager.addLog({ action: `[Undo] Reinstall ${packages.map(p => p.name).join(', ')}`, status: 'ok', type: 'install', detail: 'Undo uninstall' });
    } else if (type === 'update') {
      // 撤销更新 → 回退到旧版本
      const oldVersions = meta.oldVersions || {};
      const specs = packages.map(p => {
        const oldVer = oldVersions[p.name.toLowerCase()];
        return oldVer ? `${p.name}==${oldVer}` : p.name;
      });
      result = await pipManager.installPackages(specs, { parallel: true, retry: true, rollback: false }, onOutput);
      logManager.addLog({ action: `[Undo] Rollback ${packages.map(p => p.name).join(', ')}`, status: 'ok', type: 'update', detail: 'Undo update' });
    }

    if (onOutput) onOutput(`[OK] Undo complete\n`, 'stdout');
    return { success: true, type, packages: packages.map(p => p.name), result };
  } catch (err) {
    logManager.addLog({ action: `[Undo] Failed`, status: 'failed', type: 'system', detail: err.message });
    // 撤销失败时把操作放回去
    undoStack.push(operation);
    throw err;
  }
}

/**
 * 清空撤销栈
 */
function clear() {
  undoStack.length = 0;
}

/**
 * 获取撤销栈大小
 * @returns {number}
 */
function getStackSize() {
  return undoStack.length;
}

module.exports = {
  recordOperation,
  canUndo,
  getLastOperation,
  performUndo,
  clear,
  getStackSize
};
