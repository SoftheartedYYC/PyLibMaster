// ============ Progress：进度条 UI ============
//
// 模块职责：
// - 管理安装/更新/卸载操作共用的进度卡片 UI
// - 解析后端发送的结构化进度事件
// - 更新进度条、百分比、计数和状态显示
// - 操作完成后自动隐藏进度卡片（短暂保留让用户确认结果）
//
// 进度卡片 ID：
// - 安装: install-progress
// - 更新: update-progress
// - 卸载/回滚: install-progress（共用）

/**
 * 重置进度条（新操作开始时调用）
 * - 清除上一次操作遗留的隐藏定时器
 * - 重置进度为 0%
 * @param {number} total - 操作总数
 */
function resetProgress(total) {
  // 新操作开始，取消上一次操作遗留的隐藏定时器，避免误隐藏当前进度卡片
  if (progressHideTimer) {
    clearTimeout(progressHideTimer);
    progressHideTimer = null;
  }
  const prefix = progressOperation === 'update' ? 'update-' : '';
  const fillEl = document.getElementById(prefix + 'progress-fill');
  fillEl.style.width = '0%';
  fillEl.classList.remove('progress-fill-err');
  document.getElementById(prefix + 'progress-pct').textContent = '0%';
  document.getElementById(prefix + 'progress-count').innerHTML = `<strong>0</strong> / <strong>${total}</strong>`;
  const statusEl = document.getElementById(prefix + 'progress-status');
  statusEl.textContent = currentLang === 'zh' ? '运行中' : 'Running';
  statusEl.className = '';
}

/**
 * 操作完成后设置最终状态
 * - 成功显示"完成"（绿色）、失败显示"失败"（红色）
 * - 刷新操作日志页面
 * - 延迟 1.6 秒后自动隐藏进度卡片
 * 
 * @param {boolean} success - 操作是否成功
 */
function finishProgress(success) {
  const prefix = progressOperation === 'update' ? 'update-' : '';
  const statusEl = document.getElementById(prefix + 'progress-status');
  if (statusEl) {
    statusEl.textContent = success
      ? (currentLang === 'zh' ? '完成' : 'Done')
      : (currentLang === 'zh' ? '失败' : 'Failed');
    statusEl.className = success ? 'progress-status-ok' : 'progress-status-err';
  }
  const pctEl = document.getElementById(prefix + 'progress-pct');
  if (pctEl) pctEl.textContent = '100%';
  const fillEl = document.getElementById(prefix + 'progress-fill');
  if (fillEl) {
    fillEl.style.width = '100%';
    fillEl.classList.toggle('progress-fill-err', !success);
  }
  // 操作结束后立即刷新操作日志，保证结果（无论成败）在“日志”页面立即可见
  refreshLogs().then(() => renderLogs()).catch(() => {});
  // 全局刷新完成后隐藏进度卡片（短暂保留最终状态供用户确认）
  const cardId = progressOperation === 'update' ? 'update-progress' : 'install-progress';
  const progressCard = document.getElementById(cardId);
  if (progressCard) {
    if (progressHideTimer) clearTimeout(progressHideTimer);
    progressHideTimer = setTimeout(() => {
      progressHideTimer = null;
      // 仅在没有新操作进行时才隐藏，避免覆盖新操作的进度展示
      if (!progressOperation) progressCard.style.display = 'none';
    }, 1600);
  }
}

/**
 * 更新进度条 UI（填充宽度、百分比、计数）
 * @param {string} prefix - 元素 ID 前缀（'update-' 或 ''）
 * @param {number} pct - 百分比 0-100
 */
function setProgressUI(prefix, pct) {
  const fillEl = document.getElementById(prefix + 'progress-fill');
  if (fillEl) fillEl.style.width = pct + '%';
  const pctEl = document.getElementById(prefix + 'progress-pct');
  if (pctEl) pctEl.textContent = pct + '%';
  const countEl = document.getElementById(prefix + 'progress-count');
  if (countEl) countEl.innerHTML = `<strong>${progressDone}</strong> / <strong>${progressTotal}</strong>`;
}

/**
 * 处理后端推送的进度事件
 * 
 * 进度事件格式：
 * 1. 结构化事件: [PROGRESS] {"done":1, "pkg":"xxx", "status":"ok"}
 *    - 用于安装/更新操作，可靠地更新计数
 * 2. 文本输出: pip 原始输出
 *    - 用于卸载/回滚操作，从输出推断完成状态
 * 
 * @param {Object} payload - 进度事件负载
 */
function updateProgressFromOutput(payload) {
  if (!progressOperation) return;
  const { data } = payload;
  const prefix = progressOperation === 'update' ? 'update-' : '';

  // 解析结构化进度事件（后端在每个包完成后发送）
  if (typeof data === 'string' && data.startsWith('[PROGRESS]')) {
    try {
      const info = JSON.parse(data.slice('[PROGRESS]'.length).trim());
      progressDone = Math.min(progressDone + (info.done || 1), progressTotal);
      const pct = Math.min(100, Math.round((progressDone / Math.max(1, progressTotal)) * 100));
      setProgressUI(prefix, pct);
      if (info.pkg) {
        const nameEl = document.getElementById(prefix + 'progress-name');
        if (nameEl) nameEl.textContent = info.pkg;
      }
    } catch (e) { /* 忽略格式异常的进度消息 */ }
    return; // 进度事件无需显示其他输出
  }
  
  // 兆底逻辑：卸载等无结构化进度的操作，从 pip 输出推断完成状态
  if (progressOperation === 'uninstall' || progressOperation === 'rollback') {
    if (data.includes('Successfully installed') || data.includes('Successfully uninstalled')) {
      progressDone = Math.min(progressDone + 1, progressTotal);
      const pct = Math.min(100, Math.round((progressDone / Math.max(1, progressTotal)) * 100));
      setProgressUI(prefix, pct);
    }
  }

  // 解析 pip 下载/安装中的包名，更新进度标签显示
  const match = data.match(/(Downloading|Installing collected packages):\s*([^\n]+)/);
  if (match) {
    document.getElementById(prefix + 'progress-name').textContent = match[2].slice(0, 60);
  }
  const updateMatch = data.match(/\[INFO\] Updating ([^\s.]+)/);
  if (updateMatch) {
    const nameEl = document.getElementById(prefix + 'progress-name');
    if (nameEl) nameEl.textContent = updateMatch[1];
  }
}
