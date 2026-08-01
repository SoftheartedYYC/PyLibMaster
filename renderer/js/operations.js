// ============ Operations：安装 / 卸载 / 更新操作 ============
//
// 模块职责：
// - 三大核心操作（安装/卸载/更新）的执行逻辑
// - 操作取消支持
// - 拖拽安装区事件处理
// - 数据刷新函数（刷新已安装/可更新/日志/环境/镜像等数据）
// - 全局刷新和当前页面刷新
//
// 依赖全局状态：
// - progressOperation, progressTotal, progressDone: 进度状态
// - currentOperationId: 当前操作 ID
// - selectedForUninstall, selectedForUpdate: 勾选状态

/**
 * 取消当前正在进行的操作
 * - 通过 operationId 向主进程发送取消请求
 * - 主进程会终止关联的子进程
 */
async function cancelCurrentOperation() {
  if (!currentOperationId) {
    showToast(currentLang === 'zh' ? '当前没有可取消的操作' : 'No operation to cancel', 'warn');
    return;
  }
  try {
    await api.cancelPipOperation(currentOperationId);
    showToast(currentLang === 'zh' ? '已发送取消请求' : 'Cancel requested', 'info');
  } catch (err) {
    showToast(currentLang === 'zh' ? `取消失败: ${err.message}` : `Cancel failed: ${err.message}`, 'err');
  }
}

// ---- 卸载操作 ----

/**
 * 单个库卸载（弹出备份确认对话框）
 * @param {string} name - 包名
 */
function singleUninstall(name) {
  pendingUninstall = { names: [name], mode: 'single' };
  if (document.getElementById('uninstall-backup').checked) {
    document.getElementById('backup-modal').classList.add('show');
  } else {
    doUninstall([name], false);
  }
}

/**
 * 批量卸载（从勾选列表中卸载）
 * - 如果勾选了备份选项，先弹出备份确认对话框
 */
function batchUninstall() {
  const names = getSelectedPackageNames();
  if (names.length === 0) return;
  pendingUninstall = { names, mode: 'batch' };
  if (document.getElementById('uninstall-backup').checked) {
    document.getElementById('backup-modal').classList.add('show');
  } else {
    doUninstall(names, false);
  }
}

/** 确认备份后卸载 */
function confirmBackup() {
  closeModal('backup-modal');
  if (pendingUninstall) doUninstall(pendingUninstall.names, true);
}

/** 跳过备份直接卸载 */
function forceUninstall() {
  closeModal('backup-modal');
  if (pendingUninstall) doUninstall(pendingUninstall.names, false);
}

/**
 * 执行卸载操作（内部函数）
 * @param {string[]} names - 包名列表
 * @param {boolean} withBackup - 是否先创建备份
 */
async function doUninstall(names, withBackup) {
  const btn = document.getElementById('btn-batch-uninstall');
  btn.classList.add('loading');
  progressOperation = 'uninstall';
  progressTotal = names.length;
  progressDone = 0;
  const operationId = generateOperationId();
  currentOperationId = operationId;

  try {
    await api.uninstallPackages(names, {
      backup: withBackup,
      rollback: document.getElementById('uninstall-rollback').checked,
      operationId
    });

    await refreshAll();
    document.getElementById('select-all').checked = false;
    selectedForUninstall.clear();
    finishProgress(true);
    showToast(currentLang === 'zh'
      ? `已卸载 ${names.length} 个库${withBackup ? '（含备份）' : ''}`
      : `Uninstalled ${names.length} package(s)${withBackup ? ' (with backup)' : ''}`, 'ok');
    sendDesktopNotification(currentLang === 'zh' ? `已卸载 ${names.length} 个库` : `Uninstalled ${names.length} package(s)`);
  } catch (err) {
    finishProgress(false);
    showToast(currentLang === 'zh' ? `卸载失败: ${err.message}` : `Uninstall failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    pendingUninstall = null;
    progressOperation = null;
    currentOperationId = null;
  }
}

// ---- 更新操作 ----

/**
 * 获取更新选项（从 DOM 中读取勾选状态）
 * @returns {Object} { parallel, retry, rollback }
 */
function getUpdateOptions() {
  return {
    parallel: document.getElementById('opt-update-parallel').checked,
    retry: document.getElementById('opt-update-retry').checked,
    rollback: document.getElementById('opt-update-rollback').checked
  };
}

/**
 * 更新单个库
 * @param {string} name - 包名
 * @param {HTMLElement} btn - 触发按钮（用于加载状态）
 */
async function updateOne(name, btn) {
  btn.classList.add('loading');
  progressOperation = 'update';
  progressTotal = 1;
  progressDone = 0;
  const operationId = generateOperationId();
  currentOperationId = operationId;

  const progressEl = document.getElementById('update-progress');
  progressEl.style.display = 'block';
  resetProgress(1);
  document.getElementById('update-progress-name').textContent = name;

  try {
    const options = getUpdateOptions();
    options.operationId = operationId;
    await api.updatePackages([name], options);
    await refreshAll();
    selectedForUpdate.delete(name);
    finishProgress(true);
    showToast(currentLang === 'zh' ? `${name} 已更新` : `${name} updated`, 'ok');
  } catch (err) {
    finishProgress(false);
    showToast(currentLang === 'zh' ? `更新失败: ${err.message}` : `Update failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    progressOperation = null;
    currentOperationId = null;
  }
}

/**
 * 全部更新（更新所有勾选的库）
 * - 如果没有勾选，默认更新所有可更新的库
 * - 显示成功/失败计数
 */
async function updateAll() {
  if (selectedForUpdate.size === 0) {
    updateLibs.forEach(lib => selectedForUpdate.add(lib.name));
  }
  if (selectedForUpdate.size === 0) {
    showToast(currentLang === 'zh' ? '暂无可更新的库' : 'No packages to update', 'warn');
    return;
  }
  const btn = document.getElementById('btn-update-all');
  btn.classList.add('loading');
  progressOperation = 'update';
  const names = Array.from(selectedForUpdate);
  progressTotal = names.length;
  progressDone = 0;
  const options = getUpdateOptions();
  const operationId = generateOperationId();
  options.operationId = operationId;
  currentOperationId = operationId;

  const progressEl = document.getElementById('update-progress');
  progressEl.style.display = 'block';
  resetProgress(names.length);

  try {
    const result = await api.updatePackages(names, options);
    await refreshAll();
    selectedForUpdate.clear();
    const failedCount = result && result.failed ? result.failed.length : 0;
    const successCount = result && result.updated ? result.updated.length : 0;
    if (failedCount > 0) {
      finishProgress(false);
      showToast(currentLang === 'zh'
        ? `更新完成：${successCount} 个成功，${failedCount} 个失败`
        : `Update done: ${successCount} succeeded, ${failedCount} failed`, 'warn');
    } else {
      finishProgress(true);
      showToast(currentLang === 'zh' ? `已更新 ${successCount} 个库` : `Updated ${successCount} packages`, 'ok');
    }
    sendDesktopNotification(currentLang === 'zh' ? `更新完成：${successCount} 成功，${failedCount} 失败` : `Update done: ${successCount} ok, ${failedCount} failed`);
  } catch (err) {
    finishProgress(false);
    showToast(currentLang === 'zh' ? `更新失败: ${err.message}` : `Update failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    progressOperation = null;
    currentOperationId = null;
  }
}

/**
 * 检查更新（从 PyPI 拉取最新可更新列表）
 */
async function checkUpdates() {
  const btn = document.getElementById('btn-check-update');
  btn.classList.add('loading');
  try {
    updateLibs = await api.listOutdated();
    renderUpdateTable();
    renderQueryTable();
    renderStats();
    showToast(currentLang === 'zh' ? `检查完成，${updateLibs.length} 个库有更新` : `Check complete, ${updateLibs.length} updates available`, 'info');
  } catch (err) {
    showToast(currentLang === 'zh' ? `检查更新失败: ${err.message}` : `Check updates failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
  }
}

// ---- 安装操作 ----

/**
 * 重置拖拽安装区的显示状态
 */
function resetDropzone() {
  dropzone.querySelector('.dropzone-text').textContent = t('install.drop');
  dropzone.querySelector('.dropzone-sub').style.display = 'block';
}

/**
 * 从选中的文件安装（.whl 或 requirements.txt）
 * @param {string} filePath - 文件路径
 * @param {string} name - 文件名
 */
async function installFromSelectedFile(filePath, name) {
  const btn = document.getElementById('btn-do-install');
  const progressEl = document.getElementById('install-progress');

  const ext = (name || filePath).split('.').pop().toLowerCase();
  if (!['txt', 'whl'].includes(ext)) {
    showToast(currentLang === 'zh' ? '仅支持 .txt 或 .whl 文件' : 'Only .txt or .whl files are supported', 'err');
    return;
  }

  btn.classList.add('loading');
  progressEl.style.display = 'block';

  progressOperation = 'install';
  progressTotal = 1;
  progressDone = 0;
  const operationId = generateOperationId();
  currentOperationId = operationId;
  resetProgress(1);

  try {
    const retry = document.getElementById('opt-retry').checked;
    const rollback = document.getElementById('opt-rollback').checked;
    await api.installFromFile(filePath, { retry, rollback, operationId });

    await refreshAll();

    todayInstalled += 1;
    finishProgress(true);
    showToast(currentLang === 'zh' ? `已安装 ${name}` : `Installed ${name}`, 'ok');
    document.getElementById('install-search').value = '';
    resetDropzone();
  } catch (err) {
    finishProgress(false);
    showToast(currentLang === 'zh' ? `安装失败: ${err.message}` : `Install failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    progressOperation = null;
    currentOperationId = null;
  }
}

/**
 * 开始安装（从搜索框输入）
 * - 支持空格/逗号分隔的多个包名
 * - 支持直接粘贴 pip install 命令
 * - 支持直接粘贴文件路径（.whl/.txt）
 */
async function startInstall() {
  const input = document.getElementById('install-search');
  const btn = document.getElementById('btn-do-install');
  const query = input.value.trim();

  if (/\.(txt|whl)$/i.test(query) && /[\\/]/.test(query)) {
    return installFromSelectedFile(query, query.replace(/^.*[\\/]/, ''));
  }

  let libs;
  if (query) {
    libs = query.replace(/^pip\s+install\s+/i, '').split(/[\s,]+/).filter(Boolean).slice(0, 16);
  }
  if (!libs || libs.length === 0) {
    showToast(currentLang === 'zh' ? '请输入要安装库的名称' : 'Please enter package name(s)', 'err');
    return;
  }

  btn.classList.add('loading');
  const progressEl = document.getElementById('install-progress');
  progressEl.style.display = 'block';

  const versionMode = document.getElementById('install-version-mode').value;
  const versionNum = document.getElementById('install-version-num').value;
  const parallel = document.getElementById('opt-parallel').checked;
  const retry = document.getElementById('opt-retry').checked;
  const rollback = document.getElementById('opt-rollback').checked;
  const operationId = generateOperationId();
  currentOperationId = operationId;

  progressOperation = 'install';
  progressTotal = libs.length;
  progressDone = 0;
  resetProgress(libs.length);

  try {
    const result = await api.installPackages(libs, {
      versionMode,
      version: versionNum,
      parallel,
      retry,
      rollback,
      operationId
    });

    await refreshAll();

    const installedCount = result && result.installed ? result.installed.length : 0;
    const failedCount = result && result.failed ? result.failed.length : 0;
    todayInstalled += installedCount;
    if (failedCount > 0) {
      finishProgress(false);
      showToast(currentLang === 'zh'
        ? `安装完成：${installedCount} 个成功，${failedCount} 个失败`
        : `Install done: ${installedCount} succeeded, ${failedCount} failed`, 'err');
    } else {
      finishProgress(true);
      showToast(currentLang === 'zh' ? `成功安装 ${installedCount} 个库` : `Installed ${installedCount} package(s)`, 'ok');
    }
    sendDesktopNotification(currentLang === 'zh' ? `安装完成：${installedCount} 成功，${failedCount} 失败` : `Install done: ${installedCount} ok, ${failedCount} failed`);
    input.value = '';
  } catch (err) {
    finishProgress(false);
    showToast(currentLang === 'zh' ? `安装失败: ${err.message}` : `Install failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    progressOperation = null;
    currentOperationId = null;
  }
}

// ---- 拖拽安装区 ----
// 支持拖拽 .txt/.whl 文件安装，或点击选择文件
const dropzone = document.getElementById('dropzone');
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', async e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    dropzone.querySelector('.dropzone-sub').style.display = 'none';
    dropzone.querySelector('.dropzone-text').textContent = (currentLang === 'zh' ? '已选择: ' : 'Selected: ') + file.name;
    await installFromSelectedFile(file.path || file.name, file.name);
  }
});
dropzone.addEventListener('click', async () => {
  const filePath = await api.browseFile([
    { name: 'Requirements', extensions: ['txt'] },
    { name: 'Wheel', extensions: ['whl'] }
  ]);
  if (filePath) {
    const name = filePath.replace(/^.*[\\/]/, '');
    dropzone.querySelector('.dropzone-sub').style.display = 'none';
    dropzone.querySelector('.dropzone-text').textContent = (currentLang === 'zh' ? '已选择: ' : 'Selected: ') + name;
    await installFromSelectedFile(filePath, name);
  }
});

// ---- 数据刷新函数 ----
// 各页面数据的获取和刷新，被 app.js 和 pages.js 调用

/** 刷新已安装包列表（实时扫描） */
async function refreshInstalled() {
  installedLibs = await api.listInstalled();
}

/** 刷新可更新包列表 */
async function refreshOutdated() {
  try {
    updateLibs = await api.listOutdated();
  } catch (err) {
    updateLibs = [];
  }
}

/** 刷新操作日志 */
async function refreshLogs() {
  logData = await api.getLogs({});
}

/** 刷新 Python 环境列表（同时刷新 venv 列表和基础 Python 下拉选项） */
async function refreshEnvs() {
  envs = await api.detectEnvironments();
  const current = await api.getCurrentEnv();
  currentEnvIndex = envs.findIndex(e => e.path === current?.path);
  if (currentEnvIndex < 0 && envs.length > 0) currentEnvIndex = 0;
  // 同步刷新虚拟环境列表和创建表单的基础 Python 下拉选项
  renderVenvBaseOptions();
  renderCompareOptions();
  await refreshVenvs();
}

/** 刷新镜像源列表 */
async function refreshMirrors() {
  mirrors = await api.getMirrors();
  const smart = await api.getSmartRoute();
  document.getElementById('toggle-smart-route').checked = smart;
}

/**
 * 全局刷新（操作后调用）
 * - 同时刷新已安装和可更新列表
 * - 重新渲染所有相关页面和状态栏
 */
async function refreshAll() {
  try {
    // 同时刷新已安装列表与可更新列表，保证操作后全局数据一致
    await Promise.all([refreshInstalled(), refreshOutdated()]);
    renderUninstallTable(document.getElementById('uninstall-search').value);
    renderUpdateTable();
    renderQueryTable();
    renderStats();
    updateStatusbar();
    // 刷新撤销按钮状态
    if (typeof refreshUndoButton === 'function') refreshUndoButton();
  } catch (err) {
    console.error('refreshAll failed', err);
  }
}

/** refreshAllData 别名（供 tools.js 等模块调用） */
function refreshAllData() { return refreshAll(); }

/**
 * 刷新当前页面（标题栏刷新按钮触发）
 * - 根据当前活动页面执行对应的刷新逻辑
 */
async function refreshCurrentPage() {
  const btn = document.getElementById('btn-global-refresh');
  if (btn.classList.contains('loading')) return;
  btn.classList.add('loading');

  try {
    const pageId = document.querySelector('.page.active').id.replace('page-', '');
    switch (pageId) {
      case 'install':
        await refreshInstalled();
        renderStats();
        updateStatusbar();
        break;
      case 'uninstall':
        await refreshInstalled();
        renderUninstallTable(document.getElementById('uninstall-search').value);
        renderStats();
        updateStatusbar();
        break;
      case 'update':
        await checkUpdates();
        updateStatusbar();
        break;
      case 'query':
        await refreshInstalled();
        renderQueryTable();
        renderStats();
        updateStatusbar();
        break;
      case 'mirror':
        await refreshMirrors();
        renderMirrors();
        break;
      case 'env':
        await refreshEnvs();
        renderEnvs();
        updateStatusbar();
        break;
      case 'logs':
        await refreshLogs();
        renderLogs();
        break;
      case 'dashboard':
        await refreshLogs();
        await refreshInstalled();
        await refreshMirrors();
        renderStats();
        renderStatsDashboard();
        loadCachedAudit();
        break;
      case 'templates':
        await loadTemplatesPage();
        break;
      case 'settings':
        await loadConfig();
        break;
      case 'about':
        const appVer = await api.getAppVersion();
        document.querySelector('.about-ver').textContent = 'v' + appVer.version;
        break;
    }
    showToast(currentLang === 'zh' ? '刷新完成' : 'Refreshed', 'ok');
  } catch (err) {
    showToast(currentLang === 'zh' ? `刷新失败: ${err.message}` : `Refresh failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
  }
}
