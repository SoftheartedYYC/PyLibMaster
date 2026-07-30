# PyLibMaster

> 一款基于 Electron 的 Python 库管理桌面工具，让你以图形化界面轻松管理 Python 第三方库。

[![Version](https://img.shields.io/badge/version-1.5.14-blue)]()
[![License](https://img.shields.io/badge/license-非商业免费-orange)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)]()

## ✨ 功能特性

### 核心操作
- **安装库** — 搜索并安装 Python 库，支持指定版本 / 版本范围，支持拖拽 `requirements.txt` 和 `.whl` 文件批量安装
- **卸载库** — 安全卸载，支持批量操作与卸载前备份
- **更新库** — 一键检查并更新过期的库，支持全部更新
- **查询库** — 按名称、状态、安装时间、大小等多条件筛选已安装的库

### 环境与镜像
- **多环境支持** — 自动检测系统中所有 Python 环境（含 Anaconda / Miniconda），一键切换
- **镜像源管理** — 内置清华、阿里云、腾讯云等国内镜像，支持自定义镜像、测速与智能路由

### 安全与可靠
- **备份与回滚** — 操作前自动备份，失败自动回滚
- **操作日志** — 完整记录每次安装 / 卸载 / 更新操作
- **自动更新** — 内置应用更新机制，通过 GitHub Releases 分发新版本

### 界面
- 中英双语支持
- 浅色 / 深色主题
- 无边框现代化 UI

## 📥 下载安装

前往 [Releases](https://github.com/SoftheartedYYC/PyLibMaster/releases) 下载最新的 `PyLibMaster Setup x.x.x.exe` 安装包，双击运行即可。

> ⚠️ 应用未做代码签名，Windows SmartScreen 可能提示"未知发布者"，点击"仍要运行"即可。

## 🛠️ 从源码构建

```bash
# 安装依赖
npm install

# 启动开发模式
npm start

# 打包 Windows 安装包（输出到 dist/）
npm run dist

# 运行测试
npm test
```

## 📁 项目结构

```
PyLibMaster/
├── main.js              # Electron 主进程入口
├── preload.js           # 安全桥接层 (contextBridge)
├── core/                # 核心业务逻辑
│   ├── pipManager.js    # 安装 / 卸载 / 更新 / 搜索
│   ├── envManager.js    # Python 环境检测与切换
│   ├── mirrorManager.js # 镜像源管理与智能路由
│   ├── backupManager.js # 备份与回滚
│   ├── configManager.js # 配置持久化
│   ├── logManager.js    # 操作日志
│   └── updater.js       # 应用自动更新
├── utils/               # 工具层
│   ├── processRunner.js # 子进程管理
│   └── security.js      # 路径安全校验
└── renderer/            # 前端界面 (原生 HTML/CSS/JS)
```

## 🔧 技术栈

- [Electron](https://www.electronjs.org/) v31 — 跨平台桌面应用框架
- [electron-builder](https://www.electron.build/) v25 — 打包构建
- [electron-updater](https://www.electron.build/auto-update) — 自动更新
- 原生 HTML / CSS / JavaScript 前端

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目采用 **非商业免费许可证**：

- ✅ 个人学习、研究等非商业目的：**完全免费**，可自由使用、修改、分发
- ❌ **禁止任何商业用途**（销售、出租、商业运营、集成到商业产品等）
- 商业使用需获得作者书面授权，请联系：1247449619@qq.com

详见 [LICENSE](LICENSE)。
