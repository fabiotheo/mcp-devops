# Table: history_machine

## Overview

Stores machine-specific command history. Optimized for per-machine queries, useful for tracking device usage patterns and error diagnostics.

## CREATE Statement

```sql
CREATE TABLE history_machine (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    machine_id TEXT NOT NULL,
    command TEXT NOT NULL,
    response TEXT,
    user_id TEXT,
    timestamp INTEGER DEFAULT (unixepoch()),
    error_code INTEGER,
    session_id TEXT,
    status TEXT DEFAULT 'pending',
    request_id TEXT,
    updated_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
)
```

## Columns

| Column | Type | Nullable | Default | Primary Key | Description |
|--------|------|----------|---------|-------------|-------------|
| `id` | TEXT | YES | `hex(randomblob(16))` | YES | Auto-generated unique identifier |
| `machine_id` | TEXT | NO | - | NO | Machine identifier (REQUIRED) |
| `command` | TEXT | NO | - | NO | Command or query text |
| `response` | TEXT | YES | NULL | NO | AI assistant response |
| `user_id` | TEXT | YES | NULL | NO | User who executed the command |
| `timestamp` | INTEGER | YES | `unixepoch()` | NO | Unix timestamp when command was created |
| `error_code` | INTEGER | YES | NULL | NO | Shell exit code or error identifier |
| `session_id` | TEXT | YES | NULL | NO | Session identifier |
| `status` | TEXT | YES | 'pending' | NO | Request status (pending, completed, error) |
| `request_id` | TEXT | YES | NULL | NO | Unique request identifier |
| `updated_at` | INTEGER | YES | NULL | NO | Last update timestamp |
| `completed_at` | INTEGER | YES | NULL | NO | Completion timestamp |

## Constraints

### Primary Key
- `id` - Auto-generated hex string

### NOT NULL Constraints
- `machine_id` - Required field (partition key)
- `command` - Required field

### Foreign Keys
- `machine_id` → `machines.machine_id`
- `user_id` → `users.id`

## Indexes

```sql
CREATE INDEX idx_history_machine_lookup
    ON history_machine(machine_id, timestamp DESC);

CREATE INDEX idx_history_machine_status
    ON history_machine(status, timestamp DESC);
```

### Index Usage

| Index | Purpose | Query Pattern |
|-------|---------|---------------|
| `idx_history_machine_lookup` | Machine-specific history (PRIMARY) | `WHERE machine_id = ? ORDER BY timestamp DESC` |
| `idx_history_machine_status` | Filter by processing status | `WHERE status = ? ORDER BY timestamp DESC` |

## Foreign Keys

| Column | References | On Update | On Delete | Description |
|--------|------------|-----------|-----------|-------------|
| `machine_id` | `machines.machine_id` | NO ACTION | NO ACTION | Machine that executed command |
| `user_id` | `users.id` | NO ACTION | NO ACTION | User who executed command (optional) |

## Related Tables

**References:**
- `machines` (via `machine_id`)
- `users` (via `user_id`)

**Related tables:**
- `history_global` - All commands
- `history_user` - User-specific history
- `command_cache` - Cached command outputs
- `sessions` - Session grouping

## Usage Notes

- **Machine Isolation**: Each machine has its own history partition
- **Error Tracking**: `error_code` stores shell exit codes for failed commands
- **Multi-user**: Machine history can include commands from multiple users
- **Diagnostics**: Useful for debugging machine-specific issues

## Key Differences from Other History Tables

| Feature | history_machine | history_user | history_global |
|---------|----------------|--------------|----------------|
| **Partition** | Per machine | Per user | All |
| **machine_id** | NOT NULL | Nullable | Nullable |
| **user_id** | Nullable | NOT NULL | Nullable |
| **error_code** | YES | NO | NO |
| **context** | NO | YES | NO |
| **Primary use** | Machine diagnostics | User's personal history | System analytics |

## Example Queries

### 1. Get machine's recent history

```sql
SELECT
    command,
    response,
    error_code,
    datetime(timestamp, 'unixepoch') as when_executed,
    status
FROM history_machine
WHERE machine_id = 'machine-abc'
ORDER BY timestamp DESC
LIMIT 50;
```

### 2. Insert new machine command

```sql
INSERT INTO history_machine (
    id, machine_id, command, user_id, error_code, status, request_id
)
VALUES (
    hex(randomblob(16)),
    'machine-abc',
    'ls -la /var/log',
    'user123',
    0,  -- Success
    'pending',
    'req-789'
);
```

### 3. Update with response

```sql
UPDATE history_machine
SET response = 'drwxr-xr-x  5 root root...',
    status = 'completed',
    updated_at = unixepoch(),
    completed_at = unixepoch()
WHERE request_id = 'req-789';
```

### 4. Find failed commands on machine

```sql
SELECT
    command,
    error_code,
    response,
    datetime(timestamp, 'unixepoch') as failed_at
FROM history_machine
WHERE machine_id = 'machine-abc'
    AND error_code != 0
    AND error_code IS NOT NULL
ORDER BY timestamp DESC
LIMIT 20;
```

### 5. Get machine statistics

```sql
SELECT
    machine_id,
    COUNT(*) as total_commands,
    COUNT(CASE WHEN error_code = 0 THEN 1 END) as successful,
    COUNT(CASE WHEN error_code != 0 THEN 1 END) as failed,
    MIN(timestamp) as first_command,
    MAX(timestamp) as last_command
FROM history_machine
WHERE machine_id = 'machine-abc';
```

### 6. Find pending requests for machine

```sql
SELECT
    request_id,
    command,
    datetime(timestamp, 'unixepoch') as created,
    (unixepoch() - timestamp) as age_seconds
FROM history_machine
WHERE machine_id = 'machine-abc'
    AND status = 'pending'
ORDER BY timestamp ASC;
```

### 7. Machine activity by user

```sql
SELECT
    user_id,
    COUNT(*) as commands_by_user,
    MAX(datetime(timestamp, 'unixepoch')) as last_used
FROM history_machine
WHERE machine_id = 'machine-abc'
    AND user_id IS NOT NULL
GROUP BY user_id
ORDER BY commands_by_user DESC;
```

### 8. Most common errors on machine

```sql
SELECT
    error_code,
    COUNT(*) as error_count,
    MAX(command) as example_command
FROM history_machine
WHERE machine_id = 'machine-abc'
    AND error_code IS NOT NULL
    AND error_code != 0
GROUP BY error_code
ORDER BY error_count DESC
LIMIT 10;
```

### 9. Clean old machine history

```sql
DELETE FROM history_machine
WHERE machine_id = 'machine-abc'
    AND status = 'completed'
    AND timestamp < unixepoch() - 7776000;  -- Older than 90 days
```

### 10. Search machine history by pattern

```sql
SELECT
    command,
    response,
    error_code,
    datetime(timestamp, 'unixepoch') as date
FROM history_machine
WHERE machine_id = 'machine-abc'
    AND command LIKE '%docker%'
ORDER BY timestamp DESC;
```
