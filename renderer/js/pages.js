// ============ Pages：镜像 / 环境 / 日志 / 设置 / 自动更新 ============
//
// 模块职责：
// - 镜像源页面的交互逻辑（设置默认/删除/编辑/测速/添加/智能路由）
// - 环境选择页面的交互逻辑
// - 日志页面的交互逻辑
// - 设置页面的配置加载和应用
// - 应用自动更新的事件绑定和 UI 更新
// - 多语言切换的 DOM 更新
//
// 依赖全局状态：
// - mirrors, envs, logData, appConfig: 各页面数据
// - editingMirrorIndex: 正在编辑的镜像索引

// ---- 镜像源操作 ----

/**
 * 设置默认镜像源
 * @param {number} index - 镜像索引
 */
async function setMirror(index) {
  const mirror = mirrors[index];
  try {
    await api.setDefaultMirror(mirror.url);
    mirrors = await api.getMirrors();
    renderMirrors();
    showToast(currentLang === 'zh' ? `默认镜像源已切换为 ${mirror.name}` : `Default mirror set to ${mirror.name}`, 'ok');
  } catch (err) {
    showToast(currentLang === 'zh' ? `设置失败: ${err.message}` : `Failed: ${err.message}`, 'err');
  }
}

/** 删除自定义镜像源 */
async function removeMirror(index) {
  const mirror = mirrors[index];
  if (!mirror) return;
  try {
    await api.removeCustomMirror(mirror.url);
    mirrors = await api.getMirrors();
    if (editingMirrorIndex === index) editingMirrorIndex = -1;
    renderMirrors();
    showToast(currentLang === 'zh' ? `已删除镜像源 ${mirror.name}` : `Removed mirror ${mirror.name}`, 'info');
  } catch (err) {
    showToast(currentLang === 'zh' ? `删除失败: ${err.message}` : `Remove failed: ${err.message}`, 'err');
  }
}

/** 进入镜像源编辑模式 */
function editMirror(index) {
  editingMirrorIndex = index;
  renderMirrors();
}

/** 取消镜像源编辑 */
function cancelMirrorEdit() {
  editingMirrorIndex = -1;
  renderMirrors();
}

/** 保存镜像源编辑结果 */
async function saveMirrorEdit(index) {
  const mirror = mirrors[index];
  if (!mirror) return;
  const name = document.getElementById(`mirror-edit-name-${index}`).value.trim();
  const url = document.getElementById(`mirror-edit-url-${index}`).value.trim();
  const remark = document.getElementById(`mirror-edit-remark-${index}`).value.trim();

  if (!name) {
    showToast(currentLang === 'zh' ? '请输入镜像源名称' : 'Please enter mirror name', 'err');
    return;
  }
  if (!/^https?:\/\/.+/.test(url)) {
    showToast(currentLang === 'zh' ? '地址格式不正确' : 'Invalid URL format', 'err');
    return;
  }

  const result = await api.updateMirror(mirror.url, { name, url, remark });
  if (!result) {
    showToast(currentLang === 'zh' ? '保存失败，可能该地址已存在' : 'Save failed, URL may already exist', 'err');
    return;
  }
  editingMirrorIndex = -1;
  mirrors = result;
  renderMirrors();
  showToast(currentLang === 'zh' ? '镜像源已更新' : 'Mirror updated', 'ok');
}

/** 批量测试所有镜像源速度 */
async function testAllMirrors() {
  const btn = document.getElementById('btn-test-speed');
  btn.classList.add('loading');
  try {
    mirrors = await api.testAllMirrors();
    renderMirrors();
    const best = [...mirrors].filter(m => m.speed && m.speed !== 9999).sort((a, b) => a.speed - b.speed)[0];
    if (best) {
      showToast(currentLang === 'zh' ? `测速完成，最快: ${best.name} (${best.speed}ms)` : `Test complete, fastest: ${best.name} (${best.speed}ms)`, 'ok');
    } else {
      showToast(currentLang === 'zh' ? '测速完成，无可用镜像' : 'Test complete, no available mirrors', 'err');
    }
  } catch (err) {
    showToast(currentLang === 'zh' ? `测速失败: ${err.message}` : `Speed test failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
  }
}

/** 添加自定义镜像源 */
async function addCustomMirror() {
  const nameInput = document.getElementById('custom-mirror-name');
  const urlInput = document.getElementById('custom-mirror-url');
  const remarkInput = document.getElementById('custom-mirror-remark');
  const url = urlInput.value.trim();
  let name = nameInput.value.trim();
  const remark = remarkInput.value.trim();
  if (!url) {
    showToast(currentLang === 'zh' ? '请输入镜像源地址' : 'Please enter mirror URL', 'err');
    return;
  }
  if (!/^https?:\/\/.+/.test(url)) {
    showToast(currentLang === 'zh' ? '地址格式不正确' : 'Invalid URL format', 'err');
    return;
  }
  if (!name) {
    try { name = new URL(url).hostname; } catch { name = url; }
  }
  const added = await api.addCustomMirror(name, url, remark);
  if (!added) {
    showToast(currentLang === 'zh' ? '该镜像源已存在' : 'Mirror already exists', 'err');
    return;
  }
  mirrors = await api.getMirrors();
  nameInput.value = '';
  urlInput.value = '';
  remarkInput.value = '';
  renderMirrors();
  showToast(currentLang === 'zh' ? `已添加镜像源 ${name}` : `Added mirror ${name}`, 'ok');
}

/** 切换智能路由开关 */
async function toggleSmartRoute() {
  const on = document.getElementById('toggle-smart-route').checked;
  try {
    await api.setSmartRoute(on);
    showToast(currentLang === 'zh' ? (on ? '智能路由已开启' : '智能路由已关闭') : (on ? 'Smart routing on' : 'Smart routing off'), 'info');
  } catch (err) {
    document.getElementById('toggle-smart-route').checked = !on;
    showToast(currentLang === 'zh' ? `切换失败: ${err.message}` : `Toggle failed: ${err.message}`, 'err');
  }
}

/** 恢复默认镜像源（设置页） */
async function restoreDefaultMirrorsSettings() {
  try {
    mirrors = await api.restoreDefaultMirrors();
    renderMirrors();
    showToast(currentLang === 'zh' ? '已恢复默认镜像源' : 'Default mirrors restored', 'ok');
  } catch (err) {
    showToast(currentLang === 'zh' ? `恢复失败: ${err.message}` : `Restore failed: ${err.message}`, 'err');
  }
}

// ---- 环境操作 ----

/**
 * 切换 Python 环境
 * - 切换后全局刷新数据
 * @param {number} index - 环境索引
 */
async function selectEnv(index) {
  const env = envs[index];
  try {
    await api.switchEnvironment(env.path);
    currentEnvIndex = index;
    renderEnvs();
    // 切换环境后全局刷新：重新拉取已安装/可更新列表并重渲染各页面（refreshAll 内部会更新状态栏）
    await refreshAll();
    showToast(currentLang === 'zh' ? `已切换到 ${env.name}` : `Switched to ${env.name}`, 'ok');
  } catch (err) {
    showToast(currentLang === 'zh' ? `切换环境失败: ${err.message}` : `Switch env failed: ${err.message}`, 'err');
  }
}

/**
 * 修复 pip（使用 ensurepip 重新引导安装）
 * - 适用于 pip 被意外卸载或损坏的场景
 * - 修复成功后刷新环境信息
 */
async function repairPip() {
  const btn = document.getElementById('btn-repair-pip');
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = t('env.repairPipRunning');

  try {
    const result = await api.repairPip({});
    showToast(
      currentLang === 'zh'
        ? `${t('env.repairPipSuccess')}（${result.method}，v${result.pipVersion}）`
        : `${t('env.repairPipSuccess')} (${result.method}, v${result.pipVersion})`,
      'ok'
    );
    // 修复成功后刷新环境信息
    await refreshEnvs();
    renderEnvs();
    updateStatusbar();
  } catch (err) {
    showToast(
      currentLang === 'zh' ? `${t('env.repairPipFail')}: ${err.message}` : `${t('env.repairPipFail')}: ${err.message}`,
      'err'
    );
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = t('env.repairPipBtn');
  }
}

// ---- 虚拟环境操作 ----

/**
 * 创建虚拟环境
 * - 从表单读取名称、基础 Python、选项
 * - 创建成功后刷新 venv 列表
 */
async function createVenv() {
  const nameInput = document.getElementById('venv-name');
  const baseSelect = document.getElementById('venv-base-python');
  const withPip = document.getElementById('venv-with-pip').checked;
  const systemSite = document.getElementById('venv-system-site').checked;
  const btn = document.getElementById('btn-create-venv');

  const name = nameInput.value.trim();
  if (!name) {
    showToast(currentLang === 'zh' ? '请输入虚拟环境名称' : 'Please enter venv name', 'err');
    return;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    showToast(currentLang === 'zh' ? '名称只能包含字母、数字、短横线、下划线和点' : 'Name can only contain letters, digits, hyphens, underscores and dots', 'err');
    return;
  }

  const pythonPath = baseSelect.value;
  if (!pythonPath) {
    showToast(currentLang === 'zh' ? '请选择基础 Python 环境' : 'Please select a base Python', 'err');
    return;
  }

  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = t('env.venvCreating');

  try {
    await api.createVenv({ name, pythonPath, withPip, systemSitePackages: systemSite });
    showToast(`${t('env.venvCreated')}: ${name}`, 'ok');
    nameInput.value = '';
    await refreshVenvs();
  } catch (err) {
    showToast(currentLang === 'zh' ? `创建失败: ${err.message}` : `Create failed: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = t('env.venvCreateBtn');
  }
}

/**
 * 使用虚拟环境（切换当前环境到 venv 的 Python）
 * @param {number} index - venv 列表索引
 */
async function useVenv(index) {
  const venv = window._venvList[index];
  if (!venv) return;
  try {
    await api.switchEnvironment(venv.pythonPath);
    await refreshEnvs();
    renderEnvs();
    await refreshAll();
    showToast(`${t('env.venvSwitched')}: ${venv.name}`, 'ok');
  } catch (err) {
    showToast(currentLang === 'zh' ? `切换失败: ${err.message}` : `Switch failed: ${err.message}`, 'err');
  }
}

/**
 * 删除虚拟环境
 * @param {number} index - venv 列表索引
 */
async function deleteVenv(index) {
  const venv = window._venvList[index];
  if (!venv) return;

  const confirmMsg = currentLang === 'zh'
    ? `确定要删除虚拟环境 "${venv.name}" 吗？此操作不可恢复。`
    : `Delete virtual environment "${venv.name}"? This cannot be undone.`;
  if (!confirm(confirmMsg)) return;

  try {
    await api.deleteVenv(venv.name);
    showToast(`${t('env.venvDeleted')}: ${venv.name}`, 'info');
    await refreshVenvs();
  } catch (err) {
    showToast(currentLang === 'zh' ? `删除失败: ${err.message}` : `Delete failed: ${err.message}`, 'err');
  }
}

/**
 * 刷新虚拟环境列表并重新渲染
 */
async function refreshVenvs() {
  try {
    window._venvList = await api.listVenvs();
  } catch (err) {
    window._venvList = [];
  }
  renderVenvs();
}

// ---- 日志操作 ----

/**
 * 添加日志记录（前端侧，较少使用，主要由后端记录）
 */
async function addLog(action, status, type = 'install') {
  const entry = { action, status, type };
  await api.addLog(entry);
  await refreshLogs();
}

/** 清空所有日志 */
async function clearLogs() {
  await api.clearLogs();
  logData = [];
  renderLogs();
  showToast(currentLang === 'zh' ? '日志已清空' : 'Logs cleared', 'info');
}

/** 导出日志为 CSV 或 Markdown */
async function exportLogs(format) {
  try {
    const result = await api.exportLogs(format);
    if (result) {
      showToast(currentLang === 'zh' ? `日志已导出到 ${result}` : `Logs exported to ${result}`, 'ok');
    }
  } catch (err) {
    showToast(currentLang === 'zh' ? `导出失败: ${err.message}` : `Export failed: ${err.message}`, 'err');
  }
}

// ---- 语言与主题 ----

/**
 * 应用多语言到 DOM
 * - 遍历所有 [data-i18n] 和 [data-i18n-placeholder] 属性
 * - 重新渲染所有表格和状态栏
 */
function applyLanguage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[currentLang][key] !== undefined) el.textContent = i18n[currentLang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (i18n[currentLang][key] !== undefined) el.placeholder = i18n[currentLang][key];
  });
  renderUninstallTable(document.getElementById('uninstall-search').value);
  renderUpdateTable();
  renderQueryTable();
  renderMirrors();
  renderLogs();
  updateStatusbar();
  updateSelectionInfo();
}

// ---- 设置操作 ----

/** 浏览并设置存储路径 */
async function browseStoragePath() {
  const dir = await api.browseDirectory();
  if (dir) {
    await api.setConfig('storagePath', dir);
    const pathEl = document.getElementById('setting-path');
    if (pathEl) pathEl.textContent = dir;
    showToast(currentLang === 'zh' ? `存储路径已设置为 ${dir}` : `Storage path set to ${dir}`, 'ok');
  }
}

/**
 * 加载应用配置并应用到 UI
 * - 设置语言、主题、线程数、重试次数等
 */
async function loadConfig() {
  appConfig = await api.getConfig();
  currentLang = appConfig.language || 'zh';
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';

  // 主题处理（支持跟随系统）
  let effectiveTheme = appConfig.theme || 'light';
  if (effectiveTheme === 'system') {
    effectiveTheme = await api.getSystemTheme();
  }
  document.body.classList.toggle('dark', effectiveTheme === 'dark');
  document.querySelectorAll('#theme-options .theme-opt').forEach(x => x.classList.toggle('active', x.dataset.theme === appConfig.theme));

  document.querySelectorAll('#lang-options .theme-opt').forEach(x => x.classList.toggle('active', x.dataset.lang === currentLang));
  document.getElementById('setting-threads').value = String(appConfig.parallelThreads || 4);
  document.getElementById('setting-retry').value = String(appConfig.retryCount ?? 3);
  const pathEl = document.getElementById('setting-path');
  if (pathEl) pathEl.textContent = appConfig.storagePath || '';

  // 新增设置项
  const autoCheck = document.getElementById('toggle-auto-check');
  if (autoCheck) autoCheck.checked = appConfig.autoCheckUpdates !== false;
  const notify = document.getElementById('toggle-notify');
  if (notify) notify.checked = appConfig.desktopNotify !== false;
  const tray = document.getElementById('toggle-tray');
  if (tray) tray.checked = appConfig.minimizeToTray !== false;

  // 加载定时更新调度器状态
  loadSchedulerStatus();
}

// ---- 应用自动更新 ----

/**
 * 设置更新状态文本
 * @param {string} text - 状态文本
 * @param {string} [type=''] - 类型样式
 */
function setUpdateStatus(text, type = '') {
  const el = document.getElementById('about-update-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'about-update-status' + (type ? ` ${type}` : '');
}

/** 设置更新下载进度条 */
function setUpdateProgress(percent) {
  const bar = document.getElementById('about-update-bar');
  const wrap = document.getElementById('about-update-progress');
  if (!bar || !wrap) return;
  wrap.style.display = 'block';
  bar.style.width = `${percent}%`;
}

/** 隐藏更新进度条 */
function hideUpdateProgress() {
  const wrap = document.getElementById('about-update-progress');
  const bar = document.getElementById('about-update-bar');
  if (wrap) wrap.style.display = 'none';
  if (bar) bar.style.width = '0%';
}

/** 检查应用更新 */
async function checkAppUpdate() {
  const btnCheck = document.getElementById('btn-check-update');
  const btnInstall = document.getElementById('btn-install-update');
  if (!btnCheck) return;
  btnCheck.disabled = true;
  btnInstall.style.display = 'none';
  hideUpdateProgress();
  try {
    setUpdateStatus(t('update.checking'));
    await api.checkForUpdates();
  } catch (err) {
    setUpdateStatus(t('update.errorPrefix') + err.message, 'err');
    btnCheck.disabled = false;
  }
}

/** 安装已下载的更新 */
function installAppUpdate() {
  api.installUpdate();
}

/**
 * 绑定应用自动更新的所有事件
 * - checking: 正在检查
 * - available: 发现新版本
 * - not-available: 已是最新
 * - progress: 下载进度
 * - downloaded: 下载完成
 * - error: 更新错误
 */
function bindUpdaterEvents() {
  api.onUpdaterChecking(() => {
    setUpdateStatus(t('update.checking'));
  });

  api.onUpdaterAvailable((info) => {
    setUpdateStatus(t('update.available').replace('{version}', info.version));
  });

  api.onUpdaterNotAvailable(() => {
    setUpdateStatus(t('update.notAvailable'));
    const btnCheck = document.getElementById('btn-check-update');
    if (btnCheck) btnCheck.disabled = false;
  });

  api.onUpdaterProgress((progress) => {
    const percent = Math.round(progress.percent || 0);
    setUpdateStatus(t('update.downloading').replace('{percent}', percent));
    setUpdateProgress(percent);
  });

  api.onUpdaterDownloaded((info) => {
    setUpdateStatus(t('update.downloaded').replace('{version}', info.version));
    hideUpdateProgress();
    const btnCheck = document.getElementById('btn-check-update');
    const btnInstall = document.getElementById('btn-install-update');
    if (btnCheck) btnCheck.style.display = 'none';
    if (btnInstall) btnInstall.style.display = 'inline-flex';
  });

  api.onUpdaterError((err) => {
    setUpdateStatus(t('update.errorPrefix') + (err.message || t('update.error')), 'err');
    hideUpdateProgress();
    const btnCheck = document.getElementById('btn-check-update');
    if (btnCheck) btnCheck.disabled = false;
  });
}

// ---- 包详情面板 ----

/**
 * 显示包详情弹窗
 * - 调用 pip show 获取详细信息
 * - 加载依赖树
 * @param {string} pkgName - 包名
 */
async function showPackageDetail(pkgName) {
  const modal = document.getElementById('pkg-detail-modal');
  const title = document.getElementById('pkg-detail-title');
  const content = document.getElementById('pkg-detail-content');

  title.textContent = pkgName;
  content.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${t('detail.loading')}</div>`;
  modal.classList.add('show');

  try {
    const info = await api.showPackageInfo(pkgName);
    let html = '<div class="pkg-detail-grid">';
    html += `<span class="pkg-detail-label">${t('detail.version')}</span><span class="pkg-detail-value">${escapeHtml(info.version)}</span>`;
    if (info.summary) html += `<span class="pkg-detail-label">${t('detail.summary')}</span><span class="pkg-detail-value">${escapeHtml(info.summary)}</span>`;
    if (info.author) html += `<span class="pkg-detail-label">${t('detail.author')}</span><span class="pkg-detail-value">${escapeHtml(info.author)}</span>`;
    if (info.homePage) html += `<span class="pkg-detail-label">${t('detail.homepage')}</span><span class="pkg-detail-value"><a href="${escapeHtml(info.homePage)}" target="_blank">${escapeHtml(info.homePage)}</a></span>`;
    if (info.license) html += `<span class="pkg-detail-label">${t('detail.license')}</span><span class="pkg-detail-value">${escapeHtml(info.license)}</span>`;
    if (info.location) html += `<span class="pkg-detail-label">${t('detail.location')}</span><span class="pkg-detail-value" style="font-size:11px; font-family:monospace;">${escapeHtml(info.location)}</span>`;
    html += '</div>';

    // 依赖列表
    if (info.requires && info.requires.length > 0) {
      html += `<div class="pkg-detail-section"><div class="pkg-detail-section-title">${t('detail.requires')} (${info.requires.length})</div><div class="pkg-dep-list">`;
      html += info.requires.map(d => `<span class="pkg-dep-tag" onclick="showPackageDetail('${escapeHtml(d)}')">${escapeHtml(d)}</span>`).join('');
      html += '</div></div>';
    }

    // 被依赖列表
    if (info.requiredBy && info.requiredBy.length > 0) {
      html += `<div class="pkg-detail-section"><div class="pkg-detail-section-title">${t('detail.requiredBy')} (${info.requiredBy.length})</div><div class="pkg-dep-list">`;
      html += info.requiredBy.map(d => `<span class="pkg-dep-tag" onclick="showPackageDetail('${escapeHtml(d)}')">${escapeHtml(d)}</span>`).join('');
      html += '</div></div>';
    }

    // 依赖树
    html += `<div class="pkg-detail-section"><div class="pkg-detail-section-title">${t('detail.depTree')}</div><div class="dep-tree" id="dep-tree-content">${t('detail.loading')}</div></div>`;
    content.innerHTML = html;

    // 异步加载依赖树
    try {
      const tree = await api.getDependencyTree(pkgName);
      const treeEl = document.getElementById('dep-tree-content');
      if (treeEl) treeEl.innerHTML = renderDepTreeNode(tree, 0);
    } catch {
      const treeEl = document.getElementById('dep-tree-content');
      if (treeEl) treeEl.textContent = t('detail.noDeps');
    }
  } catch (err) {
    content.innerHTML = `<div style="text-align:center; padding:20px; color:var(--tag-danger-text);">${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 渲染依赖树节点（递归）
 * @param {Object} node - 树节点 { name, version, children }
 * @param {number} depth - 当前深度
 * @returns {string} HTML
 */
function renderDepTreeNode(node, depth) {
  if (!node) return '';
  let html = `<div class="dep-tree-item" style="margin-left:${depth * 12}px;">`;
  html += `<span class="dep-tree-name">${escapeHtml(node.name)}</span>`;
  if (node.version) html += `<span class="dep-tree-ver">v${escapeHtml(node.version)}</span>`;
  html += '</div>';
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      html += renderDepTreeNode(child, depth + 1);
    }
  }
  return html;
}

// ---- 导出/导入环境 ----

/** 导出当前环境为 requirements.txt */
async function exportEnv() {
  try {
    const savePath = await api.browseDirectory();
    if (!savePath) return;
    const fullPath = savePath + '\\requirements.txt';
    const result = await api.exportRequirements({ savePath: fullPath });
    showToast(t('env.exported').replace('{count}', result.count), 'ok');
  } catch (err) {
    showToast(currentLang === 'zh' ? `导出失败: ${err.message}` : `Export failed: ${err.message}`, 'err');
  }
}

/** 从 requirements.txt 导入包 */
async function importEnv() {
  try {
    const filePath = await api.browseFile([{ name: 'Requirements', extensions: ['txt'] }]);
    if (!filePath) return;
    showToast(currentLang === 'zh' ? '正在导入...' : 'Importing...', 'info');
    await api.importRequirements(filePath, {});
    await refreshAll();
    showToast(t('env.imported'), 'ok');
    sendDesktopNotification(t('env.imported'), currentLang === 'zh' ? '环境导入' : 'Import Done');
  } catch (err) {
    showToast(currentLang === 'zh' ? `导入失败: ${err.message}` : `Import failed: ${err.message}`, 'err');
  }
}

// ---- 环境对比 ----

/** 渲染环境对比下拉选项 */
function renderCompareOptions() {
  const selA = document.getElementById('compare-env-a');
  const selB = document.getElementById('compare-env-b');
  if (!selA || !selB) return;
  const opts = envs.map((e, i) => `<option value="${escapeHtml(e.path)}">${escapeHtml(e.name)} (Python ${e.version || '?'})</option>`).join('');
  selA.innerHTML = opts;
  selB.innerHTML = opts;
  if (envs.length > 1) selB.selectedIndex = 1;
}

/** 执行环境对比 */
async function compareEnvs() {
  const selA = document.getElementById('compare-env-a');
  const selB = document.getElementById('compare-env-b');
  const btn = document.getElementById('btn-compare-envs');
  const resultEl = document.getElementById('compare-result');

  if (selA.value === selB.value) {
    showToast(currentLang === 'zh' ? '请选择两个不同的环境' : 'Please select two different environments', 'warn');
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  try {
    const result = await api.compareEnvironments(selA.value, selB.value);
    let html = '<div class="compare-summary">';
    html += `<span>${t('env.sameCount')}: <strong>${result.same}</strong></span>`;
    html += `<span>${t('env.onlyA')}: <strong>${result.onlyA.length}</strong></span>`;
    html += `<span>${t('env.onlyB')}: <strong>${result.onlyB.length}</strong></span>`;
    html += `<span>${t('env.diffVer')}: <strong>${result.different.length}</strong></span>`;
    html += '</div>';

    if (result.onlyA.length > 0) {
      html += `<div class="compare-section"><div class="compare-section-title only-a">${t('env.onlyA')}</div><div class="compare-chips">`;
      html += result.onlyA.map(p => `<span class="compare-chip">${escapeHtml(p.name)} ${p.version}</span>`).join('');
      html += '</div></div>';
    }
    if (result.onlyB.length > 0) {
      html += `<div class="compare-section"><div class="compare-section-title only-b">${t('env.onlyB')}</div><div class="compare-chips">`;
      html += result.onlyB.map(p => `<span class="compare-chip">${escapeHtml(p.name)} ${p.version}</span>`).join('');
      html += '</div></div>';
    }
    if (result.different.length > 0) {
      html += `<div class="compare-section"><div class="compare-section-title diff">${t('env.diffVer')}</div><div class="compare-chips">`;
      html += result.different.map(p => `<span class="compare-chip">${escapeHtml(p.name)}: ${p.versionA} → ${p.versionB}</span>`).join('');
      html += '</div></div>';
    }

    resultEl.innerHTML = html;
    resultEl.style.display = 'block';
  } catch (err) {
    showToast(currentLang === 'zh' ? `对比失败: ${err.message}` : `Compare failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ---- 新增设置开关 ----

/** 切换启动时检查更新 */
function toggleAutoCheck() {
  const on = document.getElementById('toggle-auto-check').checked;
  api.setConfig('autoCheckUpdates', on);
}

/** 切换桌面通知 */
function toggleDesktopNotify() {
  const on = document.getElementById('toggle-notify').checked;
  api.setConfig('desktopNotify', on);
}

/** 切换最小化到托盘 */
function toggleTrayMinimize() {
  const on = document.getElementById('toggle-tray').checked;
  api.setConfig('minimizeToTray', on);
}

// ---- 定时自动更新调度器 ----

let schedulerWhitelist = []; // 白名单缓存

/** 加载调度器状态到 UI */
async function loadSchedulerStatus() {
  try {
    const status = await api.getSchedulerStatus();
    const toggle = document.getElementById('toggle-scheduler');
    const freq = document.getElementById('scheduler-frequency');
    const lastRunEl = document.getElementById('scheduler-last-run');
    if (toggle) toggle.checked = status.enabled;
    if (freq) freq.value = status.frequency || 'daily';
    if (lastRunEl) lastRunEl.textContent = status.lastRun ? status.lastRun.replace('T', ' ').slice(0, 19) : '-';
    schedulerWhitelist = status.whitelist || [];
    renderWhitelistTags();
  } catch (err) {
    console.error('loadSchedulerStatus failed', err);
  }
}

/** 切换调度器开关 */
async function toggleScheduler() {
  const on = document.getElementById('toggle-scheduler').checked;
  await api.saveSchedulerConfig({ enabled: on });
  showToast(currentLang === 'zh' ? (on ? '定时更新已开启' : '定时更新已关闭') : (on ? 'Scheduled update enabled' : 'Scheduled update disabled'), 'info');
}

/** 修改执行频率 */
async function changeSchedulerFrequency() {
  const freq = document.getElementById('scheduler-frequency').value;
  await api.saveSchedulerConfig({ frequency: freq });
  showToast(currentLang === 'zh' ? `执行频率已设为${freq === 'daily' ? '每天' : '每周'}` : `Frequency set to ${freq}`, 'ok');
}

/** 添加白名单包 */
async function addWhitelistPkg() {
  const input = document.getElementById('scheduler-whitelist-input');
  const raw = input.value.trim();
  if (!raw) return;
  const pkgs = raw.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
  const newSet = new Set([...schedulerWhitelist, ...pkgs]);
  schedulerWhitelist = Array.from(newSet);
  await api.saveSchedulerConfig({ whitelist: schedulerWhitelist });
  input.value = '';
  renderWhitelistTags();
  showToast(currentLang === 'zh' ? `已添加 ${pkgs.length} 个包到白名单` : `Added ${pkgs.length} package(s) to whitelist`, 'ok');
}

/** 移除白名单包 */
async function removeWhitelistPkg(name) {
  schedulerWhitelist = schedulerWhitelist.filter(p => p !== name);
  await api.saveSchedulerConfig({ whitelist: schedulerWhitelist });
  renderWhitelistTags();
}

/** 渲染白名单标签 */
function renderWhitelistTags() {
  const container = document.getElementById('scheduler-whitelist-tags');
  if (!container) return;
  container.innerHTML = schedulerWhitelist.map(name =>
    `<span class="pkg-dep-tag" style="display:inline-flex; align-items:center; gap:4px;">${escapeHtml(name)} <span style="cursor:pointer; font-weight:700; color:var(--tag-danger-text);" onclick="removeWhitelistPkg('${escapeHtml(name)}')">\u00d7</span></span>`
  ).join('');
}

/** 立即执行一次自动更新 */
async function runSchedulerNow() {
  const btn = document.getElementById('btn-run-scheduler');
  btn.classList.add('loading');
  showToast(t('scheduler.running'), 'info');
  try {
    const result = await api.runSchedulerNow();
    if (result.error) {
      showToast(currentLang === 'zh' ? `自动更新失败: ${result.error}` : `Auto-update failed: ${result.error}`, 'err');
    } else {
      showToast(`${t('scheduler.done')}: ${result.updated || 0} updated`, 'ok');
    }
    await loadSchedulerStatus();
    await refreshLogs();
    renderLogs();
  } catch (err) {
    showToast(currentLang === 'zh' ? `执行失败: ${err.message}` : `Failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
  }
}

// ---- 桌面通知 ----

/**
 * 发送桌面通知（如果配置开启）
 * - title 使用简短操作描述（Windows 通知中心已自动显示应用名 PyLibMaster，无需重复）
 * @param {string} body - 通知内容
 * @param {string} [title] - 通知标题（默认为“操作完成”）
 */
function sendDesktopNotification(body, title) {
  if (appConfig.desktopNotify !== false) {
    api.sendNotification(title || (currentLang === 'zh' ? '操作完成' : 'Done'), body).catch(() => {});
  }
}

// ---- 操作统计仪表盘 ----

/**
 * 渲染数据统计页面（独立仪表盘）
 * - 总操作概览（安装/卸载/更新/成功率）
 * - 本周活动
 * - 近 7 天趋势图（CSS 柱状图）
 * - Top 10 最常操作的包
 * - 最近活动时间线
 * - 磁盘占用 Top 10
 */
function renderStatsDashboard() {
  // ==== 总量统计 ====
  const allInstalls = logData.filter(l => l.type === 'install');
  const allUninstalls = logData.filter(l => l.type === 'uninstall');
  const allUpdates = logData.filter(l => l.type === 'update');
  const okInstalls = allInstalls.filter(l => l.status === 'ok').length;
  const okUninstalls = allUninstalls.filter(l => l.status === 'ok').length;
  const okUpdates = allUpdates.filter(l => l.status === 'ok').length;
  const totalOps = logData.length;
  const totalOk = logData.filter(l => l.status === 'ok').length;
  const successRate = totalOps > 0 ? Math.round((totalOk / totalOps) * 100) : 0;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('db-total-install', okInstalls);
  set('db-total-uninstall', okUninstalls);
  set('db-total-update', okUpdates);
  set('db-success-rate', successRate + '%');

  // ==== 本周活动 ====
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStr = weekAgo.toISOString().slice(0, 10);
  const weekLogs = logData.filter(l => l.time >= weekStr);
  set('db-week-install', weekLogs.filter(l => l.type === 'install' && l.status === 'ok').length);
  set('db-week-uninstall', weekLogs.filter(l => l.type === 'uninstall' && l.status === 'ok').length);
  set('db-week-update', weekLogs.filter(l => l.type === 'update' && l.status === 'ok').length);

  // ==== 最近活动 ====
  const actEl = document.getElementById('db-recent-activity');
  if (actEl) {
    const recent = logData.slice(0, 15);
    if (recent.length === 0) {
      actEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${t('dashboard.noData')}</div>`;
    } else {
      actEl.innerHTML = recent.map(l => {
        const dotClass = l.type || 'system';
        const actionText = l.action.length > 50 ? l.action.slice(0, 50) + '…' : l.action;
        const detailText = l.detail ? ' — ' + (l.detail.length > 25 ? l.detail.slice(0, 25) + '…' : l.detail) : '';
        return `<div class="db-activity-item"><div class="db-activity-dot ${dotClass}"></div><span class="db-activity-text" title="${escapeHtml(l.action)}${l.detail ? ' — ' + escapeHtml(l.detail) : ''}">${escapeHtml(actionText)}${escapeHtml(detailText)}</span><span class="db-activity-time">${escapeHtml((l.time || '').slice(5, 16))}</span></div>`;
      }).join('');
    }
  }
}

// ---- 项目模板与环境快照 ----

let selectedTemplateId = null; // 当前选中的模板

/** 加载模板页面数据 */
async function loadTemplatesPage() {
  await renderTemplates();
  await renderSnapshots();
  // 填充基础 Python 下拉
  const sel = document.getElementById('tpl-base-python');
  if (sel) {
    sel.innerHTML = envs.map(e => `<option value="${escapeHtml(e.path)}">${escapeHtml(e.name)} (Python ${e.version || '?'})</option>`).join('');
  }
}

/** 渲染模板卡片网格 */
async function renderTemplates() {
  const grid = document.getElementById('tpl-grid');
  if (!grid) return;
  try {
    const templates = await api.getTemplates();
    grid.innerHTML = templates.map(tpl => `
      <div class="tpl-card ${selectedTemplateId === tpl.id ? 'selected' : ''}" onclick="selectTemplate('${tpl.id}')">
        <div class="tpl-card-icon">${tpl.icon || '📦'}</div>
        <div class="tpl-card-name">${escapeHtml(tpl.name)}</div>
        <div class="tpl-card-desc">${escapeHtml(tpl.description || '')}</div>
        <div class="tpl-card-count">${tpl.packages.length} ${t('tpl.packages')}</div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div style="color:var(--text-muted); padding:12px;">${escapeHtml(err.message)}</div>`;
  }
}

/** 选中模板，显示创建表单 */
async function selectTemplate(id) {
  selectedTemplateId = id;
  const templates = await api.getTemplates();
  const tpl = templates.find(t => t.id === id);
  if (!tpl) return;

  const card = document.getElementById('tpl-create-card');
  const info = document.getElementById('tpl-create-info');
  card.style.display = 'block';
  info.innerHTML = `<strong>${tpl.icon} ${escapeHtml(tpl.name)}</strong> — ${escapeHtml(tpl.packages.join(', '))}`;
  // 自动填充环境名称
  const nameInput = document.getElementById('tpl-venv-name');
  if (nameInput && !nameInput.value) {
    nameInput.value = tpl.id.replace(/^custom-\d+$/, 'my-env').replace(/[^a-zA-Z0-9-]/g, '-');
  }
  renderTemplates();
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** 取消模板选择 */
function cancelTemplateSelect() {
  selectedTemplateId = null;
  document.getElementById('tpl-create-card').style.display = 'none';
  renderTemplates();
}

/** 执行模板创建 */
async function execTemplateCreate() {
  const venvName = document.getElementById('tpl-venv-name').value.trim();
  const pythonPath = document.getElementById('tpl-base-python').value;
  const btn = document.getElementById('btn-tpl-create');

  if (!venvName) {
    showToast(currentLang === 'zh' ? '请输入环境名称' : 'Please enter environment name', 'err');
    return;
  }
  if (!selectedTemplateId) return;

  btn.classList.add('loading');
  showToast(t('tpl.creating'), 'info');

  try {
    await api.createFromTemplate({ templateId: selectedTemplateId, venvName, pythonPath });
    showToast(t('tpl.created'), 'ok');
    sendDesktopNotification(t('tpl.created'), currentLang === 'zh' ? '模板创建' : 'Template Created');
    cancelTemplateSelect();
    document.getElementById('tpl-venv-name').value = '';
    await refreshVenvs();
  } catch (err) {
    showToast(currentLang === 'zh' ? `创建失败: ${err.message}` : `Create failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
  }
}

/** 创建环境快照 */
async function createEnvSnapshot() {
  const btn = document.getElementById('btn-create-snapshot');
  const label = document.getElementById('snapshot-label').value.trim();
  const env = envs[currentEnvIndex];
  if (!env) {
    showToast(currentLang === 'zh' ? '请先选择 Python 环境' : 'Please select a Python environment first', 'err');
    return;
  }

  btn.classList.add('loading');
  try {
    await api.createSnapshot(env.path, label);
    showToast(t('tpl.snapshotCreated'), 'ok');
    document.getElementById('snapshot-label').value = '';
    await renderSnapshots();
  } catch (err) {
    showToast(currentLang === 'zh' ? `创建快照失败: ${err.message}` : `Snapshot failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
  }
}

/** 渲染快照列表 */
async function renderSnapshots() {
  const container = document.getElementById('snapshot-list');
  if (!container) return;
  try {
    const snapshots = await api.listSnapshots();
    if (snapshots.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:24px 0;"><div class="empty-state-text">${t('tpl.empty')}</div><div class="empty-state-sub">${t('tpl.emptySub')}</div></div>`;
      return;
    }
    container.innerHTML = snapshots.map(s => `
      <div class="snapshot-item">
        <div class="snapshot-info">
          <div class="snapshot-label">📸 ${escapeHtml(s.label || s.envName)}</div>
          <div class="snapshot-meta">${escapeHtml((s.time || '').replace('T', ' ').slice(0, 19))} · ${s.packageCount} ${t('tpl.packages')} · ${escapeHtml(s.envName)}</div>
        </div>
        <div class="snapshot-actions">
          <button class="btn btn-sm btn-primary" onclick="restoreEnvSnapshot('${s.id}')">${t('tpl.restore')}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteEnvSnapshot('${s.id}')">${t('btn.delete')}</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:var(--text-muted); padding:12px;">${escapeHtml(err.message)}</div>`;
  }
}

/** 从快照恢复环境 */
async function restoreEnvSnapshot(snapshotId) {
  const env = envs[currentEnvIndex];
  if (!env) {
    showToast(currentLang === 'zh' ? '请先选择要回滚的目标环境' : 'Please select target environment', 'err');
    return;
  }
  const msg = currentLang === 'zh'
    ? `确定要将当前环境回滚到此快照状态吗？将安装快照中记录的所有包。`
    : `Restore current environment to this snapshot? All recorded packages will be installed.`;
  if (!confirm(msg)) return;

  showToast(currentLang === 'zh' ? '正在回滚...' : 'Restoring...', 'info');
  try {
    await api.restoreSnapshot(snapshotId, env.path);
    showToast(t('tpl.restored'), 'ok');
    sendDesktopNotification(t('tpl.restored'), currentLang === 'zh' ? '快照恢复' : 'Snapshot Restored');
    await refreshAll();
  } catch (err) {
    showToast(currentLang === 'zh' ? `回滚失败: ${err.message}` : `Restore failed: ${err.message}`, 'err');
  }
}

/** 删除快照 */
async function deleteEnvSnapshot(snapshotId) {
  try {
    await api.deleteSnapshot(snapshotId);
    showToast(currentLang === 'zh' ? '快照已删除' : 'Snapshot deleted', 'info');
    await renderSnapshots();
  } catch (err) {
    showToast(currentLang === 'zh' ? `删除失败: ${err.message}` : `Delete failed: ${err.message}`, 'err');
  }
}

// ---- 安全漏洞扫描 ----

/** 执行安全漏洞扫描 */
async function runSecurityAudit() {
  const btn = document.getElementById('btn-run-audit');
  const resultsEl = document.getElementById('audit-results');
  const summaryEl = document.getElementById('audit-summary');

  btn.classList.add('loading');
  resultsEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${t('audit.scanning')}</div>`;
  summaryEl.style.display = 'none';

  try {
    const result = await api.runAudit();
    renderAuditResult(result);
    showToast(t('audit.done'), result.summary.totalVulns > 0 ? 'warn' : 'ok');
  } catch (err) {
    resultsEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--tag-danger-text);">${escapeHtml(err.message)}</div>`;
    showToast(currentLang === 'zh' ? `扫描失败: ${err.message}` : `Scan failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
  }
}

/** 渲染扫描结果 */
function renderAuditResult(result) {
  const summaryEl = document.getElementById('audit-summary');
  const resultsEl = document.getElementById('audit-results');
  const s = result.summary;

  // 概览徽章
  summaryEl.style.display = 'block';
  if (s.totalVulns === 0) {
    summaryEl.innerHTML = `<span class="audit-badge ok">${t('audit.noVulns')}</span>`;
    resultsEl.innerHTML = '';
    return;
  }

  let badges = '';
  if (s.critical > 0) badges += `<span class="audit-badge critical">${t('audit.critical')} ${s.critical}</span>`;
  if (s.high > 0) badges += `<span class="audit-badge high">${t('audit.high')} ${s.high}</span>`;
  if (s.medium > 0) badges += `<span class="audit-badge medium">${t('audit.medium')} ${s.medium}</span>`;
  if (s.low > 0) badges += `<span class="audit-badge low">${t('audit.low')} ${s.low}</span>`;
  badges += `<span class="audit-badge ok">${t('audit.fixable')} ${s.fixable}/${s.totalVulns}</span>`;
  summaryEl.innerHTML = `<div class="audit-summary-row">${badges}</div>`;

  // 漏洞列表
  const severityLabel = (sev) => t('audit.' + sev) || sev;
  resultsEl.innerHTML = result.vulnerabilities.slice(0, 20).map(v => `
    <div class="audit-vuln-item">
      <div class="audit-vuln-header">
        <span class="audit-badge ${v.severity}" style="padding:2px 8px; font-size:10px;">${severityLabel(v.severity)}</span>
        <span class="audit-vuln-pkg">${escapeHtml(v.package)}</span>
        <span class="audit-vuln-ver">v${escapeHtml(v.version)}</span>
        <span class="audit-vuln-id">${escapeHtml(v.id)}</span>
      </div>
      <div class="audit-vuln-desc">${escapeHtml(v.summary)}</div>
      ${v.fixVersion ? `<span class="audit-vuln-fix">🛡️ ${t('audit.fixTo')} ${escapeHtml(v.package)}>=${escapeHtml(v.fixVersion)}</span>` : ''}
    </div>
  `).join('');

  if (result.vulnerabilities.length > 20) {
    resultsEl.innerHTML += `<div style="text-align:center; padding:8px; color:var(--text-muted); font-size:12px;">... +${result.vulnerabilities.length - 20} more</div>`;
  }
}

/** 加载缓存的扫描结果（进入仪表盘时调用） */
async function loadCachedAudit() {
  try {
    const cached = await api.getCachedAudit();
    if (cached) renderAuditResult(cached);
  } catch { /* 无缓存时静默处理 */ }
}

// ---- PyPI 在线浏览 ----

let currentPypiPackage = null; // 当前查看的包名

/**
 * 搜索 PyPI 包
 * - 通过 PyPI JSON API 查询包信息
 * - 支持空格分隔多个包名批量查询
 */
async function searchPyPI() {
  const input = document.getElementById('pypi-search');
  const btn = document.getElementById('btn-pypi-search');
  const resultsEl = document.getElementById('pypi-results');
  const detailEl = document.getElementById('pypi-detail');
  const query = input.value.trim();
  if (!query) return;

  btn.classList.add('loading');
  detailEl.style.display = 'none';
  resultsEl.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);">${t('pypi.searching')}</div>`;

  const names = query.split(/[\s,]+/).filter(Boolean).slice(0, 8);
  const results = [];

  for (const name of names) {
    try {
      const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
      if (resp.ok) {
        const data = await resp.json();
        results.push(data);
      }
    } catch { /* 网络失败时跳过 */ }
  }

  btn.classList.remove('loading');

  if (results.length === 0) {
    resultsEl.innerHTML = `<div class="empty-state" style="padding:36px;"><div class="empty-state-text">${t('pypi.notFound')}</div><div class="empty-state-sub">${escapeHtml(query)}</div></div>`;
    return;
  }

  resultsEl.innerHTML = results.map(data => {
    const info = data.info;
    return `<div class="pypi-result-item" onclick="showPypiDetail('${escapeHtml(info.name)}')">
      <div>
        <div><span class="pypi-result-name">${escapeHtml(info.name)}</span><span class="pypi-result-ver">v${escapeHtml(info.version)}</span></div>
        <div class="pypi-result-desc">${escapeHtml(info.summary || '')}</div>
      </div>
      <span style="color:var(--text-muted); font-size:18px;">›</span>
    </div>`;
  }).join('');

  // 如果只有一个结果，直接进入详情
  if (results.length === 1) {
    showPypiDetail(results[0].info.name);
  }
}

/**
 * 显示 PyPI 包详情
 * - 展示版本、作者、许可证、更新时间、下载量
 * - 展示 README 描述
 * @param {string} pkgName - 包名
 */
async function showPypiDetail(pkgName) {
  const resultsEl = document.getElementById('pypi-results');
  const detailEl = document.getElementById('pypi-detail');
  resultsEl.style.display = 'none';
  detailEl.style.display = 'block';
  currentPypiPackage = pkgName;

  try {
    const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkgName)}/json`);
    if (!resp.ok) throw new Error('Not found');
    const data = await resp.json();
    const info = data.info;

    document.getElementById('pypi-detail-name').textContent = `${info.name} v${info.version}`;
    document.getElementById('pypi-detail-summary').textContent = info.summary || '';
    document.getElementById('pypi-detail-link').href = `https://pypi.org/project/${info.name}/`;

    // 元信息
    const uploadTime = data.urls && data.urls.length > 0 ? data.urls[0].upload_time.slice(0, 10) : (info.home_page ? '' : '');
    let meta = '';
    meta += `<div class="pypi-meta-item"><span class="pypi-meta-label">${t('pypi.version')}</span><span class="pypi-meta-value">${escapeHtml(info.version)}</span></div>`;
    if (info.author) meta += `<div class="pypi-meta-item"><span class="pypi-meta-label">${t('pypi.author')}</span><span class="pypi-meta-value">${escapeHtml(info.author)}</span></div>`;
    if (info.license) meta += `<div class="pypi-meta-item"><span class="pypi-meta-label">${t('pypi.license')}</span><span class="pypi-meta-value">${escapeHtml(info.license.split('\n')[0].slice(0, 30))}</span></div>`;
    if (uploadTime) meta += `<div class="pypi-meta-item"><span class="pypi-meta-label">${t('pypi.updated')}</span><span class="pypi-meta-value">${uploadTime}</span></div>`;
    if (info.home_page) meta += `<div class="pypi-meta-item"><span class="pypi-meta-label">${t('pypi.homepage')}</span><span class="pypi-meta-value"><a href="${escapeHtml(info.home_page)}" target="_blank">${escapeHtml(info.home_page.replace(/^https?:\/\//, '').slice(0, 30))}</a></span></div>`;
    if (info.project_urls && info.project_urls.Source) meta += `<div class="pypi-meta-item"><span class="pypi-meta-label">Source</span><span class="pypi-meta-value"><a href="${escapeHtml(info.project_urls.Source)}" target="_blank">GitHub</a></span></div>`;
    document.getElementById('pypi-detail-meta').innerHTML = meta;

    // README / 描述
    const readme = info.description || '';
    const readmeEl = document.getElementById('pypi-detail-readme');
    if (readme && readme !== 'UNKNOWN') {
      // 截取前 3000 字符避免过长
      readmeEl.textContent = readme.slice(0, 3000) + (readme.length > 3000 ? '\n\n... (内容过长已截断，请在 PyPI 网站查看完整内容)' : '');
    } else {
      readmeEl.textContent = currentLang === 'zh' ? '该包没有提供详细描述' : 'No description provided';
    }
  } catch (err) {
    detailEl.style.display = 'none';
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = `<div class="empty-state"><div class="empty-state-text">${escapeHtml(err.message)}</div></div>`;
  }
}

/** 关闭详情，返回搜索结果 */
function closePypiDetail() {
  document.getElementById('pypi-detail').style.display = 'none';
  document.getElementById('pypi-results').style.display = 'block';
  currentPypiPackage = null;
}

/** 一键安装当前查看的包 */
async function installFromPypi() {
  if (!currentPypiPackage) return;
  const btn = document.getElementById('btn-pypi-install');
  btn.classList.add('loading');
  showToast(t('pypi.installing'), 'info');

  try {
    const operationId = generateOperationId();
    await api.installPackages([currentPypiPackage], { parallel: false, retry: true, rollback: false, operationId });
    showToast(`${t('pypi.installed')}: ${currentPypiPackage}`, 'ok');
    sendDesktopNotification(`${t('pypi.installed')}: ${currentPypiPackage}`, currentLang === 'zh' ? '安装完成' : 'Install Done');
  } catch (err) {
    showToast(currentLang === 'zh' ? `安装失败: ${err.message}` : `Install failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
  }
  // 后台刷新，不阻塞按钮状态
  refreshAll().catch(() => {});
}
