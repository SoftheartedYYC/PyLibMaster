/**
 * pythonInstaller 模块单元测试
 * 覆盖：版本列表、版本号合法性校验（防路径注入）、导出完整性
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');

const pythonInstaller = require('../core/system/pythonInstaller');

describe('pythonInstaller - listAvailableVersions', () => {
  it('returns non-empty version list with valid structure', () => {
    const versions = pythonInstaller.listAvailableVersions();
    assert.ok(Array.isArray(versions));
    assert.ok(versions.length > 0);
    for (const v of versions) {
      assert.match(v.version, /^\d+\.\d+\.\d+$/);
      assert.strictEqual(typeof v.label, 'string');
      assert.strictEqual(typeof v.recommended, 'boolean');
    }
  });

  it('has exactly one recommended version', () => {
    const versions = pythonInstaller.listAvailableVersions();
    const recommended = versions.filter(v => v.recommended);
    assert.strictEqual(recommended.length, 1);
  });
});

describe('pythonInstaller - version validation (path injection guard)', () => {
  it('rejects invalid version strings', async () => {
    const badVersions = [
      '3.12',                  // 缺一段
      '3.12.9; rm -rf /',      // 命令注入
      '../etc/passwd',         // 路径穿越
      '3.12.9"',               // 引号注入
      '',                      // 空
      null,
      undefined
    ];
    for (const v of badVersions) {
      await assert.rejects(
        () => pythonInstaller.installPython(v),
        /Invalid Python version/
      );
    }
  });
});

describe('pythonInstaller - exports', () => {
  it('exposes all public APIs', () => {
    assert.strictEqual(typeof pythonInstaller.listAvailableVersions, 'function');
    assert.strictEqual(typeof pythonInstaller.installPython, 'function');
  });
});
