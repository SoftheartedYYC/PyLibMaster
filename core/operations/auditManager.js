/**
 * @file auditManager.js
 * @description 安全漏洞扫描管理器
 * 
 * 职责：
 * - 使用 pip-audit 扫描已安装包的已知 CVE 漏洞
 * - 若 pip-audit 未安装，自动安装后执行
 * - 解析扫描结果，给出修复建议（升级到哪个版本）
 * - 记录扫描日志
 * 
 * 依赖：
 * - pip-audit（PyPA 官方漏洞审计工具）
 * - PyPI Advisory Database（pip-audit 的数据源）
 */

const logManager = require('../system/logManager');
const { runPip, runCommand } = require('../../utils/processRunner');
const envManager = require('../system/envManager');

// 扫描结果缓存（避免频繁扫描）
let lastScanResult = null;
let lastScanTime = 0;
const SCAN_CACHE_TTL = 10 * 60 * 1000; // 10 分钟缓存

/**
 * 确保 pip-audit 已安装
 * @param {string} pythonPath - Python 路径
 * @param {Function} [onOutput] - 输出回调
 * @returns {Promise<boolean>} 是否就绪
 */
async function ensurePipAudit(pythonPath, onOutput) {
  try {
    // 检查 pip-audit 是否已安装
    await runPip(pythonPath, ['show', 'pip-audit'], { timeout: 10000 });
    return true;
  } catch {
    // 未安装，自动安装
    if (onOutput) onOutput('[INFO] Installing pip-audit...\n', 'stdout');
    try {
      await runPip(pythonPath, ['install', 'pip-audit', '--quiet'], { timeout: 120000, onOutput });
      return true;
    } catch (err) {
      if (onOutput) onOutput(`[ERR] Failed to install pip-audit: ${err.message}\n`, 'stderr');
      return false;
    }
  }
}

/**
 * 执行安全漏洞扫描
 * @param {Function} [onOutput] - 进度输出回调
 * @returns {Promise<Object>} 扫描结果 { vulnerabilities: [], summary: {} }
 */
async function runAudit(onOutput) {
  const env = envManager.getCurrent();
  if (!env) throw new Error('No Python environment selected');

  // 检查缓存
  if (lastScanResult && Date.now() - lastScanTime < SCAN_CACHE_TTL) {
    return lastScanResult;
  }

  // 确保 pip-audit 已安装
  const ready = await ensurePipAudit(env.path, onOutput);
  if (!ready) {
    throw new Error('pip-audit installation failed. Please install manually: pip install pip-audit');
  }

  if (onOutput) onOutput('[INFO] Scanning for vulnerabilities...\n', 'stdout');

  try {
    // 执行 python -m pip_audit --format=json
    const { stdout } = await runCommand(env.path, ['-m', 'pip_audit', '--format=json', '--progress-spinner=off'], {
      timeout: 300000,
      onOutput
    });

    const data = JSON.parse(stdout);
    const result = parseAuditResult(data);

    // 缓存结果
    lastScanResult = result;
    lastScanTime = Date.now();

    // 记录日志
    logManager.addLog({
      action: '[Security] Vulnerability scan completed',
      status: result.summary.totalVulns > 0 ? 'failed' : 'ok',
      type: 'system',
      detail: `${result.summary.totalVulns} vulnerabilities in ${result.summary.affectedPackages} packages`
    });

    return result;
  } catch (err) {
    // pip-audit 返回非零退出码时也可能有 JSON 输出（有漏洞时）
    if (err.stdout) {
      try {
        const data = JSON.parse(err.stdout);
        const result = parseAuditResult(data);
        lastScanResult = result;
        lastScanTime = Date.now();
        logManager.addLog({
          action: '[Security] Vulnerability scan completed',
          status: result.summary.totalVulns > 0 ? 'failed' : 'ok',
          type: 'system',
          detail: `${result.summary.totalVulns} vulnerabilities in ${result.summary.affectedPackages} packages`
        });
        return result;
      } catch { /* 解析失败，继续抛出原始错误 */ }
    }
    logManager.addLog({
      action: '[Security] Vulnerability scan failed',
      status: 'failed',
      type: 'system',
      detail: err.message
    });
    throw err;
  }
}

/**
 * 解析 pip-audit JSON 输出
 * @param {Object} data - pip-audit JSON 数据
 * @returns {Object} 结构化结果
 */
function parseAuditResult(data) {
  const vulnerabilities = [];
  const affectedPkgs = new Set();

  // pip-audit JSON 格式: { vulnerabilities: [...], dependencies: [...] }
  // 或旧版: [ { name, version, vulns: [...] } ]
  let vulnList = [];
  if (data.vulnerabilities) {
    vulnList = data.vulnerabilities;
  } else if (Array.isArray(data)) {
    // 旧版格式
    for (const dep of data) {
      if (dep.vulns && dep.vulns.length > 0) {
        for (const v of dep.vulns) {
          vulnList.push({ ...v, name: dep.name, version: dep.version });
        }
      }
    }
  }

  for (const vuln of vulnList) {
    const pkgName = vuln.name || vuln.package || '';
    affectedPkgs.add(pkgName.toLowerCase());

    // 提取修复版本
    let fixVersion = '';
    if (vuln.fixed_in && vuln.fixed_in.length > 0) {
      fixVersion = vuln.fixed_in[vuln.fixed_in.length - 1]; // 取最新修复版本
    } else if (vuln.fix_versions && vuln.fix_versions.length > 0) {
      fixVersion = vuln.fix_versions[vuln.fix_versions.length - 1];
    }

    vulnerabilities.push({
      id: vuln.id || vuln.alias || '',
      package: pkgName,
      version: vuln.version || vuln.installed_version || '',
      severity: guessSeverity(vuln),
      summary: vuln.description || vuln.summary || vuln.id || 'Unknown vulnerability',
      fixVersion,
      url: vuln.url || vuln.link || vuln.aliases?.[0] ? `https://nvd.nist.gov/vuln/detail/${vuln.id}` : '',
      aliases: vuln.aliases || []
    });
  }

  // 按严重程度排序
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
  vulnerabilities.sort((a, b) => (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4));

  return {
    vulnerabilities,
    summary: {
      totalVulns: vulnerabilities.length,
      affectedPackages: affectedPkgs.size,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length,
      fixable: vulnerabilities.filter(v => v.fixVersion).length
    },
    scanTime: new Date().toISOString()
  };
}

/**
 * 推断漏洞严重程度
 * @param {Object} vuln - 漏洞对象
 * @returns {string} critical/high/medium/low/unknown
 */
function guessSeverity(vuln) {
  if (vuln.severity) return vuln.severity.toLowerCase();
  // 从 ID 推断（CVE 通常没有严重程度信息在 pip-audit 输出中）
  const desc = (vuln.description || vuln.summary || '').toLowerCase();
  if (desc.includes('remote code execution') || desc.includes('rce') || desc.includes('critical')) return 'critical';
  if (desc.includes('sql injection') || desc.includes('arbitrary') || desc.includes('high')) return 'high';
  if (desc.includes('xss') || desc.includes('denial of service') || desc.includes('dos')) return 'medium';
  if (desc.includes('information disclosure') || desc.includes('low')) return 'low';
  return 'unknown';
}

/**
 * 获取缓存的扫描结果
 * @returns {Object|null}
 */
function getCachedResult() {
  if (lastScanResult && Date.now() - lastScanTime < SCAN_CACHE_TTL) {
    return lastScanResult;
  }
  return null;
}

/**
 * 清除扫描缓存
 */
function clearCache() {
  lastScanResult = null;
  lastScanTime = 0;
}

module.exports = {
  runAudit,
  ensurePipAudit,
  getCachedResult,
  clearCache
};
