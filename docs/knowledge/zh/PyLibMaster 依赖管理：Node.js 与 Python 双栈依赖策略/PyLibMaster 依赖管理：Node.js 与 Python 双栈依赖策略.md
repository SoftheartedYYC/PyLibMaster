---
kind: dependency_management
name: PyLibMaster 依赖管理：Node.js 与 Python 双栈依赖策略
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - core/config/mirrorManager.js
    - core/operations/pipManager.js
---

## 1. 使用的系统与工具
- **Node.js 依赖管理**：使用 npm（package.json + package-lock.json），未使用 yarn/pnpm。
- **Python 依赖管理**：通过 pip 管理用户 Python 环境中的包，应用自身不声明 requirements.txt/pyproject.toml，而是以 Electron 桌面应用形式分发。
- **构建与打包**：electron-builder 负责将 Node 依赖与前端资源打包为 Windows NSIS 安装包。
- **镜像源与下载加速**：npm 层通过 `electronDownload.mirror` 指向 npmmirror；pip 层通过内置镜像管理器支持多镜像源切换与智能测速路由。

## 2. 关键文件与位置
- `package.json`：声明应用元数据、脚本、dependencies/devDependencies、electron-builder 配置、GitHub 发布源等。
- `package-lock.json`：锁定 npm 依赖树版本与完整性校验（lockfileVersion 3）。
- `core/config/mirrorManager.js`：PyPI 镜像源管理（内置/自定义镜像、测速、智能路由、写入 pip 配置文件）。
- `core/operations/pipManager.js`：pip 包操作核心（安装/卸载/更新/搜索/修复 pip、多镜像重试、自动回滚、并发控制）。
- `.github/workflows/ci.yml`：CI 流水线（若存在，可补充依赖检查/构建步骤）。

## 3. 架构与约定
- **Node 依赖分层**：运行时依赖仅保留最小集（electron-updater、glob、strip-ansi），开发依赖包含 electron 与 electron-builder。strip-ansi 被显式锁定在 ^6.0.1，因 7+ 为 ESM-only，与 CommonJS require() 不兼容，该约束记录在 `dependencyNotes` 中。
- **Electron 二进制下载镜像**：通过 `build.electronDownload.mirror` 指定 `https://npmmirror.com/mirrors/electron/`，确保国内下载可用。
- **pip 镜像源管理**：
  - 内置默认镜像源包括 PyPI 官方、清华、阿里云、腾讯云、华为云、豆瓣。
  - 支持用户添加/删除/更新自定义镜像，保证有且仅有一个默认源。
  - 提供 `testAllMirrors()` 并行测速与 `pickBestMirror()` 智能选择最快镜像。
  - 通过 `writePipConfig()` 将生效镜像写入全局 pip 配置文件（Windows: `%APPDATA%/pip/pip.ini`，macOS/Linux: `~/.config/pip/pip.conf`）。
  - 构建 pip 命令行参数时，非官方源会追加 `--index-url <mirror>`。
- **pip 操作安全与可靠性**：
  - 包名/版本正则校验，防止命令注入。
  - wheel 路径严格校验（禁止 `..`、UNC 路径、敏感目录、非法字符）。
  - 同一 Python 环境的操作通过 `envLocks` Map 互斥串行执行。
  - 安装/更新失败时支持自动回滚到备份快照。
  - 支持多镜像源重试（至少尝试 2 个镜像，最多不超过 `retryCount`）。
- **构建产物**：electron-builder 将 `main.js`、`preload.js`、`renderer/**/*`、`core/**/*`、`utils/**/*`、`node_modules/**/*` 打包进 dist 目录，生成 Windows x64 NSIS 安装包。
- **自动更新**：通过 `electron-updater` 配置 GitHub Releases 作为更新源（`publish.provider: github`）。

## 4. 约定与约束
- **npm 依赖版本策略**：所有依赖使用 `^` 语义化版本范围，但 strip-ansi 被显式锁定在 `^6.0.1`，因兼容性原因禁止升级至 ESM-only 的 v7+。
- **Electron 二进制镜像强制**：构建时 Electron 二进制必须从配置的 npmmirror 镜像下载，避免直接访问 GitHub 失败。
- **pip 镜像源唯一默认源约束**：系统保证镜像列表中始终有且仅有一个 `isDefault: true` 的镜像，多余默认源会被清理。
- **pip 配置文件写入路径平台差异**：Windows 写入 `%APPDATA%/pip/pip.ini`，类 Unix 写入 `~/.config/pip/pip.conf`，超时设为 60 秒。
- **包名/版本安全白名单**：仅允许 `[a-zA-Z0-9][a-zA-Z0-9._-]*` 格式的包名，版本号限制长度 ≤100 且符合 `^[a-zA-Z0-9._*!=<>,~+-]+$`。
- **wheel 路径安全策略**：必须为绝对路径，禁止 `..`、UNC、敏感系统目录，文件名必须符合 `{name}-{version}-{python}-{abi}-{platform}.whl` 规范。
- **并发与锁**：同一 Python 环境的 pip 操作通过 Promise 锁串行执行，避免并发冲突；批量操作支持有限并发（默认 4 线程）。
- **缓存策略**：已安装包列表缓存 5 分钟，site-packages 路径缓存 30 秒，减少重复 I/O。
- **CI/CD 集成**：`package.json.scripts` 提供 `start`、`test`、`build`、`build:win`、`dist` 标准脚本，便于本地与 CI 统一调用。

## 5. 总结
该项目采用“Node.js 应用 + Python 包管理”的双栈依赖管理模式：Node 侧用 npm + lockfile 锁定 Electron 生态依赖并通过 electron-builder 打包；Python 侧通过自研 mirrorManager 与 pipManager 实现镜像源管理、智能路由、安全校验、并发控制与自动回滚，形成完整的桌面级 Python 库管理解决方案。