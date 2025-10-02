# Hook Contracts Documentation

## Overview
This document defines the contracts (interfaces) for all hooks that will be extracted from `mcp-ink-cli.mjs`. Each hook has clearly defined inputs, outputs, dependencies, and responsibilities.

## 1. useRequestManager Hook

### Purpose
Manages all request lifecycle including creation, tracking, cancellation, and cleanup.

### Contract
```javascript
/**
 * @typedef {Object} RequestManagerState
 * @property {Map} activeRequests - Map of requestId -> request metadata
 * @property {string|null} currentRequestId - Current active request ID
 * @property {AbortController|null} aiAbortController - Controller for AI calls
 * @property {AbortController|null} dbAbortController - Controller for DB operations
 * @property {AbortController|null} patternAbortController - Controller for pattern matching
 */

/**
 * @typedef {Object} RequestManagerActions
 * @property {Function} createRequest - (type: string) => string (requestId)
 * @property {Function} cancelRequest - (requestId: string) => void
 * @property {Function} cancelAllRequests - () => void
 * @property {Function} completeRequest - (requestId: string) => void
 * @property {Function} getAbortSignal - (type: 'ai'|'db'|'pattern') => AbortSignal
 * @property {Function} isRequestActive - (requestId: string) => boolean
 */

/**
 * @param {Object} deps - Dependencies
 * @param {Function} deps.onRequestCancelled - Callback when request is cancelled
 * @param {Function} deps.onRequestCompleted - Callback when request completes
 * @returns {[RequestManagerState, RequestManagerActions]}
 */
function useRequestManager({ onRequestCancelled, onRequestCompleted }) {
  // Implementation
}
```

### Dependencies
- None (self-contained)

### State Managed
- `activeRequests`: Map<string, RequestMetadata>
- `currentRequestId`: string | null
- Three AbortControllers: ai, db, pattern

### Critical Behaviors
1. **MUST** maintain separate AbortControllers for different operations
2. **MUST** clean up completed/cancelled requests from activeRequests
3. **MUST** prevent memory leaks by aborting controllers on unmount
4. **MUST** handle rapid cancellations without race conditions

## 2. useInitialization Hook

### Purpose
Handles application initialization including backend services, configuration loading, and initial state setup.

### Contract
```javascript
/**
 * @typedef {Object} InitializationState
 * @property {'initializing'|'ready'|'error'} status
 * @property {Object|null} config - Loaded configuration
 * @property {string|null} error - Error message if initialization failed
 * @property {Object|null} orchestrator - AI orchestrator instance
 * @property {Object|null} tursoAdapter - Database adapter instance
 * @property {Object|null} patternMatcher - Pattern matcher instance
 */

/**
 * @param {Object} deps
 * @param {string} deps.user - User identifier
 * @param {boolean} deps.isDebug - Debug mode flag
 * @param {Function} deps.onInitComplete - Callback when initialization completes
 * @param {Function} deps.onInitError - Callback on initialization error
 * @returns {InitializationState}
 */
function useInitialization({ user, isDebug, onInitComplete, onInitError }) {
  // Implementation
}
```

### Dependencies
- AICommandOrchestratorBash
- TursoAdapter
- PatternMatcher
- ModelFactory

### State Managed
- `status`: 'initializing' | 'ready' | 'error'
- `config`: Configuration object
- Backend service instances

### Critical Behaviors
1. **MUST** initialize services in correct order
2. **MUST** handle initialization failures gracefully
3. **MUST** support cancellation during initialization
4. **MUST** clean up on unmount

## 3. useHistory Hook

### Purpose
Manages command history, navigation, and fullHistory for AI context.

### Contract
```javascript
/**
 * @typedef {Object} HistoryEntry
 * @property {'user'|'assistant'|'system'|'debug'} role
 * @property {string} content
 * @property {string} timestamp
 * @property {string} [requestId] - Only for user messages
 */

/**
 * @typedef {Object} HistoryState
 * @property {string[]} commandHistory - User commands for navigation
 * @property {HistoryEntry[]} fullHistory - Complete history for AI
 * @property {number} historyIndex - Current position in command history
 * @property {HistoryEntry[]} history - Visible history in UI
 */

/**
 * @typedef {Object} HistoryActions
 * @property {Function} addCommand - (command: string, requestId: string) => void
 * @property {Function} addResponse - (response: string) => void
 * @property {Function} addSystemMessage - (message: string) => void
 * @property {Function} addCancellationMarker - () => void
 * @property {Function} navigateHistory - (direction: 'up'|'down') => string
 * @property {Function} clearHistory - () => void
 * @property {Function} loadHistoryFromDB - () => Promise<void>
 */

/**
 * @param {Object} deps
 * @param {Object} deps.tursoAdapter - Database adapter for persistence
 * @param {number} deps.maxHistory - Maximum history entries (default: 1000)
 * @returns {[HistoryState, HistoryActions]}
 */
function useHistory({ tursoAdapter, maxHistory = 1000 }) {
  // Implementation
}
```

### Dependencies
- TursoAdapter (optional, for persistence)

### State Managed
- `commandHistory`: string[]
- `fullHistory`: HistoryEntry[]
- `historyIndex`: number
- `history`: HistoryEntry[] (UI subset)

### Critical Behaviors
1. **MUST** preserve fullHistory structure exactly for AI context
2. **MUST** never modify existing entries, only append
3. **MUST** handle cancellation markers correctly
4. **MUST** maintain chronological order
5. **MUST** trim old entries when exceeding maxHistory

## 4. useCommandProcessor Hook

### Purpose
Processes user commands, coordinates with AI/pattern matcher, and manages responses.

### Contract
```javascript
/**
 * @typedef {Object} ProcessingState
 * @property {boolean} isProcessing
 * @property {string} currentCommand
 * @property {string} response
 * @property {string|null} error
 */

/**
 * @typedef {Object} ProcessingActions
 * @property {Function} processCommand - (command: string) => Promise<void>
 * @property {Function} cancelProcessing - () => void
 * @property {Function} clearResponse - () => void
 */

/**
 * @param {Object} deps
 * @param {Object} deps.orchestrator - AI orchestrator
 * @param {Object} deps.patternMatcher - Pattern matcher
 * @param {Function} deps.getAbortSignal - From useRequestManager
 * @param {Function} deps.onResponseReceived - Callback with response
 * @returns {[ProcessingState, ProcessingActions]}
 */
function useCommandProcessor({
  orchestrator,
  patternMatcher,
  getAbortSignal,
  onResponseReceived
}) {
  // Implementation
}
```

### Dependencies
- useRequestManager (for abort signals)
- AI Orchestrator
- Pattern Matcher

### State Managed
- `isProcessing`: boolean
- `currentCommand`: string
- `response`: string
- `error`: string | null

### Critical Behaviors
1. **MUST** respect abort signals
2. **MUST** handle special commands locally (/help, /clear, etc)
3. **MUST** fallback to pattern matcher if AI fails
4. **MUST** clean up state on cancellation

## 5. useInputHandler Hook

### Purpose
Handles all user input including typing, special keys, paste detection, and multiline input.

### Contract
```javascript
/**
 * @typedef {Object} InputState
 * @property {string} input - Current input value
 * @property {boolean} isMultiline - Whether in multiline mode
 * @property {number} cursorPosition - Cursor position in input
 * @property {boolean} isPasting - Detected paste operation
 */

/**
 * @typedef {Object} InputActions
 * @property {Function} setInput - (value: string) => void
 * @property {Function} clearInput - () => void
 * @property {Function} handleKeyPress - (key: string, modifiers: Object) => void
 * @property {Function} handlePaste - (content: string) => void
 */

/**
 * @param {Object} deps
 * @param {Function} deps.onSubmit - Called when user submits input
 * @param {Function} deps.onCancel - Called when user cancels (ESC)
 * @param {Function} deps.navigateHistory - From useHistory
 * @returns {[InputState, InputActions]}
 */
function useInputHandler({ onSubmit, onCancel, navigateHistory }) {
  // Implementation
}
```

### Dependencies
- useHistory (for navigation)

### State Managed
- `input`: string
- `isMultiline`: boolean
- `cursorPosition`: number
- `isPasting`: boolean

### Critical Behaviors
1. **MUST** detect bracketed paste mode
2. **MUST** handle multiline input with Shift+Enter
3. **MUST** clear input on ESC
4. **MUST** navigate history with up/down arrows

## 6. useCancellation Hook

### Purpose
Centralized cancellation handling for ESC and Ctrl+C operations.

### Contract
```javascript
/**
 * @typedef {Object} CancellationState
 * @property {boolean} isCancelled
 * @property {number} lastEsc - Timestamp of last ESC
 * @property {number} lastCtrlC - Timestamp of last Ctrl+C
 */

/**
 * @typedef {Object} CancellationActions
 * @property {Function} handleEsc - () => void
 * @property {Function} handleCtrlC - () => void
 * @property {Function} resetCancellation - () => void
 */

/**
 * @param {Object} deps
 * @param {Function} deps.cancelAllRequests - From useRequestManager
 * @param {Function} deps.clearInput - From useInputHandler
 * @param {Function} deps.addCancellationMarker - From useHistory
 * @param {Function} deps.onExit - Called on double Ctrl+C
 * @returns {[CancellationState, CancellationActions]}
 */
function useCancellation({
  cancelAllRequests,
  clearInput,
  addCancellationMarker,
  onExit
}) {
  // Implementation
}
```

### Dependencies
- useRequestManager (for cancellation)
- useInputHandler (for clearing input)
- useHistory (for cancellation marker)

### State Managed
- `isCancelled`: boolean
- `lastEsc`: number (timestamp)
- `lastCtrlC`: number (timestamp)

### Critical Behaviors
1. **MUST** cancel all active requests on ESC
2. **MUST** add cancellation marker to fullHistory
3. **MUST** exit on double Ctrl+C within 500ms
4. **MUST** prevent duplicate cancellation markers

## Hook Dependency Graph

```
┌─────────────────┐
│useRequestManager│ (No dependencies - foundation)
└────────┬────────┘
         │
    ┌────▼────┐
    │useHistory│ (Depends on TursoAdapter)
    └────┬─────┘
         │
┌────────▼────────┐
│useInitialization│ (Loads backends)
└────────┬────────┘
         │
┌────────▼──────────┐
│useCommandProcessor│ (Needs orchestrator, signals)
└────────┬──────────┘
         │
┌────────▼────────┐
│useInputHandler  │ (Needs history navigation)
└────────┬────────┘
         │
┌────────▼────────┐
│useCancellation  │ (Orchestrates cancellation)
└─────────────────┘
```

## State Synchronization Rules

1. **Request State**: Only useRequestManager modifies activeRequests
2. **History State**: Only useHistory modifies fullHistory/commandHistory
3. **Processing State**: Only useCommandProcessor modifies isProcessing
4. **Input State**: Only useInputHandler modifies input field
5. **Cancellation State**: useCancellation coordinates but doesn't own state

## Testing Requirements

Each hook MUST have:
1. Unit tests for all actions
2. Integration tests for state changes
3. Edge case tests (rapid operations, cancellations)
4. Memory leak tests (cleanup on unmount)

## Migration Strategy

1. Extract hooks in dependency order (bottom-up)
2. Test each hook in isolation
3. Integrate hooks one at a time
4. Validate against regression tests after each integration

## TypeScript Future

All contracts are written with JSDoc for easy migration to TypeScript:
```typescript
// Future TypeScript version
interface RequestManagerState {
  activeRequests: Map<string, RequestMetadata>;
  currentRequestId: string | null;
  aiAbortController: AbortController | null;
  // ...
}
```