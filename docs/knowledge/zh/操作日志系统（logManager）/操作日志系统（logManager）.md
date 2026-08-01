---
kind: logging_system
name: 操作日志系统（logManager）
category: logging_system
scope:
    - '**'
source_files:
    - core/system/logManager.js
    - main.js
    - preload.js
---

PyLibMaster 的日志系统是一个轻量级的操作日志记录器，专注于记录应用内关键操作的审计轨迹，而非通用调试输出。该系统以 `core/system/logManager.js` 为核心实现，通过 JSON 文件持久化存储，为 pip 包管理、备份、镜像源配置、定时任务等核心功能提供可追溯的操作审计能力。

**系统与架构**
- 无外部日志框架依赖，完全基于 Node.js 原生 `fs` 模块实现
- 采用内存数组缓存 + 防抖写入磁盘的模式，避免频繁 I/O 操作
- 通过 Electron IPC 暴露 `log:get`、`log:clear`、`log:add`、`log:export` 四个接口供渲染进程调用
- 应用退出时通过 `before-quit` 事件调用 `flushLogs()` 确保数据不丢失

**日志结构与字段约束**
- 每条日志包含固定字段：`time`（ISO 时间戳，格式化为 `YYYY-MM-DD HH:mm:ss`）、`action`（操作描述）、`status`（`ok`/`failed`）、`type`（`install`/`uninstall`/`update`/`system`）、`detail`（详细信息）
- 字段长度保护：单个字符串字段最大 1000 字符，超长自动截断并追加 `...`；搜索关键词限制 200 字符
- 日志容量上限：最多保留 2000 条，超出时裁剪最旧记录
- 新日志始终插入数组开头，保证最新记录优先展示

**存储策略**
- 存储位置：`{storagePath}/logs/operations.json`，目录不存在时自动创建
- 写入策略：300ms 防抖批量写入，避免高频操作导致磁盘抖动
- 错误处理：写入失败时降级到 `console.error`，防止日志模块自身异常导致死循环
- 初始化容错：JSON 文件损坏时自动重置为空数组，保证服务可用性

**使用模式与约定**
- 各业务模块通过 `require('../system/logManager')` 动态引入，避免循环依赖
- 统一通过 `addLog({ action, status, type, detail })` 格式记录，非对象输入会安全降级为默认结构
- 查询支持按 `type` 筛选和 `search` 关键词模糊匹配（不区分大小写，匹配 `action` 和 `detail` 字段）
- 导出支持 CSV 和 Markdown 两种格式，通过 `log:export` IPC 触发保存对话框

**与其他模块的集成**
- `configManager`：配置保存失败时回退记录日志，但需处理 logManager 未就绪的竞态条件
- `mirrorManager`、`schedulerManager`、`auditManager`、`backupManager`、`pipManager` 等均在关键操作失败路径记录审计日志
- `main.js` 在 `before-quit` 生命周期钩子中调用 `flushLogs()` 确保退出前数据落盘