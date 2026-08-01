---
kind: build_system
name: Electron + electron-builder Packaging & CI Pipeline
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - .github/workflows/ci.yml
    - build/license.txt
---

The project uses an Electron-based desktop application with a Node.js main process and a renderer UI. The build system is centered around `electron-builder` configured entirely within `package.json`, producing Windows NSIS installers, and a GitHub Actions CI pipeline that runs tests and builds artifacts on each push/PR to `main`/`master`.

**Build tooling and scripts**
- `npm run start` launches the app via `electron .`
- `npm run build` invokes `electron-builder` to package the app
- `npm run build:win` targets Windows only (`--win`)
- `npm run dist` is an alias for `build:win`
- `npm test` runs Node's built-in test runner against `tests/**/*.test.js` using `./tests/bootstrap.js`

**Packaging configuration (electron-builder)**
- App ID: `com.softheartedyyc.pylibmaster`, product name: `PyLibMaster`
- Output directory: `dist/`
- Bundled files include `main.js`, `preload.js`, `renderer/**/*`, `core/**/*`, `utils/**/*`, and all `node_modules/**/*`
- Windows target: NSIS installer (`nsis`) for `x64` architecture
- Installer options: multi-click install, custom installation directory, desktop and Start Menu shortcuts, license file at `build/license.txt`
- Electron binaries are downloaded from the `npmmirror.com` mirror
- Auto-update publishing is configured to publish releases to GitHub (`SoftheartedYYC/PyLibMaster`)
- `allowScripts.electron@31.7.7` explicitly permits Electron's postinstall script

**CI pipeline (`.github/workflows/ci.yml`)**
- Two jobs: `test` and `build`, both running on `windows-latest` with Node 20
- `test` job: checkout → setup Node 20 with npm cache → `npm ci` → `npm test`
- `build` job: depends on `test` passing; same setup steps, then `npm run build`, uploads `dist/*.exe` as an artifact named `PyLibMaster-Installer`
- Triggered on pushes and pull requests to `main` and `master` branches

**Versioning and release flow**
- Version is managed in `package.json` (`"version": "1.5.23"`)
- No automated release workflow is present — the CI builds artifacts but does not publish them to GitHub Releases or npm
- The `electron-updater` dependency is configured for GitHub provider, indicating an intended auto-update mechanism once releases are published manually or via a future automation step

**Constraints and conventions**
- Dependencies are locked via `package-lock.json`; CI uses `npm ci` for deterministic installs
- Electron version is pinned at `31.7.7` and its postinstall script is explicitly allowed
- `strip-ansi` is pinned at `^6.0.1` because v7+ is ESM-only and incompatible with CommonJS `require()` (documented in `dependencyNotes`)
- Only Windows x64 NSIS installers are produced; no macOS/Linux targets are configured