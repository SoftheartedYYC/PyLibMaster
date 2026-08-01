---
kind: configuration_system
name: Electron Config System — JSON-based Persistent Settings with Validation and Atomic Writes
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

The application uses a single-file, Electron-native configuration system built around a persistent JSON store located in the platform-specific user data directory. All runtime settings are managed through `core/config/configManager.js`, which provides typed defaults, range validation, atomic disk writes, and cross-process IPC exposure via the preload bridge.

**Storage location and format**
- Configuration is stored as `pylibmaster-config.json` under Electron's `userData` directory: `%APPDATA%/PyLibMaster/` on Windows, `~/Library/Application Support/PyLibMaster/` on macOS, and `~/.config/PyLibMaster/` on Linux.
- The file is written atomically using a `.tmp` rename pattern to prevent corruption on crash.
- On first run or when the file is missing/corrupt, defaults are merged and saved automatically.

**Default configuration schema**
The manager defines typed defaults for all known keys:
- `theme` (light/dark/system), `language` (zh/en), `storagePath` (log/backup directory), `parallelThreads` (1–16, default 4), `retryCount` (0–10, default 3), `smartRoute` (boolean), `currentEnv` (string|null), `windowBounds` (object with width/height/x/y).
- Numeric values outside their declared ranges are clamped to the nearest valid value; non-numeric types fall back to the declared default.

**Validation and sanitization**
- A centralized `RANGE_LIMITS` map enforces min/max bounds per key via `sanitizeValue()`.
- Mirror URLs are validated against an `isValidMirrorUrl` helper requiring http/https protocol and length ≤ 2048.
- Mirror list integrity is enforced: exactly one mirror must be marked `isDefault`; duplicates are rejected.

**Persistence and access patterns**
- `getConfig()` returns a deep copy of the in-memory config object.
- `setConfig(key, value)` applies sanitization, persists immediately, and returns the updated snapshot.
- `setBulk(updates)` batches multiple key/value pairs into a single disk write after individual sanitization.
- `getStoragePath()` lazily creates the configured storage directory if it does not exist.
- The config module exposes only these four functions plus `init()`, keeping internal state encapsulated.

**IPC exposure to the renderer**
The main process registers three IPC handlers (`config:get`, `config:set`, `config:setBulk`) that delegate directly to `configManager`. The preload script exposes them as `electronAPI.getConfig`, `electronAPI.setConfig`, and `electronAPI.setConfigBulk`, so the renderer never touches the filesystem directly.

**Cross-cutting configuration consumers**
- `mirrorManager.js` reads/writes `mirrors` and `smartRoute` fields, merging user custom mirrors with built-in defaults and persisting only name/url/remark/isDefault/speed.
- `schedulerManager.js` persists `schedulerEnabled`, `schedulerFrequency`, `schedulerWhitelist`, and `schedulerLastRun` via `setBulk`.
- `main.js` reads `windowBounds` to restore window geometry and checks `autoCheckUpdates` / `minimizeToTray` flags at startup and on window events.
- `envManager`, `pipManager`, `backupManager`, and other core modules consume config indirectly through the managers above rather than reading the file directly.

**Separation of concerns**
- Application-level UI/runtime settings live in `pylibmaster-config.json`.
- PyPI mirror configuration is also persisted inside the same JSON file under the `mirrors` key but is logically separated into its own manager.
- pip's own global configuration (`pip.ini` on Windows, `pip.conf` under `~/.config/pip/`) is written separately by `mirrorManager.writePipConfig` and is not part of the app's config store.

**Constraints and conventions observed**
- All config mutations go through the manager API; direct file reads/writes are avoided outside the manager.
- Config initialization is idempotent — calling `init()` multiple times is safe because of the `if (config) return;` guard.
- Window bounds are debounced (500 ms) before saving to avoid excessive disk writes during drag operations.
- Theme changes from the OS native theme are pushed to the renderer via an IPC event (`theme:changed`) rather than polling.