const fs = require('fs');
const path = require('path');
const os = require('os');
const configManager = require('./configManager');
const { runPip } = require('../utils/processRunner');

const DEFAULT_MIRRORS = [
  { name: 'PyPI 官方', url: 'https://pypi.org/simple/', isDefault: true, builtin: true },
  { name: '清华大学', url: 'https://pypi.tuna.tsinghua.edu.cn/simple/', isDefault: false, builtin: true },
  { name: '阿里云', url: 'https://mirrors.aliyun.com/pypi/simple/', isDefault: false, builtin: true },
  { name: '腾讯云', url: 'https://mirrors.cloud.tencent.com/pypi/simple/', isDefault: false, builtin: true },
  { name: '华为云', url: 'https://repo.huaweicloud.com/repository/pypi/simple/', isDefault: false, builtin: true },
  { name: '豆瓣', url: 'https://pypi.doubanio.com/simple/', isDefault: false, builtin: true }
];

let mirrors = null;
let smartRoute = false;

function isValidMirrorUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function loadMirrors() {
  if (mirrors) return mirrors;
  const config = configManager.getConfig();
  const saved = config.mirrors || [];
  const merged = [...DEFAULT_MIRRORS];

  for (const s of saved) {
    const existing = merged.find(m => m.url === s.url);
    if (existing) {
      existing.isDefault = s.isDefault;
      if (s.name) existing.name = s.name;
      if (s.remark != null) existing.remark = s.remark;
    } else {
      merged.push({ ...s, builtin: false });
    }
  }

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

function getMirrors() {
  return [...loadMirrors()];
}

function getDefaultMirror() {
  const list = loadMirrors();
  return list.find(m => m.isDefault) || list[0];
}

function setDefaultMirror(url) {
  loadMirrors();
  mirrors.forEach(m => m.isDefault = (m.url === url));
  saveMirrors();
  return getMirrors();
}

function addCustomMirror(name, url, remark = '') {
  loadMirrors();
  if (!url.endsWith('/')) url += '/';
  if (!isValidMirrorUrl(url)) {
    throw new Error(`Invalid mirror URL (only http/https allowed): ${url}`);
  }
  if (mirrors.some(m => m.url === url)) return null;
  const mirror = { name, url, remark, isDefault: false, builtin: false, speed: null };
  mirrors.push(mirror);
  saveMirrors();
  return mirror;
}

function updateMirror(url, updates) {
  loadMirrors();
  const idx = mirrors.findIndex(m => m.url === url);
  if (idx < 0) return null;
  const target = mirrors[idx];

  const newUrl = updates.url ? (updates.url.endsWith('/') ? updates.url : updates.url + '/') : target.url;
  if (updates.url && !isValidMirrorUrl(newUrl)) {
    throw new Error(`Invalid mirror URL (only http/https allowed): ${updates.url}`);
  }
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

function restoreDefaultMirrors() {
  // Clear all saved mirrors so loadMirrors() rebuilds from DEFAULT_MIRRORS only
  configManager.setConfig('mirrors', []);
  mirrors = null;
  loadMirrors();
  return getMirrors();
}

async function testMirrorSpeed(url) {
  if (!isValidMirrorUrl(url)) return 9999;
  const target = url + 'numpy/';
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(target, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error('not ok');
    return Date.now() - start;
  } catch (err) {
    return 9999;
  }
}

async function testAllMirrors() {
  const list = loadMirrors();
  await Promise.all(list.map(async (m) => {
    m.speed = await testMirrorSpeed(m.url);
  }));
  saveMirrors();
  return getMirrors();
}

function setSmartRoute(enabled) {
  smartRoute = enabled;
  configManager.setConfig('smartRoute', enabled);
  return smartRoute;
}

function getSmartRoute() {
  loadMirrors();
  return smartRoute;
}

async function pickBestMirror() {
  const list = loadMirrors();
  const withSpeed = [];
  for (const m of list) {
    const speed = m.speed != null ? m.speed : await testMirrorSpeed(m.url);
    m.speed = speed;
    withSpeed.push({ ...m, speed });
  }
  withSpeed.sort((a, b) => a.speed - b.speed);
  return withSpeed[0];
}

async function getEffectiveMirror() {
  if (smartRoute) {
    const best = await pickBestMirror();
    return best;
  }
  return getDefaultMirror();
}

async function writePipConfig(env) {
  const mirror = await getEffectiveMirror();
  const pythonPath = env ? env.path : null;
  if (!pythonPath) return false;

  // Determine pip config location per platform
  const isWin = process.platform === 'win32';
  const pipDir = isWin
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'pip')
    : path.join(os.homedir(), '.config', 'pip');
  if (!fs.existsSync(pipDir)) fs.mkdirSync(pipDir, { recursive: true });
  const configPath = path.join(pipDir, isWin ? 'pip.ini' : 'pip.conf');

  const content = `[global]\nindex-url = ${mirror.url}\ntimeout = 60\n`;
  try {
    fs.writeFileSync(configPath, content, 'utf-8');
    return true;
  } catch (err) {
    const logManager = require('./logManager');
    logManager.addLog({ action: 'Write pip config failed', status: 'failed', type: 'system', detail: err.message });
    return false;
  }
}

function buildMirrorArgs(env) {
  const mirror = getDefaultMirror();
  if (mirror.url === 'https://pypi.org/simple/') return [];
  return ['--index-url', mirror.url];
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
  buildMirrorArgs
};
