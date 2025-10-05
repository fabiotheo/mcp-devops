# Table: machines

## Overview

Stores machine/device information for tracking which machines are running the MCP Terminal assistant.

## CREATE Statement

```sql
CREATE TABLE machines (
    machine_id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    ip_address TEXT,
    os_info TEXT,
    first_seen INTEGER DEFAULT (unixepoch()),
    last_seen INTEGER DEFAULT (unixepoch()),
    total_commands INTEGER DEFAULT 0
)
```

## Columns

| Column | Type | Nullable | Default | Primary Key | Description |
|--------|------|----------|---------|-------------|-------------|
| `machine_id` | TEXT | YES | - | YES | Unique machine identifier (hardware-based hash) |
| `hostname` | TEXT | NO | - | NO | Machine hostname |
| `ip_address` | TEXT | YES | NULL | NO | Current IP address |
| `os_info` | TEXT | YES | NULL | NO | Operating system information (platform, version, arch) |
| `first_seen` | INTEGER | YES | `unixepoch()` | NO | Unix timestamp when machine was first registered |
| `last_seen` | INTEGER | YES | `unixepoch()` | NO | Unix timestamp of last activity |
| `total_commands` | INTEGER | YES | 0 | NO | Total number of commands executed on this machine |

## Constraints

### Primary Key
- `machine_id` - Hardware-based unique identifier

### NOT NULL Constraints
- `hostname` - Required field

## Indexes

No additional indexes (only implicit index on PRIMARY KEY `machine_id`).

## Foreign Keys

None.

## Related Tables

**Referenced by:**
- `history_global.machine_id` → `machines.machine_id`
- `history_user.machine_id` → `machines.machine_id`
- `history_machine.machine_id` → `machines.machine_id`
- `command_cache.machine_id` → `machines.machine_id` (no FK constraint)
- `sessions.machine_id` → `machines.machine_id`

## Usage Notes

- `machine_id` is generated based on hardware identifiers (CPU, MAC, etc.)
- `hostname` is the system hostname (e.g., from `os.hostname()`)
- `os_info` stores JSON or string with platform details
- `last_seen` should be updated on each command execution
- `total_commands` is incremented for usage statistics

## Example Queries

### Register new machine

```sql
INSERT INTO machines (machine_id, hostname, ip_address, os_info)
VALUES (
    'abc123def456',
    'macbook-pro.local',
    '192.168.1.100',
    '{"platform":"darwin","version":"24.6.0","arch":"arm64"}'
)
ON CONFLICT(machine_id) DO UPDATE SET
    last_seen = unixepoch(),
    ip_address = excluded.ip_address;
```

### Update last seen timestamp

```sql
UPDATE machines
SET last_seen = unixepoch(),
    total_commands = total_commands + 1
WHERE machine_id = 'abc123def456';
```

### Find machine by hostname

```sql
SELECT * FROM machines
WHERE hostname LIKE '%macbook%';
```

### List recently active machines

```sql
SELECT
    machine_id,
    hostname,
    ip_address,
    datetime(last_seen, 'unixepoch') as last_activity,
    total_commands
FROM machines
WHERE last_seen > unixepoch() - 86400  -- Last 24 hours
ORDER BY last_seen DESC;
```

### Get machine statistics

```sql
SELECT
    COUNT(*) as total_machines,
    SUM(total_commands) as all_commands,
    AVG(total_commands) as avg_commands_per_machine
FROM machines
WHERE last_seen > unixepoch() - 2592000;  -- Last 30 days
```
