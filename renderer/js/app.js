// ============ App：事件绑定与启动初始化 ============
//
// 模块职责：
// - 渲染进程的入口文件
// - 将各模块（core / render / progress / operations / pages）与 DOM 事件连接
// - 启动时加载数据并初始化界面
//
// 依赖模块：
// - core.js: 全局状态和工具函数
// - render.js: 表格渲染函数
// - progress.js: 进度条 UI
// - operations.js: 安装/卸载/更新操作
// - pages.js: 配置页面交互
// - i18n.js: 国际化字典

// ---- 侧边栏导航 ----
// 点击侧边栏项切换页面
document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + item.dataset.page).classList.add('active');
    // 切换到更新库时加载定时调度器状态
    if (item.dataset.page === 'update') loadSchedulerStatus();
  });
});

// ---- 安装页：版本模式下拉 ----
// 切换版本模式时显示/隐藏版本号输入框
document.getElementById('install-version-mode').addEventListener('change', function() {
  document.getElementById('version-input-group').style.display = this.value === 'latest' ? 'none' : 'block';
});

// ---- 设置页：主题 / 语言切换 ----
// 主题切换（浅色/深色/跟随系统）
document.querySelectorAll('#theme-options .theme-opt').forEach(el => {
  el.addEventListener('click', async () => {
    const theme = el.dataset.theme;
    document.querySelectorAll('#theme-options .theme-opt').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    api.setConfig('theme', theme);

    let effective = theme;
    if (theme === 'system') {
      effective = await api.getSystemTheme();
    }
    document.body.classList.toggle('dark', effective === 'dark');
  });
});

// 语言切换（中文/英文）
document.querySelectorAll('#lang-options .theme-opt').forEach(el => {
  el.addEventListener('click', () => {
    currentLang = el.dataset.lang;
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('#lang-options .theme-opt').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    api.setConfig('language', currentLang);
    applyLanguage();
  });
});

// ---- 实时筛选 / 设置项绑定 ----
// 卸载页搜索框实时过滤
document.getElementById('uninstall-search').addEventListener('input', function() {
  renderUninstallTable(this.value);
});
// 查询页搜索/筛选/排序变化时重新渲染
document.getElementById('query-search').addEventListener('input', renderQueryTable);
document.getElementById('query-status-filter').addEventListener('change', renderQueryTable);
document.getElementById('query-sort').addEventListener('change', renderQueryTable);
// 日志页筛选和搜索
document.getElementById('log-type-filter').addEventListener('change', renderLogs);
document.getElementById('log-search').addEventListener('input', renderLogs);
// 设置页线程数和重试次数变更时保存到配置
document.getElementById('setting-threads').addEventListener('change', e => api.setConfig('parallelThreads', parseInt(e.target.value, 10)));
document.getElementById('setting-retry').addEventListener('change', e => api.setConfig('retryCount', parseInt(e.target.value, 10)));

// ---- 全局进度事件与应用更新事件 ----
// 绑定主进程推送的 pip 操作进度事件
api.onProgress(updateProgressFromOutput);
// 绑定应用自动更新事件
bindUpdaterEvents();
// 绑定 Python 一键安装进度事件并初始化版本下拉
bindPythonInstallEvents();

// ---- 主题跟随系统监听 ----
api.onThemeChanged(async (theme) => {
  document.body.classList.toggle('dark', theme === 'dark');
});

// ---- 启动时检查更新监听 ----
api.onUpdatesAvailable((count) => {
  if (count > 0) {
    showToast(currentLang === 'zh' ? `${count} 个库有可用更新` : `${count} updates available`, 'info');
  }
});

// ---- 定时更新调度器执行结果监听 ----
api.onSchedulerExecuted((msg) => {
  showToast(msg || t('scheduler.done'), 'info');
  refreshLogs().then(() => renderLogs()).catch(() => {});
});

// ---- 快捷键系统 ----
document.addEventListener('keydown', (e) => {
  // Ctrl+F: 聚焦当前页面搜索框
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    const activePage = document.querySelector('.page.active');
    if (activePage) {
      const input = activePage.querySelector('.search-input, input[type="text"]');
      if (input) input.focus();
    }
  }
  // Ctrl+1~9: 切换页面
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const items = document.querySelectorAll('.sidebar-item');
    const idx = parseInt(e.key) - 1;
    if (items[idx]) items[idx].click();
  }
  // Esc: 关闭弹窗
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
  }
});

// ---- 启动初始化（异步自执行函数） ----
// 启动流程分为多个阶段，优先显示缓存数据，后台异步加载完整数据
(async function init() {
  try {
    await loadConfig();
  } catch (err) {
    console.error('loadConfig failed', err);
  }
  applyLanguage();  // 应用国际化
  updateStatusbar(); // 更新状态栏

  // Phase 1: 快速加载（配置、环境、镜像、缓存库）并行执行
  const [envResult, mirrorResult, cachedLibs] = await Promise.allSettled([
    (async () => {
      await refreshEnvs();
      renderEnvs();
      updateStatusbar();
    })(),
    (async () => {
      await refreshMirrors();
      renderMirrors();
    })(),
    api.listInstalledCached()
  ]);

  // 立即显示缓存的已安装库列表（快速响应）
  if (cachedLibs.status === 'fulfilled') {
    installedLibs = cachedLibs.value;
    renderUninstallTable();
    renderQueryTable();
    renderStats();
  }

  // Phase 2: 后台刷新已安装库完整列表（实时扫描 site-packages）
  const refreshInstalledPromise = (async () => {
    try {
      await refreshInstalled();
      renderUninstallTable();
      renderQueryTable();
      renderStats();
    } catch (err) {
      console.error('refreshInstalled failed', err);
    }
  })();

  // Phase 3: 懒加载可更新库列表（不阻塞启动）
  const refreshOutdatedPromise = (async () => {
    try {
      await refreshOutdated();
      renderUpdateTable();
      renderStats();
    } catch (err) {
      console.error('refreshOutdated failed', err);
    }
  })();

  // 低优先级：加载日志和应用版本
  try {
    await refreshLogs();
  } catch (err) {
    console.error('refreshLogs failed', err);
    logData = [];
  }
  renderLogs();
  renderStatsDashboard(); // 渲染操作统计

  try {
    const appVer = await api.getAppVersion();
    document.querySelector('.about-ver').textContent = 'v' + appVer.version;
  } catch (err) {
    console.error('getAppVersion failed', err);
  }

  // 渲染环境对比下拉选项
  renderCompareOptions();

  // 初始化工具箱页面
  initTools();

  // 等待后台任务完成（不阻塞 UI）
  await Promise.allSettled([refreshInstalledPromise, refreshOutdatedPromise]);
})();
