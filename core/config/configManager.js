/**
 * @file configManager.js
 * @description 应用配置管理器
 * 
 * 职责：
 * - 管理应用配置的持久化存储（JSON 文件）
 * - 提供配置的读取、写入、批量更新接口
 * - 配置值范围校验与自动修正
 * - 配置文件路径管理（基于 Electron userData 目录）
 * 
 * 配置文件位置：
 * - Windows: %APPDATA%/PyLibMaster/pylibmaster-config.json
 * - macOS: ~/Library/Application Support/PyLibMaster/pylibmaster-config.json
 * - Linux: ~/.config/PyLibMaster/pylibmaster-config.json
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 默认配置值
const DEFAULT_THREADS = 4;    // 并行安装线程数
const DEFAULT_RETRY = 3;      // 智能重试次数

// 数值配置项的范围限制（防止无效值）
const RANGE_LIMITS = {
  parallelThreads: { min: 1, max: 16, fallback: DEFAULT_THREADS },
  retryCount: { min: 0, max: 10, fallback: DEFAULT_RETRY }
};

/**
 * 校验并修正配置值
 * - 如果值超出范围，返回最近的合法值
 * - 如果值类型错误，返回默认值
 * @param {string} key - 配置项名称
 * @param {*} value - 配置值
 * @returns {*} 修正后的配置值
 */
function sanitizeValue(key, value) {
  const limits = RANGE_LIMITS[key];
  if (!limits) return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return limits.fallback;
  return Math.max(limits.min, Math.min(limits.max, Math.round(value)));
}

// 配置对象缓存和文件路径
let config = null;
let configPath = '';

/**
 * 获取配置目录路径
 * - Electron 就绪时使用 userData 目录
 * - 否则回退到环境变量或当前目录
 * @returns {string} 配置目录路径
 */
function getConfigDir() {
  if (app && app.isReady()) {
    return app.getPath('userData');
  }
  return process.env.APPDATA || process.env.HOME || __dirname;
}

/**
 * 获取应用安装目录（exe 所在目录）
 * @returns {string} 安装目录路径
 */
function getInstallDir() {
  if (app && app.isReady()) {
    return path.dirname(app.getPath('exe'));
  }
  return __dirname;
}

/**
 * 获取默认存储路径
 * 优先使用用户数据目录而非安装目录，避免权限问题
 * @returns {string} 存储路径
 */
function getDefaultStoragePath() {
  // 核心修复：不使用 Program Files 作为存储路径
  // Windows 下 Program Files 需要管理员权限才能写入
  return path.join(getConfigDir(), 'storage');
}

/**
 * 初始化配置管理器
 * - 从配置文件加载配置，或使用默认值创建新配置
 * - 配置文件损坏时自动重建默认配置
 * - 确保配置目录存在
 */
function init() {
  if (config) return;
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  configPath = path.join(dir, 'pylibmaster-config.json');

  // 初始化默认存储路径
  const defaultStorage = getDefaultStoragePath();

  // 默认配置项
  const defaults = {
    theme: 'light',             // 主题：light/dark
    language: 'zh',             // 语言：zh/en
    storagePath: defaultStorage, // 日志和备份存储路径
    parallelThreads: DEFAULT_THREADS, // 并行安装线程数
    retryCount: DEFAULT_RETRY,  // 智能重试次数
    smartRoute: false,          // 智能路由开关
    currentEnv: null,           // 当前选中的 Python 环境
    windowBounds: { width: 1200, height: 760 } // 窗口尺寸
  };

  try {
    if (fs.existsSync(configPath)) {
      // 读取并合并配置文件（保留默认值）
      const raw = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(raw);
      config = { ...defaults, ...saved };
      
      // 智能检测：如果配置中存储路径在 Program Files，自动修正
      if (config.storagePath && config.storagePath.toLowerCase().includes('program files')) {
        console.warn('[PyLibMaster] 检测到存储路径包含"Program Files"，已自动切换到用户数据目录');
        config.storagePath = getDefaultStoragePath();
        saveConfig(); // 自动保存修正后的配置
      }
    } else {
      // 配置文件不存在，创建默认配置
      config = { ...defaults };
      saveConfig();
    }
  } catch (err) {
    // 配置文件损坏，重建默认配置
    config = { ...defaults };
    saveConfig();
  }
}

/**
 * 将配置保存到磁盘（原子写入：先写临时文件再重命名，避免崩溃时配置文件损坏）
 * - 失败时尝试记录日志，如果 logManager 未就绪则输出到 stderr
 */
function saveConfig() {
  if (!configPath) return;
  try {
    const tmpPath = configPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
    fs.renameSync(tmpPath, configPath);
  } catch (err) {
    // configManager 初始化阶段 logManager 可能尚未就绪，做安全降级
    try {
      const logManager = require('../system/logManager');
      logManager.addLog({ action: 'Save config failed', status: 'failed', type: 'system', detail: err.message });
    } catch {
      console.error('Failed to save config:', err.message);
    }
  }
}

/**
 * 获取完整的应用配置（返回深拷贝，防止外部修改内部状态）
 * @returns {Object} 配置对象深拷贝
 */
function getConfig() {
  init();
  return JSON.parse(JSON.stringify(config));
}

/**
 * 设置单个配置项
 * - 自动校验并修正值
 * - 立即保存到磁盘
 * @param {string} key - 配置项名称
 * @param {*} value - 配置值
 * @returns {Object} 更新后的配置副本
 */
function setConfig(key, value) {
  init();
  config[key] = sanitizeValue(key, value);
  saveConfig();
  return getConfig();
}

/**
 * 批量设置多个配置项
 * - 所有项都会校验并修正
 * - 只触发一次磁盘写入
 * @param {Object} updates - 配置项键值对
 * @returns {Object} 更新后的配置副本
 */
function setBulk(updates) {
  init();
  for (const [key, value] of Object.entries(updates)) {
    config[key] = sanitizeValue(key, value);
  }
  saveConfig();
  return getConfig();
}

/**
 * 获取日志和备份的存储路径
 * - 如果目录不存在则自动创建
 * @returns {string} 存储路径
 */
function getStoragePath() {
  init();
  if (!fs.existsSync(config.storagePath)) {
    fs.mkdirSync(config.storagePath, { recursive: true });
  }
  return config.storagePath;
}

module.exports = { getConfig, setConfig, setBulk, getStoragePath, init };
