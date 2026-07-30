const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const stripAnsi = require('strip-ansi');

const PIP_READY_TTL = 5 * 60 * 1000; // 5 minutes
const SIGKILL_DELAY = 5000; // 5 seconds after SIGTERM

let pipReadyCache = new Map();
const activeProcesses = new Map(); // processId -> { proc, operationId, startTime }

function generateProcessId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function isPipReadyCached(pythonPath) {
  const cached = pipReadyCache.get(pythonPath);
  if (!cached) return false;
  if (Date.now() - cached.time > PIP_READY_TTL) {
    pipReadyCache.delete(pythonPath);
    return false;
  }
  return cached.ready;
}

function setPipReadyCache(pythonPath, ready) {
  pipReadyCache.set(pythonPath, { ready, time: Date.now() });
}

function clearPipReadyCache() {
  pipReadyCache.clear();
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...options.env };
    const processId = options.processId || generateProcessId();
    const operationId = options.operationId || null;

    const proc = spawn(command, args, {
      env,
      cwd: options.cwd,
      shell: options.shell || false,
      windowsHide: true
    });

    activeProcesses.set(processId, { proc, operationId, startTime: Date.now() });

    let stdout = '';
    let stderr = '';
    let timeoutTimer = null;
    let sigkillTimer = null;

    function cleanup() {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      activeProcesses.delete(processId);
    }

    proc.stdout.on('data', (chunk) => {
      const text = stripAnsi(chunk.toString('utf-8'));
      stdout += text;
      if (options.onOutput) options.onOutput(text, 'stdout');
    });

    proc.stderr.on('data', (chunk) => {
      const text = stripAnsi(chunk.toString('utf-8'));
      stderr += text;
      if (options.onOutput) options.onOutput(text, 'stderr');
    });

    proc.on('error', (err) => {
      cleanup();
      reject(err);
    });

    proc.on('close', (code) => {
      cleanup();
      if (code === 0 || options.ignoreExitCode) {
        resolve({ stdout, stderr, code });
      } else {
        const err = new Error(stderr || stdout || `Command failed with code ${code}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });

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

function cancelProcess(processId) {
  const active = activeProcesses.get(processId);
  if (!active) return false;
  if (!active.proc.killed) active.proc.kill('SIGTERM');
  return true;
}

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

async function checkPipAvailable(pythonPath) {
  try {
    await runCommand(pythonPath, ['-m', 'pip', '--version'], { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function ensurePip(pythonPath, onOutput) {
  if (isPipReadyCached(pythonPath)) return true;

  const available = await checkPipAvailable(pythonPath);
  if (available) {
    setPipReadyCache(pythonPath, true);
    return true;
  }

  if (onOutput) onOutput('[WARN] pip not found, attempting to install...\n', 'stderr');

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

  try {
    const getPipPath = await downloadGetPip();
    if (onOutput) onOutput('[INFO] Running get-pip.py...\n', 'stdout');
    await runCommand(pythonPath, [getPipPath], { timeout: 120000, onOutput });
    fs.unlinkSync(getPipPath);

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

function downloadGetPip() {
  return new Promise((resolve, reject) => {
    const urls = [
      'https://bootstrap.pypa.io/get-pip.py',
      'https://pypi.org/pypi/pip/latest/json'
    ];
    const tmpPath = path.join(require('os').tmpdir(), `get-pip-${Date.now()}.py`);

    function tryDownload(urlIndex) {
      if (urlIndex >= urls.length) {
        reject(new Error('Failed to download get-pip.py'));
        return;
      }

      const url = urls[urlIndex];
      const client = url.startsWith('https') ? https : http;

      const req = client.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          tryDownload(urlIndex + 1);
          return;
        }
        if (res.statusCode !== 200) {
          tryDownload(urlIndex + 1);
          return;
        }
        const file = fs.createWriteStream(tmpPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(tmpPath));
        });
      });

      req.on('error', () => tryDownload(urlIndex + 1));
      req.setTimeout(30000, () => {
        req.destroy();
        tryDownload(urlIndex + 1);
      });
    }

    tryDownload(0);
  });
}

function runPip(pythonPath, args, options = {}) {
  return runCommand(pythonPath, ['-m', 'pip', ...args], options);
}

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
