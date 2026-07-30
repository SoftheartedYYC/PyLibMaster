const fs = require('fs');
const path = require('path');
const configManager = require('./configManager');

const MAX_LOGS = 2000;
const MAX_FIELD_LENGTH = 1000;
const MAX_SEARCH_LENGTH = 200;
let logs = [];
let logsPath = '';

function truncateField(str) {
  if (typeof str !== 'string') return '';
  return str.length > MAX_FIELD_LENGTH ? str.slice(0, MAX_FIELD_LENGTH) + '...' : str;
}

function getLogsDir() {
  const storage = configManager.getStoragePath();
  const dir = path.join(storage, 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function init() {
  if (logsPath) return;
  const dir = getLogsDir();
  logsPath = path.join(dir, 'operations.json');
  try {
    if (fs.existsSync(logsPath)) {
      const raw = fs.readFileSync(logsPath, 'utf-8');
      logs = JSON.parse(raw);
      if (!Array.isArray(logs)) logs = [];
    }
  } catch (err) {
    logs = [];
  }
}

function saveLogs() {
  init();
  try {
    fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    // logManager cannot log its own persistence failure; use stderr as last resort
    console.error('[PyLibMaster] Failed to save logs:', err.message);
  }
}

function addLog(entry) {
  init();
  const now = new Date();
  const time = now.toISOString().replace('T', ' ').slice(0, 19);
  const record = {
    time,
    action: truncateField(entry.action),
    status: entry.status || 'ok',
    type: entry.type || 'install',
    detail: truncateField(entry.detail)
  };
  logs.unshift(record);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  saveLogs();
  return record;
}

function getLogs(filter = {}) {
  init();
  let result = [...logs];
  if (filter.type && filter.type !== 'all') {
    result = result.filter(l => l.type === filter.type);
  }
  if (filter.search) {
    const kw = String(filter.search).slice(0, MAX_SEARCH_LENGTH).toLowerCase();
    result = result.filter(l =>
      (l.action && l.action.toLowerCase().includes(kw)) ||
      (l.detail && l.detail.toLowerCase().includes(kw))
    );
  }
  return result;
}

function clearLogs() {
  init();
  logs = [];
  saveLogs();
  return true;
}

module.exports = { addLog, getLogs, clearLogs };
