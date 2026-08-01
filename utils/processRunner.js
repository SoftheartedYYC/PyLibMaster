/**
 * @file processRunner.js
 * @description 子进程运行器与 pip 管理工具
 * 
 * 职责：
 * - 封装子进程的创建、执行、超时、取消和清理逻辑
 * - 提供 pip 命令和 Python 命令的快捷执行方法
 * - 管理活跃进程列表，支持按 operationId 取消操作
 * - 自动检测并安装 pip（ensurepip / get-pip.py）
 * - 进程输出实时回调和 ANSI 色彩清理
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const stripAnsi = require('strip-ansi'); // 清理终端 ANSI 转义序列

const PIP_READY_TTL = 5 * 60 * 1000; // pip 就绪状态缓存时间（5分钟）
const SIGKILL_DELAY = 5000;           // SIGTERM 后等待 SIGKILL 的延迟（5秒）

// pip 就绪状态缓存（避免重复检测）
let pipReadyCache = new Map();
// 活跃进程列表（processId -> { proc, operationId, startTime }）
const activeProcesses = new Map();

/**
 * 生成唯一的进程 ID
 * @returns {string} 进程 ID
 */
function generateProcessId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 检查 pip 就绪状态缓存
 * @param {string} pythonPath - Python 路径
 * @returns {boolean} pip 是否已就绪
 */
function isPipReadyCached(pythonPath) {
  const cached = pipReadyCache.get(pythonPath);
  if (!cached) return false;
  if (Date.now() - cached.time > PIP_READY_TTL) {
    pipReadyCache.delete(pythonPath);
    return false;
  }
  return cached.ready;
}

/**
 * 设置 pip 就绪状态缓存
 * @param {string} pythonPath - Python 路径
 * @param {boolean} ready - 是否就绪
 */
function setPipReadyCache(pythonPath, ready) {
  pipReadyCache.set(pythonPath, { ready, time: Date.now() });
}

/** 清空 pip 就绪状态缓存 */
function clearPipReadyCache() {
  pipReadyCache.clear();
}

/**
 * 执行系统命令
 * 
 * 功能特性：
 * - 支持超时自动终止（SIGTERM + SIGKILL 两级终止）
 * - 实时输出回调（stdout/stderr）
 * - ANSI 色彩序列自动清理
 * - 进程跟踪（支持取消操作）
 * - UTF-8 编码强制设置
 * 
 * @param {string} command - 命令名称
 * @param {string[]} args - 命令参数
 * @param {Object} [options={}] - 选项
 * @param {number} [options.timeout] - 超时时间（毫秒）
 * @param {Function} [options.onOutput] - 输出回调 (text, type)
 * @param {boolean} [options.shell] - 是否使用 shell 执行
 * @param {boolean} [options.ignoreExitCode] - 忽略非零退出码
 * @param {string} [options.operationId] - 操作 ID（用于批量取消）
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // 设置 UTF-8 编码环境变量，确保 Python 输出不乱码
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...options.env };
    const processId = options.processId || generateProcessId();
    const operationId = options.operationId || null;

    // 创建子进程
    const proc = spawn(command, args, {
      env,
      cwd: options.cwd,
      shell: options.shell || false,
      windowsHide: true          // 隐藏 Windows 控制台窗口
    });

    // 注册到活跃进程列表
    activeProcesses.set(processId, { proc, operationId, startTime: Date.now() });

    let stdout = '';
    let stderr = '';
    let timeoutTimer = null;     // 超时定时器
    let sigkillTimer = null;     // SIGKILL 强制终止定时器

    /** 清理所有定时器和进程引用 */
    function cleanup() {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      activeProcesses.delete(processId);
    }

    // 标准输出事件（清理 ANSI 色彩并回调）
    proc.stdout.on('data', (chunk) => {
      const text = stripAnsi(chunk.toString('utf-8'));
      stdout += text;
      if (options.onOutput) options.onOutput(text, 'stdout');
    });

    // 标准错误事件
    proc.stderr.on('data', (chunk) => {
      const text = stripAnsi(chunk.toString('utf-8'));
      stderr += text;
      if (options.onOutput) options.onOutput(text, 'stderr');
    });

    // 进程错误事件
    proc.on('error', (err) => {
      cleanup();
      reject(err);
    });

    // 进程退出事件
    proc.on('close', (code) => {
      cleanup();
      if (code === 0 || options.ignoreExitCode) {
        resolve({ stdout, stderr, code });
      } else {
        // 构建包含 stdout/stderr 的错误对象
        const err = new Error(stderr || stdout || `Command failed with code ${code}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });

    // 超时处理：先发送 SIGTERM，等待 5 秒后发送 SIGKILL 强制终止
    if (options.timeout) {
      timeoutTimer = setTimeout(() => {
        sigkillTimer = setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, SIGKILL_DELAY);
        if (!proc.killed) proc.kill('SIGTERM');
        reject(new Error('Command timeout'));
      }, options.timeout);
    }
  });
}

/**
 * 取消指定进程
 * @param {string} processId - 进程 ID
 * @returns {boolean} 是否成功发送取消信号
 */
function cancelProcess(processId) {
  const active = activeProcesses.get(processId);
  if (!active) return false;
  if (!active.proc.killed) active.proc.kill('SIGTERM');
  return true;
}

/**
 * 按 operationId 取消所有关联的进程
 * - 用于取消一次 pip 操作（可能包含多个子进程）
 * @param {string} operationId - 操作 ID
 * @returns {number} 被取消的进程数量
 */
function cancelOperation(operationId) {
  if (!operationId) return 0;
  let count = 0;
  for (const [id, active] of activeProcesses) {
    if (active.operationId === operationId && !active.proc.killed) {
      active.proc.kill('SIGTERM');
      count++;
    }
  }
  return count;
}

/**
 * 取消所有活跃进程（应用退出时调用）
 * @returns {number} 被取消的进程数量
 */
function cancelAllProcesses() {
  let count = 0;
  for (const [id, active] of activeProcesses) {
    if (!active.proc.killed) {
      active.proc.kill('SIGTERM');
      count++;
    }
  }
  return count;
}

/**
 * 检查 pip 是否可用
 * @param {string} pythonPath - Python 可执行文件路径
 * @returns {Promise<boolean>} pip 是否可用
 */
async function checkPipAvailable(pythonPath) {
  try {
    await runCommand(pythonPath, ['-m', 'pip', '--version'], { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 确保 pip 可用，如果不可用则自动安装
 * 
 * 安装策略（按优先级）：
 * 1. 检查缓存 → 2. 直接检测 → 3. python -m ensurepip --upgrade → 4. 下载 get-pip.py 安装
 * 
 * @param {string} pythonPath - Python 可执行文件路径
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<boolean>} pip 是否就绪
 * @throws {Error} 如果所有安装方式都失败
 */
async function ensurePip(pythonPath, onOutput) {
  // 先检查缓存
  if (isPipReadyCached(pythonPath)) return true;

  // 直接检测
  const available = await checkPipAvailable(pythonPath);
  if (available) {
    setPipReadyCache(pythonPath, true);
    return true;
  }

  if (onOutput) onOutput('[WARN] pip not found, attempting to install...\n', 'stderr');

  // 尝试 ensurepip
  try {
    if (onOutput) onOutput('[INFO] Trying python -m ensurepip...\n', 'stdout');
    await runCommand(pythonPath, ['-m', 'ensurepip', '--upgrade'], { timeout: 60000, onOutput });
    const available2 = await checkPipAvailable(pythonPath);
    if (available2) {
      setPipReadyCache(pythonPath, true);
      if (onOutput) onOutput('[INFO] pip installed successfully via ensurepip\n', 'stdout');
      return true;
    }
  } catch {
    if (onOutput) onOutput('[WARN] ensurepip failed, trying get-pip.py...\n', 'stderr');
  }

  // 尝试下载 get-pip.py
  try {
    const getPipPath = await downloadGetPip();
    if (onOutput) onOutput('[INFO] Running get-pip.py...\n', 'stdout');
    await runCommand(pythonPath, [getPipPath], { timeout: 120000, onOutput });
    fs.unlinkSync(getPipPath); // 清理临时文件

    const available3 = await checkPipAvailable(pythonPath);
    if (available3) {
      setPipReadyCache(pythonPath, true);
      if (onOutput) onOutput('[INFO] pip installed successfully\n', 'stdout');
      return true;
    }
  } catch {
    if (onOutput) onOutput('[WARN] get-pip.py failed\n', 'stderr');
  }

  throw new Error('pip is not available and could not be auto-installed. Please install pip manually.');
}

/**
 * 下载 get-pip.py 安装脚本
 * - 尝试多个下载源（主站和备用站）
 * - 支持重定向和超时处理
 * @returns {Promise<string>} 下载后的临时文件路径
 */
function downloadGetPip() {
  return new Promise((resolve, reject) => {
    const urls = [
      'https://bootstrap.pypa.io/get-pip.py',     // 主下载源
      'https://raw.githubusercontent.com/pypa/get-pip/main/public/get-pip.py'  // GitHub 备用源
    ];
    const tmpPath = path.join(require('os').tmpdir(), `get-pip-${Date.now()}.py`);

    /** 递归尝试下载（当前失败则尝试下一个 URL） */
    function tryDownload(urlIndex) {
      if (urlIndex >= urls.length) {
        reject(new Error('Failed to download get-pip.py'));
        return;
      }

      const url = urls[urlIndex];
      const client = url.startsWith('https') ? https : http;

      const req = client.get(url, (res) => {
        // 处理重定向
        if (res.statusCode === 301 || res.statusCode === 302) {
          tryDownload(urlIndex + 1);
          return;
        }
        if (res.statusCode !== 200) {
          tryDownload(urlIndex + 1);
          return;
        }
        // 写入临时文件
        const file = fs.createWriteStream(tmpPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(tmpPath));
        });
      });

      req.on('error', () => tryDownload(urlIndex + 1));
      req.setTimeout(30000, () => { // 30秒下载超时
        req.destroy();
        tryDownload(urlIndex + 1);
      });
    }

    tryDownload(0);
  });
}

/**
 * 执行 pip 命令（封装 python -m pip）
 * @param {string} pythonPath - Python 路径
 * @param {string[]} args - pip 参数
 * @param {Object} [options] - 选项
 * @returns {Promise<Object>} 执行结果
 */
function runPip(pythonPath, args, options = {}) {
  return runCommand(pythonPath, ['-m', 'pip', ...args], options);
}

/**
 * 执行 Python 命令
 * @param {string} pythonPath - Python 路径
 * @param {string[]} args - 参数
 * @param {Object} [options] - 选项
 * @returns {Promise<Object>} 执行结果
 */
function runPython(pythonPath, args, options = {}) {
  return runCommand(pythonPath, args, options);
}

module.exports = {
  runCommand,
  runPip,
  runPython,
  ensurePip,
  checkPipAvailable,
  clearPipReadyCache,
  cancelProcess,
  cancelOperation,
  cancelAllProcesses
};
