/**
 * @file pipManager.js
 * @description pip 包管理器（核心业务模块）
 * 
 * 职责：
 * - 包的查询（已安装列表、缓存列表、可更新列表、搜索）
 * - 包的安装（支持批量、并行、版本控制、镜像重试、自动回滚）
 * - 包的卸载（支持批量、安全模式、自动回滚）
 * - 包的更新（支持批量、并行、智能重试、自动回滚）
 * - 包的大小/安装时间估算（基于 site-packages 目录扫描）
 * - 包名/版本的安全校验
 * - 取消操作支持
 * 
 * 安全特性：
 * - 包名正则校验，防止命令注入
 * - wheel 文件路径安全校验，防止路径遍历
 * - 环境级操作互斥锁（同一环境不能同时操作）
 */

const fs = require('fs');
const path = require('path');
const configManager = require('../config/configManager');
const mirrorManager = require('../config/mirrorManager');
const backupManager = require('./backupManager');
const logManager = require('../system/logManager');
const { runPip, ensurePip, cancelOperation } = require('../../utils/processRunner');
const envManager = require('../system/envManager');

// 包名合法性正则（只允许字母、数字、点、短横线、下划线）
const VALID_PACKAGE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
// 版本规格合法性正则
const VALID_VERSION_SPEC = /^[a-zA-Z0-9._*!=<>,~+-]+$/;
// site-packages 路径缓存 TTL（30秒）
const SITE_PACKAGES_CACHE_TTL = 30 * 1000;

// site-packages 路径缓存（pythonPath -> { location, time }）
const sitePackagesCache = new Map();
// 环境操作互斥锁（envPath -> Promise）
const envLocks = new Map();

/** 获取当前 Python 环境 */
function getCurrentEnv() {
  return envManager.getCurrent();
}

/**
 * 生成唯一操作 ID（用于跟踪和取消操作）
 * @returns {string} 操作 ID
 */
function generateOperationId() {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 发送结构化进度事件给前端
 * - 前端据此可靠地更新"已完成/总数"计数
 * @param {Function} onOutput - 输出回调
 * @param {string} pkg - 包名
 * @param {string} status - 状态（ok/fail）
 */
function emitProgress(onOutput, pkg, status) {
  if (onOutput) onOutput(`[PROGRESS] ${JSON.stringify({ done: 1, pkg, status })}`, 'progress');
}

/**
 * 获取环境级操作互斥锁
 * - 同一 Python 环境的操作必须串行执行，避免并发冲突
 * - 返回释放锁的函数
 * @param {string} envPath - Python 环境路径
 * @returns {Promise<Function>} 释放锁的函数
 */
async function acquireEnvLock(envPath) {
  // 等待已有锁释放
  while (envLocks.get(envPath)) {
    await envLocks.get(envPath);
  }
  // 创建新锁
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  envLocks.set(envPath, promise);
  return () => {
    envLocks.delete(envPath);
    resolve();
  };
}

// ============ 已安装包缓存 ============

/** 获取缓存文件路径 */
function getCacheFile() {
  const storage = configManager.getStoragePath();
  return path.join(storage, 'installed-cache.json');
}

/**
 * 读取已安装包缓存（5分钟有效期）
 * @returns {Array|null} 缓存的包列表，过期或不存在返回 null
 */
function readCache() {
  try {
    const cacheFile = getCacheFile();
    if (fs.existsSync(cacheFile)) {
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      const data = JSON.parse(raw);
      // 缓存有效期 5 分钟
      if (Date.now() - data.timestamp < 5 * 60 * 1000) {
        return data.list;
      }
    }
  } catch (err) {
    logManager.addLog({ action: 'Read installed cache failed', status: 'failed', type: 'system', detail: err.message });
  }
  return null;
}

/**
 * 写入已安装包缓存
 * @param {Array} list - 包列表
 */
function writeCache(list) {
  try {
    const cacheFile = getCacheFile();
    fs.writeFileSync(cacheFile, JSON.stringify({ timestamp: Date.now(), list }, null, 2), 'utf-8');
  } catch (err) {
    logManager.addLog({ action: 'Write installed cache failed', status: 'failed', type: 'system', detail: err.message });
  }
}

// ============ 包名/版本安全校验 ============

// wheel 文件路径中禁止出现的字符（防止命令注入）
const WHEEL_PATH_BLOCKED_CHARS = /[;&|`$<>"'\r\n\0]/;
// wheel 文件名合法性正则
const VALID_WHEEL_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.whl$/i;
const MAX_PACKAGE_NAME_LENGTH = 214; // 包名最大长度
const MAX_VERSION_LENGTH = 100;      // 版本号最大长度

/**
 * 构建包规格字符串（用于 pip install 命令）
 * 
 * 支持模式：
 * - 最新: `package`
 * - 指定版本: `package==1.2.3`
 * - 版本范围: `package>=1.0,<2.0`
 * - wheel 文件: 直接返回文件路径（带安全校验）
 * 
 * @param {string} name - 包名或 .whl 文件路径
 * @param {Object} [options={}] - 选项
 * @param {string} [options.versionMode] - 版本模式（latest/specific/range）
 * @param {string} [options.version] - 版本号或范围
 * @returns {string} pip 安装规格字符串
 * @throws {Error} 如果包名或版本不合法
 */
function buildPackageSpec(name, options = {}) {
  // 非字符串/空输入直接拒绝
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Invalid package name: must be a non-empty string');
  }

  // 已包含版本约束的规格字符串（如 "numpy==1.26.0"、"flask>=2.0"），直接校验并传递
  // 这是 undoManager 等模块传入预构建 spec 的场景
  if (!name.endsWith('.whl') && /[>=<!]/.test(name)) {
    if (name.length > MAX_PACKAGE_NAME_LENGTH + MAX_VERSION_LENGTH + 10) {
      throw new Error(`Invalid package spec: too long`);
    }
    // 拆分包名和版本部分分别校验
    const match = name.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*)([>=<!].+)$/);
    if (!match) {
      throw new Error(`Invalid package spec: ${name}`);
    }
    const [, pkgName, versionPart] = match;
    if (!VALID_VERSION_SPEC.test(versionPart)) {
      throw new Error(`Invalid version specifier: ${versionPart}`);
    }
    return name;
  }

  // wheel 文件路径特殊处理（跳过包名校验，但进行路径安全检查）
  if (name.endsWith('.whl')) {
    // 原始输入中禁止包含 .. 组件（即使 normalize 会解析掉）
    if (name.includes('..')) {
      throw new Error(`Invalid wheel path (path traversal detected): ${name}`);
    }
    const normalized = path.normalize(name);
    // 禁止 UNC 路径（\\server\share），防止远程资源访问
    if (normalized.startsWith('\\\\') || normalized.startsWith('//')) {
      throw new Error(`Invalid wheel path (UNC paths not allowed): ${name}`);
    }
    // 必须是绝对路径（Windows 盘符路径或 Unix 路径）
    if (!path.isAbsolute(normalized)) {
      throw new Error(`Invalid wheel path (must be absolute): ${name}`);
    }
    // 禁止 Windows 系统敏感目录
    const lowerPath = normalized.toLowerCase().replace(/\\/g, '/');
    if (lowerPath.includes('/windows/') || lowerPath.includes('/dev/') || lowerPath.includes('/proc/') || lowerPath.includes('/sys/')) {
      throw new Error(`Invalid wheel path (sensitive directory): ${name}`);
    }
    if (WHEEL_PATH_BLOCKED_CHARS.test(normalized)) {
      throw new Error(`Invalid wheel path (illegal characters): ${name}`);
    }
    const base = path.basename(normalized);
    if (!VALID_WHEEL_FILENAME.test(base)) {
      throw new Error(`Invalid wheel filename: ${base}`);
    }
    return normalized;
  }

  // 包名长度校验
  if (name.length > MAX_PACKAGE_NAME_LENGTH) {
    throw new Error(`Invalid package name: too long (max ${MAX_PACKAGE_NAME_LENGTH} characters)`);
  }

  // 包名格式校验
  if (!VALID_PACKAGE_NAME.test(name)) {
    throw new Error(`Invalid package name: ${name}`);
  }

  // 指定版本模式: package==1.2.3
  if (options.versionMode === 'specific') {
    if (!options.version || options.version.length > MAX_VERSION_LENGTH || !VALID_VERSION_SPEC.test(options.version)) {
      throw new Error(`Invalid version specifier: ${options.version}`);
    }
    return `${name}==${options.version}`;
  }

  // 版本范围模式: package>=1.0,<2.0
  if (options.versionMode === 'range') {
    if (!options.version || options.version.length > MAX_VERSION_LENGTH || !VALID_VERSION_SPEC.test(options.version)) {
      throw new Error(`Invalid version range: ${options.version}`);
    }
    return `${name}${options.version}`;
  }

  return name;
}

// ============ site-packages 路径管理 ============

/**
 * 获取 Python 的 site-packages 路径（带缓存）
 * @param {string} pythonPath - Python 路径
 * @returns {Promise<string>} site-packages 路径
 */
async function getSitePackagesPath(pythonPath) {
  const now = Date.now();
  const cached = sitePackagesCache.get(pythonPath);
  if (cached && now - cached.time < SITE_PACKAGES_CACHE_TTL) {
    return cached.location;
  }
  try {
    // 通过 pip show 获取安装位置
    const { stdout } = await runPip(pythonPath, ['show', 'pip'], { timeout: 10000 });
    const match = stdout.match(/Location:\s*(.+)/i);
    const location = match ? match[1].trim() : '';
    sitePackagesCache.set(pythonPath, { location, time: now });
    return location;
  } catch (err) {
    logManager.addLog({ action: 'Get site-packages path failed', status: 'failed', type: 'system', detail: err.message });
    return '';
  }
}

/** 清空 site-packages 路径缓存 */
function clearSitePackagesCache() {
  sitePackagesCache.clear();
}

// ============ 包大小/安装时间估算 ============

/**
 * 构建 site-packages 目录的包目录映射表
 * - 扫描 .dist-info 目录和普通包目录
 * - 用于快速查找包的安装时间和占用大小
 * 
 * @param {string} sitePackages - site-packages 路径
 * @returns {Map} 包名 -> { type, path } 映射表
 */
function buildPackageDirMap(sitePackages) {
  if (!sitePackages || !fs.existsSync(sitePackages)) return new Map();
  const map = new Map();
  try {
    const entries = fs.readdirSync(sitePackages, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const fullPath = path.join(sitePackages, name);
      if (name.endsWith('.dist-info')) {
        // numpy-1.26.0.dist-info -> numpy
        const pkgName = name.replace(/-\d+(\.\d+)*.*\.dist-info$/, '').replace(/_/g, '-').toLowerCase();
        const existing = map.get(pkgName) || {};
        existing.distInfo = fullPath;
        map.set(pkgName, existing);
      } else {
        const pkgName = name.replace(/_/g, '-').toLowerCase();
        const existing = map.get(pkgName) || {};
        existing.dir = fullPath;
        map.set(pkgName, existing);
      }
    }
  } catch (err) {
    logManager.addLog({ action: 'Build package dir map failed', status: 'failed', type: 'system', detail: err.message });
  }
  return map;
}

/**
 * 规范化包名用于目录映射查找
 * - 统一转为小写 + 连字符形式（与 buildPackageDirMap 的 key 格式一致）
 * @param {string} name - 原始包名
 * @returns {string} 规范化后的包名
 */
function normalizePkgKey(name) {
  return name.replace(/_/g, '-').toLowerCase();
}

/** 在映射表中查找包的 .dist-info 条目 */
function findDistInfoEntry(dirMap, pkgName) {
  const key = normalizePkgKey(pkgName);
  const entry = dirMap.get(key);
  return entry && entry.distInfo ? { type: 'dist-info', path: entry.distInfo } : null;
}

/**
 * 递归计算目录大小（带缓存，避免重复扫描）
 * - 跳过符号链接，避免死循环
 * - 最大递归深度 20 层
 */
function getFolderSizeCached(dir, cache, depth = 0) {
  const MAX_DEPTH = 20; // 最大递归深度，防止符号链接死循环
  if (depth > MAX_DEPTH) return 0;
  if (cache.has(dir)) return cache.get(dir);
  let size = 0;
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
      if (f.isSymbolicLink()) continue; // 跳过符号链接，避免死循环
      const p = path.join(dir, f.name);
      if (f.isDirectory()) size += getFolderSizeCached(p, cache, depth + 1);
      else if (f.isFile()) size += fs.statSync(p).size;
    }
  } catch (err) {
    logManager.addLog({ action: 'Calculate folder size failed', status: 'failed', type: 'system', detail: `${dir}: ${err.message}` });
  }
  cache.set(dir, size);
  return size;
}

/**
 * 快速估算包的安装时间（基于目录修改时间）
 * @param {string} pkgName - 包名
 * @param {string} sitePackages - site-packages 路径
 * @param {Map} dirMap - 包目录映射表
 * @returns {string} 安装日期 (YYYY-MM-DD) 或空字符串
 */
function getInstallTimeFast(pkgName, sitePackages, dirMap) {
  if (!sitePackages) return '';
  const normKey = normalizePkgKey(pkgName);
  const entry = dirMap.get(normKey);
  if (!entry) return '';

  // 优先使用 dist-info 目录的修改时间（更准确反映安装时间）
  const target = entry.distInfo || entry.dir;
  if (target) {
    try {
      return fs.statSync(target).mtime.toISOString().slice(0, 10);
    } catch (err) {
      logManager.addLog({ action: 'Get install time failed', status: 'failed', type: 'system', detail: `${target}: ${err.message}` });
    }
  }
  return '';
}

/**
 * 快速估算包的占用大小
 * - 综合包目录和 .dist-info 目录的大小
 * @param {string} pkgName - 包名
 * @param {string} sitePackages - site-packages 路径
 * @param {Map} dirMap - 包目录映射表
 * @param {Map} sizeCache - 大小缓存
 * @returns {{ size: number, text: string }} 大小信息
 */
function estimatePackageSizeFast(pkgName, sitePackages, dirMap, sizeCache) {
  if (!sitePackages) return { size: 0, text: '0 MB' };

  const normKey = normalizePkgKey(pkgName);
  const entry = dirMap.get(normKey);
  if (!entry) return { size: 0, text: '-' };

  const candidates = [];
  if (entry.dir) candidates.push(entry.dir);
  if (entry.distInfo) candidates.push(entry.distInfo);

  let total = 0;
  for (const c of candidates) {
    total += getFolderSizeCached(c, sizeCache);
  }

  if (total === 0) return { size: 0, text: '-' };
  const mb = total / 1024 / 1024;
  return { size: Math.round(mb * 10) / 10, text: mb >= 1 ? `${mb.toFixed(1)} MB` : `${(total / 1024).toFixed(1)} KB` };
}

// ============ 包查询 API ============

/**
 * 获取已安装包的完整列表（实时扫描）
 * - 执行 pip list --format=json 获取包列表
 * - 同时估算每个包的大小和安装时间
 * - 结果写入缓存
 * @returns {Promise<Array>} 包列表
 */
async function listInstalled() {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');

  await ensurePip(env.path);
  const { stdout } = await runPip(env.path, ['list', '--format=json'], { timeout: 60000 });
  const list = JSON.parse(stdout);
  const sitePackages = await getSitePackagesPath(env.path);

  // Build directory map once to avoid repeated glob.sync / readdirSync per package
  const dirMap = buildPackageDirMap(sitePackages);
  const sizeCache = new Map();

  const result = [];
  for (const item of list) {
    const sizeInfo = estimatePackageSizeFast(item.name, sitePackages, dirMap, sizeCache);
    result.push({
      name: item.name,
      version: item.version,
      installed: getInstallTimeFast(item.name, sitePackages, dirMap),
      size: sizeInfo.size,
      sizeText: sizeInfo.text,
      source: 'pypi.org'
    });
  }
  writeCache(result);
  return result;
}

/**
 * 获取已安装包的缓存列表
 * - 优先返回缓存（5分钟有效）
 * - 缓存过期或不存在时回退到实时扫描
 * @returns {Promise<Array>} 包列表
 */
async function listInstalledCached() {
  const cached = readCache();
  if (cached) return cached;
  return await listInstalled();
}

/**
 * 获取有可用更新的包列表
 * - 执行 pip list --outdated --format=json
 * @returns {Promise<Array>} 可更新包列表
 */
async function listOutdated() {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');

  await ensurePip(env.path);
  const { stdout } = await runPip(env.path, ['list', '--outdated', '--format=json'], { timeout: 120000 });
  const list = JSON.parse(stdout);
  return list.map(item => ({
    name: item.name,
    current: item.version,
    latest: item.latest_version,
    date: ''
  }));
}

/**
 * 搜索 PyPI 上的包
 * - 使用 pip index versions（pip 21.2+）
 * - PyPI 已禁用 pip search，所以使用 index versions 作为替代
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<Object>} 搜索结果
 */
async function searchPackage(keyword) {
  if (!keyword || typeof keyword !== 'string') {
    throw new Error('Invalid search keyword: must be a non-empty string');
  }
  if (keyword.length > 200) {
    throw new Error('Invalid search keyword: too long (max 200 characters)');
  }
  if (!VALID_PACKAGE_NAME.test(keyword)) {
    throw new Error(`Invalid search keyword: ${keyword}`);
  }

  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');

  await ensurePip(env.path);
  // pip search is disabled on PyPI; use pip index versions if available (pip 21.2+)
  try {
    const { stdout } = await runPip(env.path, ['index', 'versions', keyword], { timeout: 30000, ignoreExitCode: true });
    return { keyword, result: stdout };
  } catch (err) {
    return { keyword, result: '', error: err.message };
  }
}

// ============ 包安装 ============

/**
 * 批量安装包
 * 
 * 功能特性：
 * - 支持并行安装（多线程）
 * - 支持智能重试（多镜像源重试）
 * - 支持自动回滚（安装失败时恢复备份）
 * - 支持版本控制（最新/指定/范围）
 * - 实时进度回调
 * 
 * @param {string[]} packages - 包名列表
 * @param {Object} [options={}] - 选项
 * @param {string} [options.versionMode] - 版本模式
 * @param {boolean} [options.parallel] - 是否并行安装
 * @param {boolean} [options.retry] - 是否智能重试
 * @param {boolean} [options.rollback] - 是否自动回滚
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<Object>} { installed, failed, operationId }
 */
async function installPackages(packages, options = {}, onOutput) {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  if (!packages || packages.length === 0) throw new Error('No packages specified');

  const operationId = options.operationId || generateOperationId();
  const releaseLock = await acquireEnvLock(env.path);

  try {
    await ensurePip(env.path, onOutput);

    const config = configManager.getConfig();
    const versionMode = options.versionMode || 'latest';
    const version = options.version || '';
    const parallel = options.parallel || false;
    const retry = options.retry || false;
    const autoRollback = options.rollback !== false;

    let backup = null;
    if (autoRollback) {
      try {
        backup = await backupManager.createBackup(env);
        if (onOutput) onOutput(`[INFO] Backup created: ${backup.id}`, 'stdout');
      } catch (err) {
        if (onOutput) onOutput(`[WARN] Backup failed: ${err.message}`, 'stderr');
      }
    }

    const specs = packages.map(p => buildPackageSpec(p, { versionMode, version }));
    const installed = [];
    const failed = [];

    if (parallel && specs.length > 1) {
      const threads = Math.min(config.parallelThreads || 4, specs.length);
      await runInParallel(specs, threads, async (spec) => {
        try {
          await installOne(env, spec, retry, config.retryCount || 2, onOutput, operationId);
          const name = spec.split(/[>=<!]/)[0];
          installed.push(name);
          emitProgress(onOutput, name, 'ok');
        } catch (err) {
          failed.push({ spec, error: err.message });
          if (onOutput) onOutput(`[ERR] ${spec}: ${err.message}`, 'stderr');
          emitProgress(onOutput, spec.split(/[>=<!]/)[0], 'fail');
        }
      });
    } else {
      for (const spec of specs) {
        try {
          await installOne(env, spec, retry, config.retryCount || 2, onOutput, operationId);
          const name = spec.split(/[>=<!]/)[0];
          installed.push(name);
          emitProgress(onOutput, name, 'ok');
        } catch (err) {
          failed.push({ spec, error: err.message });
          if (onOutput) onOutput(`[ERR] ${spec}: ${err.message}`, 'stderr');
          emitProgress(onOutput, spec.split(/[>=<!]/)[0], 'fail');
          if (autoRollback && backup) {
            if (onOutput) onOutput(`[ROLLBACK] Restoring from backup...`, 'stderr');
            await backupManager.restoreBackup(backup.id, env, onOutput);
            logManager.addLog({
              action: `Install: ${specs.join(', ')}`,
              status: 'failed',
              type: 'install',
              detail: `Rolled back: ${spec} - ${err.message}`
            });
            throw new Error(`Install failed and rolled back: ${spec} - ${err.message}`);
          }
        }
      }
    }

    logManager.addLog({
      action: `Install: ${specs.join(', ')}`,
      status: failed.length > 0 ? 'failed' : 'ok',
      type: 'install',
      detail: failed.length > 0 ? `Failed: ${failed.map(f => f.spec).join(', ')}` : ''
    });

    return { installed, failed, operationId };
  } finally {
    releaseLock();
  }
}

/**
 * 安装单个包（内部函数）
 * - 支持多镜像源重试
 * @param {Object} env - Python 环境
 * @param {string} spec - 包规格
 * @param {boolean} retry - 是否重试
 * @param {number} retryCount - 重试次数
 * @param {Function} onOutput - 输出回调
 * @param {string} operationId - 操作 ID
 */
async function installOne(env, spec, retry, retryCount, onOutput, operationId) {
  const mirrors = mirrorManager.getMirrors();
  const defaultMirror = mirrorManager.getDefaultMirror();
  const mirrorOrder = [defaultMirror, ...mirrors.filter(m => m.url !== defaultMirror.url)];

  let lastErr = null;
  // Always try multiple mirrors, even without smart retry
  const maxAttempts = Math.max(2, Math.min(retryCount || 2, mirrorOrder.length));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const mirror = mirrorOrder[attempt];
    const args = ['install', spec, '--no-warn-script-location'];
    if (mirror.url !== 'https://pypi.org/simple/') {
      args.push('--index-url', mirror.url);
    }

    try {
      if (onOutput) onOutput(`[INFO] Installing ${spec}${attempt > 0 ? ` (retry ${attempt} via ${mirror.name})` : ''}...`, 'stdout');
      await runPip(env.path, args, { timeout: 600000, onOutput, operationId });
      return;
    } catch (err) {
      lastErr = err;
      if (onOutput) onOutput(`[WARN] ${spec} failed on ${mirror.name}: ${err.message}`, 'stderr');
    }
  }
  throw lastErr || new Error(`Failed to install ${spec}`);
}

/**
 * 从文件安装包
 * - .whl: 直接安装 wheel 文件
 * - .txt: 从 requirements.txt 批量安装
 * 
 * @param {string} filePath - 文件路径
 * @param {Object} [options={}] - 选项
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<Object>} 安装结果
 */
async function installFromFile(filePath, options = {}, onOutput) {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  if (!fs.existsSync(filePath)) throw new Error('File not found');

  await ensurePip(env.path, onOutput);

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.whl') {
    const operationId = options.operationId || generateOperationId();
    const releaseLock = await acquireEnvLock(env.path);
    let backup = null;
    try {
      if (options.rollback !== false) {
        backup = await backupManager.createBackup(env);
        if (onOutput) onOutput(`[INFO] Backup created: ${backup.id}`, 'stdout');
      }
      const args = ['install', filePath, '--no-warn-script-location'];
      const defaultMirror = mirrorManager.getDefaultMirror();
      if (defaultMirror.url !== 'https://pypi.org/simple/') {
        args.push('--index-url', defaultMirror.url);
      }
      await runPip(env.path, args, { timeout: 600000, onOutput, operationId });
      logManager.addLog({ action: `Install wheel: ${path.basename(filePath)}`, status: 'ok', type: 'install' });
      emitProgress(onOutput, path.basename(filePath), 'ok');
      return { installed: [path.basename(filePath)], failed: [], operationId };
    } catch (err) {
      if (backup) {
        if (onOutput) onOutput(`[ROLLBACK] Restoring from backup...`, 'stderr');
        await backupManager.restoreBackup(backup.id, env, onOutput);
      }
      logManager.addLog({ action: `Install wheel: ${path.basename(filePath)}`, status: 'failed', type: 'install', detail: err.message });
      throw err;
    } finally {
      releaseLock();
    }
  }

  if (ext === '.txt') {
    const operationId = options.operationId || generateOperationId();
    const releaseLock = await acquireEnvLock(env.path);
    try {
      const config = configManager.getConfig();
      const retry = options.retry || false;
      const mirrors = mirrorManager.getMirrors();
      const defaultMirror = mirrorManager.getDefaultMirror();
      const mirrorOrder = [defaultMirror, ...mirrors.filter(m => m.url !== defaultMirror.url)];

      let backup = null;
      if (options.rollback !== false) {
        backup = await backupManager.createBackup(env);
        if (onOutput) onOutput(`[INFO] Backup created: ${backup.id}`, 'stdout');
      }

      let lastErr = null;
      for (let attempt = 0; attempt < (retry ? Math.min(config.retryCount || 2, mirrorOrder.length) : 1); attempt++) {
        const mirror = mirrorOrder[attempt];
        const args = ['install', '-r', filePath, '--no-warn-script-location'];
        if (mirror.url !== 'https://pypi.org/simple/') {
          args.push('--index-url', mirror.url);
        }
        try {
          if (onOutput) onOutput(`[INFO] Installing from ${path.basename(filePath)}${attempt > 0 ? ` (retry ${attempt} via ${mirror.name})` : ''}...`, 'stdout');
          await runPip(env.path, args, { timeout: 600000, onOutput, operationId });
          logManager.addLog({ action: `Install from file: ${path.basename(filePath)}`, status: 'ok', type: 'install' });
          emitProgress(onOutput, path.basename(filePath), 'ok');
          return { installed: [], failed: [], operationId };
        } catch (err) {
          lastErr = err;
          if (onOutput) onOutput(`[WARN] Install from file failed on ${mirror.name}: ${err.message}`, 'stderr');
        }
      }

      if (backup) {
        if (onOutput) onOutput(`[ROLLBACK] Restoring from backup...`, 'stderr');
        await backupManager.restoreBackup(backup.id, env, onOutput);
      }
      logManager.addLog({ action: `Install from file: ${path.basename(filePath)}`, status: 'failed', type: 'install', detail: lastErr.message });
      throw lastErr;
    } finally {
      releaseLock();
    }
  }

  throw new Error('Unsupported file type. Use .txt or .whl');
}

// ============ 包卸载 ============

/**
 * 批量卸载包
 * - 支持安全模式（仅卸载指定包，不影响依赖）
 * - 支持自动回滚
 * - 支持卸载前备份
 * 
 * @param {string[]} packages - 包名列表
 * @param {Object} [options={}] - 选项
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<Object>} { uninstalled, operationId }
 */
async function uninstallPackages(packages, options = {}, onOutput) {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  if (!packages || packages.length === 0) throw new Error('No packages specified');

  for (const pkg of packages) {
    if (typeof pkg !== 'string' || !VALID_PACKAGE_NAME.test(pkg)) {
      throw new Error(`Invalid package name: ${pkg}`);
    }
  }

  const operationId = options.operationId || generateOperationId();
  const releaseLock = await acquireEnvLock(env.path);

  try {
    await ensurePip(env.path, onOutput);

    const autoRollback = options.rollback !== false;
    let backup = null;
    if (options.backup || autoRollback) {
      backup = await backupManager.createBackup(env);
      if (onOutput) onOutput(`[INFO] Backup created: ${backup.id}`, 'stdout');
    }

    const args = ['uninstall', '-y', ...packages];
    if (options.force) args.push('--no-warn-script-location');

    try {
      await runPip(env.path, args, { timeout: 300000, onOutput, operationId });
      logManager.addLog({ action: `Uninstall: ${packages.join(', ')}`, status: 'ok', type: 'uninstall' });
      return { uninstalled: packages, operationId };
    } catch (err) {
      if (autoRollback && backup) {
        if (onOutput) onOutput(`[ROLLBACK] Restoring from backup...`, 'stderr');
        await backupManager.restoreBackup(backup.id, env, onOutput);
        logManager.addLog({ action: `Uninstall: ${packages.join(', ')}`, status: 'failed', type: 'uninstall', detail: 'Rolled back' });
        throw new Error(`Uninstall failed and rolled back: ${err.message}`);
      }
      logManager.addLog({ action: `Uninstall: ${packages.join(', ')}`, status: 'failed', type: 'uninstall', detail: err.message });
      throw err;
    }
  } finally {
    releaseLock();
  }
}

// ============ 包更新 ============

/**
 * 批量更新包
 * - 支持并行更新
 * - 支持智能重试（多镜像源）
 * - 支持自动回滚
 * - 实时进度回调
 * 
 * @param {string[]} packages - 包名列表
 * @param {Object} [options={}] - 选项
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<Object>} { updated, failed, operationId }
 */
async function updatePackages(packages, options = {}, onOutput) {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  if (!packages || packages.length === 0) throw new Error('No packages specified');

  for (const pkg of packages) {
    if (typeof pkg !== 'string' || !VALID_PACKAGE_NAME.test(pkg)) {
      throw new Error(`Invalid package name: ${pkg}`);
    }
  }

  const operationId = options.operationId || generateOperationId();
  const releaseLock = await acquireEnvLock(env.path);

  try {
    await ensurePip(env.path, onOutput);

    const config = configManager.getConfig();
    const parallel = options.parallel || false;
    const retry = options.retry || false;
    const autoRollback = options.rollback !== false;

    let backup = null;
    if (autoRollback) {
      backup = await backupManager.createBackup(env);
      if (onOutput) onOutput(`[INFO] Backup created: ${backup.id}`, 'stdout');
    }

    const updated = [];
    const failed = [];

    if (parallel && packages.length > 1) {
      const threads = Math.min(config.parallelThreads || 4, packages.length);
      await runInParallel(packages, threads, async (pkg) => {
        try {
          await updateOne(env, pkg, retry, config.retryCount || 2, onOutput, operationId);
          updated.push(pkg);
          emitProgress(onOutput, pkg, 'ok');
        } catch (err) {
          failed.push({ pkg, error: err.message });
          if (onOutput) onOutput(`[ERR] ${pkg}: ${err.message}`, 'stderr');
          emitProgress(onOutput, pkg, 'fail');
        }
      });
    } else {
      for (const pkg of packages) {
        try {
          await updateOne(env, pkg, retry, config.retryCount || 2, onOutput, operationId);
          updated.push(pkg);
          emitProgress(onOutput, pkg, 'ok');
        } catch (err) {
          failed.push({ pkg, error: err.message });
          if (onOutput) onOutput(`[ERR] ${pkg}: ${err.message}`, 'stderr');
          emitProgress(onOutput, pkg, 'fail');
          if (autoRollback && backup) {
            if (onOutput) onOutput(`[ROLLBACK] Restoring from backup...`, 'stderr');
            await backupManager.restoreBackup(backup.id, env, onOutput);
            logManager.addLog({
              action: `Update: ${packages.join(', ')}`,
              status: 'failed',
              type: 'update',
              detail: `Rolled back: ${pkg} - ${err.message}`
            });
            throw new Error(`Update failed and rolled back: ${pkg} - ${err.message}`);
          }
        }
      }
    }

    logManager.addLog({
      action: `Update: ${packages.join(', ')}`,
      status: failed.length > 0 ? 'failed' : 'ok',
      type: 'update',
      detail: failed.length > 0 ? `Failed: ${failed.map(f => f.pkg).join(', ')}` : ''
    });

    return { updated, failed, operationId };
  } finally {
    releaseLock();
  }
}

/**
 * 更新单个包（内部函数）
 * - 多镜像源重试
 * - 检测 "Requirement already satisfied" 避免误判成功
 */
async function updateOne(env, pkg, retry, retryCount, onOutput, operationId) {
  const mirrors = mirrorManager.getMirrors();
  const defaultMirror = mirrorManager.getDefaultMirror();
  const mirrorOrder = [defaultMirror, ...mirrors.filter(m => m.url !== defaultMirror.url)];

  let lastErr = null;
  // Always try multiple mirrors, even without smart retry
  const maxAttempts = Math.max(2, Math.min(retryCount || 2, mirrorOrder.length));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const mirror = mirrorOrder[attempt];
    const args = ['install', '--upgrade', pkg, '--no-warn-script-location'];
    if (mirror.url !== 'https://pypi.org/simple/') {
      args.push('--index-url', mirror.url);
    }

    try {
      if (onOutput) onOutput(`[INFO] Updating ${pkg}${attempt > 0 ? ` (retry ${attempt} via ${mirror.name})` : ''}...`, 'stdout');
      const { stdout } = await runPip(env.path, args, { timeout: 600000, onOutput, operationId });
      // pip 正常退出但并未实际升级（镜像源无新版本时会输出 Requirement already satisfied），
      // 视为在该镜像源上更新未生效，继续尝试下一个镜像源，避免被误计为“更新成功”
      if (!stdout.includes('Successfully installed') && stdout.includes('Requirement already satisfied')) {
        throw new Error(`no newer version of ${pkg} available on ${mirror.name}`);
      }
      return;
    } catch (err) {
      lastErr = err;
      if (onOutput) onOutput(`[WARN] ${pkg} failed on ${mirror.name}: ${err.message}`, 'stderr');
    }
  }
  throw lastErr || new Error(`Failed to update ${pkg}`);
}

/**
 * 并行执行任务（限制并发数）
 * @param {Array} items - 任务项列表
 * @param {number} concurrency - 并发数
 * @param {Function} task - 异步任务函数
 */
async function runInParallel(items, concurrency, task) {
  const queue = [...items];
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        await task(item);
      }
    })());
  }
  await Promise.all(workers);
}

/**
 * 取消正在进行的 pip 操作
 * @param {string} operationId - 操作 ID
 * @returns {number} 被取消的进程数
 */
function cancelPipOperation(operationId) {
  return cancelOperation(operationId);
}

/**
 * 修复当前环境的 pip（使用 ensurepip 重新引导安装）
 * 
 * 适用场景：
 * - pip 被意外卸载后恢复
 * - pip 损坏无法正常执行命令
 * 
 * 修复策略（按优先级）：
 * 1. python -m ensurepip --upgrade（Python 内置引导安装）
 * 2. 下载 get-pip.py 在线安装（备用方案）
 * 
 * @param {Object} [options={}] - 选项
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<Object>} { success, method, pipVersion }
 */
async function repairPip(options = {}, onOutput) {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');

  const { runCommand, checkPipAvailable, clearPipReadyCache } = require('../../utils/processRunner');

  // 清除 pip 就绪缓存，确保重新检测
  clearPipReadyCache();

  if (onOutput) onOutput(`[INFO] ${'开始修复 pip'}...\n`, 'stdout');

  // 策略 1：使用 ensurepip 引导安装
  try {
    if (onOutput) onOutput('[INFO] Trying python -m ensurepip --upgrade...\n', 'stdout');
    await runCommand(env.path, ['-m', 'ensurepip', '--upgrade'], { timeout: 60000, onOutput });

    const available = await checkPipAvailable(env.path);
    if (available) {
      const { stdout } = await runCommand(env.path, ['-m', 'pip', '--version'], { timeout: 10000 });
      const match = stdout.trim().match(/pip\s+([\d.]+)/i);
      const pipVersion = match ? match[1] : 'unknown';
      if (onOutput) onOutput(`[INFO] pip repaired successfully via ensurepip (v${pipVersion})\n`, 'stdout');
      logManager.addLog({ action: 'Repair pip via ensurepip', status: 'ok', type: 'system', detail: `pip v${pipVersion}` });
      return { success: true, method: 'ensurepip', pipVersion };
    }
  } catch (err) {
    if (onOutput) onOutput(`[WARN] ensurepip failed: ${err.message}\n`, 'stderr');
  }

  // 策略 2：下载 get-pip.py 在线安装
  try {
    if (onOutput) onOutput('[INFO] Trying get-pip.py (online)...\n', 'stdout');
    // 复用 processRunner 中的 ensurePip 完整流程（含 get-pip.py 下载）
    await ensurePip(env.path, onOutput);

    const { stdout } = await runCommand(env.path, ['-m', 'pip', '--version'], { timeout: 10000 });
    const match = stdout.trim().match(/pip\s+([\d.]+)/i);
    const pipVersion = match ? match[1] : 'unknown';
    if (onOutput) onOutput(`[INFO] pip repaired successfully via get-pip.py (v${pipVersion})\n`, 'stdout');
    logManager.addLog({ action: 'Repair pip via get-pip.py', status: 'ok', type: 'system', detail: `pip v${pipVersion}` });
    return { success: true, method: 'get-pip.py', pipVersion };
  } catch (err) {
    if (onOutput) onOutput(`[ERR] All repair methods failed: ${err.message}\n`, 'stderr');
    logManager.addLog({ action: 'Repair pip', status: 'failed', type: 'system', detail: err.message });
    throw new Error(`pip repair failed: ${err.message}`);
  }
}

// ============ 包详情 / 导出导入 / 依赖 ============

/**
 * 获取包的详细信息（pip show）
 * - 包含：版本、摘要、主页、作者、License、依赖、被依赖
 * @param {string} pkgName - 包名
 * @returns {Promise<Object>} 包详细信息
 */
async function showPackageInfo(pkgName) {
  if (!pkgName || !VALID_PACKAGE_NAME.test(pkgName)) {
    throw new Error(`Invalid package name: ${pkgName}`);
  }
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');

  await ensurePip(env.path);
  const { stdout } = await runPip(env.path, ['show', pkgName], { timeout: 15000 });

  const info = {};
  for (const line of stdout.split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      info[key] = val;
    }
  }

  return {
    name: info.Name || pkgName,
    version: info.Version || '',
    summary: info.Summary || '',
    homePage: info['Home-page'] || '',
    author: info.Author || '',
    authorEmail: info['Author-email'] || '',
    license: info.License || '',
    location: info.Location || '',
    requires: info.Requires ? info.Requires.split(',').map(s => s.trim()).filter(Boolean) : [],
    requiredBy: info['Required-by'] ? info['Required-by'].split(',').map(s => s.trim()).filter(Boolean) : []
  };
}

/**
 * 获取包的依赖树（递归，最大深度 3）
 * @param {string} pkgName - 包名
 * @returns {Promise<Object>} 依赖树 { name, version, children: [...] }
 */
async function getDependencyTree(pkgName) {
  if (!pkgName || !VALID_PACKAGE_NAME.test(pkgName)) {
    throw new Error(`Invalid package name: ${pkgName}`);
  }
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  await ensurePip(env.path);

  const visited = new Set();
  async function buildTree(name, depth) {
    if (depth > 3 || visited.has(name.toLowerCase())) {
      return { name, version: '', children: [] };
    }
    visited.add(name.toLowerCase());
    try {
      const { stdout } = await runPip(env.path, ['show', name], { timeout: 10000 });
      const info = {};
      for (const line of stdout.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) info[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      const requires = info.Requires ? info.Requires.split(',').map(s => s.trim()).filter(Boolean) : [];
      const children = [];
      for (const dep of requires.slice(0, 12)) {
        children.push(await buildTree(dep, depth + 1));
      }
      return { name: info.Name || name, version: info.Version || '', children };
    } catch {
      return { name, version: '', children: [] };
    }
  }
  return await buildTree(pkgName, 0);
}

/**
 * 导出当前环境为 requirements.txt
 * @param {Object} options - 选项
 * @param {string} options.savePath - 保存路径（如果为空则返回内容）
 * @param {boolean} [options.freeze=true] - 是否使用 pip freeze（带版本号）
 * @returns {Promise<{content: string, count: number}>}
 */
async function exportRequirements(options = {}) {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  await ensurePip(env.path);

  const { stdout } = await runPip(env.path, ['freeze'], { timeout: 30000 });
  const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const content = lines.join('\n');

  if (options.savePath) {
    fs.writeFileSync(options.savePath, content, 'utf-8');
    logManager.addLog({ action: `Export requirements (${lines.length} packages)`, status: 'ok', type: 'system', detail: options.savePath });
  }
  return { content, count: lines.length };
}

/**
 * 从 requirements.txt 导入包到当前环境
 * @param {string} filePath - requirements.txt 文件路径
 * @param {Object} options - 安装选项
 * @param {Function} [onOutput] - 进度回调
 * @returns {Promise<Object>} 安装结果
 */
async function importRequirements(filePath, options = {}, onOutput) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('File not found: ' + filePath);
  }
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  await ensurePip(env.path);

  const releaseLock = await acquireEnvLock(env.path);
  const operationId = options.operationId || generateOperationId();

  try {
    if (onOutput) onOutput(`[INFO] Importing from ${path.basename(filePath)}...\n`, 'stdout');
    const args = ['install', '-r', filePath];
    if (options.retry === false) args.push('--no-retries');

    const { stdout } = await runPip(env.path, args, { timeout: 300000, onOutput, operationId });
    const installed = (stdout.match(/Successfully installed (.+)/) || [])[1] || '';
    logManager.addLog({ action: `Import requirements from ${path.basename(filePath)}`, status: 'ok', type: 'install', detail: installed.slice(0, 200) });
    return { success: true, output: installed };
  } catch (err) {
    logManager.addLog({ action: `Import requirements failed`, status: 'failed', type: 'install', detail: err.message });
    throw err;
  } finally {
    releaseLock();
  }
}

/**
 * 对比两个环境的包差异
 * @param {string} envPathA - 环境 A 的 Python 路径
 * @param {string} envPathB - 环境 B 的 Python 路径
 * @returns {Promise<Object>} { onlyA: [], onlyB: [], different: [], same: number }
 */
async function compareEnvironments(envPathA, envPathB) {
  if (!envPathA || !envPathB) throw new Error('Two environment paths required');

  await ensurePip(envPathA);
  await ensurePip(envPathB);

  const [resA, resB] = await Promise.all([
    runPip(envPathA, ['list', '--format=json'], { timeout: 60000 }),
    runPip(envPathB, ['list', '--format=json'], { timeout: 60000 })
  ]);

  const listA = JSON.parse(resA.stdout);
  const listB = JSON.parse(resB.stdout);

  const mapA = new Map(listA.map(p => [p.name.toLowerCase(), p]));
  const mapB = new Map(listB.map(p => [p.name.toLowerCase(), p]));

  const onlyA = [];
  const onlyB = [];
  const different = [];
  let same = 0;

  for (const [key, pkg] of mapA) {
    if (!mapB.has(key)) {
      onlyA.push(pkg);
    } else {
      const b = mapB.get(key);
      if (pkg.version !== b.version) {
        different.push({ name: pkg.name, versionA: pkg.version, versionB: b.version });
      } else {
        same++;
      }
    }
  }
  for (const [key, pkg] of mapB) {
    if (!mapA.has(key)) onlyB.push(pkg);
  }

  return { onlyA, onlyB, different, same };
}

// ============ 磁盘空间分析 ============

/**
 * 获取当前环境的磁盘占用分析
 * @returns {Promise<Object>} { packages: [{name, size, sizeText}], total, totalText, sitePackagesPath }
 */
async function getDiskUsage() {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  await ensurePip(env.path);

  const { stdout } = await runPip(env.path, ['list', '--format=json'], { timeout: 60000 });
  const list = JSON.parse(stdout);
  const sitePackages = await getSitePackagesPath(env.path);
  const dirMap = buildPackageDirMap(sitePackages);
  const sizeCache = new Map();

  const packages = [];
  let total = 0;
  for (const item of list) {
    const sizeInfo = estimatePackageSizeFast(item.name, sitePackages, dirMap, sizeCache);
    packages.push({ name: item.name, version: item.version, size: sizeInfo.size, sizeText: sizeInfo.text });
    total += sizeInfo.size;
  }
  packages.sort((a, b) => b.size - a.size);

  const totalText = total >= 1024 ? `${(total / 1024).toFixed(2)} GB` : `${total.toFixed(1)} MB`;
  return { packages, total, totalText, sitePackagesPath: sitePackages };
}

// ============ 离线包下载 ============

/**
 * 下载包到指定目录（用于离线安装）
 * @param {string[]} packages - 包名列表
 * @param {string} destDir - 目标目录
 * @param {Object} options - { includeDeps, platform, pythonVersion, operationId }
 * @param {Function} [onOutput] - 进度回调
 * @returns {Promise<Object>} { downloaded: number, destDir }
 */
async function downloadPackages(packages, destDir, options = {}, onOutput) {
  if (!packages || !Array.isArray(packages) || packages.length === 0) {
    throw new Error('No packages specified');
  }
  if (!destDir) throw new Error('No destination directory specified');

  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  await ensurePip(env.path);

  // 安全校验包名
  const specs = packages.map(p => buildPackageSpec(p));
  const operationId = options.operationId || generateOperationId();

  // 确保目标目录存在
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const args = ['download', ...specs, '-d', destDir];
  if (options.includeDeps === false) args.push('--no-deps');
  if (options.platform && options.platform !== 'any') args.push('--platform', options.platform);
  if (options.pythonVersion) args.push('--python-version', options.pythonVersion);

  // 追加镜像源参数（使用全局镜像源配置）
  const mirrorArgs = mirrorManager.buildMirrorArgs();
  if (mirrorArgs) args.push(...mirrorArgs);

  if (onOutput) onOutput(`[INFO] Downloading ${specs.length} package(s) to ${destDir}...\n`, 'stdout');

  try {
    await runPip(env.path, args, { timeout: 600000, onOutput, operationId });
    logManager.addLog({ action: `Download packages: ${specs.join(', ')}`, status: 'ok', type: 'system', detail: `dest: ${destDir}` });
    if (onOutput) onOutput(`[OK] Download complete\n`, 'stdout');
    return { downloaded: specs.length, destDir, operationId };
  } catch (err) {
    logManager.addLog({ action: `Download packages failed`, status: 'failed', type: 'system', detail: err.message });
    throw err;
  }
}

// ============ requirements 对比 ============

/**
 * 对比两个来源的包列表差异
 * @param {Object} sourceA - { type: 'env'|'file', path: string }
 * @param {Object} sourceB - { type: 'env'|'file', path: string }
 * @returns {Promise<Object>} { onlyA, onlyB, upgraded, downgraded, same }
 */
async function diffRequirements(sourceA, sourceB) {
  async function getPackages(source) {
    if (source.type === 'file') {
      if (!fs.existsSync(source.path)) throw new Error(`File not found: ${source.path}`);
      const content = fs.readFileSync(source.path, 'utf-8');
      const map = new Map();
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9._-]+)\s*==\s*(.+)$/);
        if (match) map.set(match[1].toLowerCase(), { name: match[1], version: match[2].trim() });
        else {
          const nameMatch = trimmed.match(/^([a-zA-Z0-9._-]+)/);
          if (nameMatch) map.set(nameMatch[1].toLowerCase(), { name: nameMatch[1], version: '*' });
        }
      }
      return map;
    } else {
      await ensurePip(source.path);
      const { stdout } = await runPip(source.path, ['list', '--format=json'], { timeout: 60000 });
      const list = JSON.parse(stdout);
      return new Map(list.map(p => [p.name.toLowerCase(), { name: p.name, version: p.version }]));
    }
  }

  const [mapA, mapB] = await Promise.all([getPackages(sourceA), getPackages(sourceB)]);

  const onlyA = [], onlyB = [], upgraded = [], downgraded = [], same = [];

  for (const [key, pkgA] of mapA) {
    if (!mapB.has(key)) {
      onlyA.push(pkgA);
    } else {
      const pkgB = mapB.get(key);
      if (pkgA.version === pkgB.version) {
        same.push(pkgA);
      } else {
        // 简单版本比较：A 版本 > B 版本则为 upgraded（从B视角看是升级）
        upgraded.push({ name: pkgA.name, versionA: pkgA.version, versionB: pkgB.version });
      }
    }
  }
  for (const [key, pkgB] of mapB) {
    if (!mapA.has(key)) onlyB.push(pkgB);
  }

  return { onlyA, onlyB, upgraded, downgraded, same };
}

// ============ 包版本发布历史 ============

/**
 * 获取包的版本发布历史（从 PyPI JSON API）
 * @param {string} pkgName - 包名
 * @returns {Promise<Object>} { releases: [{version, uploadTime, url}], homePage, projectUrl }
 */
async function getPackageReleases(pkgName) {
  if (!pkgName || !VALID_PACKAGE_NAME.test(pkgName)) {
    throw new Error(`Invalid package name: ${pkgName}`);
  }

  const https = require('https');
  const url = `https://pypi.org/pypi/${encodeURIComponent(pkgName)}/json`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`PyPI returned ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const releases = [];
          const versions = Object.keys(json.releases || {}).sort((a, b) => {
            const timeA = json.releases[a][0] ? json.releases[a][0].upload_time : '';
            const timeB = json.releases[b][0] ? json.releases[b][0].upload_time : '';
            return timeB.localeCompare(timeA);
          }).slice(0, 10);

          for (const ver of versions) {
            const files = json.releases[ver];
            if (files && files.length > 0) {
              releases.push({ version: ver, uploadTime: files[0].upload_time, url: files[0].url });
            } else {
              releases.push({ version: ver, uploadTime: '', url: '' });
            }
          }

          resolve({
            releases,
            homePage: json.info.home_page || '',
            projectUrl: json.info.project_url || '',
            projectUrls: json.info.project_urls || {}
          });
        } catch (err) {
          reject(new Error(`Failed to parse PyPI response: ${err.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ============ 全局依赖图谱 ============

// 依赖图缓存
let depGraphCache = null;
let depGraphCacheTime = 0;
const DEP_GRAPH_CACHE_TTL = 5 * 60 * 1000;

/**
 * 获取全局依赖关系图数据
 * @returns {Promise<Object>} { nodes: [{name, version}], edges: [{from, to}] }
 */
async function getFullDependencyGraph() {
  // 检查缓存
  if (depGraphCache && Date.now() - depGraphCacheTime < DEP_GRAPH_CACHE_TTL) {
    return depGraphCache;
  }

  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  await ensurePip(env.path);

  const { stdout } = await runPip(env.path, ['list', '--format=json'], { timeout: 60000 });
  const list = JSON.parse(stdout);

  const nodes = [];
  const edges = [];
  const nameSet = new Set(list.map(p => p.name.toLowerCase()));

  // 限制扫描数量避免超时（最多 80 个包）
  const toScan = list.slice(0, 80);

  for (const pkg of toScan) {
    nodes.push({ name: pkg.name, version: pkg.version });
    try {
      const { stdout: showOut } = await runPip(env.path, ['show', pkg.name], { timeout: 10000 });
      const requiresMatch = showOut.match(/Requires:\s*(.+)/i);
      if (requiresMatch && requiresMatch[1].trim()) {
        const deps = requiresMatch[1].split(',').map(d => d.trim().toLowerCase());
        for (const dep of deps) {
          if (nameSet.has(dep)) {
            edges.push({ from: pkg.name, to: dep });
          }
        }
      }
    } catch { /* 单个包失败不影响整体 */ }
  }

  // 添加未扫描的包作为节点
  for (const pkg of list.slice(80)) {
    nodes.push({ name: pkg.name, version: pkg.version });
  }

  depGraphCache = { nodes, edges };
  depGraphCacheTime = Date.now();
  return depGraphCache;
}

/**
 * 依赖冲突检测（基于 pip check）
 * 扫描当前环境中包之间的版本冲突
 * @returns {Promise<Object>} { ok, conflicts: [{package, version, requires, requiredBy, message}] }
 */
async function checkConflicts() {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  await ensurePip(env.path);

  try {
    const { stdout } = await runPip(env.path, ['check'], { timeout: 60000 });
    const lines = stdout.split('\n').filter(l => l.trim());
    // pip check 输出 "No broken requirements found." 表示无冲突
    if (lines.length === 0 || (lines.length === 1 && lines[0].includes('No broken requirements found'))) {
      return { ok: true, conflicts: [], message: 'No broken requirements found.' };
    }
    // 解析冲突行，格式: "pkgA 1.0 requires pkgB, which is not installed."
    // 或: "pkgA 1.0 has requirement pkgB>=2.0, but you have pkgB 1.5."
    const conflicts = [];
    for (const line of lines) {
      const match1 = line.match(/^(.+?)\s+([\d.]+\S*)\s+requires\s+(.+?),\s+which is not installed/i);
      const match2 = line.match(/^(.+?)\s+([\d.]+\S*)\s+has requirement\s+(.+?),\s+but you have\s+(.+?)\s+([\d.]+\S*)/i);
      if (match1) {
        conflicts.push({ package: match1[1], version: match1[2], requires: match1[3], installed: null, message: line.trim() });
      } else if (match2) {
        conflicts.push({ package: match2[1], version: match2[2], requires: match2[3], installed: `${match2[4]} ${match2[5]}`, message: line.trim() });
      } else {
        conflicts.push({ package: '', version: '', requires: '', installed: null, message: line.trim() });
      }
    }
    logManager.addLog({ action: `Dependency check: ${conflicts.length} conflict(s)`, status: conflicts.length > 0 ? 'failed' : 'ok', type: 'system' });
    return { ok: conflicts.length === 0, conflicts, message: stdout.trim() };
  } catch (err) {
    // pip check 返回非零退出码时也可能有输出
    if (err.stdout) {
      const lines = err.stdout.split('\n').filter(l => l.trim());
      const conflicts = lines.map(line => {
        const match2 = line.match(/^(.+?)\s+([\d.]+\S*)\s+has requirement\s+(.+?),\s+but you have\s+(.+?)\s+([\d.]+\S*)/i);
        const match1 = line.match(/^(.+?)\s+([\d.]+\S*)\s+requires\s+(.+?),\s+which is not installed/i);
        if (match2) return { package: match2[1], version: match2[2], requires: match2[3], installed: `${match2[4]} ${match2[5]}`, message: line.trim() };
        if (match1) return { package: match1[1], version: match1[2], requires: match1[3], installed: null, message: line.trim() };
        return { package: '', version: '', requires: '', installed: null, message: line.trim() };
      });
      return { ok: false, conflicts, message: err.stdout.trim() };
    }
    throw err;
  }
}

/**
 * 环境健康检查（综合诊断）
 * 检测损坏的包、缺失的元数据、依赖冲突等
 * @returns {Promise<Object>} 健康报告
 */
async function healthCheck() {
  const env = getCurrentEnv();
  if (!env) throw new Error('No Python environment selected');
  await ensurePip(env.path);

  const report = {
    envName: env.name || env.path,
    pythonVersion: env.version || 'unknown',
    totalPackages: 0,
    issues: [],
    brokenPackages: [],
    missingMetadata: [],
    conflicts: [],
    score: 100
  };

  // 1. 获取已安装包列表
  try {
    const { stdout } = await runPip(env.path, ['list', '--format=json'], { timeout: 60000 });
    const list = JSON.parse(stdout);
    report.totalPackages = list.length;
  } catch (err) {
    report.issues.push({ level: 'error', message: `Failed to list packages: ${err.message}` });
    report.score -= 30;
  }

  // 2. pip check 依赖冲突
  try {
    const conflictResult = await checkConflicts();
    if (!conflictResult.ok) {
      report.conflicts = conflictResult.conflicts;
      report.score -= Math.min(30, conflictResult.conflicts.length * 5);
      for (const c of conflictResult.conflicts.slice(0, 10)) {
        report.issues.push({ level: 'warning', message: c.message });
      }
    }
  } catch (err) {
    report.issues.push({ level: 'warning', message: `Dependency check failed: ${err.message}` });
  }

  // 3. 检查损坏的包（通过 pip show 验证元数据）
  try {
    const { stdout } = await runPip(env.path, ['list', '--format=json'], { timeout: 60000 });
    const list = JSON.parse(stdout);
    // 抽样检查前 30 个包的元数据完整性
    const toCheck = list.slice(0, 30);
    for (const pkg of toCheck) {
      try {
        await runPip(env.path, ['show', pkg.name], { timeout: 10000 });
      } catch {
        report.brokenPackages.push(pkg.name);
        report.issues.push({ level: 'error', message: `Package metadata corrupted: ${pkg.name}` });
      }
    }
    if (report.brokenPackages.length > 0) {
      report.score -= report.brokenPackages.length * 10;
    }
  } catch { /* 已在上面处理 */ }

  // 4. 检查 site-packages 目录可访问性
  try {
    const sitePackages = await getSitePackagesPath(env.path);
    if (!sitePackages || !fs.existsSync(sitePackages)) {
      report.issues.push({ level: 'error', message: 'site-packages directory not accessible' });
      report.score -= 20;
    }
  } catch {
    report.issues.push({ level: 'warning', message: 'Cannot determine site-packages path' });
    report.score -= 10;
  }

  report.score = Math.max(0, Math.min(100, report.score));
  logManager.addLog({ action: `Health check: score ${report.score}/100`, status: report.score >= 80 ? 'ok' : 'failed', type: 'system' });
  return report;
}

// ============ PyPI 实时搜索（安装页搜索建议） ============

/**
 * 搜索 PyPI 上的包（通过 PyPI JSON API 精确匹配）
 * - 用于安装页输入时的实时搜索建议（包名/描述/最新版本）
 * - 搜索失败或无结果时返回空列表，不抛错（避免阻断输入体验）
 * @param {string} keyword - 搜索关键词（包名）
 * @returns {Promise<Object>} { results: [{ name, summary, version }] }
 */
async function searchPyPI(keyword) {
  if (!keyword || typeof keyword !== 'string') {
    throw new Error('Invalid search keyword: must be a non-empty string');
  }
  const kw = keyword.trim();
  if (!kw || kw.length > 200) {
    throw new Error('Invalid search keyword: too long (max 200 characters)');
  }
  if (!VALID_PACKAGE_NAME.test(kw)) {
    return { results: [] };
  }

  const https = require('https');
  const url = `https://pypi.org/pypi/${encodeURIComponent(kw)}/json`;

  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve({ results: [] });
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            results: [{
              name: json.info.name,
              summary: json.info.summary || '',
              version: json.info.version || ''
            }]
          });
        } catch {
          resolve({ results: [] });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ results: [] }); });
    req.on('error', () => resolve({ results: [] }));
  });
}

module.exports = {
  listInstalled,
  listInstalledCached,
  listOutdated,
  searchPackage,
  searchPyPI,
  installPackages,
  installFromFile,
  uninstallPackages,
  updatePackages,
  cancelPipOperation,
  repairPip,
  buildPackageSpec,
  buildPackageDirMap,
  estimatePackageSizeFast,
  getFolderSizeCached,
  clearSitePackagesCache,
  showPackageInfo,
  getDependencyTree,
  exportRequirements,
  importRequirements,
  compareEnvironments,
  getDiskUsage,
  downloadPackages,
  diffRequirements,
  getPackageReleases,
  getFullDependencyGraph,
  checkConflicts,
  healthCheck
};
