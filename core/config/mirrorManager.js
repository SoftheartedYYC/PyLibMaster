/**
 * @file mirrorManager.js
 * @description PyPI 镜像源管理器
 * 
 * 职责：
 * - 管理 PyPI 镜像源列表（内置 + 自定义）
 * - 镜像源测速与智能路由（自动选择最快镜像）
 * - 镜像源的增删改查
 * - 将镜像配置写入 pip 配置文件
 * 
 * 内置镜像源：
 * - PyPI 官方、清华大学、阿里云、腾讯云、华为云、豆瓣
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const configManager = require('./configManager');
const { runPip } = require('../../utils/processRunner');

// 内置默认镜像源列表
const DEFAULT_MIRRORS = [
  { name: 'PyPI 官方', url: 'https://pypi.org/simple/', isDefault: true, builtin: true },
  { name: '清华大学', url: 'https://pypi.tuna.tsinghua.edu.cn/simple/', isDefault: false, builtin: true },
  { name: '阿里云', url: 'https://mirrors.aliyun.com/pypi/simple/', isDefault: false, builtin: true },
  { name: '腾讯云', url: 'https://mirrors.cloud.tencent.com/pypi/simple/', isDefault: false, builtin: true },
  { name: '华为云', url: 'https://repo.huaweicloud.com/repository/pypi/simple/', isDefault: false, builtin: true },
  { name: '豆瓣', url: 'https://pypi.doubanio.com/simple/', isDefault: false, builtin: true }
];

// 镜像源列表缓存
let mirrors = null;
// 智能路由开关
let smartRoute = false;

/**
 * 校验镜像 URL 的有效性
 * - 必须是 http 或 https 协议
 * - 长度不超过 2048 字符
 * @param {string} url - 镜像 URL
 * @returns {boolean} 是否有效
 */
function isValidMirrorUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 从配置加载镜像源列表
 * - 合并内置镜像和用户自定义镜像
 * - 恢复用户的自定义设置（默认源、名称、备注等）
 * - 确保有且仅有一个默认源
 * @returns {Array} 镜像源列表
 */
function loadMirrors() {
  if (mirrors) return mirrors;
  const config = configManager.getConfig();
  const saved = config.mirrors || [];
  const merged = [...DEFAULT_MIRRORS];

  // 合并保存的配置
  for (const s of saved) {
    const existing = merged.find(m => m.url === s.url);
    if (existing) {
      // 更新已存在的内置源属性
      existing.isDefault = s.isDefault;
      if (s.name) existing.name = s.name;
      if (s.remark != null) existing.remark = s.remark;
    } else {
      // 添加自定义源
      merged.push({ ...s, builtin: false });
    }
  }

  // 确保有且仅有一个默认源
  const defaultCount = merged.filter(m => m.isDefault).length;
  if (defaultCount === 0) merged[0].isDefault = true;
  if (defaultCount > 1) {
    merged.forEach(m => m.isDefault = false);
    merged[0].isDefault = true;
  }

  smartRoute = config.smartRoute || false;
  mirrors = merged;
  return mirrors;
}

/**
 * 保存镜像源配置到配置文件
 * 只保存必要字段（名称、URL、备注、默认状态、速度）
 */
function saveMirrors() {
  const config = configManager.getConfig();
  const toSave = mirrors.map(m => ({
    name: m.name,
    url: m.url,
    remark: m.remark || '',
    isDefault: m.isDefault,
    speed: m.speed
  }));
  configManager.setConfig('mirrors', toSave);
}

/** 获取所有镜像源列表（返回副本） */
function getMirrors() {
  return [...loadMirrors()];
}

/** 获取当前默认镜像源 */
function getDefaultMirror() {
  const list = loadMirrors();
  return list.find(m => m.isDefault) || list[0];
}

/**
 * 设置默认镜像源
 * @param {string} url - 要设为默认的镜像 URL
 * @returns {Array} 更新后的镜像列表
 */
function setDefaultMirror(url) {
  loadMirrors();
  mirrors.forEach(m => m.isDefault = (m.url === url));
  saveMirrors();
  return getMirrors();
}

/**
 * 添加自定义镜像源
 * @param {string} name - 镜像名称
 * @param {string} url - 镜像 URL
 * @param {string} [remark=''] - 备注
 * @returns {Object|null} 新添加的镜像对象，已存在则返回 null
 */
function addCustomMirror(name, url, remark = '') {
  loadMirrors();
  if (!url.endsWith('/')) url += '/';
  if (!isValidMirrorUrl(url)) {
    throw new Error(`Invalid mirror URL (only http/https allowed): ${url}`);
  }
  if (mirrors.some(m => m.url === url)) return null; // 已存在
  const mirror = { name, url, remark, isDefault: false, builtin: false, speed: null };
  mirrors.push(mirror);
  saveMirrors();
  return mirror;
}

/**
 * 更新镜像源信息
 * @param {string} url - 原始 URL（用于定位镜像）
 * @param {Object} updates - 更新字段（name、url、remark）
 * @returns {Array|null} 更新后的镜像列表，失败返回 null
 */
function updateMirror(url, updates) {
  loadMirrors();
  const idx = mirrors.findIndex(m => m.url === url);
  if (idx < 0) return null;
  const target = mirrors[idx];

  const newUrl = updates.url ? (updates.url.endsWith('/') ? updates.url : updates.url + '/') : target.url;
  if (updates.url && !isValidMirrorUrl(newUrl)) {
    throw new Error(`Invalid mirror URL (only http/https allowed): ${updates.url}`);
  }
  // 检查新 URL 是否与其他镜像冲突
  if (newUrl !== target.url && mirrors.some((m, i) => i !== idx && m.url === newUrl)) {
    return null;
  }

  target.name = updates.name || target.name;
  target.url = newUrl;
  if (updates.remark != null) target.remark = updates.remark;
  target.builtin = DEFAULT_MIRRORS.some(m => m.url === newUrl);
  saveMirrors();
  return getMirrors();
}

/**
 * 删除自定义镜像源
 * - 如果删除的是默认源，自动将第一个源设为默认
 * @param {string} url - 要删除的镜像 URL
 * @returns {boolean} 是否成功删除
 */
function removeCustomMirror(url) {
  loadMirrors();
  const idx = mirrors.findIndex(m => m.url === url);
  if (idx >= 0) {
    const removed = mirrors.splice(idx, 1)[0];
    if (removed.isDefault && mirrors.length > 0) mirrors[0].isDefault = true;
    saveMirrors();
    return true;
  }
  return false;
}

/**
 * 恢复默认镜像源列表
 * - 清除所有自定义镜像，重建内置镜像列表
 * @returns {Array} 恢复后的镜像列表
 */
function restoreDefaultMirrors() {
  // 清空保存的镜像配置，loadMirrors() 会从 DEFAULT_MIRRORS 重建
  configManager.setConfig('mirrors', []);
  mirrors = null;
  loadMirrors();
  return getMirrors();
}

/**
 * 测试单个镜像源的响应速度
 * - 通过 HEAD 请求 numpy 包页面来测速
 * - 超时或失败返回 9999ms
 * @param {string} url - 镜像 URL
 * @returns {Promise<number>} 响应时间（毫秒）
 */
async function testMirrorSpeed(url) {
  if (!isValidMirrorUrl(url)) return 9999;
  const target = url + 'numpy/';
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5秒超时
    const response = await fetch(target, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error('not ok');
    return Date.now() - start;
  } catch (err) {
    return 9999; // 失败标记
  }
}

/**
 * 批量测试所有镜像源的速度
 * - 并行测速，结果保存到每个镜像的 speed 属性
 * @returns {Promise<Array>} 带速度信息的镜像列表
 */
async function testAllMirrors() {
  const list = loadMirrors();
  await Promise.all(list.map(async (m) => {
    m.speed = await testMirrorSpeed(m.url);
  }));
  saveMirrors();
  return getMirrors();
}

/** 设置智能路由开关 */
function setSmartRoute(enabled) {
  smartRoute = enabled;
  configManager.setConfig('smartRoute', enabled);
  return smartRoute;
}

/** 获取智能路由开关状态 */
function getSmartRoute() {
  loadMirrors();
  return smartRoute;
}

/**
 * 选择最快的镜像源
 * - 并行测试所有镜像的速度，按响应时间排序
 * @returns {Promise<Object>} 最快的镜像
 */
async function pickBestMirror() {
  const list = loadMirrors();
  const withSpeed = await Promise.all(list.map(async (m) => {
    const speed = m.speed != null ? m.speed : await testMirrorSpeed(m.url);
    m.speed = speed;
    return { ...m, speed };
  }));
  withSpeed.sort((a, b) => a.speed - b.speed);
  return withSpeed[0];
}

/**
 * 获取当前生效的镜像源
 * - 智能路由开启时返回最快的镜像
 * - 否则返回用户设置的默认镜像
 * @returns {Promise<Object>} 生效的镜像
 */
async function getEffectiveMirror() {
  if (smartRoute) {
    const best = await pickBestMirror();
    return best;
  }
  return getDefaultMirror();
}

/**
 * 将镜像配置写入 pip 配置文件
 * - Windows: %APPDATA%/pip/pip.ini
 * - macOS/Linux: ~/.config/pip/pip.conf
 * @param {Object} env - 当前 Python 环境
 * @returns {Promise<boolean>} 是否成功
 */
async function writePipConfig(env) {
  const mirror = await getEffectiveMirror();
  const pythonPath = env ? env.path : null;
  if (!pythonPath) return false;

  // 根据平台确定 pip 配置文件位置
  const isWin = process.platform === 'win32';
  const pipDir = isWin
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'pip')
    : path.join(os.homedir(), '.config', 'pip');
  if (!fs.existsSync(pipDir)) fs.mkdirSync(pipDir, { recursive: true });
  const configPath = path.join(pipDir, isWin ? 'pip.ini' : 'pip.conf');

  // 写入全局镜像配置
  const content = `[global]\nindex-url = ${mirror.url}\ntimeout = 60\n`;
  try {
    fs.writeFileSync(configPath, content, 'utf-8');
    return true;
  } catch (err) {
    const logManager = require('../system/logManager');
    logManager.addLog({ action: 'Write pip config failed', status: 'failed', type: 'system', detail: err.message });
    return false;
  }
}

/**
 * 构建 pip 命令行中的镜像源参数
 * @param {Object} env - Python 环境
 * @returns {string[]} pip 命令行参数
 */
function buildMirrorArgs(env) {
  const mirror = getDefaultMirror();
  if (mirror.url === 'https://pypi.org/simple/') return []; // 官方源不需要额外参数
  return ['--index-url', mirror.url];
}

/**
 * 重新排序镜像源列表
 * @param {string[]} urlOrder - 按新顺序排列的 URL 数组
 * @returns {Array} 更新后的镜像列表
 */
function reorderMirrors(urlOrder) {
  loadMirrors();
  if (!Array.isArray(urlOrder) || urlOrder.length === 0) return getMirrors();
  const reordered = [];
  for (const url of urlOrder) {
    const idx = mirrors.findIndex(m => m.url === url);
    if (idx >= 0) {
      reordered.push(mirrors[idx]);
      mirrors.splice(idx, 1);
    }
  }
  // 未在排序中的追加到末尾
  reordered.push(...mirrors);
  mirrors.length = 0;
  mirrors.push(...reordered);
  saveMirrors();
  return getMirrors();
}

module.exports = {
  getMirrors,
  getDefaultMirror,
  setDefaultMirror,
  addCustomMirror,
  updateMirror,
  removeCustomMirror,
  restoreDefaultMirrors,
  testMirrorSpeed,
  testAllMirrors,
  setSmartRoute,
  getSmartRoute,
  getEffectiveMirror,
  writePipConfig,
  buildMirrorArgs,
  reorderMirrors
};
