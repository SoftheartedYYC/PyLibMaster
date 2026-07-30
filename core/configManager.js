const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_THREADS = 4;
const DEFAULT_RETRY = 2;

// Range limits for numeric config values
const RANGE_LIMITS = {
  parallelThreads: { min: 1, max: 16, fallback: DEFAULT_THREADS },
  retryCount: { min: 0, max: 10, fallback: DEFAULT_RETRY }
};

function sanitizeValue(key, value) {
  const limits = RANGE_LIMITS[key];
  if (!limits) return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return limits.fallback;
  return Math.max(limits.min, Math.min(limits.max, Math.round(value)));
}

let config = null;
let configPath = '';

function getConfigDir() {
  if (app && app.isReady()) {
    return app.getPath('userData');
  }
  return process.env.APPDATA || process.env.HOME || __dirname;
}

function getDocumentsDir() {
  if (app && app.isReady()) {
    return app.getPath('documents');
  }
  return path.join(require('os').homedir(), 'Documents');
}

function init() {
  if (config) return;
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  configPath = path.join(dir, 'pylibmaster-config.json');

  const defaultStorage = path.join(getDocumentsDir(), 'PyLibMasterLog');

  const defaults = {
    theme: 'light',
    language: 'zh',
    storagePath: defaultStorage,
    parallelThreads: DEFAULT_THREADS,
    retryCount: DEFAULT_RETRY,
    smartRoute: false,
    currentEnv: null,
    windowBounds: { width: 1200, height: 760 }
  };

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(raw);
      config = { ...defaults, ...saved };
    } else {
      config = { ...defaults };
      saveConfig();
    }
  } catch (err) {
    config = { ...defaults };
    saveConfig();
  }
}

function saveConfig() {
  if (!configPath) return;
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    // configManager 初始化阶段 logManager 可能尚未就绪，做安全降级
    try {
      const logManager = require('./logManager');
      logManager.addLog({ action: 'Save config failed', status: 'failed', type: 'system', detail: err.message });
    } catch {
      console.error('Failed to save config:', err.message);
    }
  }
}

function getConfig() {
  init();
  return { ...config };
}

function setConfig(key, value) {
  init();
  config[key] = sanitizeValue(key, value);
  saveConfig();
  return getConfig();
}

function setBulk(updates) {
  init();
  for (const [key, value] of Object.entries(updates)) {
    config[key] = sanitizeValue(key, value);
  }
  saveConfig();
  return getConfig();
}

function getStoragePath() {
  init();
  if (!fs.existsSync(config.storagePath)) {
    fs.mkdirSync(config.storagePath, { recursive: true });
  }
  return config.storagePath;
}

module.exports = { getConfig, setConfig, setBulk, getStoragePath, init };
