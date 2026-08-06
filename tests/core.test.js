const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  buildPackageSpec,
  buildPackageDirMap,
  estimatePackageSizeFast,
  getFolderSizeCached
} = require('../core/operations/pipManager');

const { validateBackupId } = require('../core/operations/backupManager');
const { isAllowedOpenPath } = require('../utils/security');

describe('buildPackageSpec', () => {
  it('accepts valid package name', () => {
    assert.strictEqual(buildPackageSpec('numpy'), 'numpy');
    assert.strictEqual(buildPackageSpec('requests-toolbelt'), 'requests-toolbelt');
  });

  it('rejects invalid package name', () => {
    assert.throws(() => buildPackageSpec('numpy; rm -rf /'), /Invalid package name/);
    assert.throws(() => buildPackageSpec(''), /Invalid package name/);
  });

  it('builds specific version spec', () => {
    assert.strictEqual(buildPackageSpec('numpy', { versionMode: 'specific', version: '1.26.0' }), 'numpy==1.26.0');
  });

  it('rejects invalid version spec', () => {
    assert.throws(() => buildPackageSpec('numpy', { versionMode: 'specific', version: '1.0; whoami' }), /Invalid version specifier/);
  });

  it('passes through .whl file path (normalized)', () => {
    const path = require('path');
    assert.strictEqual(buildPackageSpec('C:/pkg/numpy.whl'), path.normalize('C:/pkg/numpy.whl'));
  });

  it('rejects .whl path with traversal', () => {
    assert.throws(() => buildPackageSpec('../evil file;echo hacked.whl'), /Invalid wheel/);
  });

  it('rejects .whl path with shell metacharacters', () => {
    assert.throws(() => buildPackageSpec('C:/pkg/evil;rm -rf.whl'), /Invalid wheel/);
  });
});

describe('validateBackupId', () => {
  it('accepts valid backup id', () => {
    assert.strictEqual(validateBackupId('backup_env_2024-01-01T00-00-00.txt'), 'backup_env_2024-01-01T00-00-00.txt');
  });

  it('rejects path traversal', () => {
    assert.throws(() => validateBackupId('../config.json'), /path traversal/);
    assert.throws(() => validateBackupId('backup/../etc.txt'), /path traversal/);
  });

  it('rejects invalid format', () => {
    assert.throws(() => validateBackupId('malicious.exe'), /format mismatch/);
    assert.throws(() => validateBackupId(123), /must be a string/);
  });
});

describe('isAllowedOpenPath', () => {
  const allowedDirs = [
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads')
  ];

  it('allows path inside allowed directory', () => {
    assert.strictEqual(isAllowedOpenPath(path.join(allowedDirs[0], 'report.pdf'), allowedDirs), true);
  });

  it('blocks path outside allowed directories', () => {
    assert.strictEqual(isAllowedOpenPath('C:/Windows/system32/calc.exe', allowedDirs), false);
  });

  it('blocks empty path', () => {
    assert.strictEqual(isAllowedOpenPath('', allowedDirs), false);
    assert.strictEqual(isAllowedOpenPath(null, allowedDirs), false);
  });
});

describe('buildPackageDirMap', () => {
  it('returns empty map for missing directory', () => {
    const map = buildPackageDirMap('/non/existent/path');
    assert.strictEqual(map instanceof Map, true);
    assert.strictEqual(map.size, 0);
  });

  it('maps dist-info and package directories', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-test-'));
    try {
      fs.mkdirSync(path.join(tmp, 'numpy'));
      fs.mkdirSync(path.join(tmp, 'requests-2.31.0.dist-info'));
      const map = buildPackageDirMap(tmp);
      assert.strictEqual(map.has('numpy'), true);
      assert.strictEqual(map.get('numpy').dir, path.join(tmp, 'numpy'));
      assert.strictEqual(map.has('requests'), true);
      assert.strictEqual(map.get('requests').distInfo, path.join(tmp, 'requests-2.31.0.dist-info'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('stores both dir and distInfo for same package', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-test-'));
    try {
      fs.mkdirSync(path.join(tmp, 'flask'));
      fs.mkdirSync(path.join(tmp, 'flask-3.0.0.dist-info'));
      const map = buildPackageDirMap(tmp);
      assert.strictEqual(map.has('flask'), true);
      const entry = map.get('flask');
      assert.strictEqual(entry.dir, path.join(tmp, 'flask'));
      assert.strictEqual(entry.distInfo, path.join(tmp, 'flask-3.0.0.dist-info'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('estimatePackageSizeFast', () => {
  it('returns zero for missing site-packages', () => {
    const info = estimatePackageSizeFast('numpy', null, new Map(), new Map());
    assert.deepStrictEqual(info, { size: 0, text: '0 MB' });
  });

  it('calculates folder size with cache', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'size-test-'));
    try {
      fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello world');
      const cache = new Map();
      const size = getFolderSizeCached(tmp, cache);
      assert.strictEqual(size, 11);
      assert.strictEqual(cache.get(tmp), 11);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('respects recursion depth limit', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'depth-test-'));
    try {
      let current = tmp;
      for (let i = 0; i < 25; i++) {
        const next = path.join(current, `dir${i}`);
        fs.mkdirSync(next);
        current = next;
      }
      const cache = new Map();
      const size = getFolderSizeCached(tmp, cache);
      assert.strictEqual(size, 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
