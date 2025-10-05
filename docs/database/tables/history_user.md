# Table: history_user

## Overview

Stores user-specific command history. Optimized for per-user queries and allows users to maintain private context separate from global history.

## CREATE Statement

```sql
CREATE TABLE history_user (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    user_id TEXT NOT NULL,
    command TEXT NOT NULL,
    response TEXT,
    machine_id TEXT,
    timestamp INTEGER DEFAULT (unixepoch()),
    session_id TEXT,
    context TEXT,
    tokens_used INTEGER,
    execution_time_ms INTEGER,
    status TEXT DEFAULT 'pending',
    request_id TEXT,
    updated_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
)
```

## Columns

| Column | Type | Nullable | Default | Primary Key | Description |
|--------|------|----------|---------|-------------|-------------|
| `id` | TEXT | YES | `hex(randomblob(16))` | YES | Auto-generated unique identifier |
| `user_id` | TEXT | NO | - | NO | User who executed the command (REQUIRED) |
| `command` | TEXT | NO | - | NO | User command/query text |
| `response` | TEXT | YES | NULL | NO | AI assistant response |
| `machine_id` | TEXT | YES | NULL | NO | Machine where command was executed |
| `timestamp` | INTEGER | YES | `unixepoch()` | NO | Unix timestamp when command was created |
| `session_id` | TEXT | YES | NULL | NO | Session identifier |
| `context` | TEXT | YES | NULL | NO | Additional context or metadata (JSON) |
| `tokens_used` | INTEGER | YES | NULL | NO | Number of API tokens consumed |
| `execution_time_ms` | INTEGER | YES | NULL | NO | Response generation time (milliseconds) |
| `status` | TEXT | YES | 'pending' | NO | Request status (pending, completed, error) |
| `request_id` | TEXT | YES | NULL | NO | Unique request identifier |
| `updated_at` | INTEGER | YES | NULL | NO | Last update timestamp |
| `completed_at` | INTEGER | YES | NULL | NO | Completion timestamp |

## Constraints

### Primary Key
- `id` - Auto-generated hex string

### NOT NULL Constraints
- `user_id` - Required field (partition key)
- `command` - Required field

### Foreign Keys
- `user_id` → `users.id`
- `machine_id` → `machines.machine_id`

## Indexes

```sql
CREATE INDEX idx_history_user_lookup
    ON history_user(user_id, timestamp DESC);

CREATE INDEX idx_history_user_status
    ON history_user(status, timestamp DESC);

CREATE INDEX idx_history_user_request
    ON history_user(request_id);

CREATE UNIQUE INDEX idx_history_user_request_unique
    ON history_user(request_id);
```

### Index Usage

| Index | Purpose | Query Pattern |
|-------|---------|---------------|
| `idx_history_user_lookup` | User-specific history (PRIMARY) | `WHERE user_id = ? ORDER BY timestamp DESC` |
| `idx_history_user_status` | Filter by processing status | `WHERE status = ? ORDER BY timestamp DESC` |
| `idx_history_user_request` | Track specific request (non-unique) | `WHERE request_id = ?` |
| `idx_history_user_request_unique` | Ensure request uniqueness | Constraint enforcement |

## Foreign Keys

| Column | References | On Update | On Delete | Description |
|--------|------------|-----------|-----------|-------------|
| `user_id` | `users.id` | NO ACTION | NO ACTION | User who owns this history entry |
| `machine_id` | `machines.machine_id` | NO ACTION | NO ACTION | Machine where command was executed |

## Related Tables

**References:**
- `users` (via `user_id`)
- `machines` (via `machine_id`)

**Related tables:**
- `history_global` - All commands
- `history_machine` - Machine-specific history
- `sessions` - Session grouping

## Usage Notes

- **User Isolation**: Each user has their own history partition
- **Context Field**: Stores additional metadata like working directory, environment
- **Request Uniqueness**: `idx_history_user_request_unique` ensures no duplicate requests
- **Multi-machine**: User can have history across multiple machines
- **Privacy**: User history can be kept private from global analytics

## Key Differences from history_global

| Feature | history_user | history_global |
|---------|-------------|----------------|
| **Partition** | Per user | All users |
| **user_id** | NOT NULL | Nullable |
| **context field** | YES | NO (uses tags) |
| **Unique request_id** | YES | NO |
| **Primary use** | User's personal history | System-wide analytics |

## Example Queries

### 1. Get user's recent history

```sql
SELECT
    command,
    response,
    datetime(timestamp, 'unixepoch') as when_asked,
    tokens_used,
    status
FROM history_user
WHERE user_id = 'user123'
ORDER BY timestamp DESC
LIMIT 50;
```

### 2. Insert new user command

```sql
INSERT INTO history_user (
    id, user_id, command, machine_id, session_id, status, request_id
)
VALUES (
    hex(randomblob(16)),
    'user123',
    'How do I compress files?',
    'machine-abc',
    'session-xyz',
    'pending',
    'req-unique-456'
);
```

### 3. Update with response

```sql
UPDATE history_user
SET response = 'Use tar or gzip...',
    status = 'completed',
    tokens_used = 200,
    execution_time_ms = 1500,
    updated_at = unixepoch(),
    completed_at = unixepoch()
WHERE request_id = 'req-unique-456';
```

### 4. Search user's command history

```sql
SELECT
    command,
    response,
    datetime(timestamp, 'unixepoch') as date
FROM history_user
WHERE user_id = 'user123'
    AND command LIKE '%git%'
    AND status = 'completed'
ORDER BY timestamp DESC;
```

### 5. Get user statistics

```sql
SELECT
    user_id,
    COUNT(*) as total_commands,
    SUM(tokens_used) as total_tokens,
    AVG(execution_time_ms) as avg_time,
    MIN(timestamp) as first_command,
    MAX(timestamp) as last_command
FROM history_user
WHERE user_id = 'user123';
```

### 6. Find pending requests for user

```sql
SELECT
    request_id,
    command,
    datetime(timestamp, 'unixepoch') as created,
    (unixepoch() - timestamp) as age_seconds
FROM history_user
WHERE user_id = 'user123'
    AND status = 'pending'
ORDER BY timestamp ASC;
```

### 7. User activity across machines

```sql
SELECT
    machine_id,
    COUNT(*) as commands_on_machine,
    MAX(datetime(timestamp, 'unixepoch')) as last_used
FROM history_user
WHERE user_id = 'user123'
GROUP BY machine_id
ORDER BY commands_on_machine DESC;
```

### 8. Delete old user history

```sql
DELETE FROM history_user
WHERE user_id = 'user123'
    AND status = 'completed'
    AND timestamp < unixepoch() - 7776000;  -- Older than 90 days
```
