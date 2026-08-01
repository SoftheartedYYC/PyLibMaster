// ============ Core：全局状态与通用工具 ============
//
// 模块职责：
// - 提供 API 桥接（window.electronAPI）和 i18n 引用
// - 定义全局共享状态变量（被所有渲染进程模块共用）
// - 提供通用工具函数（HTML 转义、Toast 提示、动画等）
//
// 注意：这里的状态变量被其余所有模块共享，请勿在其他文件重复声明。
// 其他模块通过直接访问全局变量（而非 import/export）来使用这些状态。

// ---- 全局引用 ----
const api = window.electronAPI;  // 主进程 API 桥接（由 preload.js 暴露）
const i18n = window.I18N;        // 国际化字典（由 i18n.js 注册）

// ---- 全局状态变量 ----
let currentLang = 'zh';               // 当前语言（zh/en）
function t(key) { return i18n[currentLang][key] || key; } // 国际化翻译函数

let installedLibs = [];               // 已安装的包列表
let updateLibs = [];                  // 可更新的包列表
let mirrors = [];                     // 镜像源列表
let envs = [];                        // Python 环境列表
let currentEnvIndex = -1;             // 当前环境索引
let logData = [];                     // 操作日志数据
let todayInstalled = 0;               // 今日安装计数
let pendingUninstall = null;          // 待卸载信息 {names: [], mode: 'single'|'batch'}
let editingMirrorIndex = -1;          // 正在编辑的镜像索引
let appConfig = {};                   // 应用配置缓存
let progressOperation = null;         // 当前进度操作类型 ('install'|'uninstall'|'update'|'rollback')
let progressTotal = 0;                // 进度总数
let progressDone = 0;                 // 进度已完成数
let progressHideTimer = null;         // 操作完成后延迟隐藏进度卡片的定时器
let currentOperationId = null;        // 当前操作 ID（用于取消）
let selectedForUninstall = new Set(); // 卸载页面勾选的库名称集合
let selectedForUpdate = new Set();    // 更新页面勾选的库名称集合

// ---- 通用工具函数 ----

/**
 * HTML 转义（防止 XSS 注入）
 * 将用户输入的字符串安全地转义后插入 HTML
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 显示 Toast 提示消息
 * @param {string} msg - 消息内容
 * @param {string} [type='ok'] - 类型（ok/err/info/warn）
 */
function showToast(msg, type = 'ok') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<div class="toast-dot"></div><span>' + escapeHtml(msg) + '</span>';
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

/** 生成唯一操作 ID（用于跟踪和取消操作） */
function generateOperationId() {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 统计数值动画效果
 * - 数值变化时添加缩放动画
 * @param {string} id - DOM 元素 ID
 * @param {number} value - 新数值
 */
function animateStat(id, value) {
  const el = document.getElementById(id);
  const v = value == null ? 0 : value;
  if (el.textContent !== String(v)) {
    el.textContent = v;
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 300);
  }
}

/** 关闭模态对话框 */
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
