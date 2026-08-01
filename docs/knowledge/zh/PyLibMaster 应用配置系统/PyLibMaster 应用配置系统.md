---
kind: configuration_system
name: PyLibMaster 应用配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - core/config/configManager.js
    - core/config/mirrorManager.js
    - core/config/schedulerManager.js
    - main.js
    - preload.js
---

## 配置系统概述

PyLibMaster 采用基于 Electron userData 目录的 JSON 文件持久化配置方案，通过独立的 configManager 模块统一管理配置的加载、校验、保存与合并策略。

## 核心架构

### 配置存储位置
- Windows: `%APPDATA%/PyLibMaster/pylibmaster-config.json`
- macOS: `~/Library/Application Support/PyLibMaster/pylibmaster-config.json`
- Linux: `~/.config/PyLibMaster/pylibmaster-config.json`

### 配置管理器 (configManager.js)
- **默认值合并**: 启动时从配置文件读取并合并默认配置，确保新增配置项向后兼容
- **数值范围校验**: 对 parallelThreads (1-16)、retryCount (0-10) 等数值型配置进行边界检查和自动修正
- **原子写入**: 使用 `.tmp` 临时文件 + `fs.renameSync` 实现原子写入，防止进程崩溃导致配置文件损坏
- **深拷贝保护**: `getConfig()` 返回配置的深拷贝，防止外部修改内部状态
- **路径管理**: 提供 `getStoragePath()` 自动创建日志和备份存储目录

### 镜像源配置 (mirrorManager.js)
- **内置+自定义镜像源**: 合并 PyPI 官方、清华、阿里云等内置源与用户自定义源
- **智能路由**: 支持按响应速度自动选择最快镜像源（5秒超时测试）
- **pip 配置同步**: 将当前镜像源写入 pip 配置文件 (`%APPDATA%/pip/pip.ini` 或 `~/.config/pip/pip.conf`)
- **URL 验证**: 强制 http/https 协议，长度限制 2048 字符

### 定时调度配置 (schedulerManager.js)
- **调度策略**: 支持 daily/weekly 两种频率，间隔分别为 24 小时和 7 天
- **白名单机制**: 跳过指定包名的自动更新
- **状态持久化**: 记录上次执行时间、运行状态等元数据

## IPC 通信层

### 主进程处理器 (main.js)
暴露三个配置相关 IPC 接口:
- `config:get`: 获取完整配置对象
- `config:set`: 设置单个配置项
- `config:setBulk`: 批量设置多个配置项

### 预加载桥接 (preload.js)
通过 `contextBridge.exposeInMainWorld` 安全暴露 API:
- `window.electronAPI.getConfig()`
- `window.electronAPI.setConfig(key, value)`
- `window.electronAPI.setConfigBulk(updates)`

## 配置项结构

```json
{
  "theme": "light",
  "language": "zh",
  "storagePath": "安装目录/log",
  "parallelThreads": 4,
  "retryCount": 3,
  "smartRoute": false,
  "currentEnv": null,
  "windowBounds": {"width": 1200, "height": 760},
  "mirrors": [...],
  "schedulerEnabled": false,
  "schedulerFrequency": "daily",
  "schedulerWhitelist": [],
  "schedulerLastRun": null
}
```

## 设计约束

- **单例模式**: 配置对象在内存中缓存，避免重复文件 I/O
- **错误恢复**: 配置文件损坏时自动重建默认配置
- **安全隔离**: 渲染进程通过 preload.js 访问配置，禁止直接 Node.js 访问
- **线程安全**: 配置读写在主进程完成，渲染进程仅通过 IPC 调用
- **向后兼容**: 新增配置项不影响已有配置文件解析