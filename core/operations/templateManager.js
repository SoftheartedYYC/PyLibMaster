/**
 * @file templateManager.js
 * @description 项目模板与环境快照管理器
 * 
 * 职责：
 * - 管理预设项目模板（Web开发/数据分析/机器学习等）
 * - 一键从模板创建虚拟环境并安装所有包
 * - 环境快照：记录某时刻的完整环境状态（pip freeze）
 * - 从快照恢复环境（时间旅行回滚）
 * 
 * 快照存储位置：
 * {storagePath}/snapshots/
 */

const fs = require('fs');
const path = require('path');
const configManager = require('../config/configManager');
const logManager = require('../system/logManager');
const { runPip } = require('../../utils/processRunner');

// ============ 预设模板 ============

const BUILTIN_TEMPLATES = [
  {
    id: 'web-flask',
    name: 'Web 开发 (Flask)',
    icon: '🌐',
    description: 'Flask Web 开发常用包',
    packages: ['flask', 'flask-cors', 'flask-sqlalchemy', 'flask-migrate', 'jinja2', 'werkzeug', 'requests', 'gunicorn', 'python-dotenv']
  },
  {
    id: 'web-django',
    name: 'Web 开发 (Django)',
    icon: '🎯',
    description: 'Django 全栈开发常用包',
    packages: ['django', 'djangorestframework', 'django-cors-headers', 'django-filter', 'celery', 'redis', 'requests', 'python-dotenv', 'psycopg2-binary']
  },
  {
    id: 'data-analysis',
    name: '数据分析',
    icon: '📊',
    description: '数据分析与可视化常用包',
    packages: ['numpy', 'pandas', 'matplotlib', 'seaborn', 'scipy', 'jupyter', 'openpyxl', 'xlrd', 'statsmodels']
  },
  {
    id: 'machine-learning',
    name: '机器学习',
    icon: '🤖',
    description: '机器学习与深度学习常用包',
    packages: ['scikit-learn', 'torch', 'torchvision', 'tensorflow', 'keras', 'numpy', 'pandas', 'matplotlib', 'jupyter', 'tqdm']
  },
  {
    id: 'crawler',
    name: '爬虫开发',
    icon: '🕷️',
    description: '网络爬虫与数据采集常用包',
    packages: ['requests', 'scrapy', 'beautifulsoup4', 'lxml', 'selenium', 'fake-useragent', 'pandas', 'aiohttp']
  },
  {
    id: 'automation',
    name: '自动化办公',
    icon: '⚙️',
    description: '办公自动化与文件处理常用包',
    packages: ['openpyxl', 'python-docx', 'python-pptx', 'pdfplumber', 'pillow', 'pyautogui', 'schedule', 'requests']
  }
];

/**
 * 获取所有模板（内置 + 自定义）
 * @returns {Array} 模板列表
 */
function getTemplates() {
  const cfg = configManager.getConfig();
  const custom = cfg.customTemplates || [];
  return [...BUILTIN_TEMPLATES, ...custom];
}

/**
 * 添加自定义模板
 * @param {Object} tpl - { name, icon, description, packages: [] }
 * @returns {boolean} 是否成功
 */
function addCustomTemplate(tpl) {
  if (!tpl || typeof tpl.name !== 'string' || !tpl.name || !tpl.packages || !Array.isArray(tpl.packages)) return false;
  const cfg = configManager.getConfig();
  const custom = cfg.customTemplates || [];
  const newTpl = {
    id: `custom-${Date.now()}`,
    name: tpl.name,
    icon: tpl.icon || '📦',
    description: tpl.description || '',
    packages: tpl.packages,
    isCustom: true
  };
  custom.push(newTpl);
  configManager.setConfig('customTemplates', custom);
  return true;
}

/**
 * 删除自定义模板
 * @param {string} id - 模板 ID
 * @returns {boolean}
 */
function removeCustomTemplate(id) {
  const cfg = configManager.getConfig();
  const custom = (cfg.customTemplates || []).filter(t => t.id !== id);
  configManager.setConfig('customTemplates', custom);
  return true;
}

/**
 * 从模板创建虚拟环境并安装包
 * @param {Object} options - { templateId, venvName, pythonPath }
 * @param {Function} [onOutput] - 进度回调
 * @returns {Promise<Object>} 结果
 */
async function createFromTemplate(options, onOutput) {
  const { templateId, venvName, pythonPath } = options;
  const templates = getTemplates();
  const tpl = templates.find(t => t.id === templateId);
  if (!tpl) throw new Error('Template not found: ' + templateId);

  const venvManager = require('./venvManager');

  // 1. 创建虚拟环境
  if (onOutput) onOutput(`[INFO] Creating venv: ${venvName}...\n`, 'stdout');
  await venvManager.createVenv({ name: venvName, pythonPath, withPip: true, systemSitePackages: false }, onOutput);

  // 2. 获取 venv 的 Python 路径
  const venvs = await venvManager.listVenvs();
  const venv = venvs.find(v => v.name === venvName);
  if (!venv) throw new Error('Venv created but not found: ' + venvName);

  // 3. 安装模板内所有包
  if (onOutput) onOutput(`[INFO] Installing ${tpl.packages.length} packages...\n`, 'stdout');
  const pipManager = require('./pipManager');
  const result = await pipManager.installPackages(tpl.packages, {
    parallel: true,
    retry: true,
    rollback: false,
    operationId: `tpl-${Date.now()}`,
    envOverride: venv.pythonPath
  }, onOutput);

  logManager.addLog({
    action: `Create from template: ${tpl.name}`,
    status: 'ok',
    type: 'install',
    detail: `venv: ${venvName}, packages: ${tpl.packages.length}`
  });

  return { success: true, venvName, packageCount: tpl.packages.length, result };
}

// ============ 环境快照 ============

/**
 * 获取快照目录
 * @returns {string}
 */
function getSnapshotDir() {
  const storage = configManager.getStoragePath();
  const dir = path.join(storage, 'snapshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 创建环境快照
 * @param {string} envPath - Python 环境路径
 * @param {string} [label] - 快照备注
 * @returns {Promise<Object>} 快照信息
 */
async function createSnapshot(envPath, label) {
  if (!envPath) throw new Error('No environment path provided');

  const { stdout } = await runPip(envPath, ['freeze'], { timeout: 30000 });
  const packages = stdout.split('\n').filter(l => l.trim() && !l.startsWith('#'));

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const envName = path.basename(path.dirname(envPath)) || 'unknown';
  const id = `snapshot_${envName}_${timestamp}`;
  const fileName = `${id}.json`;

  const snapshot = {
    id,
    fileName,
    envName,
    envPath,
    label: label || '',
    time: now.toISOString(),
    packageCount: packages.length,
    packages
  };

  const filePath = path.join(getSnapshotDir(), fileName);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

  logManager.addLog({
    action: `Create snapshot: ${label || envName}`,
    status: 'ok',
    type: 'system',
    detail: `${packages.length} packages recorded`
  });

  return { id, fileName, envName, label: label || '', time: snapshot.time, packageCount: packages.length };
}

/**
 * 列出所有快照
 * @returns {Array} 快照列表（不含 packages 详情）
 */
function listSnapshots() {
  const dir = getSnapshotDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const snapshots = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
      const data = JSON.parse(raw);
      snapshots.push({
        id: data.id,
        fileName: data.fileName,
        envName: data.envName,
        label: data.label || '',
        time: data.time,
        packageCount: data.packageCount || 0
      });
    } catch { /* 跳过损坏的文件 */ }
  }
  // 按时间倒序
  snapshots.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  return snapshots;
}

/**
 * 获取快照详情（含完整包列表）
 * @param {string} snapshotId - 快照 ID
 * @returns {Object} 快照完整数据
 */
function getSnapshotDetail(snapshotId) {
  const safeName = snapshotId.replace(/[^a-zA-Z0-9._-]/g, '') + '.json';
  const filePath = path.join(getSnapshotDir(), safeName);
  if (!fs.existsSync(filePath)) throw new Error('Snapshot not found: ' + snapshotId);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * 从快照恢复环境（时间旅行回滚）
 * @param {string} snapshotId - 快照 ID
 * @param {string} envPath - 目标环境 Python 路径
 * @param {Function} [onOutput] - 进度回调
 * @returns {Promise<Object>} 恢复结果
 */
async function restoreSnapshot(snapshotId, envPath, onOutput) {
  const snapshot = getSnapshotDetail(snapshotId);
  if (!envPath) throw new Error('No target environment path');

  if (onOutput) onOutput(`[INFO] Restoring snapshot: ${snapshot.label || snapshot.id}...\n`, 'stdout');

  // 写入临时 requirements 文件
  const tmpFile = path.join(getSnapshotDir(), `_restore_${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, snapshot.packages.join('\n'), 'utf-8');

  try {
    const { stdout } = await runPip(envPath, ['install', '-r', tmpFile, '--quiet'], {
      timeout: 600000,
      onOutput
    });

    logManager.addLog({
      action: `Restore snapshot: ${snapshot.label || snapshot.id}`,
      status: 'ok',
      type: 'system',
      detail: `${snapshot.packageCount} packages restored to ${path.basename(path.dirname(envPath))}`
    });

    return { success: true, packageCount: snapshot.packageCount };
  } catch (err) {
    logManager.addLog({
      action: `Restore snapshot failed: ${snapshot.label || snapshot.id}`,
      status: 'failed',
      type: 'system',
      detail: err.message
    });
    throw err;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

/**
 * 删除快照
 * @param {string} snapshotId - 快照 ID
 * @returns {boolean}
 */
function deleteSnapshot(snapshotId) {
  const safeName = snapshotId.replace(/[^a-zA-Z0-9._-]/g, '') + '.json';
  const filePath = path.join(getSnapshotDir(), safeName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

module.exports = {
  getTemplates,
  addCustomTemplate,
  removeCustomTemplate,
  createFromTemplate,
  createSnapshot,
  listSnapshots,
  getSnapshotDetail,
  restoreSnapshot,
  deleteSnapshot
};
