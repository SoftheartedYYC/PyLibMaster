/**
 * @file logManager.js
 * @description 操作日志管理器
 * 
 * 职责：
 * - 记录应用操作日志（安装/卸载/更新/系统事件）
 * - 日志持久化存储（JSON 文件）
 * - 日志查询（支持按类型和关键词筛选）
 * - 日志容量控制（最多 2000 条，字段截断保护）
 * 
 * 日志存储位置：
 * {storagePath}/logs/operations.json
 */

const fs = require('fs');
const path = require('path');
const configManager = require('../config/configManager');

const MAX_LOGS = 2000;           // 日志最大条数
const MAX_FIELD_LENGTH = 1000;   // 单个字段最大字符数
const MAX_SEARCH_LENGTH = 200;   // 搜索关键词最大字符数
const SAVE_DEBOUNCE_MS = 300;    // 写入防抖延迟（毫秒）
let logs = [];                   // 日志数组缓存
let logsPath = '';               // 日志文件路径
let saveTimer = null;            // 防抖定时器

/**
 * 截断字符串字段，防止日志文件过大
 * @param {string} str - 原始字符串
 * @returns {string} 截断后的字符串
 */
function truncateField(str) {
  if (typeof str !== 'string') return '';
  return str.length > MAX_FIELD_LENGTH ? str.slice(0, MAX_FIELD_LENGTH) + '...' : str;
}

/**
 * 获取日志目录路径（不存在则创建）
 * @returns {string} 日志目录路径
 */
function getLogsDir() {
  const storage = configManager.getStoragePath();
  const dir = path.join(storage, 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 初始化日志管理器
 * - 从磁盘加载日志文件
 * - 文件损坏时重置为空数组
 */
function init() {
  if (logsPath) return;
  const dir = getLogsDir();
  logsPath = path.join(dir, 'operations.json');
  try {
    if (fs.existsSync(logsPath)) {
      const raw = fs.readFileSync(logsPath, 'utf-8');
      logs = JSON.parse(raw);
      if (!Array.isArray(logs)) logs = [];
    }
  } catch (err) {
    logs = [];
  }
}

/**
 * 将日志保存到磁盘（防抖：300ms 内多次调用只写一次）
 * - 失败时输出到 stderr（避免死循环，日志模块不能记录自己的错误）
 */
function saveLogs() {
  init();
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      // 防御性检查：确保日志目录存在（外部存储可能断开或被删除）
      const dir = path.dirname(logsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PyLibMaster] Failed to save logs:', err.message);
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * 立即同步保存日志（应用退出前调用，确保数据不丢失）
 */
function flushLogs() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!logsPath) return;
  try {
    fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[PyLibMaster] Failed to flush logs:', err.message);
  }
}

/**
 * 添加一条新的日志记录
 * - 自动添加时间戳
 * - 自动截断过长的字段
 * - 新日志插入到数组开头（最新的在前）
 * - 超过最大条数时裁剪旧日志
 * 
 * @param {Object} entry - 日志条目
 * @param {string} entry.action - 操作描述
 * @param {string} [entry.status='ok'] - 操作状态（ok/failed）
 * @param {string} [entry.type='install'] - 操作类型（install/uninstall/update/system）
 * @param {string} [entry.detail] - 详细信息
 * @returns {Object} 完整的日志记录
 */
function addLog(entry) {
  init();
  // 防御性检查：非对象输入安全降级
  if (!entry || typeof entry !== 'object') {
    entry = { action: String(entry ?? 'unknown'), status: 'ok', type: 'system' };
  }
  const now = new Date();
  const time = now.toISOString().replace('T', ' ').slice(0, 19);
  const record = {
    time,
    action: truncateField(entry.action),
    status: entry.status || 'ok',
    type: entry.type || 'install',
    detail: truncateField(entry.detail)
  };
  logs.unshift(record);                 // 新日志插入开头
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS; // 裁剪旧日志
  saveLogs();
  return record;
}

/**
 * 查询日志列表
 * - 支持按操作类型筛选
 * - 支持按关键词搜索（匹配 action 和 detail 字段）
 * 
 * @param {Object} [filter={}] - 筛选条件
 * @param {string} [filter.type] - 操作类型（all/install/uninstall/update）
 * @param {string} [filter.search] - 搜索关键词
 * @returns {Array} 匹配的日志列表
 */
function getLogs(filter = {}) {
  init();
  let result = [...logs];
  // 按类型筛选
  if (filter.type && filter.type !== 'all') {
    result = result.filter(l => l.type === filter.type);
  }
  // 按关键词搜索（不区分大小写）
  if (filter.search) {
    const kw = String(filter.search).slice(0, MAX_SEARCH_LENGTH).toLowerCase();
    result = result.filter(l =>
      (l.action && l.action.toLowerCase().includes(kw)) ||
      (l.detail && l.detail.toLowerCase().includes(kw))
    );
  }
  return result;
}

/**
 * 清空所有日志
 * @returns {boolean} 操作是否成功
 */
function clearLogs() {
  init();
  logs = [];
  saveLogs();
  return true;
}

module.exports = { addLog, getLogs, clearLogs, flushLogs };
