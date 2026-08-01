---
kind: error_handling
name: 错误处理体系：结构化异常、IPC 桥接与日志追踪
category: error_handling
scope:
    - '**'
source_files:
    - main.js
    - preload.js
    - core/operations/pipManager.js
    - utils/processRunner.js
    - core/system/logManager.js
    - renderer/js/app.js
---

## 1. 系统/方法概述
PyLibMaster 采用「主进程抛出 Error + 渲染进程 Promise.catch」的异步错误处理模式，配合统一的日志记录（logManager）和 IPC 桥接（preload.js），形成从 UI → preload → main → core → utils/processRunner 的完整错误传播链路。核心特点：
- 使用原生 `new Error(...)` 表达业务校验失败与运行时异常；
- 子进程执行统一通过 `utils/processRunner` 封装，失败时构造包含 stdout/stderr/code 的错误对象并 reject；
- 所有 I/O 操作（文件读写、网络请求、pip 命令）均包裹 try/catch，失败后写入结构化日志而非崩溃；
- 渲染进程通过 `Promise.allSettled`、`.catch(() => {})` 等静默降级策略保证 UI 可用性。

## 2. 关键文件与位置
- `main.js`：Electron 主进程入口，集中注册 `ipcMain.handle` 处理器，是 IPC 错误的统一出口；
- `preload.js`：安全桥接层，将主进程 API 暴露给渲染进程，承载事件监听与错误转发（如 `onUpdaterError`）；
- `core/operations/pipManager.js`：包管理核心，大量输入校验抛错（包名、版本、wheel 路径），并通过 `emitProgress` 推送进度；
- `utils/processRunner.js`：子进程运行器，统一超时、取消、错误构造（含 stdout/stderr/code）；
- `core/system/logManager.js`：结构化日志持久化，字段截断、容量控制、防抖写入；
- `renderer/js/app.js`：渲染进程启动与初始化，使用 `Promise.allSettled` 并行加载、多处 `.catch` 静默降级。

## 3. 架构与约定
- **错误类型**：未定义自定义 Error 子类，统一使用 `new Error(message)`，部分错误附加 `code`、`stdout`、`stderr` 字段（processRunner 中构造）；
- **错误传播**：主进程模块直接 throw，由 `ipcMain.handle` 的 async 函数返回 Promise，Electron 自动将 reject 转为渲染进程的 Promise rejection；
- **子进程错误**：`runCommand` 在 close 事件中根据 exit code 决定 resolve/reject，非零码时构造带详细上下文的 Error；
- **I/O 容错**：文件系统操作（read/write/JSON.parse）全部 try/catch，失败后调用 `logManager.addLog` 记录而非中断流程；
- **UI 容错**：渲染进程对异步操作普遍使用 `.catch(() => {})` 或 `Promise.allSettled`，确保单个失败不影响整体体验；
- **日志即错误追踪**：所有可恢复错误都通过 `logManager.addLog({ action, status, type, detail })` 持久化，支持按类型/关键词筛选导出。

## 4. 约定与约束
- **输入校验必须抛错**：`buildPackageSpec`、`ensurePip` 等边界函数对非法输入直接 `throw new Error(...)`，禁止静默忽略；
- **子进程错误必须携带上下文**：processRunner 中 reject 的错误需包含 `code`、`stdout`、`stderr`，便于上层诊断；
- **I/O 失败必须记录日志**：所有 fs 操作 catch 分支必须调用 `logManager.addLog`，且 detail 字段截断至 1000 字符；
- **渲染进程不得崩溃**：所有用户交互回调必须包裹 try/catch 或使用 `.catch` 降级，禁止未捕获 Promise rejection；
- **IPC 处理器无返回值即成功**：`ipcMain.handle` 未显式 return 的处理器默认视为成功，错误应通过 throw 或返回 `{ error }` 结构（当前实现以 throw 为主）；
- **日志不可自引用**：logManager 自身错误仅输出到 `console.error`，避免死循环记录。

## 5. 观察到的实践模式
- 批量操作（安装/卸载/更新）通过 `operationId` 关联多个子进程，支持统一取消；
- 进度反馈通过 `event.sender.send('pip:progress', ...)` 实时推送，错误状态也作为进度事件的一部分；
- 自动更新、主题切换、调度器等后台任务均采用「失败即忽略」策略，保证主流程不受影响；
- 配置读取失败时回退到默认值（如窗口尺寸、镜像源列表），体现防御性编程风格。