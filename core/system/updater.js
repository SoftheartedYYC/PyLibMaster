/**
 * @file updater.js
 * @description 应用自动更新管理器（双源：GitHub + Gitee）
 * 
 * 职责：
 * - 基于 electron-updater 实现 GitHub 源自动更新
 * - 支持 Gitee 发行版作为备用下载源（国内加速）
 * - 更新前对两个源并行测速，自动选择较快的源下载
 * - 监听更新事件（检查、下载、完成、错误）并转发给渲染进程
 * - 记录更新相关日志
 * 
 * 更新流程：
 * 1. 检查更新：GitHub（electron-updater）优先，失败自动回退 Gitee（原生 https 直连，不走系统代理）
 * 2. 发现新版本 → 对两源安装包并行测速
 * 3. 选择较快的源下载（GitHub 用 electron-updater，Gitee 用自建下载器）
 * 4. sha512 校验 → 5. 用户确认安装 → 6. 重启应用
 */

const { autoUpdater } = require('electron-updater');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const logManager = require('./logManager');

// ============ 双源配置 ============

/** Gitee 仓库信息（备用更新源，国内加速） */
const GITEE_OWNER = 'soft-hearted-yyc';
const GITEE_REPO = 'PyLibMaster';
/** 测速时下载的字节数（512KB，兼顾准确性与耗时） */
const SPEED_TEST_BYTES = 512 * 1024;
/** 测速/检查请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 8000;

// 配置 autoUpdater：发现新版本后自动下载安装包
// 注意：双源模式下 autoDownload 关闭，由本模块测速后手动触发下载
autoUpdater.autoDownload = false;         // 关闭自动下载，测速后手动选择源
autoUpdater.autoInstallOnAppQuit = false; // 不自动安装，等待用户确认
autoUpdater.autoRunAppAfterInstall = true; // 安装后自动启动应用

// 主窗口引用，用于发送更新事件
let mainWindow = null;
// 防止重复检查更新的标志
let checkInProgress = false;
// 当前使用的下载源（'github' | 'gitee'），供 UI 展示
let activeSource = 'github';
// Gitee 下载状态（自建下载器进行中时为 true，避免与 electron-updater 事件混淆）
let giteeDownloading = false;
// GitHub 检查失败回退 Gitee 期间的标志（抑制 electron-updater error 事件的 UI 弹窗）
let githubFallback = false;
// 测速后选定的 Gitee 安装包信息（下载时复用，避免重复调 API）
let giteeAssetCache = null;
// Gitee 下载完成后的安装包文件路径（供 quitAndInstall 使用）
let pendingGiteeFile = null;

/**
 * 向渲染进程发送更新事件
 * @param {string} channel - IPC 频道名称
 * @param {*} data - 事件数据
 */
function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * 提取更新信息中的可序列化字段
 * - 避免将 electron-updater 原始对象（可能含内部引用）直接通过 IPC 传输
 * @param {Object} info - electron-updater 的 updateInfo 对象
 * @returns {Object} 纯 JSON 可序列化对象
 */
function sanitizeUpdateInfo(info) {
  if (!info) return {};
  return {
    version: info.version || '',
    releaseDate: info.releaseDate || '',
    releaseName: info.releaseName || '',
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
  };
}

/**
 * 提取下载进度中的可序列化字段
 * @param {Object} progress - electron-updater 的 download-progress 对象
 * @returns {Object} 纯 JSON 可序列化对象
 */
function sanitizeProgress(progress) {
  if (!progress) return { percent: 0 };
  return {
    percent: Number(progress.percent) || 0,
    bytesPerSecond: Number(progress.bytesPerSecond) || 0,
    transferred: Number(progress.transferred) || 0,
    total: Number(progress.total) || 0
  };
}

// ============ HTTP 工具 ============

/**
 * 发起带超时的 HTTP/HTTPS 请求（自动跟随重定向）
 * @param {string} url - 请求地址
 * @param {Object} options - 选项 { method, headers, timeout, maxRedirects }
 * @returns {Promise<http.IncomingMessage>} 响应流
 */
function httpRequest(url, options = {}) {
  const { method = 'GET', headers = {}, timeout = REQUEST_TIMEOUT, maxRedirects = 5 } = options;
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method, headers }, (res) => {
      // 跟随重定向（GitHub 下载链接会 302 到 CDN）
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        resolve(httpRequest(nextUrl, { method, headers, timeout, maxRedirects: maxRedirects - 1 }));
        return;
      }
      resolve(res);
    });
    req.setTimeout(timeout, () => req.destroy(new Error(`请求超时: ${url}`)));
    req.on('error', reject);
    req.end();
  });
}

/**
 * GET 请求并返回 JSON 响应体
 * @param {string} url - 请求地址
 * @returns {Promise<Object>} 解析后的 JSON
 */
async function fetchJson(url) {
  const res = await httpRequest(url, { headers: { 'Accept': 'application/json' } });
  try {
    if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
    const text = await streamToString(res);
    return JSON.parse(text);
  } finally {
    res.destroy();
  }
}

/** 将可读流读为 UTF-8 字符串 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

// ============ Gitee 源 ============

/**
 * 从 Gitee Releases API 获取最新发行版信息
 * - 解析附件列表，定位安装包（.exe）与 latest.yml
 * - 使用 Node 原生 https（直连，不走系统代理，国内稳定）
 * @returns {Promise<Object|null>} { version, exeUrl, ymlUrl } 或 null（无发行版）
 */
async function fetchGiteeRelease() {
  const apiUrl = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/releases/latest`;
  try {
    const data = await fetchJson(apiUrl);
    if (!data || !Array.isArray(data.assets)) return null;
    const assets = data.assets.map(a => ({ name: a.name, url: a.browser_download_url }));
    const exe = assets.find(a => /PyLibMaster-Setup-.*\.exe$/i.test(a.name));
    const yml = assets.find(a => a.name === 'latest.yml');
    if (!exe || !yml) return null;
    // 从安装包文件名提取版本号：PyLibMaster-Setup-1.5.30.exe -> 1.5.30
    const m = exe.name.match(/Setup-(\d+\.\d+\.\d+)\.exe/i);
    if (!m) return null;
    return { version: m[1], exeUrl: exe.url, ymlUrl: yml.url };
  } catch (err) {
    logManager.addLog({ action: 'Fetch Gitee release failed', status: 'failed', type: 'system', detail: err.message });
    return null;
  }
}

/**
 * 对指定 URL 测速（Range 请求下载少量字节）
 * @param {string} url - 下载地址
 * @returns {Promise<number>} 耗时（毫秒），失败返回 Infinity
 */
async function testDownloadSpeed(url) {
  const start = Date.now();
  let res = null;
  try {
    res = await httpRequest(url, {
      headers: { 'Range': `bytes=0-${SPEED_TEST_BYTES - 1}` },
      timeout: REQUEST_TIMEOUT
    });
    if (res.statusCode !== 200 && res.statusCode !== 206) return Infinity;
    let received = 0;
    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        received += chunk.length;
        if (received >= SPEED_TEST_BYTES) { res.destroy(); resolve(); }
      });
      res.on('end', resolve);
      res.on('error', reject);
    });
    return Date.now() - start;
  } catch {
    return Infinity;
  } finally {
    if (res) res.destroy();
  }
}

/**
 * 对 GitHub 与 Gitee 两源的安装包并行测速
 * @param {string} version - 目标版本号
 * @param {string} githubExeUrl - GitHub 安装包地址（可为空，缺失时根据规则拼接）
 * @returns {Promise<Object>} { source: 'github'|'gitee', speeds: { github, gitee } }
 */
async function pickFasterSource(version, githubExeUrl) {
  const gitee = await fetchGiteeRelease();
  // GitHub 安装包地址：优先用传入的，否则按命名规则拼出 releases 下载地址
  const ghUrl = githubExeUrl ||
    `https://github.com/SoftheartedYYC/PyLibMaster/releases/download/v${version}/PyLibMaster-Setup-${version}.exe`;

  const giteeUrl = (gitee && gitee.version === version) ? gitee.exeUrl : null;

  // 并行测速
  const [ghSpeed, giteeSpeed] = await Promise.all([
    testDownloadSpeed(ghUrl),
    giteeUrl ? testDownloadSpeed(giteeUrl) : Promise.resolve(Infinity)
  ]);

  if (giteeUrl) giteeAssetCache = gitee;
  const speeds = { github: ghSpeed, gitee: giteeSpeed };
  // Gitee 可用且不比 GitHub 慢时优先 Gitee（国内网络）；两者都失败时回退 GitHub
  let source = 'github';
  if (giteeSpeed < ghSpeed) source = 'gitee';
  logManager.addLog({
    action: 'Update source speed test', status: 'ok', type: 'system',
    detail: `github=${ghSpeed === Infinity ? 'failed' : ghSpeed + 'ms'}, gitee=${giteeSpeed === Infinity ? 'failed' : giteeSpeed + 'ms'}, picked=${source}`
  });
  return { source, speeds };
}

/**
 * 获取 electron-updater 的下载缓存目录
 * - Gitee 下载的安装包存到这里，与 electron-updater 缓存目录保持一致
 * @returns {string} pending 目录路径
 */
function getPendingDir() {
  const dir = path.join(os.homedir(), 'AppData', 'Local', 'pylibmaster-updater', 'pending');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 从 Gitee 下载安装包（自建下载器，带进度事件与 sha512 校验）
 * @param {Object} release - fetchGiteeRelease 返回的信息
 * @returns {Promise<string>} 下载完成的文件路径
 */
async function downloadFromGitee(release) {
  giteeDownloading = true;
  const destPath = path.join(getPendingDir(), path.basename(new URL(release.exeUrl).pathname));
  const tmpPath = destPath + '.part';

  try {
    // 1. 下载 latest.yml 获取 sha512（用于完整性校验）
    let expectedSha512 = null;
    let expectedSize = null;
    try {
      const ymlRes = await httpRequest(release.ymlUrl);
      const ymlText = await streamToString(ymlRes);
      const shaMatch = ymlText.match(/sha512:\s*(.+)/);
      const sizeMatch = ymlText.match(/size:\s*(\d+)/);
      if (shaMatch) expectedSha512 = shaMatch[1].trim();
      if (sizeMatch) expectedSize = parseInt(sizeMatch[1], 10);
    } catch { /* 拿不到校验信息时不阻断下载 */ }

    // 2. 流式下载安装包
    const res = await httpRequest(release.exeUrl, { timeout: 30000 });
    if (res.statusCode !== 200) throw new Error(`Gitee 下载失败: HTTP ${res.statusCode}`);
    const total = parseInt(res.headers['content-length'] || '0', 10);
    let transferred = 0;
    let lastEmit = 0;
    const fileStream = fs.createWriteStream(tmpPath);

    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        transferred += chunk.length;
        // 每 500ms 推送一次进度，避免 IPC 风暴
        const now = Date.now();
        if (now - lastEmit > 500 && total > 0) {
          lastEmit = now;
          send('updater:progress', {
            percent: Math.round((transferred / total) * 100),
            bytesPerSecond: 0,
            transferred,
            total
          });
        }
      });
      res.pipe(fileStream);
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
      res.on('error', reject);
    });

    // 3. sha512 完整性校验
    if (expectedSha512) {
      send('updater:progress', { percent: 99, bytesPerSecond: 0, transferred, total });
      const actualSha512 = await hashFile(tmpPath);
      if (actualSha512 !== expectedSha512) {
        throw new Error('安装包完整性校验失败（sha512 不匹配），已丢弃下载文件');
      }
    }
    if (expectedSize && fs.statSync(tmpPath).size !== expectedSize) {
      throw new Error('安装包大小与 latest.yml 不一致，已丢弃下载文件');
    }

    // 4. 校验通过，重命名为最终文件
    fs.rmSync(destPath, { force: true });
    fs.renameSync(tmpPath, destPath);
    pendingGiteeFile = destPath;
    return destPath;
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  } finally {
    giteeDownloading = false;
  }
}

/**
 * 计算文件的 sha512（Base64 格式，与 electron-builder latest.yml 一致）
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} Base64 编码的 sha512
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('base64')));
    stream.on('error', reject);
  });
}

/**
 * 初始化更新器，绑定所有更新事件
 * @param {BrowserWindow} win - 主窗口实例
 */
function initUpdater(win) {
  mainWindow = win;

  // 正在检查是否有新版本
  autoUpdater.on('checking-for-update', () => {
    send('updater:checking');
  });

  // 发现新版本可用，开始自动下载
  autoUpdater.on('update-available', (info) => {
    send('updater:available', sanitizeUpdateInfo(info));
    logManager.addLog({ action: 'Update available', status: 'ok', type: 'system', detail: `v${info.version}` });
  });

  // 当前已是最新版本，无需更新
  autoUpdater.on('update-not-available', (info) => {
    send('updater:not-available', sanitizeUpdateInfo(info));
    checkInProgress = false;
  });

  // 下载进度更新（包含百分比、速度等信息）
  autoUpdater.on('download-progress', (progress) => {
    send('updater:progress', sanitizeProgress(progress));
  });

  // 更新包已下载完成，等待用户确认安装（仅 GitHub 源，Gitee 源在下载器内自行发送）
  autoUpdater.on('update-downloaded', (info) => {
    if (giteeDownloading) return; // Gitee 下载中不处理 electron-updater 事件
    send('updater:downloaded', sanitizeUpdateInfo(info));
    logManager.addLog({ action: 'Update downloaded (GitHub)', status: 'ok', type: 'system', detail: `v${info.version}` });
    checkInProgress = false;
    // 下载完成后发送系统通知提醒用户安装
    notifyDownloaded(info.version);
  });

  // 更新过程中发生错误
  autoUpdater.on('error', (err) => {
    if (giteeDownloading) return; // Gitee 下载中的错误由下载器自行处理
    if (githubFallback) return;   // GitHub 检查失败回退 Gitee 期间不弹错误，由 checkViaGitee 接管
    send('updater:error', { message: err.message });
    logManager.addLog({ action: 'Updater error', status: 'failed', type: 'system', detail: err.message });
    checkInProgress = false;
  });
}

/**
 * 通过 Gitee 源检查更新（兜底通道）
 * - electron-updater 检查 GitHub 失败时调用（如网络/代理导致 ERR_CONNECTION_CLOSED）
 * - 发现新版本时与 GitHub 通道行为一致：通知 UI 并触发测速下载
 * @returns {Promise<Object>} 检查结果
 */
async function checkViaGitee() {
  const release = await fetchGiteeRelease();
  if (!release) {
    checkInProgress = false;
    send('updater:error', { message: 'Gitee 源检查失败：未找到可用发行版' });
    return { checking: false };
  }
  const currentVersion = require('electron').app.getVersion();
  logManager.addLog({ action: 'Update check via Gitee fallback', status: 'ok', type: 'system', detail: `latest=v${release.version}` });

  if (release.version === currentVersion) {
    // 已是最新版
    send('updater:not-available', { version: release.version, releaseDate: '', releaseName: '', releaseNotes: '' });
    checkInProgress = false;
    return { checking: false, updateInfo: { version: release.version, releaseDate: '', releaseName: '', releaseNotes: '' } };
  }

  // 发现新版本：通知 UI 并异步测速下载
  giteeAssetCache = release;
  send('updater:available', { version: release.version, releaseDate: '', releaseName: '', releaseNotes: '' });
  startSpeedTestAndDownload(release.version).catch((err) => {
    send('updater:error', { message: err && err.message ? String(err.message) : '下载更新失败' });
    checkInProgress = false;
  });
  return { checking: false, updateInfo: { version: release.version, releaseDate: '', releaseName: '', releaseNotes: '' } };
}

/**
 * 检查是否有新版本可用（双源）
 * - 防止重复检查（checkInProgress 标志）
 * - 优先 electron-updater（GitHub），失败自动回退 Gitee 直连检查
 * - 发现新版本后自动测速并选择较快的源下载
 * - 返回纯 JSON 可序列化对象（避免 IPC "object could not be cloned" 错误）
 * @returns {Promise<Object>} 检查结果（仅含可序列化字段）
 */
async function checkForUpdates() {
  if (checkInProgress) return { checking: true };
  checkInProgress = true;
  try {
    // 1. 用 electron-updater 检查 GitHub（latest.yml），不自动下载
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo) {
      checkInProgress = false;
      return { checking: false };
    }
    const info = result.updateInfo;
    const currentVersion = require('electron').app.getVersion();

    // 当前已是最新版：electron-updater 会触发 update-not-available 事件
    // 这里无需额外处理，直接返回检查结果
    const response = {
      checking: false,
      updateInfo: {
        version: info.version,
        releaseDate: info.releaseDate || '',
        releaseName: info.releaseName || '',
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
      }
    };

    // 2. 发现新版本（版本号不同）→ 测速选源并下载
    if (info.version && info.version !== currentVersion) {
      // 异步执行测速+下载，不阻塞 IPC 返回
      startSpeedTestAndDownload(info.version).catch((err) => {
        send('updater:error', { message: err && err.message ? String(err.message) : '下载更新失败' });
        checkInProgress = false;
      });
    }
    return response;
  } catch (err) {
    // 3. GitHub 检查失败（如代理中断导致 ERR_CONNECTION_CLOSED）→ 回退 Gitee 直连检查
    githubFallback = true;
    logManager.addLog({ action: 'GitHub update check failed, fallback to Gitee', status: 'failed', type: 'system', detail: err.message });
    try {
      return await checkViaGitee();
    } finally {
      githubFallback = false;
    }
  }
}

/**
 * 测速并选择较快的源下载更新
 * - Gitee 更快 → 自建下载器（带 sha512 校验）
 * - GitHub 更快或 Gitee 失败 → electron-updater 下载
 * - 所选源失败时自动回退到另一个源
 * @param {string} version - 目标版本号
 */
async function startSpeedTestAndDownload(version) {
  send('updater:speed-testing', { version });
  const { source, speeds } = await pickFasterSource(version);
  activeSource = source;
  send('updater:source-selected', { source, speeds });

  if (source === 'gitee' && giteeAssetCache) {
    try {
      await downloadFromGitee(giteeAssetCache);
      // 下载成功 → 模拟 update-downloaded 事件（供 UI 显示安装按钮）
      send('updater:downloaded', sanitizeUpdateInfo({ version }));
      logManager.addLog({ action: 'Update downloaded (Gitee)', status: 'ok', type: 'system', detail: `v${version}` });
      checkInProgress = false;
      notifyDownloaded(version);
      return;
    } catch (err) {
      // Gitee 下载失败 → 回退到 GitHub
      logManager.addLog({ action: 'Gitee download failed, fallback to GitHub', status: 'failed', type: 'system', detail: err.message });
      activeSource = 'github';
      send('updater:source-selected', { source: 'github', speeds, fallback: true });
    }
  }
  // GitHub 源（或 Gitee 回退后）：交给 electron-updater 下载
  await autoUpdater.downloadUpdate();
}

/**
 * 下载完成后发送系统通知（两个源共用）
 * @param {string} version - 版本号
 */
function notifyDownloaded(version) {
  try {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: '更新已就绪',
        body: `v${version} 安装包已下载完成，点击应用内“立即安装”按钮即可升级。`
      });
      notification.show();
    }
  } catch { /* 通知发送失败时静默处理 */ }
}

/**
 * 退出应用并安装已下载的更新
 * - GitHub 源：交给 electron-updater 的 quitAndInstall
 * - Gitee 源：直接启动下载好的安装包并退出
 */
function quitAndInstall() {
  if (pendingGiteeFile && fs.existsSync(pendingGiteeFile)) {
    // Gitee 源：启动安装包（NSIS 安装程序），然后退出应用
    const { app, shell } = require('electron');
    shell.openPath(pendingGiteeFile).catch(() => {});
    setTimeout(() => app.quit(), 500);
    return;
  }
  autoUpdater.quitAndInstall();
}

/** 获取当前生效的下载源（供 UI 展示） */
function getActiveSource() {
  return activeSource;
}

module.exports = { initUpdater, checkForUpdates, quitAndInstall, getActiveSource, testDownloadSpeed, fetchGiteeRelease, hashFile };
