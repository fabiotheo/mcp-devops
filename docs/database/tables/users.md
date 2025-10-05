# Table: users

## Overview

Stores user account information for the MCP Terminal system.

## CREATE Statement

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    is_active BOOLEAN DEFAULT 1
)
```

## Columns

| Column | Type | Nullable | Default | Primary Key | Description |
|--------|------|----------|---------|-------------|-------------|
| `id` | TEXT | YES | `hex(randomblob(16))` | YES | Auto-generated unique identifier (hex string, 32 chars) |
| `username` | TEXT | NO | - | NO | Unique username for login |
| `name` | TEXT | NO | - | NO | Full display name |
| `email` | TEXT | YES | NULL | NO | Optional email address |
| `created_at` | INTEGER | YES | `unixepoch()` | NO | Unix timestamp when user was created |
| `updated_at` | INTEGER | YES | `unixepoch()` | NO | Unix timestamp of last update |
| `is_active` | BOOLEAN | YES | 1 | NO | Account active status (1=active, 0=inactive) |

## Constraints

### Primary Key
- `id` - Auto-generated hex string (32 characters)

### Unique Constraints
- `username` - Must be unique across all users

### NOT NULL Constraints
- `username` - Required field
- `name` - Required field

## Indexes

No additional indexes (only implicit index on PRIMARY KEY `id` and UNIQUE `username`).

## Foreign Keys

None.

## Related Tables

**Referenced by:**
- `history_global.user_id` → `users.id`
- `history_user.user_id` → `users.id`
- `history_machine.user_id` → `users.id`
- `sessions.user_id` → `users.id`

## Usage Notes

- `id` is auto-generated using SQLite's `randomblob()` function
- `username` must be unique and is typically the system username
- `is_active` allows soft-deletion of users without removing history
- Timestamps are stored as Unix epoch (seconds since 1970-01-01)
- Email is optional to support users without configured email

## Example Queries

### Insert new user

```sql
INSERT INTO users (username, name, email)
VALUES ('johndoe', 'John Doe', 'john@example.com');
```

### Find user by username

```sql
SELECT * FROM users WHERE username = 'johndoe';
```

### Deactivate user

```sql
UPDATE users
SET is_active = 0, updated_at = unixepoch()
WHERE username = 'johndoe';
```

### List all active users

```sql
SELECT id, username, name, email
FROM users
WHERE is_active = 1
ORDER BY created_at DESC;
```
