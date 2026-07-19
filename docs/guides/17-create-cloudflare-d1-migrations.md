---
title: "Create and apply Cloudflare D1 migrations with a local-first safety gate"
category: development-tools
difficulty: advanced
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 11
tested_versions:
  node: "24.x LTS"
  wrangler: "4.x"
  d1: "Production storage backend"
estimated_cost: "Free-tier use available; storage and query charges may apply"
destructive_steps: true
network_exposure: true
credentials_required: true
root_required: false
downloads_executable: false
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Cloudflare D1 getting started"
    url: "https://developers.cloudflare.com/d1/get-started/"
    relationship: instruction-source
  - name: "D1 migrations"
    url: "https://developers.cloudflare.com/d1/reference/migrations/"
    relationship: instruction-source
  - name: "D1 Wrangler commands"
    url: "https://developers.cloudflare.com/d1/wrangler-commands/"
    relationship: instruction-source
  - name: "D1 Time Travel"
    url: "https://developers.cloudflare.com/d1/reference/time-travel/"
    relationship: rollback-source
  - name: "D1 import and export"
    url: "https://developers.cloudflare.com/d1/best-practices/import-export-data/"
    relationship: backup-source
---

# Create and apply Cloudflare D1 migrations with a local-first safety gate

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a D1 database, bind it to a Worker project, write a versioned migration, apply and verify it locally, capture a remote recovery bookmark and SQL export, and only then apply the migration remotely.

## Who this is for

This guide is for developers who already have a reviewed Cloudflare Worker project with project-local Wrangler and authenticated Cloudflare access.

It is not a zero-downtime production migration strategy. The example creates one table in a demonstration database.

## Requirements and expected cost

- Windows 11.
- Node.js 24 LTS.
- Wrangler 4.x installed in the Worker project.
- A Cloudflare account and Worker project.
- Cost: free-tier use is available, but review D1 billing and limits.

## Tested environment and version scope

The guide targets D1's production storage subsystem and current migration commands. D1 commands use local storage by default unless `--remote` is specified.

## Before you begin

Commit or back up the Worker project.

Use a new demonstration database name. Applying a remote migration modifies cloud data and may be irreversible through ordinary SQL. D1 Time Travel provides point-in-time recovery for supported production databases, but restoration is itself destructive.

Use the database name in migration commands rather than only the binding name; Cloudflare notes that binding names can change.

## Step-by-step instructions

### Step 1: Verify account and project state

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Outbound HTTPS for account lookup
# Downloads code: No
# Variables to replace: None
npx wrangler whoami
git status --short --branch
Get-Content .\wrangler.jsonc
```

Expected result: intended Cloudflare account, clean or understood Git state, and reviewed Worker configuration.

### Step 2: Create a new remote D1 database

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Creates an empty remote D1 database
# Port exposure: Outbound HTTPS to Cloudflare; no public listener
# Downloads code: No
# Variables to replace: Replace trace-guide-db with a unique demonstration database name
npx wrangler d1 create trace-guide-db
```

Expected output: database name, UUID, and a configuration block.

Copy the returned values into `wrangler.jsonc`:

```jsonc
// File-write safety record:
// OS: Any; file: project-root wrangler.jsonc
// Writes/deletes: Adds a D1 binding; does not change database content
// Port exposure: None
// Downloads code: No
// Variables to replace: Replace YOUR_DATABASE_ID with the returned UUID

{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "trace-guide-db",
      "database_id": "YOUR_DATABASE_ID",
      "migrations_dir": "migrations"
    }
  ]
}
```

Merge this block with existing configuration rather than replacing unrelated fields.

### Step 3: Generate the first migration file

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Creates a numbered SQL migration under migrations
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npx wrangler d1 migrations create trace-guide-db create_notes
```

Expected output: path to a new migration file.

Edit that generated file:

```sql
-- File-write safety record:
-- OS: Any; file: generated migrations/*.sql
-- Writes/deletes: Defines a new table when applied
-- Port exposure: None
-- Downloads code: No
-- Variables to replace: None

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notes_created_at ON notes(created_at);
```

### Step 4: Review migration status and SQL

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
Get-Content .\migrations\*.sql
npx wrangler d1 migrations list trace-guide-db --local
git diff
```

Expected result: one unapplied local migration and only the intended files.

### Step 5: Apply the migration locally

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Creates or modifies the local D1 database and migration tracking table
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npx wrangler d1 migrations apply trace-guide-db --local
```

Expected output: the migration is applied to local D1 state.

### Step 6: Verify local schema and data operations

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: First command reads schema; second inserts one local demonstration row; third reads it
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npx wrangler d1 execute trace-guide-db --local --command "PRAGMA table_info(notes);"
npx wrangler d1 execute trace-guide-db --local --command "INSERT INTO notes (title, body) VALUES ('Local test', 'Migration works');"
npx wrangler d1 execute trace-guide-db --local --command "SELECT id, title, created_at FROM notes;"
```

Expected output: table columns and one local row.

### Step 7: Run the Worker locally against D1

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: May write local Wrangler state
# Port exposure: Opens loopback Worker development port
# Downloads code: May download runtime components
# Variables to replace: None
npx wrangler dev --ip 127.0.0.1
```

Expected result: Worker starts and any D1-backed route behaves correctly. Stop with `Ctrl+C`.

### Step 8: Capture a remote recovery bookmark and export

Confirm the remote database uses the production backend:

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Writes a SQL export file; database itself is read
# Port exposure: Outbound HTTPS to Cloudflare
# Downloads code: Downloads database schema and data as SQL
# Variables to replace: None
npx wrangler d1 info trace-guide-db
npx wrangler d1 time-travel info trace-guide-db
New-Item -ItemType Directory -Path .\backups -Force
npx wrangler d1 export trace-guide-db --remote --output=.\backups\before-first-migration.sql
```

Expected output:

- database version is `production`;
- current Time Travel bookmark;
- SQL export written locally.

The export can temporarily block other database requests. Do not commit exports containing private data.

### Step 9: Review remote pending migrations

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Outbound HTTPS to Cloudflare
# Downloads code: No
# Variables to replace: None
npx wrangler d1 migrations list trace-guide-db --remote
```

Expected output: the reviewed migration is pending remotely.

### Step 10: Apply the migration remotely

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Modifies the remote D1 schema and migration table
# Port exposure: Outbound HTTPS to Cloudflare; application availability may be affected by migration behaviour
# Downloads code: No
# Variables to replace: None
npx wrangler d1 migrations apply trace-guide-db --remote
```

Read the confirmation and verify the database name before accepting.

### Step 11: Verify remote schema without inserting data

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Outbound HTTPS to Cloudflare
# Downloads code: No
# Variables to replace: None
npx wrangler d1 execute trace-guide-db --remote --command "PRAGMA table_info(notes);"
npx wrangler d1 migrations list trace-guide-db --remote
```

Expected result: `notes` schema exists and no migrations remain pending.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `migrations list --local` | Migration state understood locally. | Local read. |
| `migrations apply --local` | Local schema updated. | Modifies disposable local D1. |
| `d1 time-travel info` | Recovery bookmark captured. | Remote read. |
| `d1 export --remote` | SQL export file created. | Remote read; can briefly block requests. |
| `migrations apply --remote` | Reviewed migration applied. | Destructive remote schema write. |
| Remote `PRAGMA table_info` | Expected columns. | Remote read. |

## Security checks

- Use the database name for migration commands.
- Apply locally and test before remote execution.
- Review every SQL statement, including ORM-generated SQL.
- Capture a Time Travel bookmark and export before significant change.
- Never commit exports containing user or customer data.
- Avoid unbounded `UPDATE` or `DELETE`.
- Plan compatibility between old application code and new schema.
- Keep production and preview databases separate.
- Restrict CI tokens to the exact account and permissions required.
- Do not run remote commands from an unfamiliar branch or AI-generated script without review.

## Common errors

### Migration applies locally but fails remotely

Remote schema or migration history may differ. Inspect the remote migration table and schema rather than editing history blindly.

### Binding points to the wrong database

Compare `database_name` and `database_id` in `wrangler.jsonc` with the Cloudflare dashboard before applying.

### Export fails because of virtual tables

Cloudflare documents limitations for exports containing virtual tables such as FTS5. Use an appropriate specialised backup plan.

## How to undo or remove it

A remote Time Travel restore overwrites the database in place and cancels in-flight operations. Use it only after incident review and with the exact pre-migration bookmark:

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Destructively restores the entire remote database to an earlier state
# Port exposure: Outbound HTTPS to Cloudflare
# Downloads code: No
# Variables to replace: Replace PRE_MIGRATION_BOOKMARK with the recorded value
npx wrangler d1 time-travel restore trace-guide-db --bookmark=PRE_MIGRATION_BOOKMARK
```

Cloudflare returns a previous bookmark that can be used to undo the restore. Record it immediately.

Deleting the demonstration database should be done in the Cloudflare dashboard only after confirming no Worker or data still depends on it.

## What to do next

Add typed D1 bindings, application-level prepared statements, integration tests, and an explicit production migration runbook.

## Sources

- [Cloudflare D1 getting started](https://developers.cloudflare.com/d1/get-started/) — Database creation, bindings, local state, and first queries.
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) — Versioned migration files, tracking, directories, and database-name guidance.
- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) — Current local, remote, migration, execution, and Time Travel commands.
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) — Recovery bookmarks and destructive restore behaviour.
- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) — SQL export commands and limitations.
