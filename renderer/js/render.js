// ============ Render：表格渲染与选择逻辑 ============
//
// 模块职责：
// - 卸载页表格渲染和勾选状态管理
// - 更新页表格渲染和勾选状态管理
// - 查询页表格渲染（支持搜索/筛选/排序）
// - 镜像源列表渲染（包括编辑模式）
// - 环境列表渲染
// - 日志列表渲染
// - 统计数据卡片和状态栏更新
//
// 依赖全局状态：
// - installedLibs, updateLibs, mirrors, envs, logData: 各页面数据
// - selectedForUninstall, selectedForUpdate: 勾选状态

// ---- 卸载页 ----

/**
 * 切换卸载页单个库的勾选状态
 * @param {string} name - 包名
 */
function toggleUninstallSelection(name) {
  if (selectedForUninstall.has(name)) {
    selectedForUninstall.delete(name);
  } else {
    selectedForUninstall.add(name);
  }
  updateSelectionInfo();
}

/** 全选/取消全选卸载页的库 */
function toggleSelectAll() {
  const checked = document.getElementById('select-all').checked;
  document.querySelectorAll('.lib-check').forEach(cb => cb.checked = checked);
  updateSelectionInfo();
}

/** 更新卸载页的选择信息显示（已选数量、按钮状态） */
function updateSelectionInfo() {
  const checked = selectedForUninstall.size;
  const btn = document.getElementById('btn-batch-uninstall');
  const info = document.getElementById('uninstall-selection-info');
  btn.disabled = checked === 0;
  info.textContent = checked > 0
    ? (currentLang === 'zh' ? `已选择 ${checked} 个库` : `${checked} selected`)
    : '';
}

/** 获取已勾选的包名列表 */
function getSelectedPackageNames() {
  return Array.from(selectedForUninstall);
}

/**
 * 渲染卸载页表格
 * @param {string} [filter=''] - 搜索关键词
 */
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
      <td><span class="lib-name" style="cursor:pointer;" onclick="showPackageDetail('${escapeHtml(lib.name)}')">${escapeHtml(lib.name)}</span></td>
      <td><span class="version-badge">${lib.version}</span></td>
      <td>${lib.installed || '-'}</td>
      <td>${lib.sizeText || '-'}</td>
      <td><span class="tag tag-ok"><span class="tag-dot"></span>${t('tag.installed')}</span></td>
      <td><button class="btn btn-sm btn-danger" onclick="singleUninstall('${escapeHtml(lib.name)}')">${t('btn.uninstall')}</button></td>
    </tr>`;
  }).join('');
  updateSelectionInfo();
}

// ---- 更新页 ----

/** 全选/取消全选更新页的库 */
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

/** 切换更新页单个库的勾选状态 */
function toggleUpdateSelection(name) {
  if (selectedForUpdate.has(name)) {
    selectedForUpdate.delete(name);
  } else {
    selectedForUpdate.add(name);
  }
  updateUpdateSelectionInfo();
}

/** 更新更新页的选择信息显示 */
function updateUpdateSelectionInfo() {
  const info = document.getElementById('update-selection-info');
  const count = selectedForUpdate.size;
  info.textContent = count > 0
    ? (currentLang === 'zh' ? `已选择 ${count} 个库` : `${count} selected`)
    : '';
}

/** 渲染更新页表格（支持搜索过滤） */
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
      <td><span class="lib-name" style="cursor:pointer;" onclick="showPackageDetail('${escapeHtml(lib.name)}')">${escapeHtml(lib.name)}</span></td>
      <td><span class="version-badge">${lib.current}</span></td>
      <td><span class="version-badge new">${lib.latest}</span></td>
      <td>${lib.date || '-'}</td>
      <td><button class="btn btn-sm btn-primary" onclick="updateOne('${escapeHtml(lib.name)}', this)"><span class="spinner"></span>${t('btn.update')}</button></td>
    </tr>
  `}).join('');

  updateUpdateSelectionInfo();
}

// ---- 查询页 ----

/**
 * 渲染查询页表格
 * - 支持关键词搜索
 * - 支持状态筛选（所有/已安装/有更新）
 * - 支持排序（时间新旧/名称/大小）
 */
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
      <td><span class="lib-name" style="cursor:pointer;" onclick="showPackageDetail('${escapeHtml(lib.name)}')">${escapeHtml(lib.name)}</span></td>
      <td><span class="version-badge">${lib.version}</span></td>
      <td>${lib.installed || '-'}</td>
      <td>${lib.sizeText || '-'}</td>
      <td>${lib.source || '-'}</td>
      <td><span class="tag ${hasUpdate ? 'tag-update' : 'tag-ok'}"><span class="tag-dot"></span>${hasUpdate ? t('tag.hasUpdate') : t('tag.latest')}</span></td>
    </tr>`;
  }).join('');
}

// ---- 镜像源页 ----

/**
 * 渲染镜像源列表
 * - 支持显示模式和编辑模式切换
 * - 显示测速结果和默认标记
 * - 支持拖拽排序（长按拖动调整优先级）
 */
function renderMirrors() {
  const list = document.getElementById('mirror-list');
  list.innerHTML = mirrors.map((m, i) => {
    const speed = m.speed == null ? null : m.speed;
    const speedClass = speed == null ? '' : speed < 50 ? '' : speed < 100 ? 'slow' : 'very-slow';
    const speedText = speed == null ? '-' : (speed === 9999 ? '超时' : `${speed} ms`);
    const remarkHtml = m.remark ? `<div class="mirror-remark">${escapeHtml(m.remark)}</div>` : '';

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
    <div class="mirror-item ${m.isDefault ? 'default' : ''}" draggable="true" data-mirror-idx="${i}">
      <div class="mirror-drag-handle" title="${currentLang === 'zh' ? '拖动调整优先级' : 'Drag to reorder'}">
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.5"/><circle cx="7.5" cy="2.5" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13.5" r="1.5"/><circle cx="7.5" cy="13.5" r="1.5"/></svg>
      </div>
      <div class="mirror-info">
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
  bindMirrorDragEvents();
}

// ---- 镜像源拖拽排序 ----

let mirrorDragIdx = null;

function bindMirrorDragEvents() {
  const list = document.getElementById('mirror-list');
  const items = list.querySelectorAll('.mirror-item[draggable]');

  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      mirrorDragIdx = parseInt(item.dataset.mirrorIdx);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', mirrorDragIdx);
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.mirror-item').forEach(el => el.classList.remove('drag-over'));
      mirrorDragIdx = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = parseInt(item.dataset.mirrorIdx);
      if (target !== mirrorDragIdx) {
        list.querySelectorAll('.mirror-item').forEach(el => el.classList.remove('drag-over'));
        item.classList.add('drag-over');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromIdx = mirrorDragIdx;
      const toIdx = parseInt(item.dataset.mirrorIdx);
      if (fromIdx === null || fromIdx === toIdx) return;

      // 重排本地数组
      const [moved] = mirrors.splice(fromIdx, 1);
      mirrors.splice(toIdx, 0, moved);
      renderMirrors();

      // 持久化新顺序
      try {
        const urlOrder = mirrors.map(m => m.url);
        await api.reorderMirrors(urlOrder);
        showToast(currentLang === 'zh' ? '镜像源优先级已更新' : 'Mirror priority updated', 'ok');
      } catch (err) {
        showToast(currentLang === 'zh' ? `排序保存失败: ${err.message}` : `Reorder failed: ${err.message}`, 'err');
      }
    });
  });
}

// ---- 环境页 ----

/** 渲染 Python 环境列表 */
function renderEnvs() {
  const list = document.getElementById('env-list');
  if (envs.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-text">${currentLang === 'zh' ? '未检测到 Python 环境' : 'No Python environment detected'}</div>
      <div class="empty-state-sub">${currentLang === 'zh' ? '可在下方一键安装 Python，自动配置环境变量' : 'Install Python with one click below, PATH will be configured automatically'}</div>
      <button class="btn btn-primary" style="margin-top:12px;" onclick="document.getElementById('python-install-card').scrollIntoView({behavior:'smooth'})">${currentLang === 'zh' ? '立即安装 Python' : 'Install Python Now'}</button>
    </div>`;
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

/**
 * 渲染虚拟环境列表
 * - 显示每个 venv 的名称、Python 版本、pip 版本、包数量
 * - 提供“使用”和“删除”操作按钮
 */
function renderVenvs() {
  const list = document.getElementById('venv-list');
  if (!list) return;

  if (!window._venvList || window._venvList.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:20px 0;"><div class="empty-state-text">${t('env.venvEmpty')}</div><div class="empty-state-sub">${t('env.venvEmptySub')}</div></div>`;
    return;
  }

  list.innerHTML = window._venvList.map((v, i) => `
    <div class="env-card" style="margin-bottom:8px;">
      <div>
        <div class="env-name">${escapeHtml(v.name)} <span class="version-badge" style="margin-left:6px;">venv</span></div>
        <div class="env-path">Python ${v.version || '?'}${v.pipVersion ? ' · pip ' + v.pipVersion : ''} · ${v.packageCount || 0} ${t('env.venvPackages')}</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-sm btn-primary" onclick="useVenv(${i})">${t('env.venvUse')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteVenv(${i})">${t('env.venvDelete')}</button>
      </div>
    </div>
  `).join('');
}

/**
 * 渲染 venv 创建表单中的基础 Python 下拉列表
 * - 从当前检测到的环境列表中填充选项
 */
function renderVenvBaseOptions() {
  const select = document.getElementById('venv-base-python');
  if (!select) return;
  select.innerHTML = envs.map((e, i) => `<option value="${escapeHtml(e.path)}">${escapeHtml(e.name)} (Python ${e.version || '?'})</option>`).join('');
}

// ---- 日志页 ----

/**
 * 渲染操作日志列表
 * - 支持按类型筛选和关键词搜索
 */
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
        <div class="log-action">${escapeHtml(l.action)}${l.detail ? ' <span style="color:var(--text-muted)">— ' + escapeHtml(l.detail) + '</span>' : ''}</div>
        <div class="log-time">${escapeHtml(l.time)}</div>
      </div>
      <div class="log-right">
        <span class="tag ${ok ? 'tag-ok' : 'tag-danger'}"><span class="tag-dot"></span>${ok ? t('tag.success') : t('tag.failed')}</span>
      </div>
    </div>`;
  }).join('');
}

// ---- 统计卡片与状态栏 ----

/** 更新统计卡片数据（带数字动画） */
function renderStats() {
  animateStat('stat-installed', installedLibs.length);
  animateStat('stat-updates', updateLibs.length);
  animateStat('stat-today', todayInstalled);
  updateStatusbar();
}

/**
 * 更新底部状态栏
 * - 显示已安装数、可更新数、Python 版本、环境名称
 */
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
