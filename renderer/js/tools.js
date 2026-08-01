// ============ Tools：工具箱页面交互逻辑 ============
//
// 模块职责：
// - 依赖图谱（Canvas 力导向图 + 树形图）
// - 磁盘空间分析（条形图）
// - 环境对比（diff 视图）
// - 离线包下载
// - 操作撤销
// - 系统集成（右键菜单开关）
//
// 依赖全局状态：
// - api (window.electronAPI), currentLang, showToast

// ---- Tab 切换 ----

let currentToolTab = 'depGraph';

function initToolsTabs() {
  document.querySelectorAll('.tools-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tools-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(`tool-${tab.dataset.tool}`);
      if (panel) panel.classList.add('active');
      currentToolTab = tab.dataset.tool;
    });
  });
}

// ---- 依赖图谱 ----

let depMode = 'single';
let depGraphData = null;
let depAnimFrame = null;
// 图谱交互状态
let graphState = { nodes: [], edges: [], nodeMap: new Map(), scale: 1, offsetX: 0, offsetY: 0, dragging: null, panning: false, panStart: null, hoverNode: null };

function initDepGraph() {
  document.querySelectorAll('#dep-mode-options .theme-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#dep-mode-options .theme-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      depMode = opt.dataset.depMode;
      document.getElementById('dep-single-input').style.display = depMode === 'single' ? 'flex' : 'none';
      if (depMode === 'global') loadDepGraph();
    });
  });
  // Canvas 交互事件
  const canvas = document.getElementById('dep-canvas');
  canvas.addEventListener('wheel', onGraphWheel, { passive: false });
  canvas.addEventListener('mousedown', onGraphMouseDown);
  canvas.addEventListener('mousemove', onGraphMouseMove);
  canvas.addEventListener('mouseup', onGraphMouseUp);
  canvas.addEventListener('mouseleave', onGraphMouseUp);
  canvas.addEventListener('dblclick', onGraphDblClick);
}

function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    text: s.getPropertyValue('--text-primary').trim() || '#1a1a1a',
    textSec: s.getPropertyValue('--text-secondary').trim() || '#666',
    border: s.getPropertyValue('--border').trim() || '#e0e0e0',
    bg: s.getPropertyValue('--bg-card').trim() || '#fff',
    accent: s.getPropertyValue('--accent').trim() || '#6366f1',
  };
}

async function loadDepGraph() {
  const canvas = document.getElementById('dep-canvas');
  const empty = document.getElementById('dep-empty');
  const info = document.getElementById('dep-info');

  if (depMode === 'single') {
    const pkgName = document.getElementById('dep-pkg-name').value.trim();
    if (!pkgName) { showToast(currentLang === 'zh' ? '请输入包名' : 'Enter a package name', 'warn'); return; }
    empty.style.display = 'none';
    info.textContent = t('dep.loading');
    try {
      const tree = await api.getDependencyTree(pkgName);
      const nodeCount = countTreeNodes(tree);
      info.textContent = `${nodeCount} ${t('dep.nodes')}`;
      renderTreeGraph(canvas, tree);
    } catch (err) {
      info.textContent = '';
      empty.style.display = 'flex';
      empty.textContent = err.message;
    }
  } else {
    empty.style.display = 'none';
    info.textContent = t('dep.loading');
    try {
      depGraphData = await api.getDependencyGraph();
      info.textContent = `${depGraphData.nodes.length} ${t('dep.nodes')}, ${depGraphData.edges.length} ${t('dep.edges')}  (滚轮缩放 / 拖拽平移 / 双击重置)`;
      renderForceGraph(canvas, depGraphData);
    } catch (err) {
      info.textContent = '';
      empty.style.display = 'flex';
      empty.textContent = err.message;
    }
  }
}

function countTreeNodes(node) {
  let c = 1;
  if (node.children) for (const ch of node.children) c += countTreeNodes(ch);
  return c;
}

// ---- 高清 Canvas 工具 ----
function setupHiDPICanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ---- 树形图渲染（改进版） ----
function renderTreeGraph(canvas, tree) {
  if (depAnimFrame) cancelAnimationFrame(depAnimFrame);
  const W = canvas.parentElement.clientWidth;
  const H = 520;
  const ctx = setupHiDPICanvas(canvas, W, H);
  const colors = getThemeColors();
  const depthColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const nodeW = 110, nodeH = 32, levelGap = 70, leafGap = 16;
  const nodes = [], links = [];

  // 递归计算子树宽度
  function subtreeWidth(node) {
    if (!node.children || node.children.length === 0) return nodeW + leafGap;
    return node.children.reduce((sum, ch) => sum + subtreeWidth(ch), 0);
  }

  // 递归布局
  function layout(node, depth, left) {
    const w = subtreeWidth(node);
    const x = left + w / 2;
    const y = 50 + depth * levelGap;
    const n = { name: node.name, version: node.version || '', x, y, depth, w: nodeW, h: nodeH };
    nodes.push(n);
    if (node.children && node.children.length > 0) {
      let childLeft = left;
      for (const child of node.children) {
        const cw = subtreeWidth(child);
        layout(child, depth + 1, childLeft);
        const childNode = nodes[nodes.length - 1];
        // 找到刚布局的子树根节点
        const cn = nodes.find(nd => nd.depth === depth + 1 && nd.x >= childLeft && nd.x <= childLeft + cw);
        if (cn) links.push({ from: n, to: cn });
        childLeft += cw;
      }
    }
  }

  const totalW = subtreeWidth(tree);
  const startX = Math.max(0, (W - totalW) / 2);
  layout(tree, 0, startX);

  // 绘制
  ctx.clearRect(0, 0, W, H);

  // 连线（贝塞尔曲线）
  for (const link of links) {
    const midY = (link.from.y + link.to.y) / 2;
    ctx.beginPath();
    ctx.moveTo(link.from.x, link.from.y + nodeH / 2);
    ctx.bezierCurveTo(link.from.x, midY, link.to.x, midY, link.to.x, link.to.y - nodeH / 2);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 箭头
    const ax = link.to.x, ay = link.to.y - nodeH / 2;
    ctx.beginPath();
    ctx.moveTo(ax - 4, ay - 6); ctx.lineTo(ax, ay); ctx.lineTo(ax + 4, ay - 6);
    ctx.strokeStyle = colors.border; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // 节点
  for (const n of nodes) {
    const color = depthColors[Math.min(n.depth, depthColors.length - 1)];
    // 背景
    ctx.beginPath();
    ctx.roundRect(n.x - nodeW / 2, n.y - nodeH / 2, nodeW, nodeH, 8);
    ctx.fillStyle = color + '18';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 包名
    ctx.fillStyle = colors.text;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = n.name.length > 15 ? n.name.slice(0, 14) + '…' : n.name;
    ctx.fillText(label, n.x, n.y - (n.version ? 4 : 0));
    // 版本号
    if (n.version) {
      ctx.fillStyle = colors.textSec;
      ctx.font = '9px system-ui';
      ctx.fillText(n.version, n.x, n.y + 9);
    }
  }
}

// ---- 力导向图渲染（改进版） ----
function renderForceGraph(canvas, data) {
  if (depAnimFrame) cancelAnimationFrame(depAnimFrame);
  const W = canvas.parentElement.clientWidth;
  const H = 520;
  const ctx = setupHiDPICanvas(canvas, W, H);
  const colors = getThemeColors();

  // 限制节点数
  const maxNodes = Math.min(data.nodes.length, 80);
  const nodes = data.nodes.slice(0, maxNodes).map((n, i) => {
    const angle = (i / maxNodes) * Math.PI * 2;
    const radius = 80 + Math.random() * (Math.min(W, H) * 0.3);
    return { ...n, x: W / 2 + Math.cos(angle) * radius, y: H / 2 + Math.sin(angle) * radius, vx: 0, vy: 0, deg: 0 };
  });
  const nameSet = new Set(nodes.map(n => n.name.toLowerCase()));
  const edges = data.edges.filter(e => nameSet.has(e.from.toLowerCase()) && nameSet.has(e.to.toLowerCase()));
  const nodeMap = new Map(nodes.map(n => [n.name.toLowerCase(), n]));

  // 预计算节点度
  for (const e of edges) {
    const a = nodeMap.get(e.from.toLowerCase());
    const b = nodeMap.get(e.to.toLowerCase());
    if (a) a.deg++;
    if (b) b.deg++;
  }

  // 重置交互状态
  graphState = { nodes, edges, nodeMap, scale: 1, offsetX: 0, offsetY: 0, dragging: null, panning: false, panStart: null, hoverNode: null };

  let iterations = 0;
  const maxIter = 200;
  let temperature = 1.0;

  function simulate() {
    const area = W * H;
    const k = Math.sqrt(area / nodes.length) * 0.55;
    temperature = Math.max(0.01, 1.0 - iterations / maxIter);

    // 斥力（Barnes-Hut 简化：直接 O(n^2)，80 节点可接受）
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x;
        let dy = nodes[i].y - nodes[j].y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) dist2 = 1;
        const dist = Math.sqrt(dist2);
        const force = (k * k) / dist * 0.08 * temperature;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx += fx; nodes[i].vy += fy;
        nodes[j].vx -= fx; nodes[j].vy -= fy;
      }
    }
    // 引力（边）
    for (const e of edges) {
      const a = nodeMap.get(e.from.toLowerCase());
      const b = nodeMap.get(e.to.toLowerCase());
      if (!a || !b) continue;
      let dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - k * 0.6) * 0.015 * temperature;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
    // 向心力 + 应用速度 + 阻尼
    for (const n of nodes) {
      if (n === graphState.dragging) continue;
      n.vx += (W / 2 - n.x) * 0.002;
      n.vy += (H / 2 - n.y) * 0.002;
      n.x += n.vx * 0.4; n.y += n.vy * 0.4;
      n.vx *= 0.8; n.vy *= 0.8;
      n.x = Math.max(40, Math.min(W - 40, n.x));
      n.y = Math.max(30, Math.min(H - 30, n.y));
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(graphState.offsetX, graphState.offsetY);
    ctx.scale(graphState.scale, graphState.scale);

    // 边（曲线 + 箭头）
    for (const e of edges) {
      const a = nodeMap.get(e.from.toLowerCase());
      const b = nodeMap.get(e.to.toLowerCase());
      if (!a || !b) continue;
      const isHighlight = graphState.hoverNode && (a === graphState.hoverNode || b === graphState.hoverNode);
      ctx.beginPath();
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 12;
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.strokeStyle = isHighlight ? colors.accent : colors.border;
      ctx.globalAlpha = isHighlight ? 0.8 : 0.3;
      ctx.lineWidth = isHighlight ? 1.8 : 0.8;
      ctx.stroke();
      // 箭头
      const angle = Math.atan2(b.y - my, b.x - mx);
      const rB = getRadius(b.deg);
      const ax = b.x - Math.cos(angle) * (rB + 3);
      const ay = b.y - Math.sin(angle) * (rB + 3);
      ctx.beginPath();
      ctx.moveTo(ax - Math.cos(angle - 0.4) * 6, ay - Math.sin(angle - 0.4) * 6);
      ctx.lineTo(ax, ay);
      ctx.lineTo(ax - Math.cos(angle + 0.4) * 6, ay - Math.sin(angle + 0.4) * 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 节点
    for (const n of nodes) {
      const r = getRadius(n.deg);
      const isHover = n === graphState.hoverNode;
      const isConnected = graphState.hoverNode && edges.some(e => {
        const a = nodeMap.get(e.from.toLowerCase()), b = nodeMap.get(e.to.toLowerCase());
        return (a === graphState.hoverNode && b === n) || (b === graphState.hoverNode && a === n);
      });
      const dimmed = graphState.hoverNode && !isHover && !isConnected;

      // 光晕
      if (isHover) {
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = colors.accent + '25'; ctx.fill();
      }
      // 圆
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      const nodeColor = n.deg > 5 ? '#6366f1' : n.deg > 2 ? '#10b981' : n.deg > 0 ? '#f59e0b' : '#94a3b8';
      ctx.fillStyle = dimmed ? nodeColor + '40' : nodeColor;
      ctx.fill();
      if (isHover) { ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.stroke(); }

      // 标签
      if (r > 5 || isHover || isConnected) {
        ctx.fillStyle = dimmed ? colors.text + '50' : colors.text;
        ctx.font = `${isHover ? '600 11px' : '10px'} system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = n.name.length > 12 ? n.name.slice(0, 11) + '…' : n.name;
        ctx.fillText(label, n.x, n.y + r + 4);
      }
    }

    // Tooltip
    if (graphState.hoverNode) {
      const n = graphState.hoverNode;
      const text = `${n.name}  v${n.version || '?'}  |  ${n.deg} deps`;
      ctx.font = '11px system-ui';
      const tw = ctx.measureText(text).width + 16;
      const tx = Math.min(n.x + 12, W / graphState.scale - tw - 5);
      const ty = n.y - 30;
      ctx.fillStyle = colors.bg;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(tx, ty, tw, 22, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, tx + 8, ty + 11);
    }

    ctx.restore();
  }

  function getRadius(deg) { return Math.max(5, Math.min(18, 5 + deg * 2)); }

  function tick() {
    if (iterations < maxIter) simulate();
    draw();
    iterations++;
    // 始终维持渲染循环（力导向结束后仍需响应拖拽/平移/悬停）
    depAnimFrame = requestAnimationFrame(tick);
  }
  tick();
}

// ---- 图谱交互事件 ----
function screenToGraph(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - graphState.offsetX) / graphState.scale;
  const y = (e.clientY - rect.top - graphState.offsetY) / graphState.scale;
  return { x, y };
}

function findNodeAt(gx, gy) {
  for (let i = graphState.nodes.length - 1; i >= 0; i--) {
    const n = graphState.nodes[i];
    const r = Math.max(5, Math.min(18, 5 + n.deg * 2)) + 4;
    const dx = gx - n.x, dy = gy - n.y;
    if (dx * dx + dy * dy < r * r) return n;
  }
  return null;
}

function onGraphWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = Math.max(0.3, Math.min(4, graphState.scale * delta));
  const rect = e.target.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  graphState.offsetX = mx - (mx - graphState.offsetX) * (newScale / graphState.scale);
  graphState.offsetY = my - (my - graphState.offsetY) * (newScale / graphState.scale);
  graphState.scale = newScale;
}

function onGraphMouseDown(e) {
  const canvas = e.target;
  const { x, y } = screenToGraph(canvas, e);
  const node = findNodeAt(x, y);
  if (node) {
    graphState.dragging = node;
    canvas.style.cursor = 'grabbing';
  } else {
    graphState.panning = true;
    graphState.panStart = { x: e.clientX - graphState.offsetX, y: e.clientY - graphState.offsetY };
    canvas.style.cursor = 'grabbing';
  }
}

function onGraphMouseMove(e) {
  const canvas = e.target;
  const { x, y } = screenToGraph(canvas, e);
  if (graphState.dragging) {
    graphState.dragging.x = x;
    graphState.dragging.y = y;
    graphState.dragging.vx = 0;
    graphState.dragging.vy = 0;
  } else if (graphState.panning && graphState.panStart) {
    graphState.offsetX = e.clientX - graphState.panStart.x;
    graphState.offsetY = e.clientY - graphState.panStart.y;
  } else {
    const node = findNodeAt(x, y);
    graphState.hoverNode = node;
    canvas.style.cursor = node ? 'pointer' : 'default';
  }
}

function onGraphMouseUp(e) {
  graphState.dragging = null;
  graphState.panning = false;
  graphState.panStart = null;
  if (e.target) e.target.style.cursor = 'default';
}

function onGraphDblClick(e) {
  graphState.scale = 1;
  graphState.offsetX = 0;
  graphState.offsetY = 0;
}

// ---- 磁盘空间分析 ----

async function loadDiskUsage() {
  const chart = document.getElementById('disk-chart');
  const empty = document.getElementById('disk-empty');
  const totalEl = document.getElementById('disk-total');
  const pathEl = document.getElementById('disk-path');
  const btn = document.getElementById('btn-disk-scan');

  btn.classList.add('loading'); btn.disabled = true;
  chart.innerHTML = ''; empty.style.display = 'none';
  totalEl.textContent = '...';

  try {
    const data = await api.getDiskUsage();
    totalEl.textContent = data.totalText;
    pathEl.textContent = `${t('disk.path')}: ${data.sitePackagesPath}`;

    const top = data.packages.slice(0, 30);
    const maxSize = top.length > 0 ? top[0].size : 1;
    const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#10b981', '#14b8a6', '#f59e0b', '#f97316', '#ef4444'];

    let html = `<div style="font-size:12px; font-weight:600; margin-bottom:10px; color:var(--text-secondary);">${t('disk.top')}</div>`;
    top.forEach((pkg, i) => {
      const pct = maxSize > 0 ? (pkg.size / maxSize * 100) : 0;
      const color = colors[i % colors.length];
      html += `<div class="disk-bar-row">
        <span class="disk-bar-name" title="${escapeHtml(pkg.name)}">${escapeHtml(pkg.name)}</span>
        <div class="disk-bar-track"><div class="disk-bar-fill" style="width:${pct}%; background:${color};"></div></div>
        <span class="disk-bar-size">${pkg.sizeText}</span>
      </div>`;
    });

    const othersSize = data.packages.slice(30).reduce((s, p) => s + p.size, 0);
    if (othersSize > 0) {
      html += `<div class="disk-bar-row"><span class="disk-bar-name">${t('disk.others')} (${data.packages.length - 30})</span><div class="disk-bar-track"><div class="disk-bar-fill" style="width:${(othersSize / maxSize * 100).toFixed(1)}%; background:#94a3b8;"></div></div><span class="disk-bar-size">${othersSize >= 1024 ? (othersSize / 1024).toFixed(2) + ' GB' : othersSize.toFixed(1) + ' MB'}</span></div>`;
    }
    chart.innerHTML = html;
  } catch (err) {
    empty.style.display = 'block';
    showToast(err.message, 'err');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ---- 环境对比 ----

let diffFilePaths = { a: '', b: '' };

function onDiffTypeChange(side) {
  const type = document.getElementById(`diff-type-${side}`).value;
  document.getElementById(`diff-file-${side}`).style.display = type === 'file' ? 'block' : 'none';
}

async function browseDiffFile(side) {
  const filePath = await api.browseFile([{ name: 'Requirements', extensions: ['txt'] }, { name: 'All', extensions: ['*'] }]);
  if (filePath) {
    diffFilePaths[side] = filePath;
    document.getElementById(`diff-file-${side}-name`).textContent = filePath.split(/[\\/]/).pop();
  }
}

async function runDiff() {
  const btn = document.getElementById('btn-diff-run');
  const results = document.getElementById('diff-results');
  const stats = document.getElementById('diff-stats');
  const empty = document.getElementById('diff-empty');

  const typeA = document.getElementById('diff-type-a').value;
  const typeB = document.getElementById('diff-type-b').value;

  const sourceA = typeA === 'file' ? { type: 'file', path: diffFilePaths.a } : { type: 'env', path: '__current__' };
  const sourceB = typeB === 'file' ? { type: 'file', path: diffFilePaths.b } : { type: 'env', path: '__current__' };

  if (sourceA.type === 'file' && !sourceA.path) { showToast(currentLang === 'zh' ? '请选择来源 A 的文件' : 'Select file for source A', 'warn'); return; }
  if (sourceB.type === 'file' && !sourceB.path) { showToast(currentLang === 'zh' ? '请选择来源 B 的文件' : 'Select file for source B', 'warn'); return; }

  btn.classList.add('loading'); btn.disabled = true;
  empty.style.display = 'none'; results.innerHTML = ''; stats.style.display = 'none';

  try {
    // For env type, get current env path
    if (sourceA.path === '__current__') { const env = await api.getCurrentEnv(); sourceA.path = env ? env.path : ''; }
    if (sourceB.path === '__current__') { const env = await api.getCurrentEnv(); sourceB.path = env ? env.path : ''; }

    const data = await api.diffRequirements(sourceA, sourceB);
    stats.style.display = 'block';
    stats.innerHTML = `<span style="color:#10b981;">${t('diff.onlyA')}: ${data.onlyA.length}</span> &nbsp;|&nbsp; <span style="color:#ef4444;">${t('diff.onlyB')}: ${data.onlyB.length}</span> &nbsp;|&nbsp; <span style="color:#f59e0b;">${t('diff.changed')}: ${data.upgraded.length}</span> &nbsp;|&nbsp; <span style="color:var(--text-muted);">${t('diff.same')}: ${data.same.length}</span>`;

    let html = '<div class="diff-list">';
    for (const p of data.onlyA) html += `<div class="diff-row diff-add"><span class="diff-name">${escapeHtml(p.name)}</span><span class="diff-ver">${escapeHtml(p.version)}</span><span class="diff-tag">+A</span></div>`;
    for (const p of data.onlyB) html += `<div class="diff-row diff-remove"><span class="diff-name">${escapeHtml(p.name)}</span><span class="diff-ver">${escapeHtml(p.version)}</span><span class="diff-tag">+B</span></div>`;
    for (const p of data.upgraded) html += `<div class="diff-row diff-change"><span class="diff-name">${escapeHtml(p.name)}</span><span class="diff-ver">${escapeHtml(p.versionA)} → ${escapeHtml(p.versionB)}</span><span class="diff-tag">Δ</span></div>`;
    html += '</div>';
    results.innerHTML = html;
  } catch (err) {
    empty.style.display = 'block';
    showToast(err.message, 'err');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ---- 离线下载 ----

async function browseOfflineDest() {
  const dir = await api.browseDirectory();
  if (dir) document.getElementById('offline-dest').value = dir;
}

async function startOfflineDownload() {
  const packagesStr = document.getElementById('offline-packages').value.trim();
  const destDir = document.getElementById('offline-dest').value.trim();
  const platform = document.getElementById('offline-platform').value;
  const includeDeps = document.getElementById('offline-deps').checked;
  const btn = document.getElementById('btn-offline-download');
  const progress = document.getElementById('offline-progress');
  const result = document.getElementById('offline-result');

  if (!packagesStr) { showToast(currentLang === 'zh' ? '请输入包名' : 'Enter package names', 'warn'); return; }
  if (!destDir) { showToast(currentLang === 'zh' ? '请选择目标目录' : 'Select destination directory', 'warn'); return; }

  const packages = packagesStr.split(/\s+/).filter(Boolean);
  btn.classList.add('loading'); btn.disabled = true;
  progress.style.display = 'block'; result.style.display = 'none';
  document.getElementById('offline-progress-label').textContent = t('offline.downloading');
  document.getElementById('offline-progress-fill').style.width = '30%';

  try {
    const res = await api.downloadPackages(packages, destDir, { includeDeps, platform });
    document.getElementById('offline-progress-fill').style.width = '100%';
    document.getElementById('offline-progress-label').textContent = t('offline.done');
    result.style.display = 'block';
    result.innerHTML = `<div class="toast-inline ok">✅ ${t('offline.done')}: ${res.downloaded} ${currentLang === 'zh' ? '个包已下载到' : 'packages downloaded to'} ${escapeHtml(res.destDir)}</div>`;
    showToast(t('offline.done'), 'ok');
  } catch (err) {
    document.getElementById('offline-progress-label').textContent = err.message;
    document.getElementById('offline-progress-fill').style.width = '0%';
    showToast(err.message, 'err');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

// ---- 操作撤销 ----

async function refreshUndoButton() {
  try {
    const status = await api.canUndo();
    const btn = document.getElementById('btn-undo');
    if (status.available) {
      btn.style.display = '';
      btn.title = status.lastAction;
    } else {
      btn.style.display = 'none';
    }
  } catch { /* ignore */ }
}

async function performUndo() {
  const btn = document.getElementById('btn-undo');
  btn.disabled = true;
  try {
    showToast(t('undo.running'), 'info');
    await api.performUndo();
    showToast(t('undo.done'), 'ok');
    refreshAllData();
  } catch (err) {
    showToast(`${t('undo.failed')}: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
    refreshUndoButton();
  }
}

// ---- 系统集成（右键菜单） ----

async function loadContextMenuStatus() {
  try {
    const status = await api.getExplorerStatus();
    const toggle = document.getElementById('toggle-context-menu');
    if (toggle) toggle.checked = status.enabled;
  } catch { /* ignore */ }
}

async function toggleContextMenu() {
  const toggle = document.getElementById('toggle-context-menu');
  try {
    if (toggle.checked) {
      const res = await api.enableExplorerMenu();
      if (!res.success) { toggle.checked = false; showToast(res.message, 'err'); }
      else showToast(currentLang === 'zh' ? '右键菜单已启用' : 'Context menu enabled', 'ok');
    } else {
      const res = await api.disableExplorerMenu();
      if (!res.success) { toggle.checked = true; showToast(res.message, 'err'); }
      else showToast(currentLang === 'zh' ? '右键菜单已禁用' : 'Context menu disabled', 'info');
    }
  } catch (err) {
    showToast(err.message, 'err');
  }
}

// ---- 版本历史（包详情弹窗增强） ----

async function loadReleaseHistory(pkgName, container) {
  container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">${t('releases.loading')}</div>`;
  try {
    const data = await api.getPackageReleases(pkgName);
    if (!data.releases || data.releases.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">${t('releases.empty')}</div>`;
      return;
    }
    let html = '<div class="release-timeline">';
    for (const rel of data.releases) {
      const date = rel.uploadTime ? rel.uploadTime.split('T')[0] : '-';
      html += `<div class="release-item"><span class="release-ver">${escapeHtml(rel.version)}</span><span class="release-date">${date}</span></div>`;
    }
    html += '</div>';
    if (data.homePage || (data.projectUrls && data.projectUrls.Changelog)) {
      const link = (data.projectUrls && data.projectUrls.Changelog) || data.homePage;
      html += `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="btn btn-sm" style="margin-top:8px; display:inline-block;">${t('releases.viewChangelog')}</a>`;
    }
    container.innerHTML = html;
  } catch {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">${t('releases.empty')}</div>`;
  }
}

// ---- 初始化 ----

// ---- 环境诊断 ----

async function runConflictCheck() {
  const btn = document.getElementById('btn-check-conflicts');
  const results = document.getElementById('diag-results');
  const empty = document.getElementById('diag-empty');
  const scoreEl = document.getElementById('diag-score');
  const statsEl = document.getElementById('diag-stats');

  btn.classList.add('loading'); btn.disabled = true;
  empty.style.display = 'none';
  scoreEl.style.display = 'none';
  statsEl.style.display = 'none';
  results.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${t('diag.checking')}</div>`;

  try {
    const data = await api.checkConflicts();
    if (data.ok) {
      results.innerHTML = `<div class="toast-inline ok" style="padding:16px; text-align:center;">✅ ${currentLang === 'zh' ? '未检测到依赖冲突，环境健康！' : 'No dependency conflicts found. Environment is healthy!'}</div>`;
      showToast(currentLang === 'zh' ? '无依赖冲突' : 'No conflicts', 'ok');
    } else {
      let html = `<div style="margin-bottom:10px; font-size:13px; color:var(--tag-danger-text); font-weight:600;">⚠️ ${currentLang === 'zh' ? `检测到 ${data.conflicts.length} 个依赖冲突` : `${data.conflicts.length} conflict(s) detected`}</div>`;
      html += '<div class="diff-list">';
      for (const c of data.conflicts) {
        html += `<div class="diff-row diff-remove">
          <span class="diff-name">${escapeHtml(c.package || '-')}</span>
          <span class="diff-ver">${c.installed ? `${t('diag.installed')}: ${escapeHtml(c.installed)}` : `${t('diag.missing')}`}</span>
          <span class="diff-tag" title="${escapeHtml(c.message)}">${escapeHtml(c.requires)}</span>
        </div>`;
      }
      html += '</div>';
      results.innerHTML = html;
      showToast(currentLang === 'zh' ? `发现 ${data.conflicts.length} 个冲突` : `${data.conflicts.length} conflicts`, 'warn');
    }
  } catch (err) {
    results.innerHTML = `<div style="text-align:center; padding:16px; color:var(--tag-danger-text);">${escapeHtml(err.message)}</div>`;
    showToast(err.message, 'err');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

async function runHealthCheck() {
  const btn = document.getElementById('btn-health-check');
  const results = document.getElementById('diag-results');
  const empty = document.getElementById('diag-empty');
  const scoreEl = document.getElementById('diag-score');
  const scoreValue = document.getElementById('diag-score-value');
  const statsEl = document.getElementById('diag-stats');

  btn.classList.add('loading'); btn.disabled = true;
  empty.style.display = 'none';
  results.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${t('diag.running')}</div>`;

  try {
    const report = await api.healthCheck();

    // 显示评分
    scoreEl.style.display = 'block';
    const color = report.score >= 80 ? '#10b981' : report.score >= 60 ? '#f59e0b' : '#ef4444';
    scoreValue.textContent = report.score;
    scoreValue.style.color = color;

    // 显示统计
    statsEl.style.display = 'flex';
    statsEl.innerHTML = `
      <span class="audit-badge ok">${t('diag.packages')}: ${report.totalPackages}</span>
      <span class="audit-badge ${report.conflicts.length > 0 ? 'high' : 'ok'}">${t('diag.conflicts')}: ${report.conflicts.length}</span>
      <span class="audit-badge ${report.brokenPackages.length > 0 ? 'critical' : 'ok'}">${t('diag.broken')}: ${report.brokenPackages.length}</span>
    `;

    // 显示问题列表
    if (report.issues.length === 0) {
      results.innerHTML = `<div class="toast-inline ok" style="padding:16px; text-align:center;">✅ ${currentLang === 'zh' ? '环境状态良好，未发现问题' : 'Environment is healthy, no issues found'}</div>`;
    } else {
      let html = '<div class="diff-list">';
      for (const issue of report.issues) {
        const icon = issue.level === 'error' ? '❌' : '⚠️';
        const cls = issue.level === 'error' ? 'diff-remove' : 'diff-change';
        html += `<div class="diff-row ${cls}"><span class="diff-name">${icon}</span><span class="diff-ver" style="flex:1;">${escapeHtml(issue.message)}</span></div>`;
      }
      html += '</div>';
      results.innerHTML = html;
    }

    showToast(`${t('diag.scoreLabel')}: ${report.score}/100`, report.score >= 80 ? 'ok' : 'warn');
  } catch (err) {
    scoreEl.style.display = 'none';
    statsEl.style.display = 'none';
    results.innerHTML = `<div style="text-align:center; padding:16px; color:var(--tag-danger-text);">${escapeHtml(err.message)}</div>`;
    showToast(err.message, 'err');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

function initTools() {
  initToolsTabs();
  initDepGraph();
  loadContextMenuStatus();
  refreshUndoButton();
}
