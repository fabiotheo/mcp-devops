# Fix: Default User History Mode

## Problem
When running `ipcom-chat --debug` without `--user` flag, the system was using the OS username (`fabiotheodoro`) instead of `'default'`, causing unwanted USER_NOT_FOUND validation errors.

## Requirement
When NO `--user` flag is provided:
- System should use `'default'` user (not OS username)
- Enter normally WITHOUT user validation
- Set mode to `'machine'` (not 'global')
- Save history to `history_machine` table without `user_id` field (NULL)
- Load history only from `history_machine WHERE user_id IS NULL`

## Changes Made

### 1. src/ipcom-chat-cli.ts (line 641-643)
**Removed OS username fallback**
```typescript
// OLD:
const effectiveUser = options.user || process.env.MCP_USER || os.userInfo().username || 'default';

// NEW:
const effectiveUser = options.user || process.env.MCP_USER || 'default';
```

### 2. src/bridges/adapters/TursoAdapter.ts (line 220-228)
**Set mode to 'machine' for default user**
```typescript
// For 'default' user, use machine mode (no user validation)
// For specific users, use user mode (with validation)
const historyMode = (this.userId && this.userId !== 'default') ? 'user' : 'machine';

this.tursoClient = new TursoHistoryClient({
  ...config,
  debug: this.debug,
  history_mode: historyMode,
});
```

### 3. src/libs/turso-client.ts (line 975-985)
**Filter history by user_id for machine mode**
```typescript
case 'machine':
  // When userId is NULL (default user), only get machine history without user_id
  // When userId is set, get machine history for that specific user
  if (this.userId) {
    sql = `SELECT * FROM history_machine
           WHERE machine_id = ? AND user_id = ?
           ORDER BY timestamp ASC
           LIMIT ? OFFSET ?`;
    args = [this.machineId, this.userId, limit, offset];
  } else {
    sql = `SELECT * FROM history_machine
           WHERE machine_id = ? AND user_id IS NULL
           ORDER BY timestamp ASC
           LIMIT ? OFFSET ?`;
    args = [this.machineId, limit, offset];
  }
  break;
```

## Verification

### Test Commands
```bash
# Build and install
pnpm build
node setup.js --upgrade --auto

# Test with default user (no --user flag)
ipcom-chat --debug
# Expected: User = "default", mode = "machine", no validation

# Test with specific user
ipcom-chat --user fabio-teste --debug
# Expected: USER_NOT_FOUND error (if user doesn't exist)

ipcom-chat --user valid-user --debug
# Expected: User = "valid-user", mode = "user", validation performed
```

### Debug Log Confirmation
```
User: default
"mode": "machine",
[TursoAdapter] Skipping setUser (default user or empty)
```

## Behavior Matrix

| Command | User | Mode | Validation | History Tables | user_id Value |
|---------|------|------|------------|----------------|---------------|
| `ipcom-chat` | default | machine | NO | history_machine | NULL |
| `ipcom-chat --user fabio` | fabio | user | YES | history_user + history_machine | 'fabio_id' |
| `MCP_USER=test ipcom-chat` | test | user | YES | history_user + history_machine | 'test_id' |

**Importante**: Quando usuário específico é fornecido, o sistema salva em DUAS tabelas:
1. `history_user` - Histórico específico do usuário (para carregar quando usuário faz login)
2. `history_machine` - Histórico da máquina com user_id preenchido (para análise/auditoria por máquina)

## Database Schema

### history_machine table
```sql
CREATE TABLE history_machine (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  command TEXT NOT NULL,
  response TEXT,
  user_id TEXT,              -- NULL for default user, set for specific users
  timestamp INTEGER NOT NULL,
  error_code INTEGER,
  session_id TEXT,
  status TEXT,
  request_id TEXT
);
```

When `user_id IS NULL`: Machine-only history, shared across all default user sessions on this machine.
When `user_id = 'some_id'`: User-specific machine history.

## Files Modified
1. `src/ipcom-chat-cli.ts` - Remove OS username fallback
2. `src/bridges/adapters/TursoAdapter.ts` - Set history_mode based on user
3. `src/libs/turso-client.ts` - Filter getHistory by user_id in machine mode
4. `src/hooks/useCommandProcessor.ts` (3 locations) - Remove `user !== 'default'` validation that blocked Turso saves
5. `src/hooks/useHistoryManager.ts` - Remove `user !== 'default'` validation that blocked Turso saves

### Critical Bug Fixed
The system had hardcoded `user !== 'default'` checks in multiple places that prevented saving to Turso when using default user. These checks were removed:

- `useCommandProcessor.ts` line 181-185: Initial save condition
- `useCommandProcessor.ts` line 398-403: Update response with 'completed' status
- `useCommandProcessor.ts` line 478-483: Update response with 'error' status
- `useHistoryManager.ts` line 172-176: Save to Turso history

## Additional Enhancement: Dual-Table Save for Registered Users

### Problem
When a registered user logs in with `--user`, the system was only saving to `history_user` table. This meant machine-level history tracking was incomplete.

### Solution
Modified `TursoAdapter.saveQuestionWithStatusAndRequestId()` and `updateWithResponseAndStatus()` to save to BOTH tables when a registered user is active:

**Save operation** (line 505-521):
```typescript
if (this.userId && this.userId !== 'default') {
  // Save to user table first
  entryId = await this.tursoClient.saveToUser(command, null, { ... });

  // Also save to machine table for machine-level history
  await this.tursoClient.saveToMachine(command, null, {
    user_id: this.userId,  // Track which user made this command
    ...
  });
}
```

**Update operation** (line 695-708):
```typescript
if (this.userId && this.userId !== 'default') {
  // Update user table
  await this.tursoClient.updateUserEntry(entryId, { ... });

  // Also update machine table
  await this.tursoClient.client.execute({
    sql: 'UPDATE history_machine SET ... WHERE machine_id = ? AND user_id = ? ...',
    args: [response, status, ..., this.userId, ...]
  });
}
```

### Benefits
1. **User History**: User can see their personal history across any machine
2. **Machine History**: Machine tracks all commands from all users
3. **Audit Trail**: Complete machine-level audit trail with user attribution
4. **Analytics**: Can analyze machine usage patterns by user

## Status
✅ Implemented and tested successfully
✅ Default user now uses 'machine' mode without validation
✅ History correctly filtered by user_id IS NULL
✅ Turso saves now work for default user (canSaveToTurso = true)
✅ Registered users now save to BOTH history_user AND history_machine tables
