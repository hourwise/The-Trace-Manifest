---
title: "Create a reproducible Python project with uv, Ruff, and pytest"
category: development-tools
difficulty: beginner
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10
  - Windows 11
tested_versions:
  python: "3.13.14"
  uv: "0.11.29"
  ruff: "Current locked project version"
  pytest: "Current locked project version"
estimated_cost: "Free"
destructive_steps: true
network_exposure: false
credentials_required: false
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "uv project guide"
    url: "https://docs.astral.sh/uv/guides/projects/"
    relationship: instruction-source
  - name: "uv project commands"
    url: "https://docs.astral.sh/uv/reference/cli/#uv-init"
    relationship: instruction-source
  - name: "Ruff tutorial"
    url: "https://docs.astral.sh/ruff/tutorial/"
    relationship: instruction-source
  - name: "pytest getting started"
    url: "https://docs.pytest.org/en/stable/getting-started.html"
    relationship: verification-source
---

# Create a reproducible Python project with uv, Ruff, and pytest

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a small Python project pinned to Python 3.13, add linting and tests as development dependencies, generate a lockfile, and prove that the project can be rebuilt from locked dependencies.

## Who this is for

This guide is for beginners who already installed uv and a managed Python 3.13 runtime.

It demonstrates a small local project rather than packaging a public library or deploying a service.

## Requirements and expected cost

- uv installed.
- Python 3.13.14 available through uv.
- Git recommended.
- Internet access to resolve and download packages.
- Cost: free.

## Tested environment and version scope

The project runtime is pinned to Python 3.13.14. Ruff and pytest are resolved through uv and recorded in `uv.lock`.

## Before you begin

Choose a new folder name. The rollback step deletes the entire demonstration folder, so do not reuse the name of an existing project.

## Step-by-step instructions

### Step 1: Create the project

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: A parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-python-demo and starter project files
# Port exposure: None
# Downloads code: No package download expected during initialisation
# Variables to replace: You may replace trace-python-demo with another new folder name
uv init trace-python-demo --python 3.13.14
Set-Location trace-python-demo
```

Expected output: uv reports that the project was initialised.

### Step 2: Inspect generated files

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
Get-ChildItem -Force
Get-Content .\pyproject.toml
```

Expected result: `pyproject.toml`, a Python version declaration, and starter source files.

### Step 3: Add Ruff and pytest as development dependencies

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Creates .venv and uv.lock; updates pyproject.toml
# Port exposure: None
# Downloads code: Yes, Python wheels and metadata
# Variables to replace: None
uv add --dev ruff pytest
```

Expected output: dependencies resolved, downloaded, and locked.

### Step 4: Create a small module

Create `calculator.py`:

```python
# File-write safety record:
# OS: Any; file: project-root calculator.py
# Writes/deletes: Creates one source file
# Port exposure: None
# Downloads code: No
# Variables to replace: None

def add(left: int, right: int) -> int:
    """Return the sum of two integers."""
    return left + right
```

### Step 5: Create a test

Create `test_calculator.py`:

```python
# File-write safety record:
# OS: Any; file: project-root test_calculator.py
# Writes/deletes: Creates one test file
# Port exposure: None
# Downloads code: No
# Variables to replace: None

from calculator import add


def test_add() -> None:
    assert add(2, 3) == 5
```

### Step 6: Run linting and tests

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Ruff and pytest may write cache directories
# Port exposure: None
# Downloads code: No when the environment is synchronised
# Variables to replace: None
uv run ruff check .
uv run pytest
```

Expected output:

- Ruff reports no errors.
- pytest reports one passing test.

### Step 7: Verify formatting without changing files

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None; --check does not rewrite source
# Port exposure: None
# Downloads code: No
# Variables to replace: None
uv run ruff format --check .
```

Expected output: files are already formatted or a clear list of files requiring formatting.

To apply formatting deliberately, remove `--check` after reviewing the diff.

### Step 8: Confirm the lockfile can reproduce the environment

The following command removes the current virtual environment and recreates it from the lockfile. It is intentionally destructive to `.venv` only.

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Permanently deletes .venv, then recreates it from uv.lock
# Port exposure: None
# Downloads code: May re-download missing cached packages
# Variables to replace: None
Remove-Item -LiteralPath .\.venv -Recurse -Force
uv sync --locked
uv run pytest
```

Expected output: the environment is recreated and the test still passes.

### Step 9: Inspect source-control changes

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
git status --short
```

Expected output: project files and `uv.lock`; `.venv` should be ignored by the generated `.gitignore`.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `uv run python --version` | Python 3.13.14. | Runs project interpreter. |
| `uv run ruff check .` | No lint errors. | Reads source; may write cache. |
| `uv run ruff format --check .` | Formatting passes. | Inspection only. |
| `uv run pytest` | One test passes. | Executes local test code. |
| `uv sync --locked` | Environment matches `uv.lock`. | Rewrites `.venv`; downloads locked packages if absent. |

## Security checks

- Commit `pyproject.toml`, `.python-version`, source files, tests, and `uv.lock`.
- Do not commit `.venv`, caches, credentials, or local environment files.
- Review lockfile changes before merging.
- Avoid `--allow-insecure-host`.
- Treat test code and build hooks from unfamiliar projects as executable code.
- Run projects as an ordinary user, not Administrator.
- Add secret scanning before a public push.

## Common errors

### `No solution found`

A dependency may not support Python 3.13 or may conflict with another requirement. Read the resolver explanation instead of forcing incompatible versions.

### pytest cannot import `calculator`

Confirm both files are in the project root and that the filename is exactly `calculator.py`.

### Ruff reports a formatting difference

Run `uv run ruff format .`, then inspect the Git diff before committing.

## How to undo or remove it

Move to the parent folder, verify the exact path, and delete the demonstration project:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Parent of trace-python-demo
# Admin: Not required
# Writes/deletes: Permanently deletes the entire demonstration project
# Port exposure: None
# Downloads code: No
# Variables to replace: Replace the folder name only if you used a different new project name
Remove-Item -LiteralPath .\trace-python-demo -Recurse -Force
```

## What to do next

Add type checking, package structure, CI, and a project-specific security scanner only when the project requires them.

## Sources

- [uv project guide](https://docs.astral.sh/uv/guides/projects/) — Project environments, dependency groups, locking, and synchronisation.
- [uv project commands](https://docs.astral.sh/uv/reference/cli/#uv-init) — Project initialisation and Python pinning.
- [Ruff tutorial](https://docs.astral.sh/ruff/tutorial/) — Lint and formatting commands.
- [pytest getting started](https://docs.pytest.org/en/stable/getting-started.html) — Test discovery and basic assertions.
