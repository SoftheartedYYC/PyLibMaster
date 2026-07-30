// ============ i18n ============
const i18n = {
  zh: {
    'nav.core': '核心操作', 'nav.install': '安装库', 'nav.uninstall': '卸载库', 'nav.update': '更新库', 'nav.query': '查询库',
    'nav.config': '配置管理', 'nav.mirror': '镜像源', 'nav.env': '环境选择', 'nav.logs': '操作日志',
    'nav.system': '系统', 'nav.settings': '设置', 'nav.about': '关于',
    'install.title': '安装库', 'install.desc': '搜索、安装 Python 库，支持拖拽批量安装',
    'install.search': '输入需要安装库的名称，多个库以空格间隔开',
    'install.drop': '拖拽 requirements.txt 或 .whl 文件到此处', 'install.dropSub': '或点击选择文件',
    'install.options': '安装选项', 'install.version': '版本控制', 'install.latest': '最新版本', 'install.specific': '指定版本', 'install.range': '版本范围',
    'install.versionNum': '指定版本号', 'install.versionHint': '例如: 1.26.4',
    'install.parallel': '并行安装 (多线程)', 'install.retry': '智能重试', 'install.rollback': '安装失败自动回滚',
    'install.progress': '安装进度', 'install.running': '运行中',
    'uninstall.title': '卸载库', 'uninstall.desc': '安全地卸载不需要的 Python 库',
    'uninstall.search': '搜索已安装的库...',
    'uninstall.options': '卸载选项', 'uninstall.safe': '安全模式 (仅卸载指定库)',
    'uninstall.backup': '卸载前创建备份', 'uninstall.rollback': '卸载失败自动回滚',
    'update.title': '更新库', 'update.desc': '检查并安装可用的库更新',
    'update.options': '更新选项', 'update.parallel': '并行更新 (多线程)', 'update.retry': '智能重试', 'update.compare': '显示更新前后版本对比', 'update.rollback': '更新失败自动回滚',
    'update.allLatest': '所有库都是最新版本', 'update.allLatestSub': '没有可用的更新',
    'update.search': '搜索库名称...',
    'update.progress': '更新进度',
    'query.title': '查询库', 'query.desc': '按多种条件筛选和搜索已安装的库',
    'query.search': '搜索库名称...', 'query.allVersions': '所有状态', 'query.installed': '已安装', 'query.hasUpdate': '有更新',
    'query.timeDesc': '安装时间 (新→旧)', 'query.timeAsc': '安装时间 (旧→新)', 'query.nameAsc': '名称 (A→Z)', 'query.sizeDesc': '大小 (大→小)',
    'mirror.title': '镜像源管理', 'mirror.desc': '管理 PyPI 镜像源，自动选择最优线路',
    'mirror.list': '镜像源列表', 'mirror.smartRoute': '智能路由', 'mirror.smartRouteDesc': '根据网络状况自动选择最优镜像源',
    'mirror.custom': '自定义镜像源', 'mirror.customHint': '输入镜像源地址，例如: https://pypi.tuna.tsinghua.edu.cn/simple/', 'mirror.remarkHint': '备注（可选）', 'mirror.name': '名称',
    'env.title': '环境选择', 'env.desc': '选择要操作的 Python 环境',
    'env.pythonEnv': 'Python 环境', 'env.storagePath': '默认存储路径', 'env.storageDesc': '路径默认保存在文档文件夹中的Python库安装里面',
    'logs.title': '操作日志', 'logs.desc': '查看所有安装、卸载和更新操作的记录',
    'logs.allTypes': '全部类型', 'logs.install': '安装', 'logs.uninstall': '卸载', 'logs.update': '更新',
    'logs.search': '搜索日志...', 'logs.empty': '暂无日志', 'logs.emptySub': '执行操作后会在这里显示记录',
    'settings.title': '设置', 'settings.desc': '自定义 PyLibMaster 的外观和行为',
    'settings.appearance': '外观', 'settings.theme': '主题', 'settings.themeDesc': '切换浅色或深色主题',
    'settings.language': '多语言支持', 'settings.languageDesc': '选择界面显示语言',
    'settings.storage': '存储', 'settings.path': '库安装路径', 'settings.pathDesc': '路径默认保存在文档文件夹中的Python库安装里面',
    'settings.advanced': '高级', 'settings.threads': '并行安装线程数', 'settings.threadsDesc': '多线程并行安装多个库，大幅提升效率',
    'settings.retry': '智能重试次数', 'settings.retryDesc': '如果这个镜像源无法安装就换一个镜像源再安装',
    'settings.mirrors': '镜像源', 'settings.restoreMirrors': '恢复默认镜像源', 'settings.restoreMirrorsDesc': '清除所有自定义镜像源，恢复为内置镜像源',
    'theme.light': '浅色', 'theme.dark': '深色',
    'stat.installed': '已安装', 'stat.updates': '有更新', 'stat.today': '今日安装', 'stat.mirrors': '镜像源',
    'col.name': '库名称', 'col.version': '版本', 'col.installed': '安装时间', 'col.size': '大小', 'col.status': '状态', 'col.action': '操作',
    'col.current': '当前版本', 'col.latest': '最新版本', 'col.date': '发布日期', 'col.source': '来源',
    'btn.install': '安装', 'btn.batchUninstall': '批量卸载', 'btn.updateAll': '全部更新', 'btn.checkUpdate': '检查更新', 'btn.installUpdate': '立即安装',
    'btn.testSpeed': '全部测速', 'btn.add': '添加', 'btn.browse': '浏览...', 'btn.clearLogs': '清空日志',
    'btn.cancel': '取消', 'btn.confirmBackup': '确认备份并卸载', 'btn.skipBackup': '跳过备份',
    'btn.uninstall': '卸载', 'btn.update': '更新', 'btn.setDefault': '设为默认', 'btn.default': '默认',
    'btn.edit': '编辑', 'btn.save': '保存', 'btn.restore': '恢复默认', 'btn.delete': '删除',
    'modal.title': '创建卸载备份', 'modal.text': '是否要在卸载前创建备份？如果卸载导致问题，可以从备份恢复。',
    'tag.installed': '已安装', 'tag.hasUpdate': '有更新', 'tag.latest': '最新', 'tag.success': '成功', 'tag.failed': '失败',
    'empty.title': '没有匹配的库', 'empty.sub': '尝试调整搜索条件',
    'about.author': '作者', 'about.contact': '联系方式',
    'update.checking': '正在检查更新...',
    'update.available': '发现新版本 {version}，正在下载...',
    'update.notAvailable': '当前已是最新版本',
    'update.downloading': '正在下载更新... {percent}%',
    'update.downloaded': '新版本 {version} 已下载，点击立即安装',
    'update.error': '检查更新失败',
    'update.errorPrefix': '检查更新失败: ',
  },
  en: {
    'nav.core': 'Core', 'nav.install': 'Install', 'nav.uninstall': 'Uninstall', 'nav.update': 'Update', 'nav.query': 'Search',
    'nav.config': 'Config', 'nav.mirror': 'Mirrors', 'nav.env': 'Environments', 'nav.logs': 'Logs',
    'nav.system': 'System', 'nav.settings': 'Settings', 'nav.about': 'About',
    'install.title': 'Install Packages', 'install.desc': 'Search and install Python packages, drag & drop supported',
    'install.search': 'Enter package name(s) to install, separate multiple packages with spaces',
    'install.drop': 'Drag requirements.txt or .whl files here', 'install.dropSub': 'or click to browse',
    'install.options': 'Install Options', 'install.version': 'Version Control', 'install.latest': 'Latest', 'install.specific': 'Specific', 'install.range': 'Range',
    'install.versionNum': 'Version Number', 'install.versionHint': 'e.g. 1.26.4',
    'install.parallel': 'Parallel install (multi-thread)', 'install.retry': 'Smart retry', 'install.rollback': 'Auto rollback on failure',
    'install.progress': 'Install Progress', 'install.running': 'Running',
    'uninstall.title': 'Uninstall Packages', 'uninstall.desc': 'Safely remove unwanted Python packages',
    'uninstall.search': 'Search installed packages...',
    'uninstall.options': 'Uninstall Options', 'uninstall.safe': 'Safe mode (target only)',
    'uninstall.backup': 'Backup before uninstall', 'uninstall.rollback': 'Auto rollback on failure',
    'update.title': 'Update Packages', 'update.desc': 'Check and install available updates',
    'update.options': 'Update Options', 'update.parallel': 'Parallel update (multi-thread)', 'update.retry': 'Smart retry', 'update.compare': 'Show version comparison', 'update.rollback': 'Auto rollback on failure',
    'update.allLatest': 'All packages up to date', 'update.allLatestSub': 'No updates available',
    'update.search': 'Search packages...',
    'update.progress': 'Update Progress',
    'query.title': 'Search Packages', 'query.desc': 'Filter and search installed packages',
    'query.search': 'Search packages...', 'query.allVersions': 'All Status', 'query.installed': 'Installed', 'query.hasUpdate': 'Has Update',
    'query.timeDesc': 'Install date (new first)', 'query.timeAsc': 'Install date (old first)', 'query.nameAsc': 'Name (A-Z)', 'query.sizeDesc': 'Size (large first)',
    'mirror.title': 'Mirror Management', 'mirror.desc': 'Manage PyPI mirrors, auto-select optimal route',
    'mirror.list': 'Mirror List', 'mirror.smartRoute': 'Smart Routing', 'mirror.smartRouteDesc': 'Auto-select best mirror based on network',
    'mirror.custom': 'Custom Mirror', 'mirror.customHint': 'Enter mirror URL, e.g. https://pypi.tuna.tsinghua.edu.cn/simple/', 'mirror.remarkHint': 'Remark (optional)', 'mirror.name': 'Name',
    'env.title': 'Environment', 'env.desc': 'Select the Python environment to work with',
    'env.pythonEnv': 'Python Environments', 'env.storagePath': 'Default Storage Path', 'env.storageDesc': 'Default path saved in Documents/Python Libs',
    'logs.title': 'Operation Logs', 'logs.desc': 'View all install, uninstall and update records',
    'logs.allTypes': 'All Types', 'logs.install': 'Install', 'logs.uninstall': 'Uninstall', 'logs.update': 'Update',
    'logs.search': 'Search logs...', 'logs.empty': 'No logs yet', 'logs.emptySub': 'Records will appear here after operations',
    'settings.title': 'Settings', 'settings.desc': 'Customize PyLibMaster appearance and behavior',
    'settings.appearance': 'Appearance', 'settings.theme': 'Theme', 'settings.themeDesc': 'Switch between light and dark themes',
    'settings.language': 'Language', 'settings.languageDesc': 'Select interface language',
    'settings.storage': 'Storage', 'settings.path': 'Install Path', 'settings.pathDesc': 'Default path saved in Documents/Python Libs',
    'settings.advanced': 'Advanced', 'settings.threads': 'Parallel Threads', 'settings.threadsDesc': 'Multi-thread parallel install for better performance',
    'settings.retry': 'Smart Retry Count', 'settings.retryDesc': 'Auto-switch mirror when current one fails',
    'settings.mirrors': 'Mirrors', 'settings.restoreMirrors': 'Restore Default Mirrors', 'settings.restoreMirrorsDesc': 'Remove all custom mirrors and restore built-in ones',
    'theme.light': 'Light', 'theme.dark': 'Dark',
    'stat.installed': 'Installed', 'stat.updates': 'Updates', 'stat.today': 'Today', 'stat.mirrors': 'Mirrors',
    'col.name': 'Package', 'col.version': 'Version', 'col.installed': 'Installed', 'col.size': 'Size', 'col.status': 'Status', 'col.action': 'Action',
    'col.current': 'Current', 'col.latest': 'Latest', 'col.date': 'Date', 'col.source': 'Source',
    'btn.install': 'Install', 'btn.batchUninstall': 'Batch Uninstall', 'btn.updateAll': 'Update All', 'btn.checkUpdate': 'Check Updates', 'btn.installUpdate': 'Install Now',
    'btn.testSpeed': 'Test All', 'btn.add': 'Add', 'btn.browse': 'Browse...', 'btn.clearLogs': 'Clear Logs',
    'btn.cancel': 'Cancel', 'btn.confirmBackup': 'Backup & Uninstall', 'btn.skipBackup': 'Skip Backup',
    'btn.uninstall': 'Remove', 'btn.update': 'Update', 'btn.setDefault': 'Set Default', 'btn.default': 'Default',
    'btn.edit': 'Edit', 'btn.save': 'Save', 'btn.restore': 'Restore', 'btn.delete': 'Delete',
    'modal.title': 'Create Backup', 'modal.text': 'Create a backup before uninstalling? You can restore from backup if something goes wrong.',
    'tag.installed': 'Installed', 'tag.hasUpdate': 'Update', 'tag.latest': 'Latest', 'tag.success': 'Success', 'tag.failed': 'Failed',
    'empty.title': 'No matching packages', 'empty.sub': 'Try adjusting your search',
    'about.author': 'Author', 'about.contact': 'Contact',
    'update.checking': 'Checking for updates...',
    'update.available': 'New version {version} available, downloading...',
    'update.notAvailable': 'You are up to date',
    'update.downloading': 'Downloading update... {percent}%',
    'update.downloaded': 'New version {version} downloaded, click to install',
    'update.error': 'Update check failed',
    'update.errorPrefix': 'Update check failed: ',
  }
};

let currentLang = 'zh';
function t(key) { return i18n[currentLang][key] || key; }

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============ State ============
const api = window.electronAPI;
let installedLibs = [];
let updateLibs = [];
let mirrors = [];
let envs = [];
let currentEnvIndex = -1;
let logData = [];
let todayInstalled = 0;
let pendingUninstall = null; // {names: [], mode: 'single'|'batch'}
let editingMirrorIndex = -1;
let appConfig = {};
let progressOperation = null; // 'install' | 'uninstall' | 'update' | 'rollback'
let progressTotal = 0;
let progressDone = 0;
let currentOperationId = null;
let selectedForUninstall = new Set(); // 保存卸载页面勾选的库
let selectedForUpdate = new Set(); // 保存更新页面勾选的库

// ============ Toast ============
function showToast(msg, type = 'ok') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<div class="toast-dot"></div><span>' + msg + '</span>';
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function generateOperationId() {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

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

// ============ Navigation ============
document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + item.dataset.page).classList.add('active');
  });
});

// ============ Renderers ============
function toggleUninstallSelection(name) {
  if (selectedForUninstall.has(name)) {
    selectedForUninstall.delete(name);
  } else {
    selectedForUninstall.add(name);
  }
  updateSelectionInfo();
}

function renderUninstallTable(filter = '') {
  const tbody = document.getElementById('uninstall-tbody');
  const empty = document.getElementById('uninstall-empty');
  const kw = filter.toLowerCase();
  const list = installedLibs.filter(l => l.name.toLowerCase().includes(kw));
  empty.style.display = list.length === 0 ? 'block' : 'none';
  tbody.innerHTML = list.map((lib, idx) => {
    const isChecked = selectedForUninstall.has(lib.name) ? 'checked' : '';
    return `
    <tr>
      <td style="padding-left:20px;"><input type="checkbox" class="lib-check" data-name="${escapeHtml(lib.name)}" ${isChecked} onchange="toggleUninstallSelection('${escapeHtml(lib.name)}')"></td>
      <td><span class="lib-name">${escapeHtml(lib.name)}</span></td>
      <td><span class="version-badge">${lib.version}</span></td>
      <td>${lib.installed || '-'}</td>
      <td>${lib.sizeText || '-'}</td>
      <td><span class="tag tag-ok"><span class="tag-dot"></span>${t('tag.installed')}</span></td>
      <td><button class="btn btn-sm btn-danger" onclick="singleUninstall('${escapeHtml(lib.name)}')">${t('btn.uninstall')}</button></td>
    </tr>`;
  }).join('');
  updateSelectionInfo();
}

// ============ Update ============
function toggleUpdateSelectAll() {
  const checkbox = document.getElementById('update-select-all');
  const isChecked = checkbox.checked;
  const searchInput = document.getElementById('update-search');
  const kw = searchInput ? searchInput.value.toLowerCase() : '';
  
  const filtered = kw
    ? updateLibs.filter(lib => lib.name.toLowerCase().includes(kw))
    : updateLibs;
  
  if (isChecked) {
    filtered.forEach(lib => selectedForUpdate.add(lib.name));
  } else {
    filtered.forEach(lib => selectedForUpdate.delete(lib.name));
  }
  
  renderUpdateTable();
}

function toggleUpdateSelection(name) {
  if (selectedForUpdate.has(name)) {
    selectedForUpdate.delete(name);
  } else {
    selectedForUpdate.add(name);
  }
  updateUpdateSelectionInfo();
}

function updateUpdateSelectionInfo() {
  const info = document.getElementById('update-selection-info');
  const count = selectedForUpdate.size;
  info.textContent = count > 0 ? `已选择 ${count} 个库` : '';
}

function renderUpdateTable() {
  const tbody = document.getElementById('update-tbody');
  const empty = document.getElementById('update-empty');
  const searchInput = document.getElementById('update-search');
  const kw = searchInput ? searchInput.value.toLowerCase() : '';

  const filtered = kw
    ? updateLibs.filter(lib => lib.name.toLowerCase().includes(kw))
    : updateLibs;

  empty.style.display = filtered.length === 0 ? 'block' : 'none';
  document.getElementById('btn-update-all').disabled = updateLibs.length === 0;

  if (filtered.length === 0 && updateLibs.length > 0 && kw) {
    empty.querySelector('.empty-state-text').textContent = currentLang === 'zh' ? '没有匹配的库' : 'No matching packages';
    empty.querySelector('.empty-state-sub').textContent = currentLang === 'zh' ? '尝试其他关键词' : 'Try different keywords';
  } else {
    empty.querySelector('.empty-state-text').textContent = t('update.allLatest');
    empty.querySelector('.empty-state-sub').textContent = t('update.allLatestSub');
  }

  tbody.innerHTML = filtered.map(lib => {
    const isChecked = selectedForUpdate.has(lib.name) ? 'checked' : '';
    return `
    <tr>
      <td style="padding-left:20px;"><input type="checkbox" class="lib-check-update" data-name="${escapeHtml(lib.name)}" ${isChecked} onchange="toggleUpdateSelection('${escapeHtml(lib.name)}')"></td>
      <td><span class="lib-name">${escapeHtml(lib.name)}</span></td>
      <td><span class="version-badge">${lib.current}</span></td>
      <td><span class="version-badge new">${lib.latest}</span></td>
      <td>${lib.date || '-'}</td>
      <td><button class="btn btn-sm btn-primary" onclick="updateOne('${escapeHtml(lib.name)}', this)"><span class="spinner"></span>${t('btn.update')}</button></td>
    </tr>
  `}).join('');
  
  updateUpdateSelectionInfo();
}

function renderQueryTable() {
  const tbody = document.getElementById('query-tbody');
  const empty = document.getElementById('query-empty');
  const kw = document.getElementById('query-search').value.toLowerCase();
  const statusFilter = document.getElementById('query-status-filter').value;
  const sortMode = document.getElementById('query-sort').value;
  const updateNames = new Set(updateLibs.map(l => l.name));

  let list = installedLibs.filter(l => {
    if (!l.name.toLowerCase().includes(kw)) return false;
    const hasUpdate = updateNames.has(l.name);
    if (statusFilter === 'update' && !hasUpdate) return false;
    if (statusFilter === 'latest' && hasUpdate) return false;
    return true;
  });

  list.sort((a, b) => {
    switch (sortMode) {
      case 'time-asc': return (a.installed || '').localeCompare(b.installed || '');
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'size-desc': return (b.size || 0) - (a.size || 0);
      default: return (b.installed || '').localeCompare(a.installed || '');
    }
  });

  empty.style.display = list.length === 0 ? 'block' : 'none';
  tbody.innerHTML = list.map(lib => {
    const hasUpdate = updateNames.has(lib.name);
    return `
    <tr>
      <td><span class="lib-name">${escapeHtml(lib.name)}</span></td>
      <td><span class="version-badge">${lib.version}</span></td>
      <td>${lib.installed || '-'}</td>
      <td>${lib.sizeText || '-'}</td>
      <td>${lib.source || '-'}</td>
      <td><span class="tag ${hasUpdate ? 'tag-update' : 'tag-ok'}"><span class="tag-dot"></span>${hasUpdate ? t('tag.hasUpdate') : t('tag.latest')}</span></td>
    </tr>`;
  }).join('');
}

function renderMirrors() {
  const list = document.getElementById('mirror-list');
  list.innerHTML = mirrors.map((m, i) => {
    const speed = m.speed == null ? null : m.speed;
    const speedClass = speed == null ? '' : speed < 50 ? '' : speed < 100 ? 'slow' : 'very-slow';
    const speedText = speed == null ? '-' : (speed === 9999 ? '超时' : `${speed} ms`);
    const remarkHtml = m.remark ? `<div class="mirror-remark">${m.remark}</div>` : '';

    if (editingMirrorIndex === i) {
      return `
      <div class="mirror-item editing">
        <div class="mirror-edit-fields">
          <input type="text" id="mirror-edit-name-${i}" class="mirror-edit-input" value="${escapeHtml(m.name)}" placeholder="${t('mirror.name') || '名称'}">
          <input type="text" id="mirror-edit-url-${i}" class="mirror-edit-input" value="${escapeHtml(m.url)}" placeholder="https://...">
          <input type="text" id="mirror-edit-remark-${i}" class="mirror-edit-input" value="${escapeHtml(m.remark || '')}" placeholder="${t('mirror.remarkHint')}">
        </div>
        <div class="mirror-actions">
          <button class="btn btn-sm btn-primary" onclick="saveMirrorEdit(${i})">${t('btn.save')}</button>
          <button class="btn btn-sm btn-danger" onclick="removeMirror(${i})">${t('btn.delete')}</button>
          <button class="btn btn-sm" onclick="cancelMirrorEdit()">${t('btn.cancel')}</button>
        </div>
      </div>`;
    }

    return `
    <div class="mirror-item ${m.isDefault ? 'default' : ''}">
      <div>
        <div class="mirror-name">${m.name}<span class="default-badge">${t('btn.default')}</span></div>
        <div class="mirror-url">${m.url}</div>
        ${remarkHtml}
      </div>
      <div class="mirror-actions">
        <span class="mirror-speed ${speedClass}">${speedText}</span>
        ${m.isDefault ? '' : `<button class="btn btn-sm" onclick="setMirror(${i})">${t('btn.setDefault')}</button>`}
        <button class="btn btn-sm" onclick="editMirror(${i})">${t('btn.edit')}</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('stat-mirrors').textContent = mirrors.length;
}

function renderEnvs() {
  const list = document.getElementById('env-list');
  if (envs.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-text">未检测到 Python 环境</div><div class="empty-state-sub">请检查系统是否安装了 Python</div></div>`;
    return;
  }
  list.innerHTML = envs.map((e, i) => `
    <div class="env-card ${i === currentEnvIndex ? 'active-env' : ''}" onclick="selectEnv(${i})">
      <div>
        <div class="env-name">${e.name}</div>
        <div class="env-path">${e.path}</div>
      </div>
      <div class="env-ver">Python ${e.version || e.ver || '?'}</div>
    </div>
  `).join('');
}

function renderLogs() {
  const container = document.getElementById('log-entries');
  const empty = document.getElementById('logs-empty');
  const typeFilter = document.getElementById('log-type-filter').value;
  const kw = document.getElementById('log-search').value.toLowerCase();

  const list = logData.filter(l => {
    if (typeFilter !== 'all' && l.type !== typeFilter) return false;
    if (kw && !((l.action || '').toLowerCase().includes(kw) || (l.detail || '').toLowerCase().includes(kw))) return false;
    return true;
  });

  empty.style.display = list.length === 0 ? 'block' : 'none';
  container.style.display = list.length === 0 ? 'none' : 'block';
  container.innerHTML = list.map(l => {
    const ok = l.status === 'ok';
    return `
    <div class="log-entry">
      <div>
        <div class="log-action">${l.action}${l.detail ? ' <span style="color:var(--text-muted)">— ' + l.detail + '</span>' : ''}</div>
        <div class="log-time">${l.time}</div>
      </div>
      <div class="log-right">
        <span class="tag ${ok ? 'tag-ok' : 'tag-danger'}"><span class="tag-dot"></span>${ok ? t('tag.success') : t('tag.failed')}</span>
      </div>
    </div>`;
  }).join('');
}

function renderStats() {
  animateStat('stat-installed', installedLibs.length);
  animateStat('stat-updates', updateLibs.length);
  animateStat('stat-today', todayInstalled);
  updateStatusbar();
}

function animateStat(id, value) {
  const el = document.getElementById(id);
  const v = value == null ? 0 : value;
  if (el.textContent !== String(v)) {
    el.textContent = v;
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 300);
  }
}

function updateStatusbar() {
  const env = envs[currentEnvIndex];
  const hasEnv = Boolean(env);
  const ver = hasEnv ? (env.version || env.ver || '?') : '';
  const name = hasEnv
    ? env.name
    : (currentLang === 'zh' ? '未检测到 Python 版本' : 'No Python version detected');
  document.getElementById('sb-installed-text').innerHTML = currentLang === 'zh'
    ? `已安装 <strong>${installedLibs.length}</strong> 个库`
    : `<strong>${installedLibs.length}</strong> packages installed`;
  document.getElementById('sb-updates-text').innerHTML = currentLang === 'zh'
    ? `<strong>${updateLibs.length}</strong> 个有可用更新`
    : `<strong>${updateLibs.length}</strong> updates available`;
  document.getElementById('sb-python-ver').textContent = hasEnv ? ('Python ' + ver) : '';
  document.getElementById('sb-env-name').textContent = name;
  const dot = document.getElementById('sb-env-dot');
  if (dot) dot.style.background = hasEnv ? 'var(--tag-ok)' : 'var(--tag-danger)';
}

// ============ Uninstall ============
function toggleSelectAll() {
  const checked = document.getElementById('select-all').checked;
  document.querySelectorAll('.lib-check').forEach(cb => cb.checked = checked);
  updateSelectionInfo();
}

function updateSelectionInfo() {
  const checked = selectedForUninstall.size;
  const btn = document.getElementById('btn-batch-uninstall');
  const info = document.getElementById('uninstall-selection-info');
  btn.disabled = checked === 0;
  info.textContent = checked > 0
    ? (currentLang === 'zh' ? `已选择 ${checked} 个库` : `${checked} selected`)
    : '';
}

function getSelectedPackageNames() {
  return Array.from(selectedForUninstall);
}

function singleUninstall(name) {
  pendingUninstall = { names: [name], mode: 'single' };
  if (document.getElementById('uninstall-backup').checked) {
    document.getElementById('backup-modal').classList.add('show');
  } else {
    doUninstall([name], false);
  }
}

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

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function confirmBackup() {
  closeModal('backup-modal');
  if (pendingUninstall) doUninstall(pendingUninstall.names, true);
}

function forceUninstall() {
  closeModal('backup-modal');
  if (pendingUninstall) doUninstall(pendingUninstall.names, false);
}

async function doUninstall(names, withBackup) {
  const btn = document.getElementById('btn-batch-uninstall');
  btn.classList.add('loading');
  progressOperation = 'uninstall';
  progressTotal = names.length;
  progressDone = 0;
  const operationId = generateOperationId();
  currentOperationId = operationId;

  try {
    const logEl = document.getElementById('install-log');
    logEl.style.display = 'block';
    logEl.innerHTML = `<div><span class="log-info">[INFO]</span> ${currentLang === 'zh' ? '开始卸载' : 'Uninstalling'} ${names.length} ${currentLang === 'zh' ? '个库' : 'package(s)'}...</div>`;

    await api.uninstallPackages(names, {
      backup: withBackup,
      rollback: document.getElementById('uninstall-rollback').checked,
      operationId
    });

    await refreshAll();
    document.getElementById('select-all').checked = false;
    selectedForUninstall.clear();
    finishProgress(true, `[OK] ${currentLang === 'zh' ? `已卸载 ${names.length} 个库${withBackup ? '（含备份）' : ''}` : `Uninstalled ${names.length} package(s)${withBackup ? ' (with backup)' : ''}`}`);
    showToast(currentLang === 'zh'
      ? `已卸载 ${names.length} 个库${withBackup ? '（含备份）' : ''}`
      : `Uninstalled ${names.length} package(s)${withBackup ? ' (with backup)' : ''}`, 'ok');
  } catch (err) {
    finishProgress(false, `[FAIL] ${currentLang === 'zh' ? '卸载失败' : 'Uninstall failed'}: ${err.message}`);
    showToast(currentLang === 'zh' ? `卸载失败: ${err.message}` : `Uninstall failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    pendingUninstall = null;
    progressOperation = null;
    currentOperationId = null;
  }
}

// ============ Update ============
function getUpdateOptions() {
  return {
    parallel: document.getElementById('opt-update-parallel').checked,
    retry: document.getElementById('opt-update-retry').checked,
    rollback: document.getElementById('opt-update-rollback').checked
  };
}

async function updateOne(name, btn) {
  btn.classList.add('loading');
  progressOperation = 'update';
  progressTotal = 1;
  progressDone = 0;
  const operationId = generateOperationId();
  currentOperationId = operationId;

  const progressEl = document.getElementById('update-progress');
  const logEl = document.getElementById('update-log');
  progressEl.style.display = 'block';
  logEl.style.display = 'block';
  logEl.innerHTML = '';
  resetProgress(1);
  document.getElementById('update-progress-name').textContent = name;

  try {
    const options = getUpdateOptions();
    options.operationId = operationId;
    await api.updatePackages([name], options);
    await refreshAll();
    selectedForUpdate.delete(name);
    finishProgress(true, `[OK] ${currentLang === 'zh' ? '更新成功' : 'Updated'}: ${name}`);
    showToast(currentLang === 'zh' ? `${name} 已更新` : `${name} updated`, 'ok');
  } catch (err) {
    finishProgress(false, `[FAIL] ${currentLang === 'zh' ? '更新失败' : 'Update failed'}: ${err.message}`);
    showToast(currentLang === 'zh' ? `更新失败: ${err.message}` : `Update failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    progressOperation = null;
    currentOperationId = null;
  }
}

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
  const options = getUpdateOptions();
  const operationId = generateOperationId();
  options.operationId = operationId;
  currentOperationId = operationId;

  const progressEl = document.getElementById('update-progress');
  const logEl = document.getElementById('update-log');
  progressEl.style.display = 'block';
  logEl.style.display = 'block';
  logEl.innerHTML = '';
  resetProgress(names.length);

  try {
    const result = await api.updatePackages(names, options);
    await refreshAll();
    selectedForUpdate.clear();
    const failedCount = result && result.failed ? result.failed.length : 0;
    if (failedCount > 0) {
      finishProgress(false, `[FAIL] ${currentLang === 'zh' ? `更新完成，${failedCount} 个失败` : `Update complete, ${failedCount} failed`}`);
      showToast(currentLang === 'zh' ? `更新完成，${failedCount} 个失败` : `Update complete, ${failedCount} failed`, 'warn');
    } else {
      finishProgress(true, `[OK] ${currentLang === 'zh' ? `已更新 ${names.length} 个库` : `Updated ${names.length} packages`}`);
      showToast(currentLang === 'zh' ? `已更新 ${names.length} 个库` : `Updated ${names.length} packages`, 'ok');
    }
  } catch (err) {
    finishProgress(false, `[FAIL] ${currentLang === 'zh' ? '更新失败' : 'Update failed'}: ${err.message}`);
    showToast(currentLang === 'zh' ? `更新失败: ${err.message}` : `Update failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    progressOperation = null;
    currentOperationId = null;
  }
}

async function refreshAll() {
  try {
    // 同时刷新已安装列表与可更新列表，保证操作后全局数据一致
    await Promise.all([refreshInstalled(), refreshOutdated()]);
    renderUninstallTable(document.getElementById('uninstall-search').value);
    renderUpdateTable();
    renderQueryTable();
    renderStats();
    updateStatusbar();
  } catch (err) {
    console.error('refreshAll failed', err);
  }
}

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

// ============ Install ============
document.getElementById('install-version-mode').addEventListener('change', function() {
  document.getElementById('version-input-group').style.display = this.value === 'latest' ? 'none' : 'block';
});

function resetDropzone() {
  dropzone.querySelector('.dropzone-text').textContent = t('install.drop');
  dropzone.querySelector('.dropzone-sub').style.display = 'block';
}

async function installFromSelectedFile(filePath, name) {
  const btn = document.getElementById('btn-do-install');
  const progressEl = document.getElementById('install-progress');
  const logEl = document.getElementById('install-log');

  const ext = (name || filePath).split('.').pop().toLowerCase();
  if (!['txt', 'whl'].includes(ext)) {
    showToast(currentLang === 'zh' ? '仅支持 .txt 或 .whl 文件' : 'Only .txt or .whl files are supported', 'err');
    return;
  }

  btn.classList.add('loading');
  progressEl.style.display = 'block';
  logEl.style.display = 'block';
  logEl.innerHTML = `<div><span class="log-info">[INFO]</span> ${currentLang === 'zh' ? '开始从文件安装' : 'Installing from file'} ${name}...</div>`;

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
    finishProgress(true, `[OK] ${currentLang === 'zh' ? '已安装' : 'Installed'}: ${name}`);
    showToast(currentLang === 'zh' ? `已安装 ${name}` : `Installed ${name}`, 'ok');
    document.getElementById('install-search').value = '';
    resetDropzone();
  } catch (err) {
    finishProgress(false, `[FAIL] ${currentLang === 'zh' ? '安装失败' : 'Install failed'}: ${err.message}`);
    showToast(currentLang === 'zh' ? `安装失败: ${err.message}` : `Install failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    progressOperation = null;
    currentOperationId = null;
  }
}

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
    showToast(currentLang === 'zh' ? '请输入要安装的库名称' : 'Please enter package name(s)', 'err');
    return;
  }

  btn.classList.add('loading');
  const progressEl = document.getElementById('install-progress');
  const logEl = document.getElementById('install-log');
  progressEl.style.display = 'block';
  logEl.style.display = 'block';
  logEl.innerHTML = `<div><span class="log-info">[INFO]</span> ${currentLang === 'zh' ? '开始安装' : 'Installing'} ${libs.length} ${currentLang === 'zh' ? '个库' : 'package(s)'}...</div>`;

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

    const installedCount = result.installed ? result.installed.length : libs.length;
    todayInstalled += installedCount;
    if (result.failed && result.failed.length > 0) {
      finishProgress(false, `[FAIL] ${currentLang === 'zh' ? `安装完成，${result.failed.length} 个失败` : `Install finished, ${result.failed.length} failed`}`);
      showToast(currentLang === 'zh' ? `安装完成，${result.failed.length} 个失败` : `Install finished, ${result.failed.length} failed`, 'err');
    } else {
      finishProgress(true, `[OK] ${currentLang === 'zh' ? `成功安装 ${installedCount} 个库` : `Installed ${installedCount} package(s)`}`);
      showToast(currentLang === 'zh' ? `成功安装 ${installedCount} 个库` : `Installed ${installedCount} package(s)`, 'ok');
    }
    input.value = '';
  } catch (err) {
    finishProgress(false, `[FAIL] ${currentLang === 'zh' ? '安装失败' : 'Install failed'}: ${err.message}`);
    showToast(currentLang === 'zh' ? `安装失败: ${err.message}` : `Install failed: ${err.message}`, 'err');
  } finally {
    btn.classList.remove('loading');
    progressOperation = null;
    currentOperationId = null;
  }
}

// Drop zone
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

// ============ Mirror ============
async function setMirror(index) {
  const mirror = mirrors[index];
  await api.setDefaultMirror(mirror.url);
  mirrors = await api.getMirrors();
  renderMirrors();
  showToast(currentLang === 'zh' ? `默认镜像源已切换为 ${mirror.name}` : `Default mirror set to ${mirror.name}`, 'ok');
}

async function removeMirror(index) {
  const mirror = mirrors[index];
  if (!mirror) return;
  await api.removeCustomMirror(mirror.url);
  mirrors = await api.getMirrors();
  if (editingMirrorIndex === index) editingMirrorIndex = -1;
  renderMirrors();
  showToast(currentLang === 'zh' ? `已删除镜像源 ${mirror.name}` : `Removed mirror ${mirror.name}`, 'info');
}

function editMirror(index) {
  editingMirrorIndex = index;
  renderMirrors();
}

function cancelMirrorEdit() {
  editingMirrorIndex = -1;
  renderMirrors();
}

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

async function toggleSmartRoute() {
  const on = document.getElementById('toggle-smart-route').checked;
  await api.setSmartRoute(on);
  showToast(currentLang === 'zh' ? (on ? '智能路由已开启' : '智能路由已关闭') : (on ? 'Smart routing on' : 'Smart routing off'), 'info');
}

// ============ Env ============
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

// ============ Logs ============
async function addLog(action, status, type = 'install') {
  const entry = { action, status, type };
  await api.addLog(entry);
  await refreshLogs();
}

async function clearLogs() {
  await api.clearLogs();
  logData = [];
  renderLogs();
  showToast(currentLang === 'zh' ? '日志已清空' : 'Logs cleared', 'info');
}

// ============ Theme / Language ============
document.querySelectorAll('#theme-options .theme-opt').forEach(el => {
  el.addEventListener('click', () => {
    const theme = el.dataset.theme;
    document.body.classList.toggle('dark', theme === 'dark');
    document.querySelectorAll('#theme-options .theme-opt').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    api.setConfig('theme', theme);
  });
});

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

async function browseStoragePath() {
  const dir = await api.browseDirectory();
  if (dir) {
    await api.setConfig('storagePath', dir);
    const pathEl = document.getElementById('setting-path');
    if (pathEl) pathEl.textContent = dir;
    showToast(currentLang === 'zh' ? `存储路径已设置为 ${dir}` : `Storage path set to ${dir}`, 'ok');
  }
}

async function restoreDefaultMirrorsSettings() {
  mirrors = await api.restoreDefaultMirrors();
  renderMirrors();
  showToast(currentLang === 'zh' ? '已恢复默认镜像源' : 'Default mirrors restored', 'ok');
}

async function loadConfig() {
  appConfig = await api.getConfig();
  currentLang = appConfig.language || 'zh';
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  document.body.classList.toggle('dark', appConfig.theme === 'dark');
  document.querySelectorAll('#theme-options .theme-opt').forEach(x => x.classList.toggle('active', x.dataset.theme === appConfig.theme));
  document.querySelectorAll('#lang-options .theme-opt').forEach(x => x.classList.toggle('active', x.dataset.lang === currentLang));
  document.getElementById('setting-threads').value = String(appConfig.parallelThreads || 4);
  document.getElementById('setting-retry').value = String(appConfig.retryCount || 2);
  const pathEl = document.getElementById('setting-path');
  if (pathEl) pathEl.textContent = appConfig.storagePath || '';
}

async function refreshInstalled() {
  installedLibs = await api.listInstalled();
}

async function refreshLogs() {
  logData = await api.getLogs({});
}

async function refreshEnvs() {
  envs = await api.detectEnvironments();
  const current = await api.getCurrentEnv();
  currentEnvIndex = envs.findIndex(e => e.path === current?.path);
  if (currentEnvIndex < 0 && envs.length > 0) currentEnvIndex = 0;
}

async function refreshMirrors() {
  mirrors = await api.getMirrors();
  const smart = await api.getSmartRoute();
  document.getElementById('toggle-smart-route').checked = smart;
}

async function refreshOutdated() {
  try {
    updateLibs = await api.listOutdated();
  } catch (err) {
    updateLibs = [];
  }
}

function setUpdateStatus(text, type = '') {
  const el = document.getElementById('about-update-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'about-update-status' + (type ? ` ${type}` : '');
}

function setUpdateProgress(percent) {
  const bar = document.getElementById('about-update-bar');
  const wrap = document.getElementById('about-update-progress');
  if (!bar || !wrap) return;
  wrap.style.display = 'block';
  bar.style.width = `${percent}%`;
}

function hideUpdateProgress() {
  const wrap = document.getElementById('about-update-progress');
  const bar = document.getElementById('about-update-bar');
  if (wrap) wrap.style.display = 'none';
  if (bar) bar.style.width = '0%';
}

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

function installAppUpdate() {
  api.installUpdate();
}

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

function appendLog(text, type) {
  const logEl = progressOperation === 'update'
    ? document.getElementById('update-log')
    : document.getElementById('install-log');
  if (!logEl) return;
  const line = document.createElement('div');
  const cls = type === 'stderr' ? 'log-err' : (text.includes('[WARN]') ? 'log-warn' : (text.includes('[ERR]') ? 'log-err' : 'log-ok'));
  line.innerHTML = `<span class="${cls}">${text.replace(/\n/g, '<br>')}</span>`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function resetProgress(total) {
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

// 操作结束后设置最终状态：成功显示“完成”（绿色）、失败显示“失败”（红色），
// 并将结果写入命令行日志，保证成功与失败都会打印到日志里
function finishProgress(success, logMessage) {
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
  if (logMessage) appendLog(logMessage, success ? 'stdout' : 'stderr');
}

function updateProgressFromOutput(payload) {
  if (!progressOperation) return;
  const { data, type } = payload;
  appendLog(data, type);
  const prefix = progressOperation === 'update' ? 'update-' : '';
  // Try to infer completion from pip output
  if (data.includes('Successfully installed') || data.includes('Successfully uninstalled')) {
    progressDone = Math.min(progressDone + 1, progressTotal);
    const pct = Math.min(100, Math.round((progressDone / Math.max(1, progressTotal)) * 100));
    document.getElementById(prefix + 'progress-fill').style.width = pct + '%';
    document.getElementById(prefix + 'progress-pct').textContent = pct + '%';
    document.getElementById(prefix + 'progress-count').innerHTML = `<strong>${progressDone}</strong> / <strong>${progressTotal}</strong>`;
  }
  const match = data.match(/(Downloading|Installing collected packages):\s*([^\n]+)/);
  if (match) {
    document.getElementById(prefix + 'progress-name').textContent = match[2].slice(0, 60);
  }
}

api.onProgress(updateProgressFromOutput);
bindUpdaterEvents();

// ============ Live filter bindings ============
document.getElementById('uninstall-search').addEventListener('input', function() {
  renderUninstallTable(this.value);
});
document.getElementById('query-search').addEventListener('input', renderQueryTable);
document.getElementById('query-status-filter').addEventListener('change', renderQueryTable);
document.getElementById('query-sort').addEventListener('change', renderQueryTable);
document.getElementById('log-type-filter').addEventListener('change', renderLogs);
document.getElementById('log-search').addEventListener('input', renderLogs);
document.getElementById('setting-threads').addEventListener('change', e => api.setConfig('parallelThreads', parseInt(e.target.value, 10)));
document.getElementById('setting-retry').addEventListener('change', e => api.setConfig('retryCount', parseInt(e.target.value, 10)));

// ============ Init ============
(async function init() {
  try {
    await loadConfig();
  } catch (err) {
    console.error('loadConfig failed', err);
  }
  applyLanguage();
  updateStatusbar();

  // Phase 1: Fast loads (config, env, mirrors, cached libs) in parallel
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

  // Show cached libs immediately
  if (cachedLibs.status === 'fulfilled') {
    installedLibs = cachedLibs.value;
    renderUninstallTable();
    renderQueryTable();
    renderStats();
  }

  // Phase 2: Background refresh installed libs (full scan)
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

  // Phase 3: Lazy load outdated (only when user visits update page)
  // Don't block startup with this
  const refreshOutdatedPromise = (async () => {
    try {
      await refreshOutdated();
      renderUpdateTable();
      renderStats();
    } catch (err) {
      console.error('refreshOutdated failed', err);
    }
  })();

  // Logs and version — low priority
  try {
    await refreshLogs();
  } catch (err) {
    console.error('refreshLogs failed', err);
    logData = [];
  }
  renderLogs();

  try {
    const appVer = await api.getAppVersion();
    document.querySelector('.about-ver').textContent = 'v' + appVer.version;
  } catch (err) {
    console.error('getAppVersion failed', err);
  }

  // Wait for background tasks to finish (don't block UI)
  await Promise.allSettled([refreshInstalledPromise, refreshOutdatedPromise]);
})();