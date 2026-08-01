<div align="center">

<img src="renderer/assets/logo.png" alt="PyLibMaster" width="120" />

# PyLibMaster

**一站式 Python 库管理桌面工具**

*图形化界面 · 多环境支持 · 智能镜像 · 安全审计*

[![Version](https://img.shields.io/badge/version-1.5.23-blue?style=flat-square)](https://github.com/SoftheartedYYC/PyLibMaster/releases)
[![License](https://img.shields.io/badge/license-非商业免费-orange?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey?style=flat-square)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square)]()
[![Electron](https://img.shields.io/badge/electron-v31-47848F?style=flat-square&logo=electron)]()

[下载最新版](https://github.com/SoftheartedYYC/PyLibMaster/releases) · [查看文档](docs/zh/content/项目概述.md) · [更新日志](docs/CHANGELOG.md)

</div>

---

## ✨ 功能特性

<table>
<tr>
<td width="50%" valign="top">

### 📦 包管理

| 功能 | 说明 |
|:-----|:-----|
| **安装** | 搜索安装、版本指定、拖拽 `requirements.txt` / `.whl` 批量安装 |
| **卸载** | 安全卸载、批量操作、卸载前备份、失败自动回滚 |
| **更新** | 一键检查更新、全部更新、定时自动更新 |
| **查询** | 按名称/状态/安装时间/大小多条件筛选 |
| **撤销** | 一键撤销最近一次安装/卸载/更新操作 |

</td>
<td width="50%" valign="top">

### 🌐 环境与镜像

| 功能 | 说明 |
|:-----|:-----|
| **多环境** | 自动检测所有 Python 环境（含 Anaconda / Miniconda / Windows Store） |
| **虚拟环境** | 创建/管理 venv，支持从模板一键创建 |
| **镜像源** | 内置清华/阿里云/腾讯云/华为云/豆瓣，支持自定义、拖拽排序、测速智能路由 |

</td>
</tr>
</table>

### 🧰 工具箱

| 工具 | 功能描述 |
|:-----|:---------|
| 🔗 **依赖图谱** | 可视化展示包依赖关系 — 单包依赖树 / 全局依赖网络 |
| 🩺 **环境诊断** | 依赖冲突检测 + 全面健康检查，输出健康评分 |
| 🛡️ **安全审计** | 基于 pip-audit 和 PyPI Advisory Database 扫描已知 CVE 漏洞 |
| 📊 **空间分析** | 可视化展示各包磁盘占用情况 |
| ⚖️ **环境对比** | 对比两个环境或 requirements 文件的包差异 |
| 📥 **离线下载** | 批量下载包到本地，支持指定平台与 Python 版本 |

### 🔒 安全可靠

- **备份与回滚** — 操作前自动备份，失败自动回滚
- **环境快照** — 记录完整环境状态，支持随时回滚（时间旅行）
- **操作日志** — 完整记录每次操作，支持导出
- **输入安全校验** — 包名/版本/路径注入防护、ReDoS 防护、原型污染防护
- **自动更新** — 内置更新机制，通过 GitHub Releases 分发新版本

### 🖥️ 系统集成与界面

- **资源管理器右键菜单** — 文件夹右键快捷操作
- **系统托盘** — 关闭窗口时最小化到托盘
- **桌面通知** — 操作完成后系统通知提醒
- **中英双语** — 完整国际化支持
- **主题切换** — 浅色 / 深色 / 跟随系统
- **无边框 UI** — 现代化设计风格

---

## 🚀 快速开始

### 下载安装

前往 [Releases](https://github.com/SoftheartedYYC/PyLibMaster/releases) 下载最新的安装包：

```
PyLibMaster Setup 1.5.23.exe
```

双击运行即可，无需额外配置。

> ⚠️ 应用未做代码签名，Windows SmartScreen 可能提示 **"未知发布者"**，点击 **"仍要运行"** 即可。

### 从源码构建

**环境要求：** Node.js >= 18 + npm

```bash
# 克隆仓库
git clone https://github.com/SoftheartedYYC/PyLibMaster.git
cd PyLibMaster

# 安装依赖
npm install

# 启动开发模式
npm start

# 打包安装包（输出到 dist/）
npm run dist

# 运行测试
npm test
```

---

## 📂 项目结构

```
PyLibMaster/
│
├── main.js                         # Electron 主进程入口
├── preload.js                      # 安全桥接层 (contextBridge)
├── package.json                    # 项目配置与依赖
│
├── core/                           # 核心业务逻辑
│   ├── operations/                 #   核心操作
│   │   ├── pipManager.js           #   包管理（安装/卸载/更新/搜索/图谱）
│   │   ├── venvManager.js          #   虚拟环境管理
│   │   ├── backupManager.js        #   备份与回滚
│   │   ├── templateManager.js      #   项目模板与环境快照
│   │   ├── undoManager.js          #   操作撤销
│   │   └── auditManager.js         #   安全漏洞扫描
│   ├── config/                     #   配置管理
│   │   ├── configManager.js        #   应用配置持久化
│   │   ├── mirrorManager.js        #   镜像源管理与智能路由
│   │   └── schedulerManager.js     #   定时自动更新调度
│   └── system/                     #   系统服务
│       ├── envManager.js           #   Python 环境检测与切换
│       ├── logManager.js           #   操作日志
│       ├── explorerManager.js      #   Windows 资源管理器集成
│       └── updater.js              #   应用自动更新
│
├── utils/                          # 工具层
│   ├── processRunner.js            #   子进程管理（超时/取消/ANSI 清理）
│   └── security.js                 #   路径安全校验
│
├── renderer/                       # 前端界面（原生 HTML/CSS/JS）
│   ├── index.html                  #   主页面
│   ├── styles.css                  #   样式（CSS 变量主题系统）
│   ├── assets/                     #   静态资源
│   └── js/                         #   8 个功能模块
│
└── .github/workflows/ci.yml        # GitHub Actions CI/CD
```

---

## 📖 文档

项目提供完整的 **中英双语** 文档：

| 语言 | 路径 | 说明 |
|:----:|:-----|:-----|
| 🇨🇳 中文 | [docs/zh/content/](docs/zh/content/) | 完整中文文档 |
| 🇬🇧 English | [docs/en/content/](docs/en/content/) | Complete English docs |
| 📋 更新日志 | [docs/CHANGELOG.md](docs/CHANGELOG.md) | 版本变更记录 |

**文档涵盖：** 快速开始 · 项目概述 · 核心模块 · 架构设计 · API 参考 · 业务功能 · 用户界面 · 故障排除 · 开发指南

---

## 🔧 技术栈

| 类别 | 技术 |
|:-----|:-----|
| 桌面框架 | [Electron](https://www.electronjs.org/) v31 |
| 打包构建 | [electron-builder](https://www.electron.build/) v25 |
| 自动更新 | [electron-updater](https://www.electron.build/auto-update) |
| 前端 | 原生 HTML / CSS / JavaScript（零框架依赖） |
| 测试 | Node.js 内置 test runner |
| CI/CD | GitHub Actions |

---

## 🤝 贡献

欢迎提交 [Issue](https://github.com/SoftheartedYYC/PyLibMaster/issues) 和 [Pull Request](https://github.com/SoftheartedYYC/PyLibMaster/pulls)！

---

## 📄 许可证

本项目采用 **非商业免费许可证**：

| 用途 | 权限 |
|:-----|:-----|
| ✅ 个人学习、研究 | 完全免费，可自由使用、修改、分发 |
| ❌ 商业用途 | 禁止（销售、出租、商业运营、集成到商业产品等） |

商业使用需获得作者书面授权，请联系：softheartedyyc@gmail.com

详见 [LICENSE](LICENSE)。

---

<div align="center">

**PyLibMaster** — 让 Python 库管理更简单

Made with ❤️ by [SoftheartedYYC](https://github.com/SoftheartedYYC)

</div>
