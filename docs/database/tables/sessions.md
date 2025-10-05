# Table: sessions

## Overview

Tracks user sessions for grouping related commands and maintaining conversation context.

## CREATE Statement

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL,
    user_id TEXT,
    started_at INTEGER DEFAULT (unixepoch()),
    ended_at INTEGER,
    command_count INTEGER DEFAULT 0,
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
)
```

## Columns

| Column | Type | Nullable | Default | Primary Key | Description |
|--------|------|----------|---------|-------------|-------------|
| `id` | TEXT | YES | - | YES | Session identifier (UUID or generated ID) |
| `machine_id` | TEXT | NO | - | NO | Machine where session is active |
| `user_id` | TEXT | YES | NULL | NO | User owning the session (optional) |
| `started_at` | INTEGER | YES | `unixepoch()` | NO | Unix timestamp when session started |
| `ended_at` | INTEGER | YES | NULL | NO | Unix timestamp when session ended (NULL = active) |
| `command_count` | INTEGER | YES | 0 | NO | Total commands executed in this session |

## Constraints

### Primary Key
- `id` - Session identifier (typically UUID)

### NOT NULL Constraints
- `machine_id` - Required field

### Foreign Keys
- `machine_id` → `machines.machine_id`
- `user_id` → `users.id`

## Indexes

```sql
CREATE INDEX idx_sessions_machine
    ON sessions(machine_id, started_at DESC);
```

### Index Usage

| Index | Purpose | Query Pattern |
|-------|---------|---------------|
| `idx_sessions_machine` | Machine-specific session lookup | `WHERE machine_id = ? ORDER BY started_at DESC` |

## Foreign Keys

| Column | References | On Update | On Delete | Description |
|--------|------------|-----------|-----------|-------------|
| `machine_id` | `machines.machine_id` | NO ACTION | NO ACTION | Machine hosting the session |
| `user_id` | `users.id` | NO ACTION | NO ACTION | User who owns the session |

## Related Tables

**References:**
- `machines` (via `machine_id`)
- `users` (via `user_id`)

**Referenced by:**
- `history_global.session_id` → `sessions.id` (soft reference)
- `history_user.session_id` → `sessions.id` (soft reference)
- `history_machine.session_id` → `sessions.id` (soft reference)

## Usage Notes

- **Active Sessions**: `ended_at IS NULL` indicates active session
- **Session Lifecycle**: Create on first command, update `command_count`, close with `ended_at`
- **Context Grouping**: Groups related commands for conversation continuity
- **Multi-user**: Machine can have multiple concurrent sessions from different users
- **Session Duration**: Calculate as `ended_at - started_at` (or `unixepoch() - started_at` for active)

## Session States

| State | Condition | Description |
|-------|-----------|-------------|
| **Active** | `ended_at IS NULL` | Session is currently open |
| **Closed** | `ended_at IS NOT NULL` | Session has been terminated |
| **Expired** | `ended_at IS NULL AND started_at < threshold` | Active session older than timeout |

## Example Queries

### 1. Create new session

```sql
INSERT INTO sessions (id, machine_id, user_id, started_at)
VALUES (
    'session-uuid-123',
    'machine-abc',
    'user456',
    unixepoch()
);
```

### 2. Get active sessions

```sql
SELECT
    id,
    machine_id,
    user_id,
    datetime(started_at, 'unixepoch') as started,
    (unixepoch() - started_at) as duration_seconds,
    command_count
FROM sessions
WHERE ended_at IS NULL
ORDER BY started_at DESC;
```

### 3. Close session

```sql
UPDATE sessions
SET ended_at = unixepoch()
WHERE id = 'session-uuid-123';
```

### 4. Increment command count

```sql
UPDATE sessions
SET command_count = command_count + 1
WHERE id = 'session-uuid-123'
    AND ended_at IS NULL;
```

### 5. Get user's recent sessions

```sql
SELECT
    id,
    datetime(started_at, 'unixepoch') as started,
    datetime(ended_at, 'unixepoch') as ended,
    (ended_at - started_at) as duration_seconds,
    command_count
FROM sessions
WHERE user_id = 'user456'
ORDER BY started_at DESC
LIMIT 20;
```

### 6. Find machine's active session

```sql
SELECT id, user_id, started_at, command_count
FROM sessions
WHERE machine_id = 'machine-abc'
    AND ended_at IS NULL
ORDER BY started_at DESC
LIMIT 1;
```

### 7. Get session statistics

```sql
SELECT
    user_id,
    COUNT(*) as total_sessions,
    AVG(ended_at - started_at) as avg_duration_seconds,
    SUM(command_count) as total_commands,
    AVG(command_count) as avg_commands_per_session
FROM sessions
WHERE ended_at IS NOT NULL  -- Only completed sessions
GROUP BY user_id
ORDER BY total_sessions DESC;
```

### 8. Find expired sessions (timeout cleanup)

```sql
SELECT id, machine_id, user_id, started_at
FROM sessions
WHERE ended_at IS NULL
    AND started_at < unixepoch() - 3600  -- Active for > 1 hour
ORDER BY started_at ASC;
```

### 9. Auto-close expired sessions

```sql
UPDATE sessions
SET ended_at = unixepoch()
WHERE ended_at IS NULL
    AND started_at < unixepoch() - 3600;  -- Timeout after 1 hour
```

### 10. Get session with command details

```sql
SELECT
    s.id as session_id,
    s.started_at,
    s.ended_at,
    s.command_count,
    h.command,
    h.response,
    h.timestamp
FROM sessions s
LEFT JOIN history_user h ON h.session_id = s.id
WHERE s.id = 'session-uuid-123'
ORDER BY h.timestamp ASC;
```

### 11. Clean old sessions

```sql
DELETE FROM sessions
WHERE ended_at IS NOT NULL
    AND ended_at < unixepoch() - 2592000;  -- Older than 30 days
```

### 12. Get longest sessions

```sql
SELECT
    id,
    user_id,
    datetime(started_at, 'unixepoch') as started,
    datetime(ended_at, 'unixepoch') as ended,
    (ended_at - started_at) as duration_seconds,
    command_count
FROM sessions
WHERE ended_at IS NOT NULL
ORDER BY (ended_at - started_at) DESC
LIMIT 10;
```

## Session Management Flow

```
1. User starts CLI
   └─> INSERT INTO sessions (id, machine_id, user_id)

2. User executes commands
   └─> UPDATE sessions SET command_count = command_count + 1
   └─> INSERT INTO history_* (session_id = ...)

3. User exits CLI or timeout
   └─> UPDATE sessions SET ended_at = unixepoch()

4. Cleanup job (periodic)
   └─> Auto-close expired sessions
   └─> DELETE old completed sessions
```

## Session Timeout Strategy

```sql
-- Example: Auto-close sessions inactive for 30 minutes
UPDATE sessions
SET ended_at = unixepoch()
WHERE ended_at IS NULL
    AND id NOT IN (
        SELECT DISTINCT session_id
        FROM history_global
        WHERE timestamp > unixepoch() - 1800  -- Last 30 min
            AND session_id IS NOT NULL
    );
```
