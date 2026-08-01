/**
 * @file envManager.js
 * @description Python 环境管理器
 * 
 * 职责：
 * - 自动检测系统中已安装的 Python 环境
 * - 获取 Python 和 pip 版本信息
 * - 管理当前选中的 Python 环境
 * - 支持环境切换并持久化配置
 * 
 * 检测范围：
 * - 系统默认 Python 安装路径
 * - Anaconda/Miniconda 环境
 * - Windows Store Python
 * - 用户目录下的 Python 安装
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { glob } = require('glob');
const { runCommand, runPython } = require('../../utils/processRunner');
const configManager = require('../config/configManager');

// 当前选中的 Python 环境
let currentEnv = null;
// 缓存已检测到的环境列表
let cachedEnvironments = [];

// 常见 Python 安装路径模式（支持 glob 通配符）
const COMMON_PATHS = [
  'C:/Python*/python.exe',                                      // 系统级 Python
  'C:/Users/*/AppData/Local/Programs/Python/Python*/python.exe', // 用户级 Python
  'C:/Users/*/AppData/Local/Microsoft/WindowsApps/python.exe',   // Windows Store Python
  'C:/Users/*/.conda/envs/*/python.exe',                        // Conda 虚拟环境
  'C:/ProgramData/Anaconda3/python.exe',                        // 系统级 Anaconda
  'C:/Users/*/Anaconda3/python.exe',                            // 用户级 Anaconda
  'C:/Users/*/miniconda3/python.exe',                           // 用户级 Miniconda
  'C:/Users/*/Miniconda3/python.exe',                           // 用户级 Miniconda（大写）
  'C:/ProgramData/miniconda3/python.exe'                        // 系统级 Miniconda
];

/**
 * 获取 Python 版本号
 * @param {string} pythonPath - Python 可执行文件路径
 * @returns {Promise<string>} 版本号或 'unknown'
 */
async function getPythonVersion(pythonPath) {
  try {
    const { stdout } = await runPython(pythonPath, ['--version'], { timeout: 5000 });
    const match = stdout.trim().match(/Python\s+([\d.]+)/i);
    return match ? match[1] : 'unknown';
  } catch (err) {
    return 'unknown';
  }
}

/**
 * 获取 pip 版本号
 * @param {string} pythonPath - Python 可执行文件路径
 * @returns {Promise<string|null>} pip 版本号，无 pip 时返回 null
 */
async function getPipVersion(pythonPath) {
  try {
    const { stdout } = await runPython(pythonPath, ['-m', 'pip', '--version'], { timeout: 5000 });
    const match = stdout.trim().match(/pip\s+([\d.]+)/i);
    return match ? match[1] : 'unknown';
  } catch (err) {
    return null;
  }
}

/**
 * 检测系统中所有可用的 Python 环境
 * 
 * 检测流程：
 * 1. 遍历常见安装路径（glob 模式匹配）
 * 2. 执行 `where python` 查找 PATH 中的 Python
 * 3. 获取每个 Python 的版本和 pip 版本
 * 4. 过滤掉没有 pip 的环境
 * 5. 恢复配置中保存的当前环境
 * 
 * @returns {Promise<Array>} 检测到的环境列表
 */
async function detectEnvironments() {
  const found = new Map(); // 去重用用，key 为小写路径

  // 第一步：扫描常见路径
  for (const pattern of COMMON_PATHS) {
    try {
      const matches = await glob(pattern);
      for (const p of matches) {
        const realPath = fs.existsSync(p) ? fs.realpathSync(p) : p;
        if (!found.has(realPath.toLowerCase())) {
          found.set(realPath.toLowerCase(), realPath);
        }
      }
    } catch (err) {
      // 忽略 glob 错误
    }
  }

  // 第二步：尝试 `where python` 查找 PATH 中的 Python
  try {
    const { stdout } = await runCommand('where', ['python'], { shell: true, timeout: 5000, ignoreExitCode: true });
    stdout.split(/\r?\n/).forEach(line => {
      const p = line.trim();
      if (p && fs.existsSync(p) && p.endsWith('.exe')) {
        const realPath = fs.realpathSync(p);
        if (!found.has(realPath.toLowerCase())) {
          found.set(realPath.toLowerCase(), realPath);
        }
      }
    });
  } catch (err) {
    // 忽略
  }

  // 第三步：并行获取每个环境的版本信息（提升多环境场景下的检测速度）
  const envs = [];
  const versionResults = await Promise.all(
    [...found.values()].map(async (pythonPath) => {
      const pyVersion = await getPythonVersion(pythonPath);
      const pipVersion = await getPipVersion(pythonPath);
      return { pythonPath, pyVersion, pipVersion };
    })
  );

  for (const { pythonPath, pyVersion, pipVersion } of versionResults) {
    // 过滤掉没有 pip 的环境
    if (!pipVersion) continue;

    // 生成友好的环境名称
    let name = path.basename(path.dirname(pythonPath));
    if (name.toLowerCase() === 'scripts' || name.toLowerCase() === 'bin') {
      name = path.basename(path.dirname(path.dirname(pythonPath)));
    }
    if (name.toLowerCase().startsWith('python') && name.length <= 10) {
      name = `Python ${pyVersion}`;
    }

    envs.push({
      name,
      path: pythonPath,
      version: pyVersion,
      pipVersion
    });
  }

  // 恢复配置中保存的当前环境（如果仍然存在）
  const config = configManager.getConfig();
  if (config.currentEnv) {
    const stillExists = envs.find(e => e.path === config.currentEnv.path);
    if (!stillExists && fs.existsSync(config.currentEnv.path)) {
      const pyVersion = await getPythonVersion(config.currentEnv.path);
      const pipVersion = await getPipVersion(config.currentEnv.path);
      if (pipVersion) {
        envs.unshift({ ...config.currentEnv, version: pyVersion, pipVersion });
      }
    }
  }

  cachedEnvironments = envs;
  // 如果没有当前环境且列表不为空，自动选择第一个
  if (!currentEnv && envs.length > 0) {
    currentEnv = envs[0];
    configManager.setConfig('currentEnv', currentEnv);
  }
  return envs;
}

/**
 * 获取当前选中的 Python 环境
 * - 优先使用内存缓存
 * - 回退到配置文件中保存的环境
 * @returns {Object|null} 当前环境信息
 */
function getCurrent() {
  if (!currentEnv) {
    const config = configManager.getConfig();
    if (config.currentEnv) currentEnv = config.currentEnv;
  }
  return currentEnv;
}

/**
 * 切换到指定的 Python 环境
 * - 优先从缓存中查找
 * - 如果不在缓存中但路径存在，创建一个临时环境对象
 * - 切换后立即持久化到配置
 * 
 * @param {string} envPath - Python 可执行文件路径
 * @returns {Object} 切换后的环境信息
 * @throws {Error} 如果环境不存在
 */
function switchEnvironment(envPath) {
  const env = cachedEnvironments.find(e => e.path === envPath);
  if (!env) {
    if (fs.existsSync(envPath)) {
      currentEnv = { name: path.basename(path.dirname(envPath)), path: envPath, version: 'unknown', pipVersion: 'unknown' };
    } else {
      throw new Error('Environment not found: ' + envPath);
    }
  } else {
    currentEnv = env;
  }
  configManager.setConfig('currentEnv', currentEnv);
  return currentEnv;
}

/**
 * 启动后台环境检测（不阻塞主流程）
 * 在应用启动时调用，异步检测环境避免阻塞窗口显示
 */
function startDetection() {
  detectEnvironments().catch(() => {});
}

module.exports = { detectEnvironments, getCurrent, switchEnvironment, startDetection };
