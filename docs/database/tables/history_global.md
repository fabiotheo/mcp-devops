# Table: history_global

## Overview

Stores global command history - all commands executed across all machines and users. This is the primary table for system-wide analytics and search.

## CREATE Statement

```sql
CREATE TABLE history_global (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    command TEXT NOT NULL,
    response TEXT,
    machine_id TEXT,
    user_id TEXT,
    timestamp INTEGER DEFAULT (unixepoch()),
    tokens_used INTEGER,
    execution_time_ms INTEGER,
    tags TEXT,
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
| `command` | TEXT | NO | - | NO | User command/query text |
| `response` | TEXT | YES | NULL | NO | AI assistant response |
| `machine_id` | TEXT | YES | NULL | NO | Machine where command was executed |
| `user_id` | TEXT | YES | NULL | NO | User who executed the command |
| `timestamp` | INTEGER | YES | `unixepoch()` | NO | Unix timestamp when command was created |
| `tokens_used` | INTEGER | YES | NULL | NO | Number of API tokens consumed |
| `execution_time_ms` | INTEGER | YES | NULL | NO | Time taken to generate response (milliseconds) |
| `tags` | TEXT | YES | NULL | NO | Comma-separated tags or JSON array |
| `session_id` | TEXT | YES | NULL | NO | Session identifier |
| `status` | TEXT | YES | 'pending' | NO | Request status (pending, completed, error) |
| `request_id` | TEXT | YES | NULL | NO | Unique request identifier |
| `updated_at` | INTEGER | YES | NULL | NO | Last update timestamp |
| `completed_at` | INTEGER | YES | NULL | NO | Completion timestamp |

## Constraints

### Primary Key
- `id` - Auto-generated hex string

### NOT NULL Constraints
- `command` - Required field

### Foreign Keys
- `machine_id` → `machines.machine_id`
- `user_id` → `users.id`

## Indexes

```sql
CREATE INDEX idx_history_global_timestamp
    ON history_global(timestamp DESC);

CREATE INDEX idx_history_global_machine
    ON history_global(machine_id, timestamp DESC);

CREATE INDEX idx_history_global_status
    ON history_global(status, timestamp DESC);

CREATE INDEX idx_history_global_request
    ON history_global(request_id);
```

### Index Usage

| Index | Purpose | Query Pattern |
|-------|---------|---------------|
| `idx_history_global_timestamp` | Recent commands across all machines | `ORDER BY timestamp DESC` |
| `idx_history_global_machine` | Machine-specific history | `WHERE machine_id = ? ORDER BY timestamp DESC` |
| `idx_history_global_status` | Filter by status | `WHERE status = ? ORDER BY timestamp DESC` |
| `idx_history_global_request` | Track specific request | `WHERE request_id = ?` |

## Foreign Keys

| Column | References | On Update | On Delete | Description |
|--------|------------|-----------|-----------|-------------|
| `machine_id` | `machines.machine_id` | NO ACTION | NO ACTION | Machine that executed command |
| `user_id` | `users.id` | NO ACTION | NO ACTION | User who executed command |

## Related Tables

**References:**
- `machines` (via `machine_id`)
- `users` (via `user_id`)

**Related tables:**
- `history_user` - User-specific history
- `history_machine` - Machine-specific history
- `sessions` - Session grouping

## Usage Notes

- This table contains ALL commands from all users and machines
- `status` tracks async processing: 'pending' → 'completed' or 'error'
- `request_id` allows tracking specific requests across tables
- `tags` can store JSON array or comma-separated values
- `response` is populated after AI processing completes
- Use `timestamp DESC` indexes for chronological queries

## Typical Workflows

### 1. Insert pending command

```sql
INSERT INTO history_global (
    id, command, machine_id, user_id, session_id, status, request_id
)
VALUES (
    hex(randomblob(16)),
    'How do I list files?',
    'abc123',
    'user456',
    'session789',
    'pending',
    'req-12345'
);
```

### 2. Update with response

```sql
UPDATE history_global
SET response = 'Use the `ls` command to list files...',
    status = 'completed',
    tokens_used = 150,
    execution_time_ms = 1200,
    updated_at = unixepoch(),
    completed_at = unixepoch()
WHERE request_id = 'req-12345';
```

### 3. Query recent global history

```sql
SELECT
    id,
    command,
    response,
    datetime(timestamp, 'unixepoch') as executed_at,
    tokens_used,
    status
FROM history_global
ORDER BY timestamp DESC
LIMIT 50;
```

### 4. Search commands by keyword

```sql
SELECT
    command,
    response,
    datetime(timestamp, 'unixepoch') as when_asked
FROM history_global
WHERE command LIKE '%docker%'
    AND status = 'completed'
ORDER BY timestamp DESC
LIMIT 20;
```

### 5. Get statistics by machine

```sql
SELECT
    machine_id,
    COUNT(*) as total_commands,
    SUM(tokens_used) as total_tokens,
    AVG(execution_time_ms) as avg_time_ms
FROM history_global
WHERE status = 'completed'
    AND timestamp > unixepoch() - 2592000  -- Last 30 days
GROUP BY machine_id
ORDER BY total_commands DESC;
```

### 6. Find pending requests

```sql
SELECT
    request_id,
    command,
    datetime(timestamp, 'unixepoch') as created_at,
    (unixepoch() - timestamp) as age_seconds
FROM history_global
WHERE status = 'pending'
ORDER BY timestamp ASC;
```

### 7. Clean old completed records

```sql
DELETE FROM history_global
WHERE status = 'completed'
    AND timestamp < unixepoch() - 7776000;  -- Older than 90 days
```
