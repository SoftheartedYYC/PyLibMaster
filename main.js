/**
 * @file main.js
 * @description Electron 主进程入口文件
 * 
 * 职责：
 * - 创建和管理应用窗口
 * - 注册所有 IPC 通信处理器（连接渲染进程与核心模块）
 * - 管理应用生命周期（启动、关闭、激活等）
 * - 协调各核心模块的初始化
 */

// ============ 依赖导入 ============
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeTheme, Notification } = require('electron');
const path = require('path');

// 核心业务模块
const pipManager = require('./core/operations/pipManager');          // pip 包管理（安装/卸载/更新/查询）
const mirrorManager = require('./core/config/mirrorManager');    // 镜像源管理
const envManager = require('./core/system/envManager');          // Python 环境检测与切换
const backupManager = require('./core/operations/backupManager');    // 备份与回滚
const logManager = require('./core/system/logManager');          // 操作日志记录
const configManager = require('./core/config/configManager');    // 应用配置持久化
const { isAllowedOpenPath } = require('./utils/security'); // 路径安全校验
const updater = require('./core/system/updater');                // 应用自动更新
const venvManager = require('./core/operations/venvManager');        // 虚拟环境管理
const schedulerManager = require('./core/config/schedulerManager'); // 定时自动更新调度器
const templateManager = require('./core/operations/templateManager');   // 项目模板与环境快照
const auditManager = require('./core/operations/auditManager');         // 安全漏洞扫描
const undoManager = require('./core/operations/undoManager');           // 操作撤销管理
const explorerManager = require('./core/system/explorerManager');   // Windows 资源管理器集成

// 全局窗口引用
let mainWindow;
let tray = null; // 系统托盘实例

/**
 * 创建主窗口
 * - 恢复上次保存的窗口位置和尺寸
 * - 配置安全选项（上下文隔离、禁用 Node 集成）
 * - 设置窗口事件监听（resize/move 保存位置，closed 清理引用）
 * - 拦截外部链接，使用系统浏览器打开
 */
function createWindow() {
  // 从配置中恢复窗口位置和尺寸，若无则使用默认值
  const savedBounds = configManager.getConfig().windowBounds || {};
  const defaultBounds = { width: 1200, height: 760 };
  const bounds = { ...defaultBounds, ...savedBounds };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,              // 窗口最小宽度限制
    minHeight: 600,             // 窗口最小高度限制
    frame: false,               // 隐藏原生窗口边框（使用自定义标题栏）
    titleBarStyle: 'hidden',    // 隐藏标题栏但保留系统按钮区域
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.ico'), // 应用图标
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // 预加载脚本（安全桥接）
      contextIsolation: true,   // 启用上下文隔离（安全最佳实践）
      nodeIntegration: false,   // 禁用 Node 集成（防止 XSS 攻击）
      sandbox: false            // 禁用沙箱（需要 preload 访问 Node API）
    },
    show: false                 // 先隐藏窗口，ready-to-show 后再显示（避免白屏）
  });

  // 加载渲染进程的 HTML 入口文件
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 窗口内容就绪后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 拦截所有新窗口打开请求，使用系统默认浏览器打开外部链接（仅允许 http/https 协议）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  /**
   * 保存窗口位置和尺寸到配置文件
   * - 窗口最大化时不保存（避免恢复时覆盖正常尺寸）
   * - 窗口已销毁时不保存
   * - 使用 500ms 防抖避免拖动窗口时高频写入
   */
  let boundsTimer = null;
  function saveWindowBounds() {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      boundsTimer = null;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const [x, y] = mainWindow.getPosition();
      const [width, height] = mainWindow.getSize();
      configManager.setConfig('windowBounds', { x, y, width, height });
    }, 500);
  }

  // 监听窗口尺寸和位置变化，实时保存
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // 关闭窗口时：如果开启了托盘最小化，则隐藏窗口而非关闭
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      const cfg = configManager.getConfig();
      if (cfg.minimizeToTray !== false) {
        e.preventDefault();
        mainWindow.hide();
      }
    }
  });

  // 窗口关闭时保存并清理引用
  mainWindow.on('closed', () => {
    saveWindowBounds();
    mainWindow = null;
  });
}

// ============ 应用生命周期 ============

/**
 * 单实例锁：禁止同时运行多个 PyLibMaster 进程
 * - 如果已有一个实例在运行（含托盘后台），新启动时会聚焦到已有窗口并退出自身
 * - 防止用户多次点击快捷方式打开多个窗口/托盘
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[single-instance] Another instance is already running, quitting.');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[single-instance] Second instance launched, focusing existing window.');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  /**
   * 应用就绪时的初始化流程：
   * 1. 创建主窗口
   * 2. 初始化自动更新模块
   * 3. 启动 Python 环境检测
   */
  app.whenReady().then(() => {
    createWindow();
    createTray();             // 创建系统托盘图标
    updater.initUpdater(mainWindow);  // 绑定更新事件到窗口
    envManager.startDetection();      // 后台异步检测 Python 环境
    setupThemeSync();                 // 设置主题跟随系统
    autoCheckUpdates();               // 启动时静默检查更新
    schedulerManager.startScheduler((title, body) => {  // 启动定时更新调度器
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scheduler:executed', body);
      }
    });

    // macOS 点击 Dock 图标时重新创建窗口（如果没有窗口存在）
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// 所有窗口关闭时退出应用（macOS 除外，macOS 通常保持活跃直到显式退出）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * 应用退出前的清理工作：
 * - 取消所有正在运行的子进程（pip 安装/卸载等操作）
 */
app.on('before-quit', () => {
  app.isQuitting = true; // 标记正在退出，避免 close 事件拦截
  const { cancelAllProcesses } = require('./utils/processRunner');
  const count = cancelAllProcesses();
  if (count > 0) {
    console.log(`[shutdown] Cancelled ${count} active process(es) before quit`);
  }
  // 退出前立即刷新日志到磁盘，避免防抖延迟导致数据丢失
  logManager.flushLogs();
});

// ============ 系统托盘 ============

/**
 * 创建系统托盘图标
 * - 右键菜单：显示窗口 / 退出
 * - 双击托盘图标恢复窗口
 */
function createTray() {
  const iconPath = path.join(__dirname, 'renderer', 'assets', 'icon.ico');
  tray = new Tray(iconPath);
  tray.setToolTip('PyLibMaster - Python 库管理工具');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ============ 主题跟随系统 ============

/**
 * 设置主题跟随系统
 * - 当配置为 'system' 时，监听系统主题变化并同步到渲染进程
 */
function setupThemeSync() {
  nativeTheme.on('updated', () => {
    const cfg = configManager.getConfig();
    if (cfg.theme === 'system' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  });
}

// ============ 启动时静默检查更新 ============

/**
 * 启动时静默检查可更新包数量
 * - 仅在配置开启时执行
 * - 结果通过状态栏展示
 */
async function autoCheckUpdates() {
  try {
    const cfg = configManager.getConfig();
    if (cfg.autoCheckUpdates === false) return;
    // 延迟 5 秒后执行，避免影响启动速度
    setTimeout(async () => {
      try {
        const outdated = await pipManager.listOutdated();
        if (outdated.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updates:available', outdated.length);
        }
      } catch { /* 静默失败 */ }
    }, 5000);
  } catch { /* 配置读取失败时跳过 */ }
}

// ============ IPC 处理器：窗口控制 ============
// 渲染进程通过 preload.js 暴露的 API 调用这些处理器

// 最小化窗口
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

// 最大化/还原窗口（切换状态）
ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

// 关闭窗口
ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

// ============ IPC 处理器：环境管理 ============

// 检测系统中所有可用的 Python 环境
ipcMain.handle('env:detect', async () => envManager.detectEnvironments());
// 获取当前选中的 Python 环境
ipcMain.handle('env:getCurrent', () => envManager.getCurrent());
// 切换到指定的 Python 环境
ipcMain.handle('env:switch', (event, envPath) => envManager.switchEnvironment(envPath));

// ============ IPC 处理器：虚拟环境管理 ============

// 创建虚拟环境
ipcMain.handle('venv:create', async (event, options) => {
  return venvManager.createVenv(options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'venv', data, type });
  });
});
// 列出所有虚拟环境
ipcMain.handle('venv:list', async () => venvManager.listVenvs());
// 删除虚拟环境
ipcMain.handle('venv:delete', async (event, name) => {
  return venvManager.deleteVenv(name, (data, type) => {
    event.sender.send('pip:progress', { operation: 'venv', data, type });
  });
});
// 获取虚拟环境详细信息
ipcMain.handle('venv:info', async (event, name) => venvManager.getVenvInfo(name));

// ============ IPC 处理器：包查询 ============

// 获取已安装包的完整列表（实时扫描 site-packages）
ipcMain.handle('pip:list', async () => pipManager.listInstalled());
// 获取已安装包的缓存列表（快速响应，5分钟有效期）
ipcMain.handle('pip:listCached', async () => pipManager.listInstalledCached());
// 获取有可用更新的包列表
ipcMain.handle('pip:outdated', async () => pipManager.listOutdated());
// 搜索 PyPI 上的包（使用 pip index versions）
ipcMain.handle('pip:search', async (event, keyword) => pipManager.searchPackage(keyword));
// 获取包的详细信息（pip show）
ipcMain.handle('pip:showInfo', async (event, pkgName) => pipManager.showPackageInfo(pkgName));
// 获取包的依赖树
ipcMain.handle('pip:depTree', async (event, pkgName) => pipManager.getDependencyTree(pkgName));
// 导出当前环境为 requirements.txt
ipcMain.handle('pip:export', async (event, options) => pipManager.exportRequirements(options));
// 从 requirements.txt 导入包
ipcMain.handle('pip:import', async (event, filePath, options) => {
  return pipManager.importRequirements(filePath, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'install', data, type });
  });
});
// 对比两个环境的包差异
ipcMain.handle('pip:compareEnvs', async (event, envPathA, envPathB) => pipManager.compareEnvironments(envPathA, envPathB));

// ============ IPC 处理器：安装 / 卸载 / 更新 ============
// 这些操作都支持实时进度回调，通过 pip:progress 事件推送给渲染进程

// 安装包（支持批量、并行、版本控制、自动回滚）
ipcMain.handle('pip:install', async (event, packages, options) => {
  return pipManager.installPackages(packages, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'install', data, type });
  });
});

// 从文件安装（支持 .whl 和 requirements.txt）
ipcMain.handle('pip:installFromFile', async (event, filePath, options) => {
  return pipManager.installFromFile(filePath, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'install', data, type });
  });
});

// 卸载包（支持批量、安全模式、自动回滚）
ipcMain.handle('pip:uninstall', async (event, packages, options) => {
  return pipManager.uninstallPackages(packages, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'uninstall', data, type });
  });
});

// 更新包（支持批量、并行、智能重试、自动回滚）
ipcMain.handle('pip:update', async (event, packages, options) => {
  return pipManager.updatePackages(packages, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'update', data, type });
  });
});

// 取消正在进行的 pip 操作（通过 operationId 匹配）
ipcMain.handle('pip:cancel', async (event, operationId) => {
  return pipManager.cancelPipOperation(operationId);
});

// 修复 pip（使用 ensurepip 重新引导安装，适用于 pip 被意外卸载的场景）
ipcMain.handle('pip:repair', async (event, options) => {
  return pipManager.repairPip(options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'repair', data, type });
  });
});

// 依赖冲突检测（pip check）
ipcMain.handle('pip:checkConflicts', async () => pipManager.checkConflicts());
// 环境健康检查（综合诊断）
ipcMain.handle('pip:healthCheck', async () => pipManager.healthCheck());

// ============ IPC 处理器：备份与回滚 ============

// 创建当前环境的包列表备份（pip freeze）
ipcMain.handle('backup:create', async () => backupManager.createBackup(envManager.getCurrent()));
// 获取所有备份文件列表
ipcMain.handle('backup:list', async () => backupManager.listBackups());
// 从备份恢复环境（force-reinstall 指定版本的包）
ipcMain.handle('backup:restore', async (event, backupId) => {
  return backupManager.restoreBackup(backupId, envManager.getCurrent(), (data, type) => {
    event.sender.send('pip:progress', { operation: 'rollback', data, type });
  });
});
// 删除指定的备份文件
ipcMain.handle('backup:delete', async (event, backupId) => backupManager.deleteBackup(backupId));

// ============ IPC 处理器：镜像源管理 ============

// 获取所有镜像源列表（内置 + 自定义）
ipcMain.handle('mirror:list', () => mirrorManager.getMirrors());
// 测试单个镜像源的响应速度
ipcMain.handle('mirror:test', async (event, url) => mirrorManager.testMirrorSpeed(url));
// 批量测试所有镜像源速度
ipcMain.handle('mirror:testAll', async () => mirrorManager.testAllMirrors());
// 设置默认镜像源
ipcMain.handle('mirror:setDefault', (event, url) => mirrorManager.setDefaultMirror(url));
// 添加自定义镜像源（名称、URL、备注）
ipcMain.handle('mirror:addCustom', (event, name, url, remark) => mirrorManager.addCustomMirror(name, url, remark));
// 更新镜像源信息（名称、URL、备注）
ipcMain.handle('mirror:update', (event, url, updates) => mirrorManager.updateMirror(url, updates));
// 删除自定义镜像源
ipcMain.handle('mirror:removeCustom', (event, url) => mirrorManager.removeCustomMirror(url));
// 恢复为内置默认镜像源列表
ipcMain.handle('mirror:restoreDefaults', () => mirrorManager.restoreDefaultMirrors());
// 开启/关闭智能路由（自动选择最快镜像）
ipcMain.handle('mirror:smartRoute', (event, enabled) => mirrorManager.setSmartRoute(enabled));
// 获取智能路由开关状态
ipcMain.handle('mirror:getSmartRoute', () => mirrorManager.getSmartRoute());
// 将当前镜像源配置写入 pip 配置文件（pip.ini/pip.conf）
ipcMain.handle('mirror:writePipConfig', async () => mirrorManager.writePipConfig(envManager.getCurrent()));
// 重新排序镜像源列表（拖拽排序后保存优先级）
ipcMain.handle('mirror:reorder', (event, urlOrder) => mirrorManager.reorderMirrors(urlOrder));

// ============ IPC 处理器：日志管理 ============

// 获取日志列表（支持按类型和关键词筛选）
ipcMain.handle('log:get', async (event, filter) => logManager.getLogs(filter));
// 清空所有日志
ipcMain.handle('log:clear', async () => logManager.clearLogs());
// 添加一条新的日志记录
ipcMain.handle('log:add', async (event, entry) => logManager.addLog(entry));

// ============ IPC 处理器：配置管理 ============

// 获取完整的应用配置
ipcMain.handle('config:get', () => configManager.getConfig());
// 设置单个配置项
ipcMain.handle('config:set', (event, key, value) => configManager.setConfig(key, value));
// 批量设置多个配置项
ipcMain.handle('config:setBulk', (event, updates) => configManager.setBulk(updates));

// ============ IPC 处理器：自动更新 ============

// 检查是否有新版本可用
ipcMain.handle('updater:check', async () => updater.checkForUpdates());
// 退出应用并安装已下载的更新
ipcMain.handle('updater:install', () => updater.quitAndInstall());

// ============ IPC 处理器：系统功能 ============

// 获取应用版本号和名称
ipcMain.handle('system:version', () => ({ version: app.getVersion(), name: app.getName() }));

// 打开目录选择对话框（用于选择存储路径等）
ipcMain.handle('system:browseDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// 打开文件选择对话框（支持自定义文件类型过滤器）
ipcMain.handle('system:browseFile', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

/**
 * 使用系统默认应用打开指定路径（安全限制）
 * - 仅允许打开文档、下载、用户数据目录下的文件
 * - 防止恶意路径访问（路径遍历攻击防护）
 */
ipcMain.handle('system:openPath', async (event, filePath) => {
  // 白名单：仅允许访问这些目录下的文件
  const allowedDirs = [
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('userData')
  ];
  if (!isAllowedOpenPath(filePath, allowedDirs)) {
    console.warn(`Blocked attempt to open path outside allowed directories: ${filePath}`);
    return false;
  }
  try {
    await shell.openPath(filePath);
    return true;
  } catch (err) {
    return false;
  }
});

// ============ IPC 处理器：桌面通知 ============

// 发送系统桌面通知
ipcMain.handle('notify:send', async (event, title, body) => {
  try {
    if (Notification.isSupported()) {
      const notification = new Notification({ title: title || 'PyLibMaster', body: body || '' });
      notification.show();
      return true;
    }
  } catch { /* 通知发送失败时静默处理 */ }
  return false;
});

// ============ IPC 处理器：日志导出 ============

// 导出日志为 CSV 或 Markdown 文件
ipcMain.handle('log:export', async (event, format) => {
  const logs = logManager.getLogs({});
  if (!logs || logs.length === 0) return null;

  let content = '';
  let defaultName = '';
  if (format === 'csv') {
    content = 'Time,Type,Status,Action,Detail\n';
    content += logs.map(l => `"${l.time}","${l.type}","${l.status}","${(l.action || '').replace(/"/g, '""')}","${(l.detail || '').replace(/"/g, '""')}"`).join('\n');
    defaultName = 'pylibmaster-logs.csv';
  } else {
    content = '# PyLibMaster 操作日志\n\n';
    content += '| 时间 | 类型 | 状态 | 操作 | 详情 |\n';
    content += '|------|------|------|------|------|\n';
    content += logs.map(l => `| ${l.time} | ${l.type} | ${l.status} | ${l.action || ''} | ${l.detail || ''} |`).join('\n');
    defaultName = 'pylibmaster-logs.md';
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: format === 'csv'
      ? [{ name: 'CSV', extensions: ['csv'] }]
      : [{ name: 'Markdown', extensions: ['md'] }]
  });
  if (result.canceled || !result.filePath) return null;

  const fs = require('fs');
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return result.filePath;
});

// ============ IPC 处理器：主题 ============

// 获取当前系统主题（用于“跟随系统”模式）
ipcMain.handle('theme:getSystem', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// ============ IPC 处理器：定时更新调度器 ============

// 获取调度器状态和配置
ipcMain.handle('scheduler:getStatus', () => schedulerManager.getStatus());

// 保存调度器配置并重启调度器
ipcMain.handle('scheduler:save', (event, config) => {
  schedulerManager.saveSchedulerConfig(config);
  schedulerManager.startScheduler((title, body) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scheduler:executed', body);
    }
  });
  return schedulerManager.getStatus();
});

// 立即执行一次自动更新
ipcMain.handle('scheduler:runNow', async () => {
  return schedulerManager.runAutoUpdate((title, body) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scheduler:executed', body);
    }
  });
});

// ============ IPC 处理器：项目模板与环境快照 ============

// 获取所有模板
ipcMain.handle('template:list', () => templateManager.getTemplates());
// 添加自定义模板
ipcMain.handle('template:add', (event, tpl) => templateManager.addCustomTemplate(tpl));
// 删除自定义模板
ipcMain.handle('template:remove', (event, id) => templateManager.removeCustomTemplate(id));
// 从模板创建环境
ipcMain.handle('template:create', async (event, options) => {
  return templateManager.createFromTemplate(options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'install', data, type });
  });
});
// 创建环境快照
ipcMain.handle('snapshot:create', async (event, envPath, label) => templateManager.createSnapshot(envPath, label));
// 列出所有快照
ipcMain.handle('snapshot:list', () => templateManager.listSnapshots());
// 获取快照详情
ipcMain.handle('snapshot:detail', (event, id) => templateManager.getSnapshotDetail(id));
// 从快照恢复
ipcMain.handle('snapshot:restore', async (event, snapshotId, envPath) => {
  return templateManager.restoreSnapshot(snapshotId, envPath, (data, type) => {
    event.sender.send('pip:progress', { operation: 'rollback', data, type });
  });
});
// 删除快照
ipcMain.handle('snapshot:delete', (event, id) => templateManager.deleteSnapshot(id));

// ============ IPC 处理器：安全漏洞扫描 ============

// 执行漏洞扫描
ipcMain.handle('audit:run', async (event) => {
  return auditManager.runAudit((data, type) => {
    event.sender.send('pip:progress', { operation: 'audit', data, type });
  });
});
// 获取缓存的扫描结果
ipcMain.handle('audit:cached', () => auditManager.getCachedResult());

// ============ IPC 处理器：磁盘空间分析 ============

// 获取当前环境的磁盘占用分析
ipcMain.handle('pip:diskUsage', async () => pipManager.getDiskUsage());

// ============ IPC 处理器：离线包下载 ============

// 下载包到指定目录（用于离线安装）
ipcMain.handle('pip:download', async (event, packages, destDir, options) => {
  return pipManager.downloadPackages(packages, destDir, options, (data, type) => {
    event.sender.send('pip:progress', { operation: 'download', data, type });
  });
});

// ============ IPC 处理器：requirements 对比 ============

// 对比两个来源的包列表差异
ipcMain.handle('pip:diffRequirements', async (event, sourceA, sourceB) => {
  return pipManager.diffRequirements(sourceA, sourceB);
});

// ============ IPC 处理器：包版本发布历史 ============

// 获取包的版本发布历史（PyPI JSON API）
ipcMain.handle('pip:releases', async (event, pkgName) => pipManager.getPackageReleases(pkgName));

// ============ IPC 处理器：全局依赖图谱 ============

// 获取全局依赖关系图数据
ipcMain.handle('pip:depGraph', async () => pipManager.getFullDependencyGraph());

// ============ IPC 处理器：操作撤销 ============

// 获取撤销状态
ipcMain.handle('undo:canUndo', () => undoManager.canUndo());
// 执行撤销操作
ipcMain.handle('undo:perform', async (event) => {
  return undoManager.performUndo((data, type) => {
    event.sender.send('pip:progress', { operation: 'undo', data, type });
  });
});
// 清空撤销历史
ipcMain.handle('undo:clear', () => undoManager.clear());

// ============ IPC 处理器：Windows 资源管理器集成 ============

// 获取右键菜单状态
ipcMain.handle('explorer:getStatus', () => explorerManager.getStatus());
// 启用右键菜单
ipcMain.handle('explorer:enable', () => explorerManager.enableContextMenu());
// 禁用右键菜单
ipcMain.handle('explorer:disable', () => explorerManager.disableContextMenu());
