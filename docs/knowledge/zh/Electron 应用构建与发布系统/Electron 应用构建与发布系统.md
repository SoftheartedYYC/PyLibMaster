---
kind: build_system
name: Electron 应用构建与发布系统
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - .github/workflows/ci.yml
    - build/license.txt
---

该仓库使用 Electron + electron-builder 作为桌面应用的构建与打包系统，通过 npm scripts 统一入口，GitHub Actions 执行 CI/CD 流水线。

**构建工具链与脚本**
- 开发运行：`npm start` 调用 `electron .` 直接启动主进程 main.js
- 测试执行：`npm test` 基于 Node.js 内置 --test 运行器，通过 tests/bootstrap.js 注入 mock 环境
- 打包构建：`npm run build` / `npm run build:win` / `npm run dist` 均委托 electron-builder
- 依赖管理：electron 31.7.7、electron-builder ^25.0.0 为固定版本，electron-updater ^6.8.9 提供自动更新能力

**electron-builder 配置（package.json 内 build 字段）**
- 应用标识：appId 为 com.softheartedyyc.pylibmaster，productName 为 PyLibMaster
- 输出目录：dist
- 打包文件：main.js、preload.js、renderer/**/*、core/**/*、utils/**/*、node_modules/**/*
- Windows 目标：仅 x64 架构的 NSIS 安装包，启用签名验证（signAndEditExecutable）
- NSIS 安装器：非一键安装、允许自定义安装路径、创建桌面与开始菜单快捷方式
- 镜像源：electron 下载走 npmmirror.com/mirrors/electron/
- 发布配置：provider 为 github，owner 为 SoftheartedYYC，repo 为 PyLibMaster

**CI/CD 流水线（.github/workflows/ci.yml）**
- 触发条件：push 到 main/master 分支或 PR 到这些分支
- 测试任务：在 windows-latest 上安装 Node 20 并执行 npm ci + npm test
- 构建任务：依赖 test 成功，同样在 windows-latest 上执行 npm ci + npm run build，将 dist/*.exe 上传为 GitHub Actions 工件

**许可证资源**
- build/license.txt 包含中英文双语的非商业免费许可证文本，被 NSIS 安装器引用

**版本策略**
- 版本号集中在 package.json 的 version 字段（当前 1.5.23），由 electron-builder 在打包时读取并写入安装包元数据

**约束与约定**
- 仅支持 Windows x64 平台打包（target.arch 限定为 x64）
- 依赖 strip-ansi 锁定在 ^6.0.1，因 7+ 版本为 ESM-only，与 CommonJS require() 不兼容（见 dependencyNotes）
- electron@31.7.7 需在 allowScripts 中显式授权执行安装脚本