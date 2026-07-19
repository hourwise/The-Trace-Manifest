---
title: "Run PostgreSQL 18 locally with Docker Compose and loopback-only access"
category: development-tools
difficulty: intermediate
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  docker_desktop: "4.68.x"
  postgresql: "18.4"
  compose: "Docker Compose v2"
estimated_cost: "Free software; local storage and electricity apply"
destructive_steps: true
network_exposure: true
credentials_required: true
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "PostgreSQL Docker Official Image"
    url: "https://hub.docker.com/_/postgres"
    relationship: instruction-source
  - name: "Docker Compose networking"
    url: "https://docs.docker.com/compose/how-tos/networking/"
    relationship: instruction-source
  - name: "Docker Compose environment variables"
    url: "https://docs.docker.com/compose/how-tos/environment-variables/"
    relationship: security-source
  - name: "PostgreSQL 18 documentation"
    url: "https://www.postgresql.org/docs/18/"
    relationship: version-source
---

# Run PostgreSQL 18 locally with Docker Compose and loopback-only access

**Status:** Draft — not published or indexed.

## What you will achieve

You will run PostgreSQL 18.4 in a Docker container, persist its data in a named volume, require password authentication, and publish the database only on Windows loopback at `127.0.0.1:5432`.

## Who this is for

This guide is for developers who need an isolated local PostgreSQL database.

It is not a production database, backup strategy, high-availability design, or guide to exposing PostgreSQL to another computer.

## Requirements and expected cost

- Docker Desktop running Linux containers.
- Git recommended.
- About 1 GB free disk space to begin.
- A generated local development password.
- Cost: free software.

## Tested environment and version scope

The Compose file pins PostgreSQL 18.4. PostgreSQL 18 uses `/var/lib/postgresql` as the image volume root, with a version-specific `PGDATA` path managed by the image.

## Before you begin

Choose an empty folder. Do not reuse a Compose project connected to important data.

The final removal command can permanently delete the named database volume. The guide separates ordinary container shutdown from volume deletion.

## Step-by-step instructions

### Step 1: Create the project folder

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: A parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-postgres-local
# Port exposure: None
# Downloads code: No
# Variables to replace: You may replace trace-postgres-local with another new folder name
New-Item -ItemType Directory -Path .\trace-postgres-local
Set-Location .\trace-postgres-local
```

Expected output: a new empty directory.

### Step 2: Generate a local password file

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Creates .env containing a generated local password
# Port exposure: None
# Downloads code: No
# Variables to replace: None
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = [Convert]::ToBase64String($bytes)
"POSTGRES_PASSWORD=$password" | Set-Content -Encoding utf8 .env
```

Expected output: no terminal output. The `.env` file contains a random development password.

Create `.gitignore`:

```gitignore
# File-write safety record:
# OS: Any; file: project-root .gitignore
# Writes/deletes: Creates or updates ignore rules
# Port exposure: None
# Downloads code: No
# Variables to replace: None

.env
backups/
```

### Step 3: Create `compose.yaml`

```yaml
# File-write safety record:
# OS: Any; file: project-root compose.yaml
# Writes/deletes: Defines a container and named volume; no action until Docker Compose runs
# Port exposure: Publishes PostgreSQL only to Windows loopback at 127.0.0.1:5432
# Downloads code: The image will be downloaded when started
# Variables to replace: None

services:
  db:
    image: postgres:18.4-alpine
    container_name: trace-postgres-local
    restart: unless-stopped
    environment:
      POSTGRES_USER: trace_app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
      POSTGRES_DB: trace_dev
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --data-checksums"
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trace_app -d trace_dev"]
      interval: 5s
      timeout: 5s
      retries: 10
    security_opt:
      - no-new-privileges:true

volumes:
  postgres_data:
```

The environment values initialise the database only when the data directory is empty. Changing them later does not change an existing database password.

### Step 4: Validate the Compose model before starting it

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: May read and interpolate .env; no containers created
# Port exposure: None
# Downloads code: No
# Variables to replace: None
docker compose config --quiet
docker compose config --services
```

Expected output: no validation error and one service named `db`.

Do not publish the fully interpolated `docker compose config` output because it can include the password.

### Step 5: Pull the pinned image and inspect it

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Downloads and stores the PostgreSQL image
# Port exposure: None
# Downloads code: Yes, Docker Official Image layers
# Variables to replace: None
docker compose pull
docker image inspect postgres:18.4-alpine --format "{{json .RepoDigests}}"
```

Expected output: image downloaded and a content digest displayed.

### Step 6: Start the database

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Creates a container, named volume, database cluster, user, and database
# Port exposure: Opens 127.0.0.1:5432 on the local Windows machine only
# Downloads code: No additional image expected after pull
# Variables to replace: None
docker compose up -d
```

Expected output: container created and started.

### Step 7: Wait for health and verify SQL

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Executes a read-only SQL query inside the container
# Port exposure: Uses Docker's internal container execution; no new port
# Downloads code: No
# Variables to replace: None
docker compose ps
docker compose exec db psql -U trace_app -d trace_dev -c "SELECT version(), current_database(), current_user;"
```

Expected output: healthy service and PostgreSQL 18.4 details.

### Step 8: Verify the Windows listener address

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Inspects port 5432; opens nothing
# Downloads code: No
# Variables to replace: None
Get-NetTCPConnection -LocalPort 5432 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Expected output: `127.0.0.1` for the published listener, not `0.0.0.0` or a LAN address.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `docker compose config --quiet` | Compose file is valid. | Inspection only. |
| `docker compose ps` | Database is healthy. | Local engine query. |
| `docker compose exec db psql ...` | PostgreSQL 18.4, `trace_dev`, `trace_app`. | Read-only SQL inside container. |
| `Get-NetTCPConnection -LocalPort 5432` | Loopback-only listener. | Inspection only. |

## Security checks

- Never use `POSTGRES_HOST_AUTH_METHOD=trust`.
- Do not commit `.env`.
- Do not publish `5432:5432` without an explicit loopback address.
- Use a non-production password and separate database.
- Treat image tags as mutable; record the resolved digest for higher-assurance work.
- Do not mount the Docker socket or unrelated host directories.
- Back up the database before destructive schema changes.
- Keep PostgreSQL patch versions current.
- Do not assume a Docker container is appropriate for hostile database extensions.

## Common errors

### `port is already allocated`

Another database or container is using 5432. Stop it or change the host side to `127.0.0.1:5433:5432`.

### Password changes have no effect

The official image initialises credentials only on an empty data directory. Change the password with SQL or deliberately recreate the volume for disposable development data.

### Data disappears after container recreation

Confirm the volume targets `/var/lib/postgresql` for PostgreSQL 18 and that `docker compose down -v` was not used.

## How to undo or remove it

Stop and remove the container while preserving database data:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Removes the container and network; preserves the named volume
# Port exposure: Closes 127.0.0.1:5432
# Downloads code: No
# Variables to replace: None
docker compose down
```

To permanently delete the disposable database volume:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Permanently deletes the container, network, and all data in the named volume
# Port exposure: Closes the database port
# Downloads code: No
# Variables to replace: None
docker compose down --volumes
```

Confirm that no important data remains before using `--volumes`.

## What to do next

Create migrations using the application's migration tool, add a backup command, and use a separate database user with narrower privileges for the application.

## Sources

- [PostgreSQL Docker Official Image](https://hub.docker.com/_/postgres) — Image variables, authentication warnings, Docker secrets, and PostgreSQL 18 volume path.
- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) — Service networking and host-port publication.
- [Docker Compose environment variables](https://docs.docker.com/compose/how-tos/environment-variables/) — `.env` interpolation and configuration.
- [PostgreSQL 18 documentation](https://www.postgresql.org/docs/18/) — Current PostgreSQL 18 behaviour and SQL reference.
