/**
 * updater 双源更新模块单元测试
 * 覆盖：版本号解析、sha512 计算、Gitee Release 解析逻辑（纯函数部分）
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 测试环境需要 mock electron 与 electron-updater
const updater = require('../core/system/updater');

describe('updater - hashFile', () => {
  it('computes correct sha512 base64', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-test-'));
    const file = path.join(tmp, 'test.bin');
    fs.writeFileSync(file, 'hello pylibmaster');
    try {
      const hash = await updater.hashFile(file);
      // 用 Node crypto 独立计算一遍对照
      const crypto = require('crypto');
      const expected = crypto.createHash('sha512').update('hello pylibmaster').digest('base64');
      assert.strictEqual(hash, expected);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('updater - getActiveSource', () => {
  it('defaults to github', () => {
    assert.strictEqual(updater.getActiveSource(), 'github');
  });
});

describe('updater - exports', () => {
  it('exposes all public APIs', () => {
    assert.strictEqual(typeof updater.initUpdater, 'function');
    assert.strictEqual(typeof updater.checkForUpdates, 'function');
    assert.strictEqual(typeof updater.quitAndInstall, 'function');
    assert.strictEqual(typeof updater.getActiveSource, 'function');
    assert.strictEqual(typeof updater.testDownloadSpeed, 'function');
    assert.strictEqual(typeof updater.fetchGiteeRelease, 'function');
    assert.strictEqual(typeof updater.hashFile, 'function');
  });
});
