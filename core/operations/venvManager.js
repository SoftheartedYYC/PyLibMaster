/**
 * @file venvManager.js
 * @description Python 虚拟环境（venv）管理器
 * 
 * 职责：
 * - 创建虚拟环境（支持指定名称、基础 Python、是否包含 pip、是否继承系统包）
 * - 列出已创建的虚拟环境
 * - 删除虚拟环境
 * - 获取虚拟环境详细信息（Python 版本、pip 版本、已安装包数量）
 * 
 * 虚拟环境存储位置：
 * - 默认保存在配置存储路径下的 venvs 目录中
 * - 每个 venv 以独立文件夹存在（内含 Scripts/python.exe）
 */

const fs = require('fs');
const path = require('path');
const configManager = require('../config/configManager');
const logManager = require('../system/logManager');
const { runCommand, runPython } = require('../../utils/processRunner');

// venv 名称合法性正则（只允许字母、数字、短横线、下划线、点）
const VALID_VENV_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MAX_VENV_NAME_LENGTH = 64;

/**
 * 获取虚拟环境存储根目录
 * @returns {string} venvs 目录路径
 */
function getVenvsDir() {
  const storage = configManager.getStoragePath();
  return path.join(storage, 'venvs');
}

/**
 * 确保 venvs 目录存在
 * @returns {string} venvs 目录路径
 */
function ensureVenvsDir() {
  const dir = getVenvsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 获取 venv 内的 Python 可执行文件路径
 * @param {string} venvPath - venv 根目录
 * @returns {string} python.exe 路径
 */
function getVenvPythonPath(venvPath) {
  // Windows: Scripts/python.exe, Unix: bin/python
  const winPath = path.join(venvPath, 'Scripts', 'python.exe');
  const unixPath = path.join(venvPath, 'bin', 'python');
  if (fs.existsSync(winPath)) return winPath;
  if (fs.existsSync(unixPath)) return unixPath;
  return winPath; // 默认返回 Windows 路径
}

/**
 * 创建虚拟环境
 * 
 * @param {Object} options - 创建选项
 * @param {string} options.name - 虚拟环境名称
 * @param {string} options.pythonPath - 基础 Python 可执行文件路径
 * @param {boolean} [options.withPip=true] - 是否包含 pip（--without-pip 的反义）
 * @param {boolean} [options.systemSitePackages=false] - 是否继承系统 site-packages
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<Object>} 创建的 venv 信息 { name, path, pythonPath, version }
 * @throws {Error} 名称不合法或创建失败
 */
async function createVenv(options, onOutput) {
  const { name, pythonPath, withPip = true, systemSitePackages = false } = options;

  // 名称校验
  if (!name || typeof name !== 'string' || !VALID_VENV_NAME.test(name)) {
    throw new Error(`Invalid venv name: ${name}`);
  }
  if (name.length > MAX_VENV_NAME_LENGTH) {
    throw new Error(`Venv name too long (max ${MAX_VENV_NAME_LENGTH} characters)`);
  }

  // 基础 Python 校验
  if (!pythonPath || !fs.existsSync(pythonPath)) {
    throw new Error('Base Python not found: ' + pythonPath);
  }

  const venvsDir = ensureVenvsDir();
  const venvPath = path.join(venvsDir, name);

  // 检查是否已存在
  if (fs.existsSync(venvPath)) {
    throw new Error(`Virtual environment "${name}" already exists`);
  }

  // 构建 python -m venv 命令参数
  const args = ['-m', 'venv'];
  if (!withPip) args.push('--without-pip');
  if (systemSitePackages) args.push('--system-site-packages');
  args.push(venvPath);

  if (onOutput) onOutput(`[INFO] Creating venv "${name}"...\n`, 'stdout');

  try {
    await runCommand(pythonPath, args, { timeout: 120000, onOutput });
  } catch (err) {
    // 创建失败时清理残留目录
    if (fs.existsSync(venvPath)) {
      try { fs.rmSync(venvPath, { recursive: true, force: true }); } catch {}
    }
    logManager.addLog({ action: `Create venv: ${name}`, status: 'failed', type: 'system', detail: err.message });
    throw new Error(`Failed to create venv: ${err.message}`);
  }

  // 获取 venv 的 Python 版本
  const venvPython = getVenvPythonPath(venvPath);
  let version = 'unknown';
  try {
    const { stdout } = await runPython(venvPython, ['--version'], { timeout: 5000 });
    const match = stdout.trim().match(/Python\s+([\d.]+)/i);
    if (match) version = match[1];
  } catch {}

  const info = { name, path: venvPath, pythonPath: venvPython, version };
  logManager.addLog({ action: `Create venv: ${name}`, status: 'ok', type: 'system', detail: `Python ${version}` });
  if (onOutput) onOutput(`[INFO] Venv "${name}" created (Python ${version})\n`, 'stdout');

  return info;
}

/**
 * 列出所有已创建的虚拟环境
 * @returns {Promise<Array>} venv 列表 [{ name, path, pythonPath, version, pipVersion, packageCount }]
 */
async function listVenvs() {
  const venvsDir = getVenvsDir();
  if (!fs.existsSync(venvsDir)) return [];

  const entries = fs.readdirSync(venvsDir, { withFileTypes: true });
  const venvs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const venvPath = path.join(venvsDir, entry.name);
    const pythonPath = getVenvPythonPath(venvPath);

    // 验证是否为有效 venv（必须存在 python 可执行文件和 pyvenv.cfg）
    const cfgPath = path.join(venvPath, 'pyvenv.cfg');
    if (!fs.existsSync(pythonPath) || !fs.existsSync(cfgPath)) continue;

    // 获取版本信息
    let version = 'unknown';
    let pipVersion = null;
    let packageCount = 0;

    try {
      const { stdout } = await runPython(pythonPath, ['--version'], { timeout: 5000 });
      const match = stdout.trim().match(/Python\s+([\d.]+)/i);
      if (match) version = match[1];
    } catch {}

    try {
      const { stdout } = await runPython(pythonPath, ['-m', 'pip', '--version'], { timeout: 5000 });
      const match = stdout.trim().match(/pip\s+([\d.]+)/i);
      if (match) pipVersion = match[1];
    } catch {}

    try {
      const { stdout } = await runPython(pythonPath, ['-m', 'pip', 'list', '--format=json'], { timeout: 15000 });
      const list = JSON.parse(stdout);
      packageCount = list.length;
    } catch {}

    venvs.push({
      name: entry.name,
      path: venvPath,
      pythonPath,
      version,
      pipVersion,
      packageCount
    });
  }

  return venvs;
}

/**
 * 删除虚拟环境
 * @param {string} name - venv 名称
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<Object>} { success, name }
 * @throws {Error} 名称不合法或 venv 不存在
 */
async function deleteVenv(name, onOutput) {
  if (!name || !VALID_VENV_NAME.test(name)) {
    throw new Error(`Invalid venv name: ${name}`);
  }

  const venvsDir = getVenvsDir();
  const venvPath = path.join(venvsDir, name);

  if (!fs.existsSync(venvPath)) {
    throw new Error(`Virtual environment "${name}" not found`);
  }

  // 安全检查：确保路径在 venvs 目录内（防止路径遍历）
  const resolved = path.resolve(venvPath);
  if (!resolved.startsWith(path.resolve(venvsDir))) {
    throw new Error('Invalid venv path (path traversal detected)');
  }

  if (onOutput) onOutput(`[INFO] Deleting venv "${name}"...\n`, 'stdout');

  try {
    fs.rmSync(venvPath, { recursive: true, force: true });
    logManager.addLog({ action: `Delete venv: ${name}`, status: 'ok', type: 'system' });
    if (onOutput) onOutput(`[INFO] Venv "${name}" deleted\n`, 'stdout');
    return { success: true, name };
  } catch (err) {
    logManager.addLog({ action: `Delete venv: ${name}`, status: 'failed', type: 'system', detail: err.message });
    throw new Error(`Failed to delete venv: ${err.message}`);
  }
}

/**
 * 获取虚拟环境详细信息
 * @param {string} name - venv 名称
 * @returns {Promise<Object>} venv 详细信息
 */
async function getVenvInfo(name) {
  if (!name || !VALID_VENV_NAME.test(name)) {
    throw new Error(`Invalid venv name: ${name}`);
  }

  const venvsDir = getVenvsDir();
  const venvPath = path.join(venvsDir, name);
  const pythonPath = getVenvPythonPath(venvPath);

  if (!fs.existsSync(pythonPath)) {
    throw new Error(`Virtual environment "${name}" not found`);
  }

  let version = 'unknown';
  let pipVersion = null;

  try {
    const { stdout } = await runPython(pythonPath, ['--version'], { timeout: 5000 });
    const match = stdout.trim().match(/Python\s+([\d.]+)/i);
    if (match) version = match[1];
  } catch {}

  try {
    const { stdout } = await runPython(pythonPath, ['-m', 'pip', '--version'], { timeout: 5000 });
    const match = stdout.trim().match(/pip\s+([\d.]+)/i);
    if (match) pipVersion = match[1];
  } catch {}

  // 读取 pyvenv.cfg 获取基础 Python 路径
  let basePython = '';
  try {
    const cfg = fs.readFileSync(path.join(venvPath, 'pyvenv.cfg'), 'utf-8');
    const homeMatch = cfg.match(/home\s*=\s*(.+)/i);
    if (homeMatch) basePython = homeMatch[1].trim();
  } catch {}

  return { name, path: venvPath, pythonPath, version, pipVersion, basePython };
}

module.exports = {
  createVenv,
  listVenvs,
  deleteVenv,
  getVenvInfo,
  getVenvsDir,
  getVenvPythonPath
};
