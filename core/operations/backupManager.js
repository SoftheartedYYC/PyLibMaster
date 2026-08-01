/**
 * @file backupManager.js
 * @description 备份与恢复管理器
 * 
 * 职责：
 * - 创建 Python 环境的包列表备份（基于 pip freeze）
 * - 列出所有备份文件
 * - 从备份恢复环境（force-reinstall 指定版本的包）
 * - 删除备份文件
 * - 备份 ID 安全校验（防止路径遍历攻击）
 * 
 * 备份文件格式：
 * backup_{环境名}_{时间戳}.txt
 * 
 * 备份存储位置：
 * {storagePath}/backups/
 */

const fs = require('fs');
const path = require('path');
const configManager = require('../config/configManager');
const logManager = require('../system/logManager');
const { runPip } = require('../../utils/processRunner');

/**
 * 获取备份目录路径（不存在则创建）
 * @returns {string} 备份目录路径
 */
function getBackupDir() {
  const storage = configManager.getStoragePath();
  const dir = path.join(storage, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 备份 ID 格式校验正则（只允许 backup_ 前缀的 .txt 文件）
const VALID_BACKUP_ID = /^backup_[a-zA-Z0-9._-]+\.txt$/;
const MAX_BACKUP_ID_LENGTH = 255; // 备份 ID 最大长度

/**
 * 生成备份文件名
 * - 格式：backup_{环境名}_{ISO时间戳}.txt
 * @param {Object} env - Python 环境信息
 * @returns {string} 备份文件名
 */
function getBackupFileName(env) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const envName = env ? path.basename(path.dirname(env.path)) : 'unknown';
  return `backup_${envName}_${timestamp}.txt`;
}

/**
 * 校验备份 ID 的安全性
 * - 防止路径遍历攻击（../、..\\ 等）
 * - 校验格式是否匹配 backup_*.txt
 * 
 * @param {string} backupId - 备份文件名
 * @returns {string} 安全的备份文件名
 * @throws {Error} 如果备份 ID 不合法
 */
function validateBackupId(backupId) {
  if (typeof backupId !== 'string') {
    throw new Error('Invalid backup ID: must be a string');
  }
  if (backupId.length === 0 || backupId.length > MAX_BACKUP_ID_LENGTH) {
    throw new Error(`Invalid backup ID: length must be 1-${MAX_BACKUP_ID_LENGTH}`);
  }
  // 防止路径遍历
  if (backupId.includes('/') || backupId.includes('\\') || backupId.includes('..')) {
    throw new Error('Invalid backup ID: path traversal detected');
  }
  const safe = path.basename(backupId);
  if (!VALID_BACKUP_ID.test(safe)) {
    throw new Error('Invalid backup ID: format mismatch');
  }
  return safe;
}

/**
 * 创建当前环境的备份
 * - 执行 pip freeze 获取已安装包列表及版本
 * - 将输出写入备份文件
 * 
 * @param {Object} env - Python 环境信息
 * @returns {Promise<Object>} 备份信息（id、路径、创建时间、环境名）
 * @throws {Error} 如果未选择环境或备份失败
 */
async function createBackup(env) {
  const pythonPath = env ? env.path : null;
  if (!pythonPath) throw new Error('No Python environment selected');

  try {
    const backupDir = getBackupDir();
    const fileName = getBackupFileName(env);
    const filePath = path.join(backupDir, fileName);

    // 执行 pip freeze 获取包列表
    const { stdout } = await runPip(pythonPath, ['freeze'], { timeout: 60000 });
    fs.writeFileSync(filePath, stdout, 'utf-8');

    return {
      id: fileName,
      path: filePath,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      envName: env.name,
      envPath: env.path
    };
  } catch (err) {
    logManager.addLog({ action: 'Create backup failed', status: 'failed', type: 'system', detail: err.message });
    throw new Error(`Backup failed: ${err.message}`);
  }
}

/**
 * 列出所有备份文件
 * - 按创建时间倒序排列
 * - 返回备份文件的基本信息
 * 
 * @returns {Array<Object>} 备份列表
 */
function listBackups() {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.txt'))
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return {
          id: f,
          path: path.join(backupDir, f),
          createdAt: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
          size: stat.size
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // 最新的在前
  } catch (err) {
    logManager.addLog({ action: 'List backups failed', status: 'failed', type: 'system', detail: err.message });
    return [];
  }
}

/**
 * 从备份恢复环境
 * - 使用 pip install -r 强制重装指定版本的包
 * - --force-reinstall: 强制重新安装
 * - --no-deps: 不重装依赖
 * 
 * @param {string} backupId - 备份文件 ID
 * @param {Object} env - Python 环境信息
 * @param {Function} [onOutput] - 输出回调函数
 * @returns {Promise<Object>} pip 执行结果
 * @throws {Error} 如果备份 ID 不合法或备份文件不存在
 */
async function restoreBackup(backupId, env, onOutput) {
  const pythonPath = env ? env.path : null;
  if (!pythonPath) throw new Error('No Python environment selected');

  const safeBackupId = validateBackupId(backupId);
  const backupDir = getBackupDir();
  const filePath = path.join(backupDir, safeBackupId);
  if (!fs.existsSync(filePath)) throw new Error('Backup not found');

  // 从备份文件重装指定版本的包
  return runPip(pythonPath, ['install', '-r', filePath, '--force-reinstall', '--no-deps', '--no-warn-script-location'], {
    timeout: 600000,
    onOutput
  });
}

/**
 * 删除指定的备份文件
 * 
 * @param {string} backupId - 备份文件 ID
 * @returns {boolean} 是否成功删除
 * @throws {Error} 如果备份 ID 不合法或删除失败
 */
function deleteBackup(backupId) {
  try {
    const safeBackupId = validateBackupId(backupId);
    const backupDir = getBackupDir();
    const filePath = path.join(backupDir, safeBackupId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    logManager.addLog({ action: 'Delete backup failed', status: 'failed', type: 'system', detail: err.message });
    throw new Error(`Delete backup failed: ${err.message}`);
  }
}

module.exports = { createBackup, listBackups, restoreBackup, deleteBackup, validateBackupId };
