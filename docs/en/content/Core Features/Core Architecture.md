# Core Architecture

<cite>
**Referenced Files in This Document**
- [main.js](file://main.js)
- [preload.js](file://preload.js)
- [package.json](file://package.json)
- [index.html](file://renderer/index.html)
- [app.js](file://renderer/js/app.js)
- [core.js](file://renderer/js/core.js)
- [pipManager.js](file://core/operations/pipManager.js)
- [processRunner.js](file://utils/processRunner.js)
- [security.js](file://utils/security.js)
- [envManager.js](file://core/system/envManager.js)
- [configManager.js](file://core/config/configManager.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document describes PyLibMaster’s Electron-based architecture with a focus on the separation between main and renderer processes, IPC communication patterns, security isolation via contextBridge, module organization, event-driven interactions, preload bridge implementation, window lifecycle management, system integration, and cross-cutting concerns such as logging, error handling, and resource management. It includes diagrams that map to actual source files and explain data flow, message passing protocols, and state synchronization mechanisms.

## Project Structure
PyLibMaster follows a clear separation of responsibilities:
- Main process (Node.js): application entry, window lifecycle, IPC handlers, system integrations, and orchestration of core modules.
- Preload script: secure bridge exposing a curated API surface to the renderer via contextBridge.
- Renderer (HTML + JS): UI pages, user interactions, and IPC calls through the exposed API.
- Core modules: business logic for pip operations, environment management, configuration, mirrors, backups, templates, audit, undo, and more.
- Utilities: process runner for child processes and security helpers.

```mermaid
graph TB
subgraph "Main Process"
M["main.js"]
Cfg["configManager.js"]
Env["envManager.js"]
Pip["pipManager.js"]
PR["processRunner.js"]
Sec["security.js"]
end
subgraph "Preload Bridge"
PL["preload.js"]
end
subgraph "Renderer"
HTML["index.html"]
App["app.js"]
CoreJS["core.js"]
end
M --> Cfg
M --> Env
M --> Pip
Pip --> PR
M --> Sec
M --> PL
PL --> App
App --> CoreJS
HTML --> App
```

**Diagram sources**
- [main.js](file://main.js)
- [preload.js](file://preload.js)
- [index.html](file://renderer/index.html)
- [app.js](file://renderer/js/app.js)
- [core.js](file://renderer/js/core.js)
- [configManager.js](file://core/config/configManager.js)
- [envManager.js](file://core/system/envManager.js)
- [pipManager.js](file://core/operations/pipManager.js)
- [processRunner.js](file://utils/processRunner.js)
- [security.js](file://utils/security.js)

**Section sources**
- [package.json:1-79](file://package.json#L1-L79)

## Core Components
- Main process (main.js): Creates BrowserWindow with strict security settings (contextIsolation true, nodeIntegration false), registers all IPC handlers, manages tray, theme sync, auto-update checks, scheduler events, and coordinates core modules.
- Preload bridge (preload.js): Exposes a typed API surface via contextBridge to the renderer; uses ipcRenderer.invoke for request/response and ipcRenderer.on for streaming events.
- Renderer (index.html, app.js, core.js): Renders UI, binds events, initializes data asynchronously in phases, subscribes to progress and updater events, and calls window.electronAPI methods.
- Core modules:
  - pipManager.js: Orchestrates package queries, install/uninstall/update, caching, rollback, cancellation, and dependency analysis.
  - envManager.js: Detects Python environments, switches current environment, persists selection.
  - configManager.js: Persistent JSON configuration with validation and atomic writes.
- Utilities:
  - processRunner.js: Child process execution, timeout/cancellation, ensurePip fallback, ANSI stripping, active process tracking.
  - security.js: Path allowlist validation to prevent path traversal attacks.

**Section sources**
- [main.js:1-640](file://main.js#L1-L640)
- [preload.js:1-221](file://preload.js#L1-L221)
- [index.html:1-800](file://renderer/index.html#L1-L800)
- [app.js:1-200](file://renderer/js/app.js#L1-L200)
- [core.js:1-93](file://renderer/js/core.js#L1-L93)
- [pipManager.js:1-200](file://core/operations/pipManager.js#L1-L200)
- [envManager.js:1-200](file://core/system/envManager.js#L1-L200)
- [configManager.js:1-194](file://core/config/configManager.js#L1-L194)
- [processRunner.js:1-366](file://utils/processRunner.js#L1-L366)
- [security.js:1-43](file://utils/security.js#L1-L43)

## Architecture Overview
The application enforces strict security by isolating the renderer from Node APIs and routing all privileged operations through the preload bridge and main process IPC handlers. The main process owns system resources and orchestrates long-running tasks while the renderer focuses on UI and user interactions.

```mermaid
sequenceDiagram
participant R as "Renderer (app.js)"
participant P as "Preload (preload.js)"
participant M as "Main (main.js)"
participant PM as "pipManager.js"
participant PR as "processRunner.js"
R->>P : window.electronAPI.installPackages(packages, options)
P->>M : ipcRenderer.invoke('pip : install', packages, options)
M->>PM : pipManager.installPackages(packages, options, onProgress)
PM->>PR : runPip(..., { operationId, onOutput })
PR-->>PM : stdout/stderr streams (onOutput)
PM-->>M : emitProgress(data,type)
M-->>R : webContents.send('pip : progress', payload)
R-->>R : updateProgressFromOutput(payload)
```

**Diagram sources**
- [app.js:1-200](file://renderer/js/app.js#L1-L200)
- [preload.js:1-221](file://preload.js#L1-L221)
- [main.js:1-640](file://main.js#L1-L640)
- [pipManager.js:1-200](file://core/operations/pipManager.js#L1-L200)
- [processRunner.js:1-366](file://utils/processRunner.js#L1-L366)

## Detailed Component Analysis

### Main Process Lifecycle and Window Management
- Window creation with security best practices: contextIsolation enabled, nodeIntegration disabled, preload script loaded.
- Window bounds persistence with debounced save; minimize-to-tray behavior; external link interception.
- Application lifecycle hooks: whenReady, activate, window-all-closed, before-quit; graceful shutdown cancels active processes and flushes logs.
- Tray menu and theme synchronization with nativeTheme updates.

```mermaid
flowchart TD
Start([App Ready]) --> CreateWindow["Create BrowserWindow<br/>with preload and security flags"]
CreateWindow --> LoadHTML["Load renderer/index.html"]
LoadHTML --> ShowOnReady["Show on 'ready-to-show'"]
ShowOnReady --> BindEvents["Bind resize/move/close events"]
BindEvents --> Tray["Create System Tray"]
Tray --> UpdaterInit["Initialize updater"]
UpdaterInit --> EnvDetect["Start Python env detection"]
EnvDetect --> ThemeSync["Setup theme sync"]
ThemeSync --> AutoCheck["Auto-check updates after delay"]
AutoCheck --> Scheduler["Start scheduler with callbacks"]
Scheduler --> Idle([Idle Loop])
```

**Diagram sources**
- [main.js:1-640](file://main.js#L1-L640)

**Section sources**
- [main.js:1-640](file://main.js#L1-L640)

### IPC Communication Patterns and Security Isolation
- Request/Response: All renderer calls use ipcRenderer.invoke through a curated API surface in preload.js.
- Streaming Events: Long-running operations push progress via webContents.send('pip:progress') and other domain-specific events.
- Security: contextBridge exposes only necessary methods; renderer cannot access Node APIs directly; path opening is restricted via allowlist.

```mermaid
classDiagram
class PreloadAPI {
+windowMinimize()
+windowMaximize()
+windowClose()
+detectEnvironments()
+getCurrentEnv()
+switchEnvironment(envPath)
+createVenv(options)
+listVenvs()
+deleteVenv(name)
+getVenvInfo(name)
+listInstalled()
+listInstalledCached()
+listOutdated()
+searchPackage(keyword)
+showPackageInfo(pkgName)
+getDependencyTree(pkgName)
+exportRequirements(options)
+importRequirements(filePath, options)
+compareEnvironments(envA, envB)
+installPackages(packages, options)
+installFromFile(filePath, options)
+uninstallPackages(packages, options)
+updatePackages(packages, options)
+cancelPipOperation(operationId)
+repairPip(options)
+createBackup()
+listBackups()
+restoreBackup(backupId)
+deleteBackup(backupId)
+getMirrors()
+testMirrorSpeed(url)
+testAllMirrors()
+setDefaultMirror(url)
+addCustomMirror(name, url, remark)
+updateMirror(url, updates)
+removeCustomMirror(url)
+restoreDefaultMirrors()
+setSmartRoute(enabled)
+getSmartRoute()
+writePipMirrorConfig()
+reorderMirrors(urlOrder)
+getLogs(filter)
+clearLogs()
+addLog(entry)
+getConfig()
+setConfig(key, value)
+setConfigBulk(updates)
+getAppVersion()
+browseDirectory()
+browseFile(filters)
+openPath(filePath)
+sendNotification(title, body)
+exportLogs(format)
+getSystemTheme()
+onThemeChanged(callback)
+onUpdatesAvailable(callback)
+getSchedulerStatus()
+saveSchedulerConfig(config)
+runSchedulerNow()
+onSchedulerExecuted(callback)
+getTemplates()
+addCustomTemplate(tpl)
+removeCustomTemplate(id)
+createFromTemplate(options)
+createSnapshot(envPath, label)
+listSnapshots()
+getSnapshotDetail(id)
+restoreSnapshot(snapshotId, envPath)
+deleteSnapshot(id)
+runAudit()
+getCachedAudit()
+getDiskUsage()
+downloadPackages(packages, destDir, options)
+diffRequirements(sourceA, sourceB)
+getPackageReleases(pkgName)
+getDependencyGraph()
+checkConflicts()
+healthCheck()
+canUndo()
+performUndo()
+clearUndo()
+getExplorerStatus()
+enableExplorerMenu()
+disableExplorerMenu()
+onProgress(callback)
+removeProgressListener(callback)
+checkForUpdates()
+installUpdate()
+onUpdaterChecking(callback)
+onUpdaterAvailable(callback)
+onUpdaterNotAvailable(callback)
+onUpdaterProgress(callback)
+onUpdaterDownloaded(callback)
+onUpdaterError(callback)
}
```

**Diagram sources**
- [preload.js:1-221](file://preload.js#L1-L221)

**Section sources**
- [preload.js:1-221](file://preload.js#L1-L221)
- [main.js:1-640](file://main.js#L1-L640)
- [security.js:1-43](file://utils/security.js#L1-L43)

### Renderer Event-Driven Architecture
- Initialization phases: load config, apply language, render status bar, then parallelize environment/mirror/cache loading; background refresh full installed list; lazy load outdated list; low-priority logs and version info.
- Global state shared across renderer modules via core.js; UI bindings in app.js subscribe to progress and updater events.
- Keyboard shortcuts and page navigation are handled centrally.

```mermaid
sequenceDiagram
participant DOM as "DOM (index.html)"
participant App as "app.js"
participant Core as "core.js"
participant API as "window.electronAPI"
DOM->>App : Sidebar click / button clicks
App->>Core : Update global state / UI helpers
App->>API : invoke('pip : list', ...) or send('pip : progress' listener)
API-->>App : Progress events / results
App-->>DOM : Render tables / progress bars / toasts
```

**Diagram sources**
- [index.html:1-800](file://renderer/index.html#L1-L800)
- [app.js:1-200](file://renderer/js/app.js#L1-L200)
- [core.js:1-93](file://renderer/js/core.js#L1-L93)

**Section sources**
- [app.js:1-200](file://renderer/js/app.js#L1-L200)
- [core.js:1-93](file://renderer/js/core.js#L1-L93)
- [index.html:1-800](file://renderer/index.html#L1-L800)

### Core Business Logic: pipManager
- Implements robust package operations with:
  - Input validation (package names, versions, wheel paths).
  - Environment-level locks to serialize operations per Python environment.
  - Caching of installed packages with TTL.
  - Structured progress emission for UI updates.
  - Integration with backupManager, logManager, mirrorManager, and processRunner.

```mermaid
flowchart TD
A["Install Packages"] --> B["Validate inputs<br/>buildPackageSpec()"]
B --> C{"Wheel file?"}
C --> |Yes| D["Security check path<br/>absolute, no UNC,<br/>no sensitive dirs"]
C --> |No| E["Regex validate name/version"]
D --> F["Acquire env lock"]
E --> F
F --> G["runPip with operationId<br/>and onOutput callback"]
G --> H["emitProgress(done,pkg,status)"]
H --> I["webContents.send('pip:progress')"]
I --> J["UI updates progress"]
```

**Diagram sources**
- [pipManager.js:1-200](file://core/operations/pipManager.js#L1-L200)
- [processRunner.js:1-366](file://utils/processRunner.js#L1-L366)

**Section sources**
- [pipManager.js:1-200](file://core/operations/pipManager.js#L1-L200)

### Process Runner and Resource Management
- Spawns child processes with UTF-8 encoding, strips ANSI codes, tracks active processes, supports timeouts and SIGTERM/SIGKILL cascades.
- Provides ensurePip fallback chain (cache → direct check → ensurepip → get-pip.py download).
- Supports canceling individual processes or all processes tied to an operationId.

```mermaid
flowchart TD
Start(["runCommand"]) --> Spawn["spawn(command,args,env)"]
Spawn --> Track["Register activeProcesses"]
Track --> Stdout["stdout.on('data') -> stripAnsi -> onOutput"]
Track --> Stderr["stderr.on('data') -> stripAnsi -> onOutput"]
Spawn --> Error["proc.on('error') -> cleanup -> reject"]
Spawn --> Close["proc.on('close') -> cleanup -> resolve/reject"]
Spawn --> Timeout{"timeout set?"}
Timeout --> |Yes| Kill["SIGTERM -> wait -> SIGKILL"]
Timeout --> |No| End(["Done"])
```

**Diagram sources**
- [processRunner.js:1-366](file://utils/processRunner.js#L1-L366)

**Section sources**
- [processRunner.js:1-366](file://utils/processRunner.js#L1-L366)

### Configuration and Environment Management
- configManager provides validated, atomic writes and default values; stores app settings and storage paths.
- envManager detects Python installations across common paths and PATH, filters out environments without pip, caches results, and persists current environment.

```mermaid
classDiagram
class ConfigManager {
+getConfig() Object
+setConfig(key, value) Object
+setBulk(updates) Object
+getStoragePath() string
+init() void
}
class EnvManager {
+detectEnvironments() Promise~Array~
+getCurrent() Object|null
+switchEnvironment(envPath) Object
}
ConfigManager <.. EnvManager : "used by"
```

**Diagram sources**
- [configManager.js:1-194](file://core/config/configManager.js#L1-L194)
- [envManager.js:1-200](file://core/system/envManager.js#L1-L200)

**Section sources**
- [configManager.js:1-194](file://core/config/configManager.js#L1-L194)
- [envManager.js:1-200](file://core/system/envManager.js#L1-L200)

### System Integration and Security
- Path opening restricted to allowed directories using security.isAllowedOpenPath.
- External links intercepted and opened via shell.openExternal with protocol checks.
- Notifications sent via native Notification API if supported.

**Section sources**
- [main.js:1-640](file://main.js#L1-L640)
- [security.js:1-43](file://utils/security.js#L1-L43)

## Dependency Analysis
The following diagram shows key dependencies among modules and how they interact during typical operations.

```mermaid
graph LR
App["renderer/app.js"] --> CoreJS["renderer/core.js"]
CoreJS --> Preload["preload.js"]
Preload --> Main["main.js"]
Main --> Pip["core/operations/pipManager.js"]
Main --> Env["core/system/envManager.js"]
Main --> Cfg["core/config/configManager.js"]
Pip --> PR["utils/processRunner.js"]
Main --> Sec["utils/security.js"]
```

**Diagram sources**
- [app.js:1-200](file://renderer/js/app.js#L1-L200)
- [core.js:1-93](file://renderer/js/core.js#L1-L93)
- [preload.js:1-221](file://preload.js#L1-L221)
- [main.js:1-640](file://main.js#L1-L640)
- [pipManager.js:1-200](file://core/operations/pipManager.js#L1-L200)
- [envManager.js:1-200](file://core/system/envManager.js#L1-L200)
- [configManager.js:1-194](file://core/config/configManager.js#L1-L194)
- [processRunner.js:1-366](file://utils/processRunner.js#L1-L366)
- [security.js:1-43](file://utils/security.js#L1-L43)

**Section sources**
- [main.js:1-640](file://main.js#L1-L640)
- [preload.js:1-221](file://preload.js#L1-L221)
- [app.js:1-200](file://renderer/js/app.js#L1-L200)
- [core.js:1-93](file://renderer/js/core.js#L1-L93)
- [pipManager.js:1-200](file://core/operations/pipManager.js#L1-L200)
- [processRunner.js:1-366](file://utils/processRunner.js#L1-L366)
- [configManager.js:1-194](file://core/config/configManager.js#L1-L194)
- [envManager.js:1-200](file://core/system/envManager.js#L1-L200)
- [security.js:1-43](file://utils/security.js#L1-L43)

## Performance Considerations
- Renderer startup is optimized with phased initialization: immediate cache display followed by background refresh of real-time data.
- pipManager caches installed packages with TTL to reduce repeated scans.
- processRunner uses ANSI stripping and efficient stream handling; timeouts prevent hanging processes.
- Debounced window bounds saving avoids excessive disk writes.
- Parallelization options for pip operations improve throughput where safe.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- If pip is missing, ensurePip attempts multiple strategies; failures will be logged and surfaced to the UI.
- Cancel operations via operationId; verify activeProcesses tracking in processRunner.
- For path-related errors, confirm allowed directories and input sanitization in security.js.
- Logs can be exported and cleared via IPC handlers; ensure logManager is flushed on quit.

**Section sources**
- [processRunner.js:1-366](file://utils/processRunner.js#L1-L366)
- [security.js:1-43](file://utils/security.js#L1-L43)
- [main.js:1-640](file://main.js#L1-L640)

## Conclusion
PyLibMaster’s architecture cleanly separates concerns across main, preload, and renderer layers, enforcing security through context isolation and a minimal IPC surface. The event-driven design enables responsive UIs while managing long-running system operations safely. Robust utilities for process control, configuration, and security underpin reliable behavior across platforms.

[No sources needed since this section summarizes without analyzing specific files]