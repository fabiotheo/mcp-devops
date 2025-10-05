# Table: command_cache

## Overview

Caches command outputs to avoid redundant executions. Improves performance by storing frequently executed command results.

## CREATE Statement

```sql
CREATE TABLE command_cache (
    command_hash TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    output TEXT,
    machine_id TEXT,
    last_executed INTEGER,
    execution_count INTEGER DEFAULT 1,
    avg_execution_time_ms INTEGER
)
```

## Columns

| Column | Type | Nullable | Default | Primary Key | Description |
|--------|------|----------|---------|-------------|-------------|
| `command_hash` | TEXT | YES | - | YES | Hash of command + machine_id (unique key) |
| `command` | TEXT | NO | - | NO | Original command text |
| `output` | TEXT | YES | NULL | NO | Cached command output |
| `machine_id` | TEXT | YES | NULL | NO | Machine where command was cached |
| `last_executed` | INTEGER | YES | NULL | NO | Unix timestamp of last execution |
| `execution_count` | INTEGER | YES | 1 | NO | Number of times command was executed |
| `avg_execution_time_ms` | INTEGER | YES | NULL | NO | Average execution time (milliseconds) |

## Constraints

### Primary Key
- `command_hash` - Hash of `command + machine_id`

### NOT NULL Constraints
- `command` - Required field

## Indexes

```sql
CREATE INDEX idx_command_cache_lookup
    ON command_cache(machine_id, last_executed DESC);
```

### Index Usage

| Index | Purpose | Query Pattern |
|-------|---------|---------------|
| `idx_command_cache_lookup` | Machine-specific cache lookup | `WHERE machine_id = ? ORDER BY last_executed DESC` |

## Foreign Keys

None (soft reference to `machines.machine_id`).

## Related Tables

**Soft references:**
- `machines` (via `machine_id` - no FK constraint)

## Usage Notes

- **Cache Key**: `command_hash` should be generated as `hash(command + machine_id)`
- **TTL**: Cache entries should have expiration logic based on `last_executed`
- **Invalidation**: Update `last_executed` and increment `execution_count` on cache hit
- **Performance**: Reduces redundant command executions
- **Machine-specific**: Same command can have different outputs per machine

## Cache Strategy

### When to Cache
- Idempotent commands (e.g., `ls`, `ps`, `df`)
- Frequently repeated queries
- Commands with stable output

### When NOT to Cache
- Time-sensitive commands (e.g., `date`, `uptime`)
- Commands with side effects (e.g., `rm`, `mv`)
- User-specific commands that change state

## Example Queries

### 1. Check if command is cached

```sql
SELECT output, last_executed, execution_count
FROM command_cache
WHERE command_hash = 'abc123def456'
    AND machine_id = 'machine-xyz'
    AND last_executed > unixepoch() - 3600;  -- Cache valid for 1 hour
```

### 2. Insert new cache entry

```sql
INSERT INTO command_cache (
    command_hash,
    command,
    output,
    machine_id,
    last_executed,
    execution_count,
    avg_execution_time_ms
)
VALUES (
    'abc123def456',
    'ls -la /var/log',
    'drwxr-xr-x  5 root root...',
    'machine-xyz',
    unixepoch(),
    1,
    250
)
ON CONFLICT(command_hash) DO UPDATE SET
    output = excluded.output,
    last_executed = excluded.last_executed,
    execution_count = execution_count + 1,
    avg_execution_time_ms = (
        (avg_execution_time_ms * execution_count + excluded.avg_execution_time_ms)
        / (execution_count + 1)
    );
```

### 3. Update cache on hit

```sql
UPDATE command_cache
SET last_executed = unixepoch(),
    execution_count = execution_count + 1
WHERE command_hash = 'abc123def456';
```

### 4. Get frequently cached commands

```sql
SELECT
    command,
    execution_count,
    datetime(last_executed, 'unixepoch') as last_used,
    avg_execution_time_ms
FROM command_cache
WHERE machine_id = 'machine-xyz'
ORDER BY execution_count DESC
LIMIT 20;
```

### 5. Clean expired cache entries

```sql
DELETE FROM command_cache
WHERE last_executed < unixepoch() - 86400;  -- Older than 24 hours
```

### 6. Get cache statistics

```sql
SELECT
    COUNT(*) as total_cached_commands,
    SUM(execution_count) as total_cache_hits,
    AVG(avg_execution_time_ms) as avg_time,
    MAX(execution_count) as max_hits
FROM command_cache
WHERE machine_id = 'machine-xyz';
```

### 7. Find slow commands

```sql
SELECT
    command,
    avg_execution_time_ms,
    execution_count
FROM command_cache
WHERE avg_execution_time_ms > 1000  -- Slower than 1 second
ORDER BY avg_execution_time_ms DESC
LIMIT 10;
```

### 8. Invalidate specific command cache

```sql
DELETE FROM command_cache
WHERE command LIKE '%docker%'
    AND machine_id = 'machine-xyz';
```

## Hash Generation Example (TypeScript)

```typescript
import crypto from 'crypto';

function generateCommandHash(command: string, machineId: string): string {
  const data = `${command}:${machineId}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Usage
const hash = generateCommandHash('ls -la', 'machine-xyz');
// hash: '8f7a4e2b1c...'
```

## Cache Hit Rate Calculation

```sql
-- Get cache effectiveness
SELECT
    machine_id,
    COUNT(*) as unique_commands,
    SUM(execution_count) as total_executions,
    ROUND((SUM(execution_count) - COUNT(*)) * 100.0 / SUM(execution_count), 2) as cache_hit_rate_percent
FROM command_cache
GROUP BY machine_id
ORDER BY cache_hit_rate_percent DESC;
```
