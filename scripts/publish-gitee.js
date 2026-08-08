/**
 * @file scripts/publish-gitee.js
 * @description 发布安装包到 Gitee 发行版（与 GitHub Release 配套，支持双源更新）
 *
 * 用法：
 *   node scripts/publish-gitee.js <版本号> [发行版说明文件]
 *   示例: node scripts/publish-gitee.js 1.5.31
 *
 * 环境变量：
 *   GITEE_TOKEN - Gitee 私人令牌（必须，权限至少 projects）
 *
 * 前置条件：
 *   dist/ 目录中已存在打包产物：
 *   - PyLibMaster-Setup-<version>.exe
 *   - PyLibMaster-Setup-<version>.exe.blockmap
 *   - latest.yml
 *
 * 流程：
 *   1. 用 Gitee API 基于已有 tag 创建发行版
 *   2. 上传安装包、blockmap、latest.yml 作为附件
 */

const fs = require('fs');
const path = require('path');

const GITEE_API = 'https://gitee.com/api/v5';
const OWNER = 'soft-hearted-yyc';
const REPO = 'PyLibMaster';

/** 从环境变量或 Windows 凭据读取 Gitee 令牌 */
function getToken() {
  const token = process.env.GITEE_TOKEN;
  if (!token) {
    console.error('错误：未设置 GITEE_TOKEN 环境变量');
    console.error('请设置：$env:GITEE_TOKEN="你的令牌"');
    process.exit(1);
  }
  return token;
}

/** Gitee API 请求封装（JSON） */
async function giteeApi(method, urlPath, body) {
  const token = getToken();
  const res = await fetch(`${GITEE_API}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `token ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gitee API ${method} ${urlPath} 失败 (HTTP ${res.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

/** 上传附件到发行版（multipart/form-data） */
async function uploadAsset(releaseId, filePath) {
  const token = getToken();
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('access_token', token);
  form.append('file', new Blob([fileBuffer]), fileName);

  const res = await fetch(`${GITEE_API}/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`, {
    method: 'POST',
    body: form
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`上传附件 ${fileName} 失败 (HTTP ${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('用法: node scripts/publish-gitee.js <版本号>');
    console.error('示例: node scripts/publish-gitee.js 1.5.31');
    process.exit(1);
  }

  const distDir = path.join(__dirname, '..', 'dist');
  const files = [
    `PyLibMaster-Setup-${version}.exe`,
    `PyLibMaster-Setup-${version}.exe.blockmap`,
    'latest.yml'
  ];
  // 绿色版（portable）存在时一并上传
  const portableFile = `PyLibMaster-${version}-Portable.exe`;
  if (fs.existsSync(path.join(distDir, portableFile))) {
    files.push(portableFile);
  }
  // 校验文件存在
  for (const f of files) {
    const p = path.join(distDir, f);
    if (!fs.existsSync(p)) {
      console.error(`错误：找不到文件 ${p}，请先执行 npm run build:win`);
      process.exit(1);
    }
  }

  // 1. 创建发行版（基于已推送的 tag vX.X.X）
  console.log(`[1/3] 创建 Gitee 发行版 v${version} ...`);
  let release;
  try {
    release = await giteeApi('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: `v${version}`,
      name: `PyLibMaster v${version}`,
      body: `PyLibMaster v${version} 发行版（与 GitHub Release 同步，供国内用户加速下载）`,
      target_commitish: 'main',
      prerelease: false
    });
    console.log(`  ✓ 发行版已创建: ${release.html_url || release.url}`);
  } catch (err) {
    if (String(err.message).includes('已存在') || String(err.message).includes('exist')) {
      // 发行版已存在，查询其 id
      const list = await giteeApi('GET', `/repos/${OWNER}/${REPO}/releases/tags/v${version}`);
      release = Array.isArray(list) ? list[0] : list;
      if (!release) throw err;
      console.log('  ✓ 发行版已存在，复用');
    } else {
      throw err;
    }
  }

  // 2. 逐个上传附件
  console.log('[2/3] 上传附件 ...');
  for (const f of files) {
    const p = path.join(distDir, f);
    const sizeMB = (fs.statSync(p).size / 1024 / 1024).toFixed(2);
    process.stdout.write(`  上传 ${f} (${sizeMB} MB) ...`);
    await uploadAsset(release.id, p);
    console.log(' ✓');
  }

  // 3. 验证附件完整性
  console.log('[3/3] 验证发行版附件 ...');
  const detail = await giteeApi('GET', `/repos/${OWNER}/${REPO}/releases/${release.id}`);
  const assetNames = (detail.assets || []).map(a => a.name);
  for (const f of files) {
    if (!assetNames.includes(f)) {
      console.error(`  ✗ 缺少附件: ${f}`);
      process.exit(1);
    }
    console.log(`  ✓ ${f}`);
  }

  console.log(`\n✅ Gitee 发行版发布完成: ${detail.html_url || release.html_url}`);
}

main().catch((err) => {
  console.error('发布失败:', err.message);
  process.exit(1);
});
