---
kind: error_handling
name: Error Handling in PyLibMaster Electron Application
category: error_handling
scope:
    - '**'
source_files:
    - main.js
    - preload.js
    - utils/processRunner.js
    - core/operations/pipManager.js
    - core/system/logManager.js
---

## Error Handling Approach

PyLibMaster uses a **structured error handling pattern** combining Node.js native Error objects, try-catch blocks, and Promise rejection patterns throughout the codebase. The application follows a layered approach where errors are caught at appropriate boundaries and propagated through IPC channels.

### Core Patterns

**1. Native Error Objects with Context**
The codebase primarily uses `throw new Error()` statements with descriptive messages that include context information:
- Input validation errors: `throw new Error('Invalid package name: must be a non-empty string')`
- Security-related errors: `throw new Error('Invalid wheel path (path traversal detected): ${name}')`
- System operation failures: `throw new Error('pip is not available and could not be auto-installed.')`

**2. Try-Catch with Graceful Degradation**
Most operations use try-catch blocks with fallback behavior:
- File operations catch errors and log them via `logManager.addLog()`
- Network requests use `.catch(() => {})` for silent failure when appropriate
- Configuration reads fall back to defaults on errors

**3. Promise-Based Error Propagation**
Asynchronous operations return rejected Promises with structured error objects:
- Process execution failures include stdout/stderr content
- Timeout errors are clearly distinguished from command failures
- Cancellation signals are handled separately from actual errors

### Key Files and Architecture

**Process Runner (`utils/processRunner.js`)**
Centralizes all subprocess management with comprehensive error handling:
- Command timeouts trigger SIGTERM followed by SIGKILL after 5 seconds
- Non-zero exit codes create Error objects with stdout/stderr attached
- Process cancellation maintains separate error semantics from failures

**Pip Manager (`core/operations/pipManager.js`)**
Implements environment-level locking and rollback mechanisms:
- Environment locks prevent concurrent operations on the same Python environment
- Failed operations trigger automatic rollback through backupManager
- Progress events distinguish between success/failure states

**IPC Layer (`main.js`, `preload.js`)**
Electron's IPC handlers wrap core operations with error boundaries:
- All IPC handlers return promises that can reject with Error objects
- Progress events are sent separately from error conditions
- UI updates handle both success and error states gracefully

### Conventions and Constraints

**Input Validation Pattern**
All user inputs undergo strict validation before processing:
- Package names validated against regex patterns
- File paths checked for traversal attacks and system directory access
- Version specifications sanitized against allowed character sets

**Error Propagation Strategy**
- Low-level functions throw native Error objects
- Business logic catches and transforms errors into user-friendly messages
- UI layer displays error details while logging full stack traces
- Silent failures are explicitly marked with comments like `/* 静默失败 */`

**Resource Cleanup**
- Active processes are tracked and cancelled on application shutdown
- File handles and timers are properly cleaned up in error paths
- Log files are flushed during graceful shutdown to prevent data loss

**Security Considerations**
- Path validation prevents directory traversal attacks
- Command injection is mitigated through input sanitization
- External resource access is restricted to whitelisted directories