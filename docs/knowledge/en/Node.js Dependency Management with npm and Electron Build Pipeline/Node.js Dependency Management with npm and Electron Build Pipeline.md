---
kind: dependency_management
name: Node.js Dependency Management with npm and Electron Build Pipeline
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - .github/workflows/ci.yml
    - core/operations/pipManager.js
    - core/config/mirrorManager.js
    - utils/processRunner.js
---

This repository manages dependencies through the standard npm ecosystem for its Node.js/Electron application, while also providing Python package management capabilities as its core business feature. The dependency strategy is split into two distinct layers: Node.js runtime dependencies (for the Electron app itself) and Python package management (the application's primary functionality).

**Node.js Dependencies (Application Runtime)**

The project uses npm as its package manager with a minimal set of runtime dependencies declared in `package.json`: `electron-updater` (^6.8.9), `glob` (^11.0.0), and `strip-ansi` (^6.0.1). Development dependencies include `electron` (31.7.7) and `electron-builder` (^25.0.0). A lockfile (`package-lock.json`) is committed to ensure reproducible builds across environments.

The build system uses `electron-builder` configured in `package.json` under the `build` field, which packages the entire `node_modules` directory along with source files into Windows NSIS installers. The configuration specifies GitHub as the update provider and includes an Electron download mirror pointing to `https://npmmirror.com/mirrors/electron/` for faster downloads in China.

Notably, the project documents compatibility constraints in a `dependencyNotes` field, explaining that `strip-ansi` is locked at ^6.0.1 because version 7+ is ESM-only and incompatible with CommonJS `require()` usage. The `allowScripts` field explicitly permits the `electron@31.7.7` postinstall script to run during installation.

**Python Package Management (Core Business Feature)**

The application's main purpose is managing Python packages through pip, implemented in `core/operations/pipManager.js`. This module provides comprehensive pip operations including install/uninstall/update with rollback support, parallel execution, and automatic retry mechanisms. It integrates with a mirror management system (`core/config/mirrorManager.js`) that supports multiple PyPI mirrors including official PyPI, Tsinghua University, Aliyun, Tencent Cloud, Huawei Cloud, and Douban mirrors.

The Python package management layer handles security validation through regex patterns for package names and versions, wheel file path validation preventing path traversal attacks, and environment isolation using per-environment locks to prevent concurrent operations on the same Python environment.

**CI/CD Integration**

GitHub Actions workflow in `.github/workflows/ci.yml` runs tests and builds on Windows-latest runners using Node.js 20. The workflow uses `npm ci` for deterministic dependency installation and caches npm dependencies. The build process produces Windows installers uploaded as artifacts.

**Registry Configuration**

The project uses the npmmirror registry (China mirror of npm) as evidenced by all resolved URLs in `package-lock.json` pointing to `registry.npmmirror.com`. No local `.npmrc` file exists, suggesting this registry configuration is applied globally or through environment variables in the development environment.