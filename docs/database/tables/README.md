# Database Tables Documentation

## Overview

Complete documentation of all tables in the MCP Terminal Turso/LibSQL database.

## Database Schema Diagram

```
+-------------+         +-----------------+
|   users     |         |    machines     |
+-------------+         +-----------------+
| id (PK)     |         | machine_id (PK) |
| username    |<---+    | hostname        |
| name        |    |    | ip_address      |
| email       |    |    | os_info         |
| created_at  |    |    | first_seen      |
| updated_at  |    |    | last_seen       |
| is_active   |    |    | total_commands  |
+-------------+    |    +-----------------+
       ^           |           ^
       |           |           |
       |    +------+           |
       |    |                  |
+------+----+-------+    +-----+----------+
| history_global    |    | history_machine|
+-------------------+    +----------------+
| id (PK)           |    | id (PK)        |
| command           |    | machine_id (FK)|
| response          |    | command        |
| machine_id (FK)   |    | response       |
| user_id (FK)      |    | user_id (FK)   |
| timestamp         |    | timestamp      |
| tokens_used       |    | error_code     |
| execution_time_ms |    | session_id     |
| tags              |    | status         |
| session_id        |    | request_id     |
| status            |    | updated_at     |
| request_id        |    | completed_at   |
| updated_at        |    +----------------+
| completed_at      |
+-------------------+
       ^
       |
+------+------------+
| history_user      |
+-------------------+
| id (PK)           |
| user_id (FK)      |
| command           |
| response          |
| machine_id (FK)   |
| timestamp         |
| session_id        |
| context           |
| tokens_used       |
| execution_time_ms |
| status            |
| request_id        |
| updated_at        |
| completed_at      |
+-------------------+

+-------------------+    +-----------------+
| command_cache     |    |    sessions     |
+-------------------+    +-----------------+
| command_hash (PK) |    | id (PK)         |
| command           |    | machine_id (FK) |
| output            |    | user_id (FK)    |
| machine_id        |    | started_at      |
| last_executed     |    | ended_at        |
| execution_count   |    | command_count   |
| avg_exec_time_ms  |    +-----------------+
+-------------------+
```

## Tables Summary

| Table | Rows | Purpose | Key Indexes |
|-------|------|---------|-------------|
| [`users`](./users.md) | ~10-1K | User accounts | username (UNIQUE) |
| [`machines`](./machines.md) | ~1-100 | Registered devices | machine_id (PK) |
| [`history_global`](./history_global.md) | ~10K-1M | All command history | timestamp, machine_id, status, request_id |
| [`history_user`](./history_user.md) | ~10K-1M | Per-user history | user_id+timestamp, status, request_id (UNIQUE) |
| [`history_machine`](./history_machine.md) | ~10K-1M | Per-machine history | machine_id+timestamp, status |
| [`command_cache`](./command_cache.md) | ~100-10K | Cached outputs | machine_id+last_executed |
| [`sessions`](./sessions.md) | ~100-10K | Active sessions | machine_id+started_at |

## Quick Reference

### Entity Tables
- **[users](./users.md)** - User accounts with authentication info
- **[machines](./machines.md)** - Registered devices/machines

### History Tables (Partitioned)
- **[history_global](./history_global.md)** - Global view (all users, all machines)
- **[history_user](./history_user.md)** - Per-user partition (with UNIQUE request_id)
- **[history_machine](./history_machine.md)** - Per-machine partition (with error_code)

### Performance Tables
- **[command_cache](./command_cache.md)** - Command output caching
- **[sessions](./sessions.md)** - Session grouping and context

## Relationships

### Foreign Keys

```
users.id
  ├─> history_global.user_id
  ├─> history_user.user_id
  ├─> history_machine.user_id
  └─> sessions.user_id

machines.machine_id
  ├─> history_global.machine_id
  ├─> history_user.machine_id
  ├─> history_machine.machine_id
  └─> sessions.machine_id

sessions.id (soft references)
  ├─> history_global.session_id
  ├─> history_user.session_id
  └─> history_machine.session_id

command_cache.machine_id (soft reference, no FK)
  └─> machines.machine_id
```

## Design Patterns

### 1. History Partitioning

The history is stored in three tables for different query patterns:

| Table | Use Case | Partition Key | Best For |
|-------|----------|---------------|----------|
| `history_global` | System-wide analytics | None | Cross-user/machine queries |
| `history_user` | User's personal history | `user_id` | User-specific queries |
| `history_machine` | Machine diagnostics | `machine_id` | Machine-specific queries |

### 2. Async Processing Pattern

All history tables use the same async pattern:

1. **Insert**: `status = 'pending'`, `request_id = unique_id`
2. **Process**: AI generates response
3. **Update**: `status = 'completed'`, `response = '...'`, `completed_at = now()`

### 3. Soft References

Some relationships use soft references (no FK constraint):
- `*.session_id` → `sessions.id`
- `command_cache.machine_id` → `machines.machine_id`

This allows cleanup without cascading deletes.

## Index Strategy

### Timestamp Indexes (DESC for recent first)
```sql
-- Most queries need recent records first
CREATE INDEX idx_*_timestamp ON *(timestamp DESC);
```

### Composite Indexes (Partition + Timestamp)
```sql
-- Partition-specific queries
CREATE INDEX idx_*_lookup ON *(partition_key, timestamp DESC);
```

### Status Indexes (For async processing)
```sql
-- Find pending/failed requests
CREATE INDEX idx_*_status ON *(status, timestamp DESC);
```

### Request Tracking
```sql
-- Track specific requests
CREATE INDEX idx_*_request ON *(request_id);
```

## Common Query Patterns

### 1. Get Recent Global History

```sql
SELECT command, response, datetime(timestamp, 'unixepoch') as date
FROM history_global
ORDER BY timestamp DESC
LIMIT 50;
```

### 2. Get User's History

```sql
SELECT command, response, datetime(timestamp, 'unixepoch') as date
FROM history_user
WHERE user_id = ?
ORDER BY timestamp DESC
LIMIT 50;
```

### 3. Get Machine's History

```sql
SELECT command, response, error_code, datetime(timestamp, 'unixepoch') as date
FROM history_machine
WHERE machine_id = ?
ORDER BY timestamp DESC
LIMIT 50;
```

### 4. Find Pending Requests

```sql
SELECT request_id, command, timestamp
FROM history_global
WHERE status = 'pending'
ORDER BY timestamp ASC;
```

### 5. Check Cache

```sql
SELECT output FROM command_cache
WHERE command_hash = ?
    AND machine_id = ?
    AND last_executed > unixepoch() - 3600;  -- 1 hour TTL
```

## Maintenance

### Cleanup Old Records

```sql
-- Delete old completed history (90+ days)
DELETE FROM history_global
WHERE status = 'completed'
    AND timestamp < unixepoch() - 7776000;

DELETE FROM history_user
WHERE status = 'completed'
    AND timestamp < unixepoch() - 7776000;

DELETE FROM history_machine
WHERE status = 'completed'
    AND timestamp < unixepoch() - 7776000;
```

### Cleanup Expired Cache

```sql
-- Delete cache entries older than 24 hours
DELETE FROM command_cache
WHERE last_executed < unixepoch() - 86400;
```

### Close Expired Sessions

```sql
-- Auto-close sessions inactive for 1+ hours
UPDATE sessions
SET ended_at = unixepoch()
WHERE ended_at IS NULL
    AND started_at < unixepoch() - 3600;
```

## Performance Considerations

### Write Patterns
- **High Write Volume**: History tables (1000s per day)
- **Low Write Volume**: Users, Machines (10s per day)
- **Medium Write Volume**: Sessions, Cache (100s per day)

### Read Patterns
- **Hot Queries**: Recent history (last 24h)
- **Warm Queries**: User/Machine specific (last 7 days)
- **Cold Queries**: Analytics, search (30+ days)

### Optimization Tips

1. **Use Composite Indexes**: `(partition_key, timestamp DESC)`
2. **Limit Results**: Always use `LIMIT` on history queries
3. **Filter by Status**: Use status indexes for pending/completed
4. **Cache Frequently Read Data**: Use `command_cache` table
5. **Archive Old Data**: Move old records to separate archive table

## Data Types

### TEXT Types
- **IDs**: Hex strings (32 chars) from `hex(randomblob(16))`
- **UUIDs**: Standard UUID format
- **Timestamps**: INTEGER (Unix epoch seconds)
- **JSON**: Stored as TEXT (parse in application)

### INTEGER Types
- **Timestamps**: Unix epoch (seconds since 1970-01-01)
- **Counters**: execution_count, command_count, total_commands
- **Metrics**: tokens_used, execution_time_ms, error_code

## Migration Notes

When adding new columns:
1. Use `ALTER TABLE ADD COLUMN` with default values
2. Update all three history tables consistently
3. Rebuild indexes if needed
4. Update application code to handle new fields

Example:
```sql
ALTER TABLE history_global ADD COLUMN new_field TEXT DEFAULT NULL;
ALTER TABLE history_user ADD COLUMN new_field TEXT DEFAULT NULL;
ALTER TABLE history_machine ADD COLUMN new_field TEXT DEFAULT NULL;
```

## See Also

- [Database Migrations Plan](../migrations.md)
- Individual table documentation in this directory
- Turso Documentation: https://docs.turso.tech/
