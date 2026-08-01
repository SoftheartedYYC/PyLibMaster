# PyLibMaster

> 一款基于 Electron 的 Python 库管理桌面工具，以图形化界面轻松管理 Python 第三方库。

[![Version](https://img.shields.io/badge/version-1.5.23-blue)]()
[![License](https://img.shields.io/badge/license-非商业免费-orange)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)]()

## ✨ 功能特性

### 核心操作
- **安装库** — 搜索并安装 Python 库，支持指定版本 / 版本范围，支持拖拽 `requirements.txt` 和 `.whl` 文件批量安装
- **卸载库** — 安全卸载，支持批量操作、卸载前备份与失败自动回滚
- **更新库** — 一键检查并更新过期的库，支持全部更新与定时自动更新
- **查询库** — 按名称、状态、安装时间、大小等多条件筛选已安装的库
- **操作撤销** — 支持撤销最近一次安装 / 卸载 / 更新操作

### 环境与镜像
- **多环境支持** — 自动检测系统中所有 Python 环境（含 Anaconda / Miniconda / Windows Store），一键切换
- **虚拟环境管理** — 创建、管理 Python venv 虚拟环境，支持从模板一键创建
- **镜像源管理** — 内置清华、阿里云、腾讯云、华为云、豆瓣等国内镜像，支持自定义镜像、拖拽排序、测速与智能路由

### 工具箱
- **依赖图谱** — 可视化展示包依赖关系（单包依赖树 / 全局依赖网络）
- **环境诊断** — 依赖冲突检测 + 全面健康检查（元数据验证、目录可访问性），输出健康评分
- **安全审计** — 基于 pip-audit 和 PyPI Advisory Database 扫描已安装包的已知 CVE 漏洞
- **空间分析** — 可视化展示各包磁盘占用情况
- **环境对比** — 对比两个环境或 requirements 文件的包差异
- **离线下载** — 批量下载包到本地目录，支持指定平台与 Python 版本

### 安全与可靠
- **备份与回滚** — 操作前自动备份，失败自动回滚
- **环境快照** — 记录当前环境的完整状态，支持随时回滚（时间旅行）
- **操作日志** — 完整记录每次操作，支持导出
- **输入安全校验** — 包名/版本/路径注入防护、ReDoS 防护、原型污染防护
- **自动更新** — 内置应用更新机制，通过 GitHub Releases 分发新版本

### 系统集成
- **资源管理器右键菜单** — 在文件夹右键菜单中添加 PyLibMaster 快捷操作
- **系统托盘** — 关闭窗口时最小化到系统托盘
- **桌面通知** — 操作完成后发送系统通知

### 界面
- 中英双语支持
- 浅色 / 深色 / 跟随系统主题
- 无边框现代化 UI

##  下载安装

前往 [Releases](https://github.com/SoftheartedYYC/PyLibMaster/releases) 下载最新的 `PyLibMaster Setup x.x.x.exe` 安装包，双击运行即可。

> ⚠️ 应用未做代码签名，Windows SmartScreen 可能提示"未知发布者"，点击"仍要运行"即可。

## 🛠️ 从源码构建

### 环境要求
- Node.js >= 18
- npm

### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/SoftheartedYYC/PyLibMaster.git
cd PyLibMaster

# 安装依赖
npm install

# 启动开发模式
npm start

# 打包 Windows 安装包（输出到 dist/）
npm run dist

# 运行测试
npm test
```

##  项目结构

```
PyLibMaster/
├── main.js                  # Electron 主进程入口
├── preload.js               # 安全桥接层 (contextBridge)
├── package.json             # 项目配置与依赖
│
├── core/                    # 核心业务逻辑（三类划分）
│   ├── operations/          # 核心操作
│   │   ├── pipManager.js    # 包安装/卸载/更新/搜索/依赖图谱
│   │   ├── venvManager.js   # 虚拟环境管理
│   │   ├── backupManager.js # 备份与回滚
│   │   ├── templateManager.js # 项目模板与环境快照
│   │   ├── undoManager.js   # 操作撤销
│   │   └── auditManager.js  # 安全漏洞扫描
│   ├── config/              # 配置管理
│   │   ├── configManager.js # 应用配置持久化
│   │   ├── mirrorManager.js # 镜像源管理与智能路由
│   │   └── schedulerManager.js # 定时自动更新调度
│   └── system/              # 系统
│       ├── envManager.js    # Python 环境检测与切换
│       ├── logManager.js    # 操作日志
│       ├── explorerManager.js # Windows 资源管理器集成
│       └── updater.js       # 应用自动更新
│
├── utils/                   # 工具层
│   ├── processRunner.js     # 子进程管理（超时/取消/ANSI清理）
│   └── security.js          # 路径安全校验
│
├── renderer/                # 前端界面（原生 HTML/CSS/JS）
│   ├── index.html           # 主页面
│   ├── styles.css           # 样式（CSS 变量主题系统）
│   ├── assets/              # 静态资源（图标、Logo）
│   └── js/
│       ├── app.js           # 应用初始化与导航
│       ├── core.js          # 核心工具函数
│       ├── i18n.js          # 国际化（中英双语）
│       ├── operations.js    # 安装/卸载/更新操作
│       ├── pages.js         # 页面渲染与交互
│       ├── progress.js      # 进度条与状态管理
│       ├── render.js        # 表格/列表渲染
│       └── tools.js         # 工具箱功能（图谱/诊断/对比等）
│
├── tests/                   # 测试
│   ├── core.test.js         # 核心单元测试
│   ├── bootstrap.js         # 测试引导（Electron mock）
│   ├── mocks/               # Mock 文件
│   └── stress/              # 压力测试
│       ├── full-stress-test-v5.js  # 回归测试
│       └── full-stress-test-v6.js  # 当前版本测试（238项）
│
├── docs/                    # 文档
│   ├── zh/                  # 中文文档
│   │   ├── content/         # 文档内容
│   │   │   ├── API 参考/    # API 接口文档
│   │   │   ├── 业务功能/    # 备份、安全审计、模板、调度器、镜像源
│   │   │   ├── 故障排除/    # 常见问题、日志分析、调试工具、错误代码
│   │   │   ├── 架构设计/    # 模块化架构、IPC 通信、安全架构、数据流
│   │   │   ├── 核心模块/    # pipManager、envManager、configManager 等
│   │   │   └── 用户界面/    # 界面架构、JS 模块、主题、国际化
│   │   ├── 快速开始.md
│   │   ├── 项目概述.md
│   │   └── 开发指南.md
│   ├── en/                  # English documentation
│   │   └── content/         # (mirrors zh/ structure)
│   └── CHANGELOG.md         # 更新日志
│
├── .github/workflows/       # CI/CD
│   └── ci.yml               # GitHub Actions 流水线
├── .gitignore
├── LICENSE                  # 非商业免费许可证
└── release.js               # 本地一键发布脚本
```

## 📖 文档

项目提供完整的 **中文** 和 **英文** 文档，涵盖架构设计、核心模块、API 参考、故障排除等内容。

| 语言 | 路径 | 说明 |
|------|------|------|
| 中文 | [docs/zh/content/](docs/zh/content/) | 完整中文文档 |
| English | [docs/en/content/](docs/en/content/) | Complete English documentation |
| 更新日志 | [docs/CHANGELOG.md](docs/CHANGELOG.md) | 版本变更记录 |

### 文档目录

- **快速开始** — 安装、构建与基本使用
- **项目概述** — 项目定位与整体介绍
- **核心模块** — pipManager、envManager、configManager、processRunner 详解
- **架构设计** — 模块化架构、IPC 通信机制、安全架构、数据流设计
- **API 参考** — 所有 IPC 接口与核心模块 API 的完整参考
- **业务功能** — 备份恢复、安全审计、模板管理、调度器、镜像源管理
- **用户界面** — 界面架构、JavaScript 模块、主题定制、国际化支持
- **故障排除** — 常见问题、日志分析、调试工具、错误代码参考、性能优化
- **开发指南** — 开发者贡献指南与代码规范

## 🔧 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | [Electron](https://www.electronjs.org/) v31 |
| 打包构建 | [electron-builder](https://www.electron.build/) v25 |
| 自动更新 | [electron-updater](https://www.electron.build/auto-update) |
| 前端 | 原生 HTML / CSS / JavaScript（无框架依赖） |
| 测试 | Node.js 内置 test runner |
| CI/CD | GitHub Actions |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目采用 **非商业免费许可证**：

- ✅ 个人学习、研究等非商业目的：**完全免费**，可自由使用、修改、分发
-  **禁止任何商业用途**（销售、出租、商业运营、集成到商业产品等）
- 商业使用需获得作者书面授权，请联系：softheartedyyc@gmail.com

详见 [LICENSE](LICENSE)。
