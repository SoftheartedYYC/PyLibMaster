/**
 * @file preload.js
 * @description Electron 预加载脚本（安全桥接层）
 * 
 * 职责：
 * - 在渲染进程加载前执行，通过 contextBridge 安全地暴露主进程 API
 * - 使用 IPC 通信将渲染进程的请求转发给主进程
 * - 确保渲染进程无法直接访问 Node.js API（安全隔离）
 * 
 * 架构位置：
 * 主进程 (Node.js) ←→ preload.js (桥接) ←→ 渲染进程 (浏览器环境)
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 通过 contextBridge 将主进程 API 暴露到渲染进程的 window.electronAPI 对象
 * 渲染进程可以通过 window.electronAPI.xxx() 调用这些方法
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ============ 窗口控制 ============
  // 最小化、最大化/还原、关闭窗口
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  // ============ 环境管理 ============
  // 检测、获取、切换 Python 环境
  detectEnvironments: () => ipcRenderer.invoke('env:detect'),
  getCurrentEnv: () => ipcRenderer.invoke('env:getCurrent'),
  switchEnvironment: (envPath) => ipcRenderer.invoke('env:switch', envPath),

  // ============ Python 一键安装 ============
  // 获取可安装版本列表、执行安装、监听安装进度
  listPythonVersions: () => ipcRenderer.invoke('python:listVersions'),
  installPython: (version) => ipcRenderer.invoke('python:install', version),
  onPythonInstallProgress: (callback) => {
    ipcRenderer.removeAllListeners('python:install-progress');
    ipcRenderer.on('python:install-progress', (event, data) => callback(data));
  },

  // ============ 虚拟环境管理 ============
  // 创建、列出、删除虚拟环境
  createVenv: (options) => ipcRenderer.invoke('venv:create', options),
  listVenvs: () => ipcRenderer.invoke('venv:list'),
  deleteVenv: (name) => ipcRenderer.invoke('venv:delete', name),
  getVenvInfo: (name) => ipcRenderer.invoke('venv:info', name),

  // ============ 包查询 ============
  // 获取已安装列表、可更新列表、搜索包
  listInstalled: () => ipcRenderer.invoke('pip:list'),
  listInstalledCached: () => ipcRenderer.invoke('pip:listCached'),
  listOutdated: () => ipcRenderer.invoke('pip:outdated'),
  searchPackage: (keyword) => ipcRenderer.invoke('pip:search', keyword),
  // 搜索 PyPI 包信息（安装页实时搜索建议）
  searchPyPI: (keyword) => ipcRenderer.invoke('pip:searchPyPI', keyword),
  // 获取包详细信息（pip show）
  showPackageInfo: (pkgName) => ipcRenderer.invoke('pip:showInfo', pkgName),
  // 获取包依赖树
  getDependencyTree: (pkgName) => ipcRenderer.invoke('pip:depTree', pkgName),
  // 导出环境为 requirements.txt
  exportRequirements: (options) => ipcRenderer.invoke('pip:export', options),
  // 从 requirements.txt 导入
  importRequirements: (filePath, options) => ipcRenderer.invoke('pip:import', filePath, options),
  // 对比两个环境
  compareEnvironments: (envA, envB) => ipcRenderer.invoke('pip:compareEnvs', envA, envB),

  // ============ 包操作 ============
  // 安装、卸载、更新包，支持取消操作
  installPackages: (packages, options) => ipcRenderer.invoke('pip:install', packages, options),
  installFromFile: (filePath, options) => ipcRenderer.invoke('pip:installFromFile', filePath, options),
  uninstallPackages: (packages, options) => ipcRenderer.invoke('pip:uninstall', packages, options),
  updatePackages: (packages, options) => ipcRenderer.invoke('pip:update', packages, options),
  cancelPipOperation: (operationId) => ipcRenderer.invoke('pip:cancel', operationId),
  repairPip: (options) => ipcRenderer.invoke('pip:repair', options),

  // ============ 备份管理 ============
  // 创建、列出、恢复、删除备份
  createBackup: () => ipcRenderer.invoke('backup:create'),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (backupId) => ipcRenderer.invoke('backup:restore', backupId),
  deleteBackup: (backupId) => ipcRenderer.invoke('backup:delete', backupId),

  // ============ 镜像源管理 ============
  // 获取、测试、设置、添加、更新、删除镜像源，配置智能路由
  getMirrors: () => ipcRenderer.invoke('mirror:list'),
  testMirrorSpeed: (url) => ipcRenderer.invoke('mirror:test', url),
  testAllMirrors: () => ipcRenderer.invoke('mirror:testAll'),
  setDefaultMirror: (url) => ipcRenderer.invoke('mirror:setDefault', url),
  addCustomMirror: (name, url, remark) => ipcRenderer.invoke('mirror:addCustom', name, url, remark),
  updateMirror: (url, updates) => ipcRenderer.invoke('mirror:update', url, updates),
  removeCustomMirror: (url) => ipcRenderer.invoke('mirror:removeCustom', url),
  restoreDefaultMirrors: () => ipcRenderer.invoke('mirror:restoreDefaults'),
  setSmartRoute: (enabled) => ipcRenderer.invoke('mirror:smartRoute', enabled),
  getSmartRoute: () => ipcRenderer.invoke('mirror:getSmartRoute'),
  writePipMirrorConfig: () => ipcRenderer.invoke('mirror:writePipConfig'),
  reorderMirrors: (urlOrder) => ipcRenderer.invoke('mirror:reorder', urlOrder),

  // ============ 日志管理 ============
  // 获取、清空、添加日志记录
  getLogs: (filter) => ipcRenderer.invoke('log:get', filter),
  clearLogs: () => ipcRenderer.invoke('log:clear'),
  addLog: (entry) => ipcRenderer.invoke('log:add', entry),

  // ============ 配置管理 ============
  // 获取、设置应用配置
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  setConfigBulk: (updates) => ipcRenderer.invoke('config:setBulk', updates),

  // ============ 系统功能 ============
  // 获取应用版本、浏览目录/文件、打开路径
  getAppVersion: () => ipcRenderer.invoke('system:version'),
  browseDirectory: () => ipcRenderer.invoke('system:browseDirectory'),
  browseFile: (filters) => ipcRenderer.invoke('system:browseFile', filters),
  openPath: (filePath) => ipcRenderer.invoke('system:openPath', filePath),

  // ============ 桌面通知 ============
  sendNotification: (title, body) => ipcRenderer.invoke('notify:send', title, body),

  // ============ 日志导出 ============
  exportLogs: (format) => ipcRenderer.invoke('log:export', format),

  // ============ 主题 ============
  getSystemTheme: () => ipcRenderer.invoke('theme:getSystem'),
  onThemeChanged: (callback) => {
    ipcRenderer.removeAllListeners('theme:changed');
    ipcRenderer.on('theme:changed', (event, theme) => callback(theme));
  },
  onUpdatesAvailable: (callback) => {
    ipcRenderer.removeAllListeners('updates:available');
    ipcRenderer.on('updates:available', (event, count) => callback(count));
  },

  // ============ 定时更新调度器 ============
  getSchedulerStatus: () => ipcRenderer.invoke('scheduler:getStatus'),
  saveSchedulerConfig: (config) => ipcRenderer.invoke('scheduler:save', config),
  runSchedulerNow: () => ipcRenderer.invoke('scheduler:runNow'),
  onSchedulerExecuted: (callback) => {
    ipcRenderer.removeAllListeners('scheduler:executed');
    ipcRenderer.on('scheduler:executed', (event, msg) => callback(msg));
  },

  // ============ 项目模板与环境快照 ============
  getTemplates: () => ipcRenderer.invoke('template:list'),
  addCustomTemplate: (tpl) => ipcRenderer.invoke('template:add', tpl),
  removeCustomTemplate: (id) => ipcRenderer.invoke('template:remove', id),
  createFromTemplate: (options) => ipcRenderer.invoke('template:create', options),
  createSnapshot: (envPath, label) => ipcRenderer.invoke('snapshot:create', envPath, label),
  listSnapshots: () => ipcRenderer.invoke('snapshot:list'),
  getSnapshotDetail: (id) => ipcRenderer.invoke('snapshot:detail', id),
  restoreSnapshot: (snapshotId, envPath) => ipcRenderer.invoke('snapshot:restore', snapshotId, envPath),
  deleteSnapshot: (id) => ipcRenderer.invoke('snapshot:delete', id),

  // ============ 安全漏洞扫描 ============
  runAudit: () => ipcRenderer.invoke('audit:run'),
  getCachedAudit: () => ipcRenderer.invoke('audit:cached'),

  // ============ 磁盘空间分析 ============
  getDiskUsage: () => ipcRenderer.invoke('pip:diskUsage'),

  // ============ 离线包下载 ============
  downloadPackages: (packages, destDir, options) => ipcRenderer.invoke('pip:download', packages, destDir, options),

  // ============ requirements 对比 ============
  diffRequirements: (sourceA, sourceB) => ipcRenderer.invoke('pip:diffRequirements', sourceA, sourceB),

  // ============ 包版本发布历史 ============
  getPackageReleases: (pkgName) => ipcRenderer.invoke('pip:releases', pkgName),

  // ============ 全局依赖图谱 ============
  getDependencyGraph: () => ipcRenderer.invoke('pip:depGraph'),

  // ============ 环境诊断 ============
  checkConflicts: () => ipcRenderer.invoke('pip:checkConflicts'),
  healthCheck: () => ipcRenderer.invoke('pip:healthCheck'),

  // ============ 操作撤销 ============
  canUndo: () => ipcRenderer.invoke('undo:canUndo'),
  performUndo: () => ipcRenderer.invoke('undo:perform'),
  clearUndo: () => ipcRenderer.invoke('undo:clear'),

  // ============ Windows 资源管理器集成 ============
  getExplorerStatus: () => ipcRenderer.invoke('explorer:getStatus'),
  enableExplorerMenu: () => ipcRenderer.invoke('explorer:enable'),
  disableExplorerMenu: () => ipcRenderer.invoke('explorer:disable'),

  // ============ 进度事件监听 ============
  // 监听主进程推送的 pip 操作进度（安装/卸载/更新）
  onProgress: (callback) => {
    // 先移除旧监听器，避免重复绑定
    ipcRenderer.removeAllListeners('pip:progress');
    ipcRenderer.on('pip:progress', (event, payload) => callback(payload));
  },
  removeProgressListener: (callback) => ipcRenderer.removeListener('pip:progress', callback),

  // ============ 自动更新事件监听 ============
  // 监听应用更新的各个阶段事件
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  // 获取当前生效的更新下载源（github/gitee）
  getUpdateSource: () => ipcRenderer.invoke('updater:getSource'),
  // 正在检查更新
  onUpdaterChecking: (callback) => {
    ipcRenderer.removeAllListeners('updater:checking');
    ipcRenderer.on('updater:checking', () => callback());
  },
  // 正在对两个更新源测速
  onUpdaterSpeedTesting: (callback) => {
    ipcRenderer.removeAllListeners('updater:speed-testing');
    ipcRenderer.on('updater:speed-testing', (event, data) => callback(data));
  },
  // 测速完成，已选定下载源
  onUpdaterSourceSelected: (callback) => {
    ipcRenderer.removeAllListeners('updater:source-selected');
    ipcRenderer.on('updater:source-selected', (event, data) => callback(data));
  },
  // 发现新版本可用
  onUpdaterAvailable: (callback) => {
    ipcRenderer.removeAllListeners('updater:available');
    ipcRenderer.on('updater:available', (event, info) => callback(info));
  },
  // 当前已是最新版本
  onUpdaterNotAvailable: (callback) => {
    ipcRenderer.removeAllListeners('updater:not-available');
    ipcRenderer.on('updater:not-available', (event, info) => callback(info));
  },
  // 下载进度更新
  onUpdaterProgress: (callback) => {
    ipcRenderer.removeAllListeners('updater:progress');
    ipcRenderer.on('updater:progress', (event, progress) => callback(progress));
  },
  // 更新已下载完成
  onUpdaterDownloaded: (callback) => {
    ipcRenderer.removeAllListeners('updater:downloaded');
    ipcRenderer.on('updater:downloaded', (event, info) => callback(info));
  },
  // 更新检查或下载出错
  onUpdaterError: (callback) => {
    ipcRenderer.removeAllListeners('updater:error');
    ipcRenderer.on('updater:error', (event, err) => callback(err));
  }
});
