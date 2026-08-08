/**
 * @file pythonInstaller.js
 * @description Python 环境一键安装器
 *
 * 职责：
 * - 为没有 Python 环境的用户提供一键安装能力
 * - 从国内镜像（npmmirror/华为云）优先下载官方安装包，失败回退官方源
 * - 静默安装并自动将 Python 写入 PATH 环境变量（PrependPath=1）
 *
 * 安装参数说明（Python 官方安装器）：
 * - /quiet             静默安装，无 UI
 * - InstallAllUsers=0  安装到当前用户目录（无需管理员权限）
 * - PrependPath=1      自动将 Python 及 Scripts 目录加入 PATH 环境变量
 * - Include_pip=1      安装 pip
 * - Include_test=0     不安装标准库测试模块（减小体积）
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCommand } = require('../../utils/processRunner');
const logManager = require('./logManager');

/** 推荐安装的 Python 版本列表（新→旧） */
const RECOMMENDED_VERSIONS = [
  { version: '3.13.2', label: 'Python 3.13.2（最新稳定版）', recommended: true },
  { version: '3.12.9', label: 'Python 3.12.9（兼容性最好）', recommended: false },
  { version: '3.11.9', label: 'Python 3.11.9', recommended: false },
  { version: '3.10.11', label: 'Python 3.10.11', recommended: false }
];

/** 下载源（按优先级排列）：国内镜像优先 */
function getDownloadUrls(version) {
  const fileName = `python-${version}-amd64.exe`;
  return [
    { name: 'npmmirror', url: `https://registry.npmmirror.com/-/binary/python/${version}/${fileName}` },
    { name: 'huaweicloud', url: `https://mirrors.huaweicloud.com/python/${version}/${fileName}` },
    { name: 'python.org', url: `https://www.python.org/ftp/python/${version}/${fileName}` }
  ];
}

/** 安装程序存放目录 */
function getInstallerDir() {
  const dir = path.join(os.tmpdir(), 'pylibmaster-python-installer');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 版本号合法性校验（防止路径注入） */
function isValidVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version || '');
}

/**
 * 跟随重定向的下载（带进度回调）
 * @param {string} url - 下载地址
 * @param {string} destPath - 目标文件路径
 * @param {Function} onProgress - 进度回调 (percent)
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      // 跟随重定向
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        downloadFile(nextUrl, destPath, onProgress).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      let lastEmit = 0;
      const fileStream = fs.createWriteStream(destPath);
      res.on('data', (chunk) => {
        received += chunk.length;
        const now = Date.now();
        // 每 300ms 推送一次进度，避免 IPC 风暴
        if (onProgress && now - lastEmit > 300 && total > 0) {
          lastEmit = now;
          onProgress(Math.round((received / total) * 100));
        }
      });
      res.pipe(fileStream);
      fileStream.on('finish', () => resolve());
      fileStream.on('error', reject);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('下载超时')));
    req.on('error', reject);
  });
}

/**
 * 获取可安装的 Python 版本列表
 * @returns {Array} 版本信息列表
 */
function listAvailableVersions() {
  return RECOMMENDED_VERSIONS;
}

/**
 * 一键安装 Python
 *
 * 流程：
 * 1. 按优先级尝试多个下载源（国内镜像优先）
 * 2. 下载官方安装程序到临时目录
 * 3. 静默安装（/quiet PrependPath=1，自动写入 PATH 环境变量）
 * 4. 清理安装包
 *
 * @param {string} version - 目标版本号（如 '3.12.9'）
 * @param {Object} [options={}] - 选项
 * @param {Function} [options.onProgress] - 进度回调 ({ phase: 'download'|'install'|'done', percent })
 * @returns {Promise<Object>} { success, installDir, version }
 * @throws {Error} 版本非法或所有下载源均失败时
 */
async function installPython(version, options = {}) {
  if (!isValidVersion(version)) {
    throw new Error(`Invalid Python version: ${version}`);
  }
  const onProgress = options.onProgress || (() => {});
  const installerPath = path.join(getInstallerDir(), `python-${version}-amd64.exe`);

  // 1. 下载（多源回退）
  let downloaded = false;
  let lastError = null;
  for (const source of getDownloadUrls(version)) {
    try {
      onProgress({ phase: 'download', percent: 0 });
      fs.rmSync(installerPath, { force: true });
      await downloadFile(source.url, installerPath, (percent) => {
        onProgress({ phase: 'download', percent });
      });
      // 安装包正常大小应大于 5MB，过小视为下载异常
      if (fs.existsSync(installerPath) && fs.statSync(installerPath).size > 5 * 1024 * 1024) {
        downloaded = true;
        break;
      }
      lastError = new Error('安装包文件异常');
    } catch (err) {
      lastError = err;
      fs.rmSync(installerPath, { force: true });
    }
  }
  if (!downloaded) {
    logManager.addLog({ action: 'Install Python download failed', status: 'failed', type: 'system', detail: `v${version}: ${lastError && lastError.message}` });
    throw new Error(`下载安装包失败：${lastError && lastError.message}`);
  }

  // 2. 静默安装（PrependPath=1 自动写入 PATH 环境变量）
  onProgress({ phase: 'install', percent: 100 });
  const args = [
    '/quiet',
    'InstallAllUsers=0',
    'PrependPath=1',
    'Include_pip=1',
    'Include_test=0',
    'Include_launcher=1',
    'SimpleInstall=1'
  ];
  const result = await runCommand(installerPath, args, { timeout: 15 * 60 * 1000, ignoreExitCode: true });

  // 3. 清理安装包
  fs.rmSync(installerPath, { force: true });

  // 退出码：0 成功；1638 = 已安装相同/更高版本（视为成功）
  if (result.code !== 0 && result.code !== 1638) {
    logManager.addLog({ action: 'Install Python', status: 'failed', type: 'system', detail: `v${version} exit=${result.code}` });
    throw new Error(`Python 安装程序退出码 ${result.code}，安装可能失败`);
  }

  const installDir = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', `Python${version.split('.').slice(0, 2).join('')}`);
  logManager.addLog({ action: 'Install Python', status: 'ok', type: 'system', detail: `v${version} -> ${installDir}` });
  onProgress({ phase: 'done', percent: 100 });
  return { success: true, installDir, version };
}

module.exports = { listAvailableVersions, installPython };
