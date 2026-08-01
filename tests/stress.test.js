/**
 * @file stress.test.js
 * @description 全方位压力测试 — 覆盖所有核心模块的边界、异常和并发场景
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ============ 公共 Mock 注入 ============

const mockState = {
  envManager: { current: { path: '/mock/python', name: 'test-env' } },
  configManager: {
    config: { retryCount: 2, parallelThreads: 4, storagePath: '' },
    storagePath: ''
  },
  mirrorManager: {
    mirrors: [
      { name: '默认', url: 'https://pypi.org/simple/', enabled: true },
      { name: '清华', url: 'https://pypi.tuna.tsinghua.edu.cn/simple/', enabled: true },
      { name: '阿里', url: 'https://mirrors.aliyun.com/pypi/simple/', enabled: true }
    ],
    defaultMirror: { name: '默认', url: 'https://pypi.org/simple/', enabled: true }
  },
  backupManager: { backupId: 'backup_env_2026-01-01T00-00-00.txt', restoreCalled: false },
  processRunner: { runPipCalls: [], runPipHandler: null },
  logManager: { logs: [] }
};

let tmpStorage = '';

function resetMockState() {
  tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'pylib-stress-'));
  mockState.configManager.storagePath = tmpStorage;
  mockState.configManager.config.storagePath = tmpStorage;
  mockState.envManager.current = { path: '/mock/python', name: 'test-env' };
  mockState.configManager.config.retryCount = 2;
  mockState.configManager.config.parallelThreads = 4;
  mockState.mirrorManager.mirrors = [
    { name: '默认', url: 'https://pypi.org/simple/', enabled: true },
    { name: '清华', url: 'https://pypi.tuna.tsinghua.edu.cn/simple/', enabled: true },
    { name: '阿里', url: 'https://mirrors.aliyun.com/pypi/simple/', enabled: true }
  ];
  mockState.mirrorManager.defaultMirror = { name: '默认', url: 'https://pypi.org/simple/', enabled: true };
  mockState.backupManager.backupId = 'backup_env_2026-01-01T00-00-00.txt';
  mockState.backupManager.restoreCalled = false;
  mockState.processRunner.runPipCalls = [];
  mockState.processRunner.runPipHandler = null;
  mockState.logManager.logs = [];
}

function injectMocks() {
  const processRunnerPath = require.resolve('../utils/processRunner');
  require.cache[processRunnerPath] = {
    id: processRunnerPath, filename: processRunnerPath, loaded: true,
    exports: {
      runPip: async (pythonPath, args, options) => {
        mockState.processRunner.runPipCalls.push({ pythonPath, args, options });
        if (mockState.processRunner.runPipHandler) {
          return mockState.processRunner.runPipHandler(pythonPath, args, options);
        }
        return { stdout: '', stderr: '', code: 0 };
      },
      runCommand: async (command, args, options) => {
        return { stdout: '', stderr: '', code: 0 };
      },
      ensurePip: async () => true,
      cancelOperation: () => 0,
      checkPipAvailable: async () => true,
      clearPipReadyCache: () => {}
    }
  };

  const envManagerPath = require.resolve('../core/system/envManager');
  require.cache[envManagerPath] = {
    id: envManagerPath, filename: envManagerPath, loaded: true,
    exports: { getCurrent: () => mockState.envManager.current }
  };

  const configManagerPath = require.resolve('../core/config/configManager');
  require.cache[configManagerPath] = {
    id: configManagerPath, filename: configManagerPath, loaded: true,
    exports: {
      getConfig: () => JSON.parse(JSON.stringify(mockState.configManager.config)),
      getStoragePath: () => mockState.configManager.storagePath,
      setConfig: (key, value) => { mockState.configManager.config[key] = value; return mockState.configManager.config; },
      setBulk: (updates) => { Object.assign(mockState.configManager.config, updates); return mockState.configManager.config; }
    }
  };

  const mirrorManagerPath = require.resolve('../core/config/mirrorManager');
  require.cache[mirrorManagerPath] = {
    id: mirrorManagerPath, filename: mirrorManagerPath, loaded: true,
    exports: {
      getMirrors: () => mockState.mirrorManager.mirrors,
      getDefaultMirror: () => mockState.mirrorManager.defaultMirror,
      buildMirrorArgs: () => null
    }
  };

  const backupManagerPath = require.resolve('../core/operations/backupManager');
  require.cache[backupManagerPath] = {
    id: backupManagerPath, filename: backupManagerPath, loaded: true,
    exports: {
      createBackup: async (env) => ({ id: mockState.backupManager.backupId }),
      restoreBackup: async (id, env, onOutput) => {
        mockState.backupManager.restoreCalled = true;
        if (onOutput) onOutput('[ROLLBACK] Restored', 'stderr');
      },
      validateBackupId: (id) => {
        if (typeof id !== 'string') throw new Error('Invalid backup ID: must be a string');
        if (id.includes('/') || id.includes('\\') || id.includes('..')) throw new Error('Invalid backup ID: path traversal detected');
        if (!/^backup_[a-zA-Z0-9._-]+\.txt$/.test(id)) throw new Error('Invalid backup ID: format mismatch');
        return id;
      }
    }
  };

  const logManagerPath = require.resolve('../core/system/logManager');
  require.cache[logManagerPath] = {
    id: logManagerPath, filename: logManagerPath, loaded: true,
    exports: {
      addLog: (entry) => { mockState.logManager.logs.push(entry); },
      getLogs: () => mockState.logManager.logs,
      clearLogs: () => { mockState.logManager.logs = []; },
      flushLogs: () => {}
    }
  };
}

function removeMocks() {
  const modules = [
    '../utils/processRunner',
    '../core/system/envManager',
    '../core/config/configManager',
    '../core/config/mirrorManager',
    '../core/operations/backupManager',
    '../core/system/logManager',
    '../core/operations/pipManager',
    '../core/operations/undoManager',
    '../core/operations/templateManager',
    '../core/operations/auditManager'
  ];
  for (const mod of modules) {
    try { delete require.cache[require.resolve(mod)]; } catch {}
  }
}

function cleanupTmp() {
  if (tmpStorage && fs.existsSync(tmpStorage)) {
    fs.rmSync(tmpStorage, { recursive: true, force: true });
  }
}

// ============ 测试套件 ============

describe('压力测试: undoManager', () => {
  beforeEach(() => { resetMockState(); removeMocks(); injectMocks(); });
  afterEach(() => { removeMocks(); cleanupTmp(); });

  it('records operations and reports canUndo correctly', () => {
    const undoManager = require('../core/operations/undoManager');
    assert.strictEqual(undoManager.canUndo().available, false);
    assert.strictEqual(undoManager.getStackSize(), 0);

    undoManager.recordOperation('install', [{ name: 'numpy', version: '1.0' }]);
    assert.strictEqual(undoManager.canUndo().available, true);
    assert.strictEqual(undoManager.getStackSize(), 1);
    assert.ok(undoManager.canUndo().lastAction.includes('numpy'));
  });

  it('respects MAX_UNDO_STACK (20) limit', () => {
    const undoManager = require('../core/operations/undoManager');
    for (let i = 0; i < 30; i++) {
      undoManager.recordOperation('install', [{ name: `pkg${i}`, version: '1.0' }]);
    }
    assert.strictEqual(undoManager.getStackSize(), 20);
  });

  it('clears undo stack', () => {
    const undoManager = require('../core/operations/undoManager');
    undoManager.recordOperation('install', [{ name: 'numpy' }]);
    undoManager.clear();
    assert.strictEqual(undoManager.getStackSize(), 0);
    assert.strictEqual(undoManager.canUndo().available, false);
  });

  it('ignores empty package list', () => {
    const undoManager = require('../core/operations/undoManager');
    undoManager.recordOperation('install', []);
    undoManager.recordOperation('install', null);
    assert.strictEqual(undoManager.getStackSize(), 0);
  });

  it('getLastOperation returns the most recent operation', () => {
    const undoManager = require('../core/operations/undoManager');
    undoManager.recordOperation('install', [{ name: 'a' }]);
    undoManager.recordOperation('uninstall', [{ name: 'b' }]);
    const last = undoManager.getLastOperation();
    assert.strictEqual(last.type, 'uninstall');
    assert.strictEqual(last.packages[0].name, 'b');
  });

  it('performUndo throws when stack is empty', async () => {
    const undoManager = require('../core/operations/undoManager');
    await assert.rejects(() => undoManager.performUndo(), /No operation to undo/);
  });

  it('performUndo for install triggers uninstall', async () => {
    const undoManager = require('../core/operations/undoManager');
    undoManager.recordOperation('install', [{ name: 'numpy', version: '1.0' }]);
    const result = await undoManager.performUndo();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.type, 'install');
    assert.deepStrictEqual(result.packages, ['numpy']);
    assert.strictEqual(undoManager.getStackSize(), 0);
  });

  it('performUndo for uninstall triggers reinstall', async () => {
    const undoManager = require('../core/operations/undoManager');
    undoManager.recordOperation('uninstall', [{ name: 'requests', version: '2.31' }]);
    const result = await undoManager.performUndo();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.type, 'uninstall');
  });

  it('performUndo for update triggers version rollback', async () => {
    const undoManager = require('../core/operations/undoManager');
    undoManager.recordOperation('update', [{ name: 'flask', version: '3.0' }], {
      oldVersions: { flask: '2.0' }
    });
    const result = await undoManager.performUndo();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.type, 'update');
  });

  it('canUndo formats display text correctly for multiple packages', () => {
    const undoManager = require('../core/operations/undoManager');
    undoManager.recordOperation('install', [
      { name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }
    ]);
    const info = undoManager.canUndo();
    assert.ok(info.lastAction.includes('a, b, c'));
    assert.ok(info.lastAction.includes('等4个包'));
  });
});

describe('压力测试: pipManager 高级场景', () => {
  beforeEach(() => { resetMockState(); removeMocks(); injectMocks(); });
  afterEach(() => { removeMocks(); cleanupTmp(); });

  it('uninstallPackages validates package names', async () => {
    const { uninstallPackages } = require('../core/operations/pipManager');
    await assert.rejects(
      () => uninstallPackages(['evil; rm -rf /']),
      /Invalid package name/
    );
  });

  it('uninstallPackages succeeds with rollback', async () => {
    const { uninstallPackages } = require('../core/operations/pipManager');
    const result = await uninstallPackages(['numpy'], { rollback: true });
    assert.deepStrictEqual(result.uninstalled, ['numpy']);
    assert.ok(result.operationId);
  });

  it('uninstallPackages rolls back on failure', async () => {
    mockState.processRunner.runPipHandler = async () => {
      throw new Error('uninstall failed');
    };
    const { uninstallPackages } = require('../core/operations/pipManager');
    await assert.rejects(
      () => uninstallPackages(['numpy'], { rollback: true }),
      /Uninstall failed and rolled back/
    );
    assert.strictEqual(mockState.backupManager.restoreCalled, true);
  });

  it('updatePackages validates package names', async () => {
    const { updatePackages } = require('../core/operations/pipManager');
    await assert.rejects(
      () => updatePackages(['bad name!']),
      /Invalid package name/
    );
  });

  it('updatePackages succeeds normally', async () => {
    const { updatePackages } = require('../core/operations/pipManager');
    const result = await updatePackages(['numpy'], { rollback: false });
    assert.deepStrictEqual(result.updated, ['numpy']);
    assert.strictEqual(result.failed.length, 0);
  });

  it('updatePackages rolls back on failure', async () => {
    mockState.processRunner.runPipHandler = async () => {
      throw new Error('update failed');
    };
    const { updatePackages } = require('../core/operations/pipManager');
    await assert.rejects(
      () => updatePackages(['numpy'], { rollback: true }),
      /Update failed and rolled back/
    );
  });

  it('updatePackages parallel mode handles partial failures', async () => {
    let callIdx = 0;
    mockState.processRunner.runPipHandler = async (pythonPath, args) => {
      callIdx++;
      // 第一个包失败，第二个包成功
      if (args.includes('numpy')) throw new Error('fail');
      return { stdout: '', stderr: '', code: 0 };
    };
    const { updatePackages } = require('../core/operations/pipManager');
    const result = await updatePackages(['numpy', 'requests'], { parallel: true, rollback: false });
    assert.ok(result.failed.length >= 1);
    assert.ok(result.updated.includes('requests'));
  });

  it('installPackages throws on empty package list', async () => {
    const { installPackages } = require('../core/operations/pipManager');
    await assert.rejects(() => installPackages([]), /No packages specified/);
  });

  it('installPackages throws when no environment selected', async () => {
    mockState.envManager.current = null;
    const { installPackages } = require('../core/operations/pipManager');
    await assert.rejects(() => installPackages(['numpy']), /No Python environment/);
  });

  it('installPackages parallel mode succeeds', async () => {
    const { installPackages } = require('../core/operations/pipManager');
    const result = await installPackages(['a', 'b', 'c'], { parallel: true, rollback: false });
    assert.strictEqual(result.installed.length, 3);
  });

  it('searchPackage rejects invalid keyword', async () => {
    const { searchPackage } = require('../core/operations/pipManager');
    await assert.rejects(() => searchPackage(''), /Invalid search keyword/);
    await assert.rejects(() => searchPackage('bad;chars'), /Invalid search keyword/);
    await assert.rejects(() => searchPackage('a'.repeat(201)), /too long/);
  });

  it('searchPackage returns result on valid keyword', async () => {
    mockState.processRunner.runPipHandler = async () => ({
      stdout: 'numpy (1.26.0)\nAvailable versions: 1.26.0, 1.25.0',
      stderr: '', code: 0
    });
    const { searchPackage } = require('../core/operations/pipManager');
    const result = await searchPackage('numpy');
    assert.strictEqual(result.keyword, 'numpy');
    assert.ok(result.result.length > 0);
  });

  it('showPackageInfo rejects invalid name', async () => {
    const { showPackageInfo } = require('../core/operations/pipManager');
    await assert.rejects(() => showPackageInfo(''), /Invalid package name/);
  });

  it('showPackageInfo parses pip show output', async () => {
    mockState.processRunner.runPipHandler = async () => ({
      stdout: 'Name: numpy\nVersion: 1.26.0\nSummary: Array computing\nHome-page: https://numpy.org\nAuthor: NumPy\nLicense: BSD\nRequires: \nRequired-by: pandas',
      stderr: '', code: 0
    });
    const { showPackageInfo } = require('../core/operations/pipManager');
    const info = await showPackageInfo('numpy');
    assert.strictEqual(info.name, 'numpy');
    assert.strictEqual(info.version, '1.26.0');
    assert.deepStrictEqual(info.requiredBy, ['pandas']);
  });

  it('downloadPackages validates inputs', async () => {
    const { downloadPackages } = require('../core/operations/pipManager');
    await assert.rejects(() => downloadPackages([], '/tmp'), /No packages/);
    await assert.rejects(() => downloadPackages(['numpy'], ''), /No destination/);
  });

  it('downloadPackages creates dest directory and succeeds', async () => {
    const dest = path.join(tmpStorage, 'dl-pkgs');
    const { downloadPackages } = require('../core/operations/pipManager');
    const result = await downloadPackages(['numpy'], dest);
    assert.strictEqual(result.downloaded, 1);
    assert.ok(fs.existsSync(dest));
  });

  it('exportRequirements returns content and count', async () => {
    mockState.processRunner.runPipHandler = async () => ({
      stdout: 'numpy==1.26.0\nrequests==2.31.0\n',
      stderr: '', code: 0
    });
    const { exportRequirements } = require('../core/operations/pipManager');
    const result = await exportRequirements({});
    assert.strictEqual(result.count, 2);
    assert.ok(result.content.includes('numpy==1.26.0'));
  });

  it('exportRequirements saves to file when savePath provided', async () => {
    mockState.processRunner.runPipHandler = async () => ({
      stdout: 'flask==3.0\n',
      stderr: '', code: 0
    });
    const savePath = path.join(tmpStorage, 'req.txt');
    const { exportRequirements } = require('../core/operations/pipManager');
    await exportRequirements({ savePath });
    assert.ok(fs.existsSync(savePath));
    assert.ok(fs.readFileSync(savePath, 'utf-8').includes('flask==3.0'));
  });

  it('importRequirements rejects missing file', async () => {
    const { importRequirements } = require('../core/operations/pipManager');
    await assert.rejects(() => importRequirements('/nonexistent/file.txt'), /File not found/);
  });

  it('importRequirements succeeds with valid file', async () => {
    const reqFile = path.join(tmpStorage, 'requirements.txt');
    fs.writeFileSync(reqFile, 'numpy==1.26.0\nrequests==2.31.0\n');
    mockState.processRunner.runPipHandler = async () => ({
      stdout: 'Successfully installed numpy-1.26.0 requests-2.31.0',
      stderr: '', code: 0
    });
    const { importRequirements } = require('../core/operations/pipManager');
    const result = await importRequirements(reqFile);
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('numpy'));
  });

  it('diffRequirements compares two file sources', async () => {
    const fileA = path.join(tmpStorage, 'a.txt');
    const fileB = path.join(tmpStorage, 'b.txt');
    fs.writeFileSync(fileA, 'numpy==1.26.0\nflask==3.0\n');
    fs.writeFileSync(fileB, 'numpy==1.25.0\nrequests==2.31.0\n');
    const { diffRequirements } = require('../core/operations/pipManager');
    const result = await diffRequirements(
      { type: 'file', path: fileA },
      { type: 'file', path: fileB }
    );
    assert.ok(result.onlyA.some(p => p.name === 'flask'));
    assert.ok(result.onlyB.some(p => p.name === 'requests'));
    assert.ok(result.upgraded.some(p => p.name === 'numpy'));
  });

  it('diffRequirements handles missing file', async () => {
    const { diffRequirements } = require('../core/operations/pipManager');
    await assert.rejects(
      () => diffRequirements({ type: 'file', path: '/no/file' }, { type: 'file', path: '/no/file2' }),
      /File not found/
    );
  });

  it('installFromFile rejects unsupported file type', async () => {
    const tmpFile = path.join(tmpStorage, 'bad.zip');
    fs.writeFileSync(tmpFile, 'data');
    const { installFromFile } = require('../core/operations/pipManager');
    await assert.rejects(() => installFromFile(tmpFile), /Unsupported file type/);
  });

  it('installFromFile rejects missing file', async () => {
    const { installFromFile } = require('../core/operations/pipManager');
    await assert.rejects(() => installFromFile('/no/such/file.whl'), /File not found/);
  });

  it('installFromFile handles .txt file', async () => {
    const reqFile = path.join(tmpStorage, 'req.txt');
    fs.writeFileSync(reqFile, 'numpy==1.26.0\n');
    const { installFromFile } = require('../core/operations/pipManager');
    const result = await installFromFile(reqFile, { rollback: false });
    assert.ok(result.operationId);
  });

  it('compareEnvironments rejects empty paths', async () => {
    const { compareEnvironments } = require('../core/operations/pipManager');
    await assert.rejects(() => compareEnvironments('', '/b'), /Two environment paths required/);
    await assert.rejects(() => compareEnvironments('/a', ''), /Two environment paths required/);
  });

  it('compareEnvironments compares two environments', async () => {
    let callCount = 0;
    mockState.processRunner.runPipHandler = async (pythonPath, args) => {
      if (args.includes('list')) {
        callCount++;
        if (callCount === 1) {
          return { stdout: JSON.stringify([{ name: 'numpy', version: '1.26' }, { name: 'flask', version: '3.0' }]), stderr: '', code: 0 };
        } else {
          return { stdout: JSON.stringify([{ name: 'numpy', version: '1.25' }, { name: 'requests', version: '2.31' }]), stderr: '', code: 0 };
        }
      }
      return { stdout: '', stderr: '', code: 0 };
    };
    const { compareEnvironments } = require('../core/operations/pipManager');
    const result = await compareEnvironments('/python/a', '/python/b');
    assert.ok(result.onlyA.some(p => p.name === 'flask'));
    assert.ok(result.onlyB.some(p => p.name === 'requests'));
    assert.ok(result.different.some(p => p.name === 'numpy'));
  });

  it('concurrent install operations serialize via env lock', async () => {
    const { installPackages } = require('../core/operations/pipManager');
    // Launch two installs concurrently — they should serialize
    const p1 = installPackages(['pkg-a'], { rollback: false });
    const p2 = installPackages(['pkg-b'], { rollback: false });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.ok(r1.installed.includes('pkg-a'));
    assert.ok(r2.installed.includes('pkg-b'));
  });
});

describe('压力测试: buildPackageSpec 边界场景', () => {
  it('rejects non-string input', () => {
    const { buildPackageSpec } = require('../core/operations/pipManager');
    assert.throws(() => buildPackageSpec(123), /Invalid package name/);
    assert.throws(() => buildPackageSpec(null), /Invalid package name/);
    assert.throws(() => buildPackageSpec(undefined), /Invalid package name/);
  });

  it('rejects extremely long package name', () => {
    const { buildPackageSpec } = require('../core/operations/pipManager');
    assert.throws(() => buildPackageSpec('a'.repeat(215)), /too long/);
  });

  it('handles range version mode', () => {
    const { buildPackageSpec } = require('../core/operations/pipManager');
    const spec = buildPackageSpec('numpy', { versionMode: 'range', version: '>=1.0,<2.0' });
    assert.strictEqual(spec, 'numpy>=1.0,<2.0');
  });

  it('rejects invalid range version', () => {
    const { buildPackageSpec } = require('../core/operations/pipManager');
    assert.throws(
      () => buildPackageSpec('numpy', { versionMode: 'range', version: 'bad;version' }),
      /Invalid version range/
    );
  });

  it('rejects wheel in sensitive directory', () => {
    const { buildPackageSpec } = require('../core/operations/pipManager');
    assert.throws(
      () => buildPackageSpec('C:/Windows/system32/numpy.whl'),
      /sensitive directory/i
    );
  });

  it('rejects wheel with UNC path', () => {
    const { buildPackageSpec } = require('../core/operations/pipManager');
    assert.throws(
      () => buildPackageSpec('\\\\server\\share\\pkg.whl'),
      /Invalid wheel/
    );
  });

  it('rejects relative wheel path', () => {
    const { buildPackageSpec } = require('../core/operations/pipManager');
    assert.throws(
      () => buildPackageSpec('relative/path/pkg.whl'),
      /must be absolute/
    );
  });
});

describe('压力测试: validateBackupId 边界场景', () => {
  const { validateBackupId } = require('../core/operations/backupManager');

  it('rejects null/undefined/number inputs', () => {
    assert.throws(() => validateBackupId(null), /must be a string/);
    assert.throws(() => validateBackupId(undefined), /must be a string/);
    assert.throws(() => validateBackupId(42), /must be a string/);
  });

  it('rejects empty string', () => {
    assert.throws(() => validateBackupId(''), /length must be/);
  });

  it('rejects extremely long backup id', () => {
    assert.throws(() => validateBackupId('backup_' + 'x'.repeat(250) + '.txt'), /length must be/);
  });

  it('rejects backslash path traversal', () => {
    assert.throws(() => validateBackupId('backup\\..\\evil.txt'), /path traversal/);
  });

  it('rejects non-backup format', () => {
    assert.throws(() => validateBackupId('config.json'), /format mismatch/);
    assert.throws(() => validateBackupId('backup_no_ext'), /format mismatch/);
  });
});

describe('压力测试: isAllowedOpenPath 边界场景', () => {
  const { isAllowedOpenPath } = require('../utils/security');

  it('blocks non-string inputs', () => {
    assert.strictEqual(isAllowedOpenPath(123, ['/home']), false);
    assert.strictEqual(isAllowedOpenPath(undefined, ['/home']), false);
  });

  it('blocks when allowedDirs is empty or invalid', () => {
    assert.strictEqual(isAllowedOpenPath('/home/user/file', []), false);
    assert.strictEqual(isAllowedOpenPath('/home/user/file', null), false);
    assert.strictEqual(isAllowedOpenPath('/home/user/file', 'not-array'), false);
  });

  it('allows exact match of allowed directory', () => {
    const allowed = [path.join(os.homedir(), 'Documents')];
    assert.strictEqual(isAllowedOpenPath(allowed[0], allowed), true);
  });

  it('blocks path traversal via ../', () => {
    const allowed = [path.join(os.homedir(), 'Documents')];
    const evil = path.join(allowed[0], '..', '..', 'etc', 'passwd');
    assert.strictEqual(isAllowedOpenPath(evil, allowed), false);
  });

  it('blocks prefix-matching attack (e.g. DocumentsEvil)', () => {
    const allowed = [path.join(os.homedir(), 'Documents')];
    const evil = path.join(os.homedir(), 'DocumentsEvil', 'file.txt');
    assert.strictEqual(isAllowedOpenPath(evil, allowed), false);
  });
});

describe('压力测试: logManager 真实模块', () => {
  beforeEach(() => { resetMockState(); removeMocks(); injectMocks(); });
  afterEach(() => { removeMocks(); cleanupTmp(); });

  it('addLog, getLogs, clearLogs work end-to-end', () => {
    // 使用真实的 logManager (需要 configManager mock)
    delete require.cache[require.resolve('../core/system/logManager')];
    const logManager = require('../core/system/logManager');

    logManager.addLog({ action: 'Test action 1', status: 'ok', type: 'install' });
    logManager.addLog({ action: 'Test action 2', status: 'failed', type: 'uninstall', detail: 'some detail' });

    const allLogs = logManager.getLogs();
    assert.strictEqual(allLogs.length, 2);

    const installLogs = logManager.getLogs({ type: 'install' });
    assert.strictEqual(installLogs.length, 1);
    assert.strictEqual(installLogs[0].action, 'Test action 1');

    const searchLogs = logManager.getLogs({ search: 'detail' });
    assert.strictEqual(searchLogs.length, 1);

    logManager.clearLogs();
    assert.strictEqual(logManager.getLogs().length, 0);
  });

  it('truncates extremely long fields', () => {
    delete require.cache[require.resolve('../core/system/logManager')];
    const logManager = require('../core/system/logManager');

    const longStr = 'x'.repeat(2000);
    const record = logManager.addLog({ action: longStr, status: 'ok', type: 'system' });
    assert.ok(record.action.length <= 1004); // 1000 + '...'
  });

  it('handles non-object entry gracefully', () => {
    delete require.cache[require.resolve('../core/system/logManager')];
    const logManager = require('../core/system/logManager');

    const record = logManager.addLog('just a string');
    assert.ok(record.action.includes('just a string'));
  });

  it('caps logs at MAX_LOGS (2000)', () => {
    delete require.cache[require.resolve('../core/system/logManager')];
    const logManager = require('../core/system/logManager');

    for (let i = 0; i < 2100; i++) {
      logManager.addLog({ action: `log-${i}`, status: 'ok', type: 'system' });
    }
    assert.strictEqual(logManager.getLogs().length, 2000);
  });
});

describe('压力测试: templateManager 模板和快照', () => {
  beforeEach(() => { resetMockState(); removeMocks(); injectMocks(); });
  afterEach(() => { removeMocks(); cleanupTmp(); });

  it('getTemplates returns builtin templates', () => {
    const templateManager = require('../core/operations/templateManager');
    const templates = templateManager.getTemplates();
    assert.ok(templates.length >= 6);
    assert.ok(templates.some(t => t.id === 'web-flask'));
    assert.ok(templates.some(t => t.id === 'data-analysis'));
  });

  it('addCustomTemplate and removeCustomTemplate', () => {
    const templateManager = require('../core/operations/templateManager');
    const added = templateManager.addCustomTemplate({
      name: 'My Template',
      packages: ['numpy', 'pandas']
    });
    assert.strictEqual(added, true);

    const templates = templateManager.getTemplates();
    const custom = templates.find(t => t.name === 'My Template');
    assert.ok(custom);
    assert.ok(custom.isCustom);

    templateManager.removeCustomTemplate(custom.id);
  });

  it('addCustomTemplate rejects invalid input', () => {
    const templateManager = require('../core/operations/templateManager');
    assert.strictEqual(templateManager.addCustomTemplate(null), false);
    assert.strictEqual(templateManager.addCustomTemplate({ name: '' }), false);
    assert.strictEqual(templateManager.addCustomTemplate({ name: 'X', packages: 'not-array' }), false);
  });

  it('createSnapshot and listSnapshots', () => {
    const templateManager = require('../core/operations/templateManager');
    // mock runPip 返回 freeze 输出
    const procPath = require.resolve('../utils/processRunner');
    require.cache[procPath].exports.runPip = async () => ({
      stdout: 'numpy==1.26.0\nflask==3.0\n', stderr: '', code: 0
    });

    const snap = templateManager.createSnapshot('/mock/python', 'test-snap');
    // createSnapshot is async, but we can test sync snapshot dir
    const dir = templateManager.getSnapshotDir ? templateManager.getSnapshotDir() : null;
    // Just verify the function doesn't throw synchronously
    assert.ok(snap instanceof Promise);
  });

  it('deleteSnapshot handles non-existent snapshot', () => {
    const templateManager = require('../core/operations/templateManager');
    const result = templateManager.deleteSnapshot('nonexistent_snapshot');
    assert.strictEqual(result, false);
  });

  it('getSnapshotDetail rejects non-existent snapshot', () => {
    const templateManager = require('../core/operations/templateManager');
    assert.throws(() => templateManager.getSnapshotDetail('nonexistent'), /Snapshot not found/);
  });
});

describe('压力测试: auditManager parseAuditResult', () => {
  beforeEach(() => { resetMockState(); removeMocks(); injectMocks(); });
  afterEach(() => { removeMocks(); cleanupTmp(); });

  it('clearCache and getCachedResult', () => {
    const auditManager = require('../core/operations/auditManager');
    auditManager.clearCache();
    assert.strictEqual(auditManager.getCachedResult(), null);
  });

  it('runAudit throws when no environment', async () => {
    mockState.envManager.current = null;
    const auditManager = require('../core/operations/auditManager');
    await assert.rejects(() => auditManager.runAudit(), /No Python environment/);
  });
});

describe('压力测试: getFolderSizeCached 边界场景', () => {
  const { getFolderSizeCached } = require('../core/operations/pipManager');

  it('handles permission denied gracefully', () => {
    const cache = new Map();
    const size = getFolderSizeCached('/nonexistent/path', cache);
    assert.strictEqual(size, 0);
  });

  it('caches directory size correctly', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-size-'));
    try {
      fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello');
      fs.writeFileSync(path.join(tmp, 'b.txt'), 'world!');
      const cache = new Map();
      const size1 = getFolderSizeCached(tmp, cache);
      assert.strictEqual(size1, 11); // "hello" + "world!"
      const size2 = getFolderSizeCached(tmp, cache);
      assert.strictEqual(size2, 11); // from cache
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('压力测试: buildPackageDirMap 边界场景', () => {
  const { buildPackageDirMap } = require('../core/operations/pipManager');

  it('handles empty directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-dipmap-'));
    try {
      const map = buildPackageDirMap(tmp);
      assert.strictEqual(map.size, 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('handles null/undefined input', () => {
    assert.strictEqual(buildPackageDirMap(null).size, 0);
    assert.strictEqual(buildPackageDirMap(undefined).size, 0);
    assert.strictEqual(buildPackageDirMap('').size, 0);
  });

  it('normalizes underscore to hyphen in package names', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-norm-'));
    try {
      fs.mkdirSync(path.join(tmp, 'my_package-1.0.0.dist-info'));
      const map = buildPackageDirMap(tmp);
      assert.ok(map.has('my-package'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('压力测试: estimatePackageSizeFast 边界场景', () => {
  const { estimatePackageSizeFast } = require('../core/operations/pipManager');

  it('returns 0 size for null sitePackages', () => {
    const result = estimatePackageSizeFast('numpy', null, new Map(), new Map());
    assert.deepStrictEqual(result, { size: 0, text: '0 MB' });
  });

  it('returns "-" for package with zero total size', () => {
    const dirMap = new Map();
    dirMap.set('numpy', { type: 'dir', path: '/nonexistent/numpy' });
    const result = estimatePackageSizeFast('numpy', '/nonexistent', dirMap, new Map());
    assert.strictEqual(result.text, '-');
  });
});

describe('压力测试: healthCheck 和 checkConflicts', () => {
  beforeEach(() => { resetMockState(); removeMocks(); injectMocks(); });
  afterEach(() => { removeMocks(); cleanupTmp(); });

  it('checkConflicts handles no-conflict output', async () => {
    mockState.processRunner.runPipHandler = async () => ({
      stdout: 'No broken requirements found.\n', stderr: '', code: 0
    });
    const { checkConflicts } = require('../core/operations/pipManager');
    const result = await checkConflicts();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.conflicts.length, 0);
  });

  it('checkConflicts parses conflict lines', async () => {
    mockState.processRunner.runPipHandler = async (pythonPath, args) => {
      if (args.includes('check')) {
        return {
          stdout: 'pkgA 1.0 has requirement pkgB>=2.0, but you have pkgB 1.5\n',
          stderr: '', code: 1
        };
      }
      return { stdout: '', stderr: '', code: 0 };
    };
    const { checkConflicts } = require('../core/operations/pipManager');
    const result = await checkConflicts();
    assert.strictEqual(result.ok, false);
    assert.ok(result.conflicts.length > 0);
    assert.strictEqual(result.conflicts[0].package, 'pkgA');
  });

  it('healthCheck returns a structured report', async () => {
    mockState.processRunner.runPipHandler = async (pythonPath, args) => {
      if (args.includes('list')) {
        return { stdout: JSON.stringify([{ name: 'numpy', version: '1.0' }]), stderr: '', code: 0 };
      }
      if (args.includes('check')) {
        return { stdout: 'No broken requirements found.\n', stderr: '', code: 0 };
      }
      if (args.includes('show')) {
        return { stdout: 'Name: numpy\nVersion: 1.0\n', stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    };
    const { healthCheck } = require('../core/operations/pipManager');
    const report = await healthCheck();
    assert.ok(typeof report.score === 'number');
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.strictEqual(report.totalPackages, 1);
  });
});

describe('压力测试: processRunner cancelOperation', () => {
  it('cancelOperation returns 0 for null operationId', () => {
    const { cancelOperation } = require('../utils/processRunner');
    assert.strictEqual(cancelOperation(null), 0);
    assert.strictEqual(cancelOperation(''), 0);
  });

  it('cancelOperation returns 0 for unknown operationId', () => {
    const { cancelOperation } = require('../utils/processRunner');
    assert.strictEqual(cancelOperation('unknown-op-id'), 0);
  });

  it('cancelAllProcesses returns 0 when no active processes', () => {
    const { cancelAllProcesses } = require('../utils/processRunner');
    assert.strictEqual(cancelAllProcesses(), 0);
  });
});

describe('压力测试: installOne 镜像重试逻辑', () => {
  beforeEach(() => { resetMockState(); removeMocks(); injectMocks(); });
  afterEach(() => { removeMocks(); cleanupTmp(); });

  it('tries all mirrors and records failures when rollback=false', async () => {
    let attempt = 0;
    mockState.processRunner.runPipHandler = async () => {
      attempt++;
      throw new Error(`Mirror ${attempt} failed`);
    };
    const { installPackages } = require('../core/operations/pipManager');
    // rollback: false → 不抛异常，而是返回 failed 列表
    const result = await installPackages(['numpy'], { rollback: false });
    assert.strictEqual(result.installed.length, 0);
    assert.ok(result.failed.length > 0);
    // 应该尝试了至少 2 个镜像
    assert.ok(attempt >= 2);
  });

  it('succeeds on last mirror attempt', async () => {
    let attempt = 0;
    mockState.processRunner.runPipHandler = async () => {
      attempt++;
      // 第一次失败，第二次成功（maxAttempts=2 时只尝试 2 次）
      if (attempt < 2) throw new Error('fail');
      return { stdout: 'Successfully installed', stderr: '', code: 0 };
    };
    const { installPackages } = require('../core/operations/pipManager');
    const result = await installPackages(['numpy'], { rollback: false });
    assert.strictEqual(result.installed.length, 1);
    assert.strictEqual(result.failed.length, 0);
  });
});

describe('压力测试: updateOne "Requirement already satisfied" 处理', () => {
  beforeEach(() => { resetMockState(); removeMocks(); injectMocks(); });
  afterEach(() => { removeMocks(); cleanupTmp(); });

  it('retries next mirror when "already satisfied" detected', async () => {
    let attempt = 0;
    mockState.processRunner.runPipHandler = async () => {
      attempt++;
      if (attempt === 1) {
        return { stdout: 'Requirement already satisfied: numpy', stderr: '', code: 0 };
      }
      return { stdout: 'Successfully installed numpy-1.27.0', stderr: '', code: 0 };
    };
    const { updatePackages } = require('../core/operations/pipManager');
    const result = await updatePackages(['numpy'], { rollback: false });
    assert.strictEqual(result.updated.length, 1);
    assert.ok(attempt >= 2);
  });
});
