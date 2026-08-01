const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// ============ Mock 基础设施 ============
// Mock runCommand（底层命令执行），让 runPip 真实执行（内部调用 runCommand）

const mockState = {
  envManager: { current: { path: '/mock/python', name: 'test-env' } },
  configManager: { config: { retryCount: 2, parallelThreads: 4 }, storagePath: '/tmp/mock-storage' },
  mirrorManager: {
    mirrors: [
      { name: '默认', url: 'https://pypi.org/simple/', enabled: true },
      { name: '清华', url: 'https://pypi.tuna.tsinghua.edu.cn/simple/', enabled: true },
      { name: '阿里', url: 'https://mirrors.aliyun.com/pypi/simple/', enabled: true }
    ],
    defaultMirror: { name: '默认', url: 'https://pypi.org/simple/', enabled: true }
  },
  backupManager: { backupId: 'backup_env_2026-01-01T00-00-00.txt', restoreCalled: false },
  processRunner: { runCommandCalls: [], runCommandHandler: null },
  logManager: { logs: [] }
};

function resetMockState() {
  mockState.envManager.current = { path: '/mock/python', name: 'test-env' };
  mockState.configManager.config = { retryCount: 2, parallelThreads: 4 };
  mockState.mirrorManager.mirrors = [
    { name: '默认', url: 'https://pypi.org/simple/', enabled: true },
    { name: '清华', url: 'https://pypi.tuna.tsinghua.edu.cn/simple/', enabled: true },
    { name: '阿里', url: 'https://mirrors.aliyun.com/pypi/simple/', enabled: true }
  ];
  mockState.mirrorManager.defaultMirror = { name: '默认', url: 'https://pypi.org/simple/', enabled: true };
  mockState.backupManager.backupId = 'backup_env_2026-01-01T00-00-00.txt';
  mockState.backupManager.restoreCalled = false;
  mockState.processRunner.runCommandCalls = [];
  mockState.processRunner.runCommandHandler = null;
  mockState.logManager.logs = [];
}

// 注入模块 mock 到 require.cache
function injectMocks() {
  // mock processRunner - 只 mock runCommand，让 runPip 真实执行
  const processRunnerPath = require.resolve('../utils/processRunner');
  require.cache[processRunnerPath] = {
    id: processRunnerPath,
    filename: processRunnerPath,
    loaded: true,
    exports: {
      runCommand: async (command, args, options) => {
        mockState.processRunner.runCommandCalls.push({ command, args, options });
        if (mockState.processRunner.runCommandHandler) {
          return mockState.processRunner.runCommandHandler(command, args, options);
        }
        return { stdout: '', stderr: '', code: 0 };
      },
      // runPip 真实实现（内部调用 mock 的 runCommand）
      runPip: async (pythonPath, args, options) => {
        const { runCommand } = require.cache[processRunnerPath].exports;
        return runCommand(pythonPath, ['-m', 'pip', ...args], options);
      },
      ensurePip: async () => true,
      cancelOperation: () => 0,
      checkPipAvailable: async () => true,
      clearPipReadyCache: () => {}
    }
  };

  // mock envManager
  const envManagerPath = require.resolve('../core/system/envManager');
  require.cache[envManagerPath] = {
    id: envManagerPath,
    filename: envManagerPath,
    loaded: true,
    exports: {
      getCurrent: () => mockState.envManager.current
    }
  };

  // mock configManager
  const configManagerPath = require.resolve('../core/config/configManager');
  require.cache[configManagerPath] = {
    id: configManagerPath,
    filename: configManagerPath,
    loaded: true,
    exports: {
      getConfig: () => mockState.configManager.config,
      getStoragePath: () => mockState.configManager.storagePath
    }
  };

  // mock mirrorManager
  const mirrorManagerPath = require.resolve('../core/config/mirrorManager');
  require.cache[mirrorManagerPath] = {
    id: mirrorManagerPath,
    filename: mirrorManagerPath,
    loaded: true,
    exports: {
      getMirrors: () => mockState.mirrorManager.mirrors,
      getDefaultMirror: () => mockState.mirrorManager.defaultMirror,
      buildMirrorArgs: () => null
    }
  };

  // mock backupManager
  const backupManagerPath = require.resolve('../core/operations/backupManager');
  require.cache[backupManagerPath] = {
    id: backupManagerPath,
    filename: backupManagerPath,
    loaded: true,
    exports: {
      createBackup: async (env) => ({ id: mockState.backupManager.backupId }),
      restoreBackup: async (id, env, onOutput) => {
        mockState.backupManager.restoreCalled = true;
        if (onOutput) onOutput('[ROLLBACK] Restored', 'stderr');
      },
      validateBackupId: (id) => id
    }
  };

  // mock logManager
  const logManagerPath = require.resolve('../core/system/logManager');
  require.cache[logManagerPath] = {
    id: logManagerPath,
    filename: logManagerPath,
    loaded: true,
    exports: {
      addLog: (entry) => { mockState.logManager.logs.push(entry); }
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
    '../core/operations/pipManager'
  ];
  for (const mod of modules) {
    try {
      delete require.cache[require.resolve(mod)];
    } catch { /* ignore if not resolved */ }
  }
}

// 加载 pipManager（在 mock 注入后）
function loadPipManager() {
  return require('../core/operations/pipManager');
}

// ============ 测试用例 ============

describe('installPackages - runCommand mock', () => {
  beforeEach(() => {
    resetMockState();
    removeMocks();
    injectMocks();
  });

  afterEach(() => {
    removeMocks();
  });

  // 场景 1: 正常安装成功
  it('installs packages successfully via runCommand', async () => {
    // runCommand 默认返回成功（mock 基础设施）
    const { installPackages } = loadPipManager();

    const result = await installPackages(['numpy', 'requests'], { rollback: false });

    // 验证返回结构
    assert.strictEqual(result.installed.length, 2);
    assert.deepStrictEqual(result.installed, ['numpy', 'requests']);
    assert.strictEqual(result.failed.length, 0);
    assert.ok(result.operationId);

    // 验证 runCommand 被调用（每个包至少调用 1 次，默认镜像尝试 2 次）
    const installCalls = mockState.processRunner.runCommandCalls.filter(
      c => c.args.includes('install') && c.args.includes('--no-warn-script-location')
    );
    assert.ok(installCalls.length >= 2, `Expected >= 2 install calls, got ${installCalls.length}`);

    // 验证第一个包使用了默认镜像（无 --index-url）
    const firstInstall = installCalls[0];
    assert.ok(firstInstall.args.includes('numpy'));
    assert.strictEqual(firstInstall.args.includes('--index-url'), false);

    // 验证日志记录
    const installLog = mockState.logManager.logs.find(l => l.action.startsWith('Install:'));
    assert.ok(installLog, 'Expected install log entry');
    assert.strictEqual(installLog.status, 'ok');
  });

  // 场景 2: 安装失败触发自动回滚
  it('rolls back via backupManager when install fails', async () => {
    // 所有 runCommand 调用都失败
    mockState.processRunner.runCommandHandler = async () => {
      throw new Error('pip install failed: network error');
    };

    const { installPackages } = loadPipManager();
    const outputs = [];
    const onOutput = (msg) => outputs.push(msg);

    // installPackages 在串行模式下，第一个包失败后会回滚并 throw
    await assert.rejects(
      () => installPackages(['numpy'], { rollback: true }, onOutput),
      /Install failed and rolled back/
    );

    // 验证回滚被调用
    assert.strictEqual(mockState.backupManager.restoreCalled, true, 'restoreBackup should be called');

    // 验证输出中包含 ROLLBACK 信息
    const rollbackMsg = outputs.find(m => m.includes('[ROLLBACK]'));
    assert.ok(rollbackMsg, 'Expected [ROLLBACK] output message');

    // 验证日志记录了失败和回滚
    const failLog = mockState.logManager.logs.find(l => l.status === 'failed' && l.type === 'install');
    assert.ok(failLog, 'Expected failed install log entry');
    assert.ok(failLog.detail.includes('Rolled back'), 'Log should mention rollback');
  });

  // 场景 3: 镜像重试 — 默认镜像失败后切换到备用镜像
  it('retries on alternate mirrors when default mirror fails', async () => {
    let callCount = 0;
    mockState.processRunner.runCommandHandler = async (command, args, options) => {
      callCount++;
      // 第一次调用（默认镜像）失败，第二次调用（清华镜像）成功
      if (callCount === 1) {
        throw new Error('Connection timeout on default mirror');
      }
      return { stdout: 'Successfully installed numpy-1.26.0', stderr: '', code: 0 };
    };

    const { installPackages } = loadPipManager();
    const outputs = [];
    const onOutput = (msg) => outputs.push(msg);

    const result = await installPackages(['numpy'], { retry: true, rollback: false }, onOutput);

    // 验证安装成功（通过备用镜像）
    assert.strictEqual(result.installed.length, 1);
    assert.deepStrictEqual(result.installed, ['numpy']);
    assert.strictEqual(result.failed.length, 0);

    // 验证 runCommand 被调用了至少 2 次（默认 + 备用镜像）
    const installCalls = mockState.processRunner.runCommandCalls.filter(
      c => c.args.includes('install') && c.args.includes('numpy')
    );
    assert.ok(installCalls.length >= 2, `Expected >= 2 calls (retry), got ${installCalls.length}`);

    // 验证第二次调用使用了备用镜像的 --index-url
    const secondCall = installCalls[1];
    assert.ok(
      secondCall.args.includes('--index-url'),
      'Second attempt should use --index-url for alternate mirror'
    );
    const indexUrlIdx = secondCall.args.indexOf('--index-url');
    assert.strictEqual(
      secondCall.args[indexUrlIdx + 1],
      'https://pypi.tuna.tsinghua.edu.cn/simple/',
      'Should retry with Tsinghua mirror'
    );

    // 验证输出中包含重试信息
    const retryMsg = outputs.find(m => m.includes('retry'));
    assert.ok(retryMsg, 'Expected retry output message');

    // 验证回滚未被调用
    assert.strictEqual(mockState.backupManager.restoreCalled, false, 'restoreBackup should NOT be called on success');
  });
});
