const fs = require('fs');
const path = require('path');
const configManager = require('./configManager');
const logManager = require('./logManager');
const { runPip } = require('../utils/processRunner');

function getBackupDir() {
  const storage = configManager.getStoragePath();
  const dir = path.join(storage, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const VALID_BACKUP_ID = /^backup_[a-zA-Z0-9._-]+\.txt$/;
const MAX_BACKUP_ID_LENGTH = 255;

function getBackupFileName(env) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const envName = env ? path.basename(path.dirname(env.path)) : 'unknown';
  return `backup_${envName}_${timestamp}.txt`;
}

function validateBackupId(backupId) {
  if (typeof backupId !== 'string') {
    throw new Error('Invalid backup ID: must be a string');
  }
  if (backupId.length === 0 || backupId.length > MAX_BACKUP_ID_LENGTH) {
    throw new Error(`Invalid backup ID: length must be 1-${MAX_BACKUP_ID_LENGTH}`);
  }
  if (backupId.includes('/') || backupId.includes('\\') || backupId.includes('..')) {
    throw new Error('Invalid backup ID: path traversal detected');
  }
  const safe = path.basename(backupId);
  if (!VALID_BACKUP_ID.test(safe)) {
    throw new Error('Invalid backup ID: format mismatch');
  }
  return safe;
}

async function createBackup(env) {
  const pythonPath = env ? env.path : null;
  if (!pythonPath) throw new Error('No Python environment selected');

  try {
    const backupDir = getBackupDir();
    const fileName = getBackupFileName(env);
    const filePath = path.join(backupDir, fileName);

    const { stdout } = await runPip(pythonPath, ['freeze'], { timeout: 60000 });
    fs.writeFileSync(filePath, stdout, 'utf-8');

    return {
      id: fileName,
      path: filePath,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      envName: env.name,
      envPath: env.path
    };
  } catch (err) {
    logManager.addLog({ action: 'Create backup failed', status: 'failed', type: 'system', detail: err.message });
    throw new Error(`Backup failed: ${err.message}`);
  }
}

function listBackups() {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.txt'))
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return {
          id: f,
          path: path.join(backupDir, f),
          createdAt: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
          size: stat.size
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    logManager.addLog({ action: 'List backups failed', status: 'failed', type: 'system', detail: err.message });
    return [];
  }
}

async function restoreBackup(backupId, env, onOutput) {
  const pythonPath = env ? env.path : null;
  if (!pythonPath) throw new Error('No Python environment selected');

  const safeBackupId = validateBackupId(backupId);
  const backupDir = getBackupDir();
  const filePath = path.join(backupDir, safeBackupId);
  if (!fs.existsSync(filePath)) throw new Error('Backup not found');

  return runPip(pythonPath, ['install', '-r', filePath, '--force-reinstall', '--no-deps', '--no-warn-script-location'], {
    timeout: 600000,
    onOutput
  });
}

function deleteBackup(backupId) {
  try {
    const safeBackupId = validateBackupId(backupId);
    const backupDir = getBackupDir();
    const filePath = path.join(backupDir, safeBackupId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    logManager.addLog({ action: 'Delete backup failed', status: 'failed', type: 'system', detail: err.message });
    throw new Error(`Delete backup failed: ${err.message}`);
  }
}

module.exports = { createBackup, listBackups, restoreBackup, deleteBackup, validateBackupId };
