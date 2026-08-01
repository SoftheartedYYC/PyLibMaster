---
kind: logging_system
name: Operation Log Manager — JSON File-Based Structured Logging
category: logging_system
scope:
    - '**'
source_files:
    - core/system/logManager.js
    - main.js
    - core/operations/pipManager.js
---

The application implements a lightweight, file-based operation logging system centered on `core/system/logManager.js`. It is not a general-purpose logger framework but a domain-specific audit trail for user-triggered operations (install/uninstall/update/system events) persisted to disk.

**Storage format and location**
- Logs are stored as a single JSON array in `{storagePath}/logs/operations.json`.
- Each log entry is a structured object with fields: `time` (ISO timestamp truncated to seconds), `action`, `status` (`ok` or `failed`), `type` (`install`, `uninstall`, `update`, `system`), and `detail`.
- The storage directory is created lazily via `configManager.getStoragePath()`.

**Lifecycle and persistence strategy**
- On first use, `init()` loads existing logs from disk; malformed files are silently reset to an empty array.
- New entries are appended to an in-memory array with newest-first ordering. When the array exceeds `MAX_LOGS = 2000`, older entries are trimmed.
- Writes are debounced with a 300ms timer (`SAVE_DEBOUNCE_MS`) to avoid excessive disk I/O; `flushLogs()` forces an immediate synchronous write and is called during `app.on('before-quit')` to guarantee durability.
- Write failures are logged to `console.error('[PyLibMaster] Failed to save logs: ...')` rather than re-thrown, preventing a logging-from-a-failing-logger loop.

**Field safety and capacity controls**
- Every string field is passed through `truncateField()`, which caps length at `MAX_FIELD_LENGTH = 1000` characters and appends `'...'` when truncated.
- Search queries are limited to `MAX_SEARCH_LENGTH = 200` characters.
- Non-object inputs to `addLog` are coerced into a safe default record instead of throwing.

**Query API**
- `getLogs(filter)` supports filtering by `type` (`all`, `install`, `uninstall`, `update`, `system`) and free-text search across `action` and `detail` fields (case-insensitive).
- `clearLogs()` resets the in-memory array and persists the empty state.

**Integration points**
- `main.js` requires `logManager` and calls `flushLogs()` on `before-quit`.
- Core modules (`pipManager`, `backupManager`, `auditManager`, `templateManager`, `undoManager`, `venvManager`, `mirrorManager`, `schedulerManager`, `explorerManager`, `configManager`) all import `../system/logManager` and call `logManager.addLog({ action, status, type, detail })` to record operational events.
- The renderer UI reads logs via IPC handlers wired in `main.js` and exposes them through the UI's log viewer page.

**What is NOT part of this system**
- There is no console-level logging framework (no winston/pino/bunyan). Console statements (`console.log`, `console.warn`, `console.error`) are used ad hoc in `main.js`, `renderer/js/app.js`, and other files for debugging and error reporting, but they are separate from the structured operation log.
- No log rotation, compression, or multi-sink routing exists; the only sink is the single `operations.json` file.