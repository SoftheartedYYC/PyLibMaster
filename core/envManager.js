const fs = require('fs');
const path = require('path');
const os = require('os');
const { glob } = require('glob');
const { runCommand, runPython } = require('../utils/processRunner');
const configManager = require('./configManager');

let currentEnv = null;
let cachedEnvironments = [];

const COMMON_PATHS = [
  'C:/Python*/python.exe',
  'C:/Users/*/AppData/Local/Programs/Python/Python*/python.exe',
  'C:/Users/*/AppData/Local/Microsoft/WindowsApps/python.exe',
  'C:/Users/*/.conda/envs/*/python.exe',
  'C:/ProgramData/Anaconda3/python.exe',
  'C:/Users/*/Anaconda3/python.exe',
  'C:/Users/*/miniconda3/python.exe',
  'C:/Users/*/Miniconda3/python.exe',
  'C:/ProgramData/miniconda3/python.exe'
];

async function getPythonVersion(pythonPath) {
  try {
    const { stdout } = await runPython(pythonPath, ['--version'], { timeout: 5000 });
    const match = stdout.trim().match(/Python\s+([\d.]+)/i);
    return match ? match[1] : 'unknown';
  } catch (err) {
    return 'unknown';
  }
}

async function getPipVersion(pythonPath) {
  try {
    const { stdout } = await runPython(pythonPath, ['-m', 'pip', '--version'], { timeout: 5000 });
    const match = stdout.trim().match(/pip\s+([\d.]+)/i);
    return match ? match[1] : 'unknown';
  } catch (err) {
    return null;
  }
}

async function detectEnvironments() {
  const found = new Map();

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
      // ignore glob errors
    }
  }

  // Also try `where python`
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
    // ignore
  }

  const envs = [];
  for (const pythonPath of found.values()) {
    const pyVersion = await getPythonVersion(pythonPath);
    const pipVersion = await getPipVersion(pythonPath);
    if (!pipVersion) continue;

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

  // Prefer the configured current env if still valid
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
  if (!currentEnv && envs.length > 0) {
    currentEnv = envs[0];
    configManager.setConfig('currentEnv', currentEnv);
  }
  return envs;
}

function getCurrent() {
  if (!currentEnv) {
    const config = configManager.getConfig();
    if (config.currentEnv) currentEnv = config.currentEnv;
  }
  return currentEnv;
}

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

function startDetection() {
  detectEnvironments().catch(() => {});
}

module.exports = { detectEnvironments, getCurrent, switchEnvironment, startDetection };
