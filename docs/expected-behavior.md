# Expected Behavior Documentation - MCP Ink CLI

## Cancellation System

### ESC Key Behavior

#### Points of Cancellation
1. **During Backend Initialization**
   - ESC during startup cancels initialization
   - Sets `isCancelled` to true
   - Clears all activeRequests
   - Updates `lastEsc` timestamp

2. **During AI Call**
   - ESC before response arrives cancels the request
   - Aborts `aiAbortControllerRef`
   - Adds cancellation marker to fullHistory
   - Sets `isProcessing` to false

3. **During Database Write**
   - ESC during Turso operation cancels the write
   - Aborts `dbAbortControllerRef`
   - Prevents partial data corruption

4. **During Multi-line Input**
   - ESC clears current input buffer
   - Does not affect command history
   - Returns to normal input mode

### Cancellation Marker
```javascript
const CANCELLATION_MARKER = '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]';
```

This marker is added to `fullHistory` as a system message when a command is cancelled.

### Multiple ESC Prevention
- System prevents duplicate cancellation markers
- Rapid ESC presses are deduplicated
- Only one cancellation marker per cancelled command

## Ctrl+C Behavior

### Single Press
- Updates `lastCtrlC` timestamp
- Does not exit application
- May cancel current operation (context dependent)

### Double Press (within 500ms)
- Exits application immediately
- Calls `process.exit(0)`
- No cleanup or saving

## State Management

### Critical State Properties

#### activeRequests (Map)
- Tracks all in-flight requests
- Key: requestId
- Value: request metadata
- Must be cleared on cancellation

#### fullHistory (Array)
- Complete conversation history for AI context
- Preserves all user/assistant/system messages
- Never modified, only appended
- Critical for AI context continuity

#### commandHistory (Array)
- User command history for navigation
- Preserved even for cancelled commands
- Used by up/down arrow navigation

#### isProcessing (Boolean)
- Indicates active AI/DB operation
- Must be false when idle
- Controls UI loading state

#### isCancelled (Boolean)
- Temporary flag during cancellation
- Reset after cancellation completes
- Prevents duplicate processing

## Initialization Order

1. Create app state with defaults
2. Initialize Turso adapter (if configured)
3. Initialize AI orchestrator
4. Initialize pattern matcher
5. Setup input handlers
6. Render UI
7. Set status to 'ready'

## AbortController Management

### Three Separate Controllers
1. **aiAbortControllerRef**: AI API calls
2. **dbAbortControllerRef**: Database operations
3. **patternAbortControllerRef**: Pattern matching operations

### Why Separate?
- Granular control over cancellation
- Prevent cascade failures
- Allow partial cancellation
- Better error handling

## History Navigation

### Up Arrow
- Navigates to previous command
- Increments `historyIndex`
- Updates input field
- Preserves current input if not in history

### Down Arrow
- Navigates to next command
- Decrements `historyIndex`
- Clears input if at end of history

## Special Commands

### /help
- Shows available commands
- Does not call AI
- Handled locally

### /clear
- Clears screen
- Preserves fullHistory
- Resets UI state

### /history
- Shows command history
- Optional limit parameter
- Formatted display

## Debug Mode

### Activation
- `--debug` flag on startup
- `MCP_DEBUG=true` environment variable

### Debug Features
- Verbose logging to console
- Request/response details
- Timing information
- State changes logged
- Error stack traces

## Paste Detection

### Bracketed Paste Mode
- Detects multi-line pastes
- Preserves formatting
- Handles special characters
- Prevents command injection

### Detection Logic
```javascript
// Paste detected if:
// 1. Multiple lines at once
// 2. Bracketed paste sequences (\x1b[200~ and \x1b[201~)
// 3. Rapid character input (>50 chars in <100ms)
```

## Error Handling

### Network Errors
- Retry logic with exponential backoff
- User notification
- Graceful degradation

### AI API Errors
- Fallback to pattern matcher if available
- Error message in fullHistory
- User-friendly error display

### Database Errors
- Continue without persistence
- Warning to user
- Local history maintained

## State Consistency Rules

1. **Never have both `isProcessing` and `isCancelled` true**
2. **`activeRequests.size` must be 0 when `isProcessing` is false**
3. **`historyIndex` must be within bounds of `commandHistory`**
4. **`fullHistory` must maintain chronological order**
5. **Each user message must have a unique `requestId`**

## Performance Requirements

### Response Times
- Input lag: <50ms
- Command submission: <100ms
- Cancellation response: <200ms
- History navigation: <10ms

### Memory Limits
- fullHistory: Max 1000 entries (then trim oldest)
- commandHistory: Max 500 entries
- activeRequests: Max 10 concurrent

## Testing Requirements

### Before Each Refactoring Phase
1. Run full test suite
2. Verify cancellation tests pass
3. Check fullHistory snapshots match
4. Manual smoke test of critical paths

### Critical Test Scenarios
1. ESC during each cancellation point
2. Rapid command-cancel sequences
3. Multi-line input handling
4. Double Ctrl+C exit
5. History navigation edge cases
6. State consistency after operations

## Backward Compatibility

### Must Preserve
- Command line arguments
- Environment variables
- Configuration file format
- fullHistory structure
- API response format

### Can Change
- Internal state management
- Component structure
- Module organization
- Import paths (with setup.js update)
- Internal function names