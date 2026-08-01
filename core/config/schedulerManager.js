/**
 * @file schedulerManager.js
 * @description 定时自动更新调度器
 * 
 * 职责：
 * - 管理定时自动检查并更新包的任务（每天/每周）
 * - 后台静默执行更新，结果写入操作日志
 * - 支持白名单配置（白名单内的包不自动更新）
 * - 调度状态持久化到配置文件
 * 
 * 调度逻辑：
 * - 应用启动时根据配置恢复定时器
 * - 每天模式：每隔 24 小时执行一次
 * - 每周模式：每隔 7 天执行一次
 * - 执行时先 listOutdated，过滤白名单，再批量 updatePackages
 */

const configManager = require('./configManager');
const logManager = require('../system/logManager');

let timer = null;           // 定时器引用
let lastRunTime = null;     // 上次执行时间
let isRunning = false;      // 是否正在执行更新

/**
 * 获取调度器配置
 * @returns {Object} { enabled, frequency, whitelist, lastRun }
 */
function getSchedulerConfig() {
  const cfg = configManager.getConfig();
  return {
    enabled: cfg.schedulerEnabled || false,
    frequency: cfg.schedulerFrequency || 'daily',   // 'daily' | 'weekly'
    whitelist: cfg.schedulerWhitelist || [],         // 不自动更新的包名列表
    lastRun: cfg.schedulerLastRun || null            // 上次执行时间 ISO 字符串
  };
}

/**
 * 保存调度器配置
 * @param {Object} updates - 要更新的字段
 */
function saveSchedulerConfig(updates) {
  const bulk = {};
  if (updates.enabled !== undefined) bulk.schedulerEnabled = updates.enabled;
  if (updates.frequency !== undefined) bulk.schedulerFrequency = updates.frequency;
  if (updates.whitelist !== undefined) bulk.schedulerWhitelist = updates.whitelist;
  if (updates.lastRun !== undefined) bulk.schedulerLastRun = updates.lastRun;
  configManager.setBulk(bulk);
}

/**
 * 获取定时间隔（毫秒）
 * @param {string} frequency - 'daily' | 'weekly'
 * @returns {number} 间隔毫秒数
 */
function getInterval(frequency) {
  return frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

/**
 * 执行自动更新（核心逻辑）
 * - 获取可更新列表
 * - 过滤白名单
 * - 批量更新
 * - 写入日志
 * @param {Function} [notify] - 通知回调 (title, body)
 * @returns {Promise<Object>} 执行结果
 */
async function runAutoUpdate(notify) {
  if (isRunning) return { skipped: true, reason: 'already running' };
  isRunning = true;
  const startTime = new Date().toISOString();

  try {
    const pipManager = require('../operations/pipManager');
    const { whitelist } = getSchedulerConfig();
    const whitelistSet = new Set(whitelist.map(w => w.toLowerCase()));

    // 获取可更新列表
    const outdated = await pipManager.listOutdated();
    // 过滤白名单
    const toUpdate = outdated.filter(p => !whitelistSet.has(p.name.toLowerCase()));

    if (toUpdate.length === 0) {
      logManager.addLog({
        action: '[Auto] Scheduled update check',
        status: 'ok',
        type: 'update',
        detail: 'All packages up to date (0 to update)'
      });
      saveSchedulerConfig({ lastRun: startTime });
      lastRunTime = startTime;
      return { updated: 0, skipped: whitelist.length, total: outdated.length };
    }

    // 批量更新
    const names = toUpdate.map(p => p.name);
    const result = await pipManager.updatePackages(names, {
      parallel: true,
      retry: true,
      rollback: false,
      operationId: `auto-${Date.now()}`
    });

    const successCount = result && result.updated ? result.updated.length : 0;
    const failedCount = result && result.failed ? result.failed.length : 0;

    logManager.addLog({
      action: `[Auto] Scheduled update executed`,
      status: failedCount > 0 ? 'failed' : 'ok',
      type: 'update',
      detail: `${successCount} updated, ${failedCount} failed, ${whitelist.length} whitelisted`
    });

    saveSchedulerConfig({ lastRun: startTime });
    lastRunTime = startTime;

    // 发送通知
    if (notify) {
      notify('PyLibMaster', `Auto update: ${successCount} packages updated, ${failedCount} failed`);
    }

    return { updated: successCount, failed: failedCount, skipped: whitelist.length, total: outdated.length };
  } catch (err) {
    logManager.addLog({
      action: '[Auto] Scheduled update failed',
      status: 'failed',
      type: 'update',
      detail: err.message
    });
    saveSchedulerConfig({ lastRun: startTime });
    lastRunTime = startTime;
    return { error: err.message };
  } finally {
    isRunning = false;
  }
}

/**
 * 启动调度器
 * - 根据配置设定定时器
 * @param {Function} [notify] - 通知回调
 */
function startScheduler(notify) {
  stopScheduler(); // 先清除已有定时器
  const { enabled, frequency } = getSchedulerConfig();
  if (!enabled) return;

  const interval = getInterval(frequency);
  timer = setInterval(() => {
    runAutoUpdate(notify).catch(() => {});
  }, interval);

  // 如果距离上次执行已超过一个间隔，立即执行一次
  const { lastRun } = getSchedulerConfig();
  if (lastRun) {
    const elapsed = Date.now() - new Date(lastRun).getTime();
    if (elapsed >= interval) {
      setTimeout(() => runAutoUpdate(notify).catch(() => {}), 10000); // 启动 10 秒后执行
    }
  }
}

/**
 * 停止调度器
 */
function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 获取调度器状态
 * @returns {Object} 当前状态
 */
function getStatus() {
  const cfg = getSchedulerConfig();
  return {
    ...cfg,
    active: timer !== null,
    running: isRunning,
    lastRun: cfg.lastRun
  };
}

module.exports = {
  getSchedulerConfig,
  saveSchedulerConfig,
  runAutoUpdate,
  startScheduler,
  stopScheduler,
  getStatus
};
