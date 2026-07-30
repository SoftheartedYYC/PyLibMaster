const fs = require('fs');
const path = require('path');
const configManager = require('./configManager');
const mirrorManager = require('./mirrorManager');
const backupManager = require('./backupManager');
const logManager = require('./logManager');
const { runPip, ensurePip, cancelOperation } = require('../utils/processRunner');
const envManager = require('./envManager');

const VALID_PACKAGE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const VALID_VERSION_SPEC = /^[a-zA-Z0-9._*!=<>,~+-]+$/;
const SITE_PACKAGES_CACHE_TTL = 30 * 1000; // 30 seconds

const sitePackagesCache = new Map(); // pythonPath -> { location, time }
const envLocks = new Map();

function getCurrentEnv() {
  return envManager.getCurrent();
}

function generateOperationId() {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function acquireEnvLock(envPath) {
  while (envLocks.get(envPath)) {
    await envLocks.get(envPath);
  }
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  envLocks.set(envPath, promise);
  return () => {
    envLocks.delete(envPath);
    resolve();
  };
}

function getCacheFile() {
  const storage = configManager.getStoragePath();
  return path.join(storage, 'installed-cache.json');
}

function readCache() {
  try {
    const cacheFile = getCacheFile();
    if (fs.existsSync(cacheFile)) {
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      const data = JSON.parse(raw);
      // Cache valid for 5 minutes
      if (Date.now() - data.timestamp < 5 * 60 * 1000) {
        return data.list;
      }
    }
  } catch (err) {
    logManager.addLog({ action: 'Read installed cache failed', status: 'failed', type: 'system', detail: err.message });
  }
  return null;
}

function writeCache(list) {
  try {
    const cacheFile = getCacheFile();
    fs.writeFileSync(cacheFile, JSON.stringify({ timestamp: Date.now(), list }, null, 2), 'utf-8');
  } catch (err) {
    logManager.addLog({ action: 'Write installed cache failed', status: 'failed', type: 'system', detail: err.message });
  }
}

// Shell metacharacters that must never appear in a wheel path
const WHEEL_PATH_BLOCKED_CHARS = /[;&|`$<>"'\r\n\0]/;
const VALID_WHEEL_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.whl$/i;
const MAX_PACKAGE_NAME_LENGTH = 214;
const MAX_VERSION_LENGTH = 100;

function buildPackageSpec(name, options = {}) {
  // Reject non-string / empty input up front (regex .test() would coerce types)
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Invalid package name: must be a non-empty string');
  }

  // File paths (e.g. .whl) bypass package-name validation but still need path safety checks
  if (name.endsWith('.whl')) {
    const normalized = path.normalize(name);
    if (normalized.includes('..')) {
      throw new Error(`Invalid wheel path (path traversal detected): ${name}`);
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

  if (name.length > MAX_PACKAGE_NAME_LENGTH) {
    throw new Error(`Invalid package name: too long (max ${MAX_PACKAGE_NAME_LENGTH} characters)`);
  }

  if (!VALID_PACKAGE_NAME.test(name)) {
    throw new Error(`Invalid package name: ${name}`);
  }

  if (options.versionMode === 'specific') {
    if (!options.version || options.version.length > MAX_VERSION_LENGTH || !VALID_VERSION_SPEC.test(options.version)) {
      throw new Error(`Invalid version specifier: ${options.version}`);
    }
    return `${name}==${options.version}`;
  }

  if (options.versionMode === 'range') {
    if (!options.version || options.version.length > MAX_VERSION_LENGTH || !VALID_VERSION_SPEC.test(options.version)) {
      throw new Error(`Invalid version range: ${options.version}`);
    }
    return `${name}${options.version}`;
  }

  return name;
}

async function getSitePackagesPath(pythonPath) {
  const now = Date.now();
  const cached = sitePackagesCache.get(pythonPath);
  if (cached && now - cached.time < SITE_PACKAGES_CACHE_TTL) {
    return cached.location;
  }
  try {
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

function clearSitePackagesCache() {
  sitePackagesCache.clear();
}

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
        map.set(pkgName, { type: 'dist-info', path: fullPath });
      } else {
        const pkgName = name.replace(/_/g, '-').toLowerCase();
        map.set(pkgName, { type: 'dir', path: fullPath });
      }
    }
  } catch (err) {
    logManager.addLog({ action: 'Build package dir map failed', status: 'failed', type: 'system', detail: err.message });
  }
  return map;
}

function findDistInfoEntry(dirMap, pkgName) {
  const key = pkgName.toLowerCase();
  const entry = dirMap.get(key);
  return entry && entry.type === 'dist-info' ? entry : null;
}

function getFolderSizeCached(dir, cache, depth = 0) {
  const MAX_DEPTH = 20;
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

function getInstallTimeFast(pkgName, sitePackages, dirMap) {
  if (!sitePackages) return '';
  const dirKey = pkgName.replace(/-/g, '_').toLowerCase();
  const distKey = pkgName.replace(/_/g, '-').toLowerCase();

  const dirEntry = dirMap.get(dirKey);
  const distEntry = findDistInfoEntry(dirMap, distKey);
  const target = dirEntry || distEntry;

  if (target) {
    try {
      return fs.statSync(target.path).mtime.toISOString().slice(0, 10);
    } catch (err) {
      logManager.addLog({ action: 'Get install time failed', status: 'failed', type: 'system', detail: `${target.path}: ${err.message}` });
    }
  }
  return '';
}

function estimatePackageSizeFast(pkgName, sitePackages, dirMap, sizeCache) {
  if (!sitePackages) return { size: 0, text: '0 MB' };

  const candidates = [];
  const dirKey = pkgName.replace(/-/g, '_').toLowerCase();
  const dirEntry = dirMap.get(dirKey);
  if (dirEntry && dirEntry.type === 'dir') candidates.push(dirEntry.path);

  const distKey = pkgName.replace(/_/g, '-').toLowerCase();
  const distEntry = findDistInfoEntry(dirMap, distKey);
  if (distEntry) candidates.push(distEntry.path);

  let total = 0;
  for (const c of candidates) {
    total += getFolderSizeCached(c, sizeCache);
  }

  if (total === 0) return { size: 0, text: '-' };
  const mb = total / 1024 / 1024;
  return { size: Math.round(mb * 10) / 10, text: mb >= 1 ? `${mb.toFixed(1)} MB` : `${(total / 1024).toFixed(1)} KB` };
}

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

async function listInstalledCached() {
  const cached = readCache();
  if (cached) return cached;
  return await listInstalled();
}

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

    try {
      if (parallel && specs.length > 1) {
        const threads = Math.min(config.parallelThreads || 4, specs.length);
        await runInParallel(specs, threads, async (spec) => {
          try {
            await installOne(env, spec, retry, config.retryCount || 2, onOutput, operationId);
            const name = spec.split(/[>=<!]/)[0];
            installed.push(name);
          } catch (err) {
            failed.push({ spec, error: err.message });
            if (onOutput) onOutput(`[ERR] ${spec}: ${err.message}`, 'stderr');
          }
        });
      } else {
        for (const spec of specs) {
          try {
            await installOne(env, spec, retry, config.retryCount || 2, onOutput, operationId);
            const name = spec.split(/[>=<!]/)[0];
            installed.push(name);
          } catch (err) {
            failed.push({ spec, error: err.message });
            if (onOutput) onOutput(`[ERR] ${spec}: ${err.message}`, 'stderr');
            if (autoRollback && backup) {
              if (onOutput) onOutput(`[ROLLBACK] Restoring from backup...`, 'stderr');
              await backupManager.restoreBackup(backup.id, env, onOutput);
              throw new Error(`Install failed and rolled back: ${spec} - ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      throw err;
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

    try {
      if (parallel && packages.length > 1) {
        const threads = Math.min(config.parallelThreads || 4, packages.length);
        await runInParallel(packages, threads, async (pkg) => {
          try {
            await updateOne(env, pkg, retry, config.retryCount || 2, onOutput, operationId);
            updated.push(pkg);
          } catch (err) {
            failed.push({ pkg, error: err.message });
            if (onOutput) onOutput(`[ERR] ${pkg}: ${err.message}`, 'stderr');
          }
        });
      } else {
        for (const pkg of packages) {
          try {
            await updateOne(env, pkg, retry, config.retryCount || 2, onOutput, operationId);
            updated.push(pkg);
          } catch (err) {
            failed.push({ pkg, error: err.message });
            if (onOutput) onOutput(`[ERR] ${pkg}: ${err.message}`, 'stderr');
            if (autoRollback && backup) {
              if (onOutput) onOutput(`[ROLLBACK] Restoring from backup...`, 'stderr');
              await backupManager.restoreBackup(backup.id, env, onOutput);
              throw new Error(`Update failed and rolled back: ${pkg} - ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      throw err;
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
      await runPip(env.path, args, { timeout: 600000, onOutput, operationId });
      return;
    } catch (err) {
      lastErr = err;
      if (onOutput) onOutput(`[WARN] ${pkg} failed on ${mirror.name}: ${err.message}`, 'stderr');
    }
  }
  throw lastErr || new Error(`Failed to update ${pkg}`);
}

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

function cancelPipOperation(operationId) {
  return cancelOperation(operationId);
}

module.exports = {
  listInstalled,
  listInstalledCached,
  listOutdated,
  searchPackage,
  installPackages,
  installFromFile,
  uninstallPackages,
  updatePackages,
  cancelPipOperation,
  buildPackageSpec,
  buildPackageDirMap,
  estimatePackageSizeFast,
  getFolderSizeCached,
  clearSitePackagesCache
};
