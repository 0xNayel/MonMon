# MonMon — Architecture & Feature Reference

> Complete technical documentation for the MonMon project.
> Last updated: March 2026

---

## Table of Contents

- [System Overview](#system-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Monitoring Engine](#monitoring-engine)
  - [Command Monitor](#1-command-monitor)
  - [Endpoint Monitor](#2-endpoint-monitor)
  - [Subdomain Monitor](#3-subdomain-monitor)
  - [Bbscope Monitor](#4-bbscope-monitor)
- [Diff Engine](#diff-engine)
- [Scheduling System](#scheduling-system)
- [Alert System](#alert-system)
- [Authentication & Authorization](#authentication--authorization)
- [API Reference](#api-reference)
- [CLI Reference](#cli-reference)
- [Web Dashboard](#web-dashboard)
- [Theme System](#theme-system)
- [Self-Update System](#self-update-system)
- [Configuration](#configuration)
- [Logging System](#logging-system)
- [Data Retention](#data-retention)
- [Docker & Deployment](#docker--deployment)
- [CI/CD Pipeline](#cicd-pipeline)

---

## System Overview

MonMon is a diff-based monitoring system designed for bug bounty hunters. It continuously runs recon tasks — shell commands, HTTP endpoint polling, subdomain discovery, and bug bounty scope checks — compares each output to the previous run, generates unified diffs, and delivers alerts through Slack, Discord, Telegram, or custom webhooks.

**Core design principles:**

- **Single binary** — Go backend with embedded React SPA, SQLite database, zero external services required
- **Diff everything** — Every task output is hashed, diffed, and versioned. First-time line detection checks against the full task history, not just the previous run
- **Plugin-free monitors** — Four built-in monitor types cover the primary bug bounty recon workflows without needing external plugins
- **Real-time UI** — WebSocket log streaming, animated dashboard stats, multi-theme interface with View Transitions API

```
┌─────────────────────────────────────────────────────────┐
│                      MonMon Binary                       │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐              │
│  │ Gin API  │  │ Scheduler │  │  Alert   │              │
│  │ Server   │──│  (cron +  │──│ Manager  │──► Slack     │
│  │          │  │   loop)   │  │          │──► Discord   │
│  └────┬─────┘  └─────┬─────┘  └──────────┘──► Telegram  │
│       │              │                    ──► Webhook   │
│  ┌────┴─────┐  ┌─────┴─────────────────┐               │
│  │ Embedded │  │       Monitors         │               │
│  │ React    │  │ ┌─────┐ ┌────┐ ┌────┐ │               │
│  │ SPA      │  │ │ cmd │ │http│ │sub │ │               │
│  └──────────┘  │ └─────┘ └────┘ └────┘ │               │
│                │ ┌─────────┐            │               │
│  ┌──────────┐  │ │ bbscope │            │               │
│  │ SQLite   │  │ └─────────┘            │               │
│  │ (WAL)    │  └────────────────────────┘               │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | Go 1.25 | Backend, CLI, monitors |
| Web Framework | Gin | REST API, middleware, CORS |
| ORM | GORM | Database abstraction, migrations |
| Database | SQLite (WAL mode) | Data storage via `glebarez/sqlite` (pure Go, no CGO) |
| Auth | JWT (HS256) + bcrypt | Token-based auth with 24h expiry |
| Scheduler | robfig/cron v3 | Cron expressions and loop intervals |
| Diff | sergi/go-diff | Line-by-line unified diff generation |
| Logging | zerolog | Structured logging to console, file, and DB |
| CLI | cobra | Command-line interface |
| Config | viper | YAML config with env var override |
| WebSocket | gorilla/websocket | Real-time log streaming |
| Alerts | projectdiscovery/notify | Multi-provider notification delivery |
| Frontend | React 18 + TypeScript | Single-page application |
| Routing | React Router v6 | Client-side routing |
| HTTP Client | Axios | API communication with JWT interceptor |
| Build | Vite | Frontend bundling |
| Embedding | go:embed | SPA served from binary |

---

## Project Structure

```
MonMon/
├── cmd/monmon/
│   └── main.go                    # CLI entry point — Cobra commands, server bootstrap
│
├── internal/
│   ├── api/
│   │   ├── router.go              # Gin router setup, middleware, route registration
│   │   ├── auth.go                # POST /api/login handler
│   │   ├── tasks.go               # Task CRUD + pause/resume/run handlers
│   │   ├── checks.go              # Check listing, output, diff, compare handlers
│   │   ├── alerts.go              # Alert CRUD + test handler
│   │   ├── logs.go                # Log listing + WebSocket streaming
│   │   ├── stats.go               # Dashboard statistics handler
│   │   └── system.go              # Tools check + version check handlers
│   │
│   ├── alert/
│   │   └── alert.go               # AlertManager — match alerts to checks, format + send
│   │
│   ├── auth/
│   │   └── auth.go                # AuthService — JWT generation/validation, user CRUD,
│   │                              #   credential sync, bcrypt, middleware
│   │
│   ├── config/
│   │   └── config.go              # Viper-based config loading (YAML + env vars)
│   │
│   ├── db/
│   │   └── db.go                  # SQLite init (WAL mode), GORM auto-migration
│   │
│   ├── diff/
│   │   └── diff.go                # Unified diff generation, line counting
│   │
│   ├── logger/
│   │   └── logger.go              # AppLogger — zerolog multi-writer (console + file + DB)
│   │
│   ├── models/
│   │   └── models.go              # GORM models: Task, Check, AlertConfig, Log, User
│   │                              #   + constants for types/statuses
│   │
│   ├── monitor/
│   │   ├── monitor.go             # Monitor interface definition
│   │   ├── command.go             # Shell command execution (stdout/file modes)
│   │   ├── endpoint.go            # HTTP polling (body/full/metadata/regex modes)
│   │   ├── subdomain.go           # subfinder → httpx pipeline (threaded)
│   │   └── bbscope.go             # HackerOne/Bugcrowd scope via bbscope
│   │
│   ├── scheduler/
│   │   └── scheduler.go           # Task scheduling (loop + cron), execution, diff + alert
│   │
│   ├── updater/
│   │   └── updater.go             # GitHub release checker + binary self-update
│   │
│   └── webui/
│       └── webui.go               # go:embed for React SPA dist files
│
├── web/                           # React + TypeScript source
│   ├── src/
│   │   ├── main.tsx               # React entry point + ThemeProvider wrapper
│   │   ├── App.tsx                # React Router setup (public + protected routes)
│   │   ├── api.ts                 # Axios instance with JWT interceptor
│   │   ├── utils.ts               # formatDuration, formatInterval, toSeconds
│   │   ├── themes.ts              # 6 theme definitions (colors, gradients, CSS vars)
│   │   ├── context/
│   │   │   └── ThemeContext.tsx    # Theme state, localStorage, View Transitions API
│   │   ├── components/
│   │   │   ├── Layout.tsx         # Sidebar, nav, theme picker, version, logout
│   │   │   └── ConfigForm.tsx     # Dynamic config editor per task type
│   │   └── pages/
│   │       ├── Login.tsx          # Login form
│   │       ├── Dashboard.tsx      # Stats cards + recent activity table
│   │       ├── Tasks.tsx          # Task list + create form
│   │       ├── TaskDetail.tsx     # Task detail + edit + check history
│   │       ├── DiffView.tsx       # Unified diff viewer (single + multi-URL)
│   │       ├── Alerts.tsx         # Alert config CRUD + edit + test
│   │       ├── Logs.tsx           # Log viewer with live WebSocket stream
│   │       └── System.tsx         # External tool status checker
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── configs/
│   ├── monmon.yaml                # Default server configuration
│   └── credentials.yaml           # User credentials (username:bcrypt_hash)
│
├── .github/workflows/
│   └── docker.yml                 # Docker Hub build + push CI
│
├── Dockerfile                     # Multi-stage: node → go → alpine
├── docker-compose.yml             # Docker Compose with volumes + env
├── Makefile                       # Build targets: web, build, dev, test, clean
├── go.mod / go.sum
└── README.md
```

---

## Database Schema

SQLite with WAL mode for concurrent reads. GORM handles auto-migration on startup.

### Users

| Column | Type | Notes |
|--------|------|-------|
| `id` | uint | Primary key, auto-increment |
| `username` | string | Unique |
| `password_hash` | string | bcrypt hash |
| `created_at` | timestamp | |

### Tasks

| Column | Type | Notes |
|--------|------|-------|
| `id` | uint | Primary key |
| `name` | string | Display name |
| `type` | string | `command` / `endpoint` / `subdomain` / `bbscope` |
| `status` | string | `active` / `paused` / `error` |
| `config` | text | JSON — structure depends on type |
| `schedule_type` | string | `loop` / `cron` |
| `schedule_value` | string | Seconds (loop) or cron expression |
| `tags` | string | Comma-separated tags |
| `data_retention` | int | 0 = keep all, N = keep last N checks |
| `last_check_at` | timestamp | Nullable |
| `total_checks` | int64 | Running counter |
| `total_changes` | int64 | Running counter |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Checks

| Column | Type | Notes |
|--------|------|-------|
| `id` | uint | Primary key |
| `task_id` | uint | Foreign key → Tasks |
| `version` | int | Auto-incremented per task |
| `status` | string | `success` / `changed` / `error` |
| `output_hash` | string | SHA256 of output |
| `output` | text | Full output text |
| `diff_text` | text | Unified diff (empty if unchanged) |
| `diff_added` | int | Lines added |
| `diff_removed` | int | Lines removed |
| `metadata` | text | JSON metadata |
| `duration_ms` | int64 | Execution time |
| `error_msg` | string | Error message (if status = error) |
| `created_at` | timestamp | |

### AlertConfigs

| Column | Type | Notes |
|--------|------|-------|
| `id` | uint | Primary key |
| `task_id` | uint | Nullable — NULL = global (all tasks) |
| `name` | string | Display name |
| `provider` | string | `slack` / `discord` / `telegram` / `custom` |
| `provider_config` | text | JSON with provider-specific fields |
| `enabled` | bool | Default true |
| `on_change` | bool | Alert on change, default true |
| `on_error` | bool | Alert on error, default false |
| `keyword_filter` | string | Only alert when output contains this string |
| `message_template` | text | Go text/template format, empty = use default |
| `created_at` | timestamp | |

### Logs

| Column | Type | Notes |
|--------|------|-------|
| `id` | uint | Primary key |
| `level` | string | `debug` / `info` / `warn` / `error` |
| `source` | string | `scheduler` / `api` / `server` / `auth` |
| `task_id` | uint | Nullable — links log to a specific task |
| `message` | string | |
| `created_at` | timestamp | Indexed for query performance |

---

## Monitoring Engine

All monitors implement the `Monitor` interface:

```go
type Monitor interface {
    Execute(config string) (output string, metadata map[string]interface{}, err error)
}
```

### 1. Command Monitor

**Purpose:** Execute any shell command and capture its output.

**Config:**
```json
{
  "command": "gau target.com | sort -u",
  "output_mode": "stdout",
  "output_file": "/tmp/output.txt",
  "timeout_sec": 120
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `command` | string | required | Shell command to execute |
| `output_mode` | string | `stdout` | `stdout` = capture combined stdout+stderr; `file` = read from output_file after execution |
| `output_file` | string | — | File path to read when mode = file |
| `timeout_sec` | int | 0 | Timeout in seconds (0 = no timeout) |

**Implementation details:**
- Uses `/bin/bash -c` on Unix, `cmd.exe /C` on Windows
- Combined stdout + stderr capture via `CombinedOutput()`
- Timeout via `context.WithTimeout` + `CommandContext`
- Killed processes return `"timeout: command killed after Xs"` as error
- File mode reads the file after command completes (useful for tools that write to files)

### 2. Endpoint Monitor

**Purpose:** Poll HTTP endpoints and diff the response.

**Config:**
```json
{
  "urls": ["https://target.com/api/v1/", "https://target.com/api/v2/"],
  "method": "GET",
  "headers": {"Authorization": "Bearer token123"},
  "body": "",
  "monitor_mode": "body",
  "metadata_fields": ["status_code", "content_length", "title"],
  "regex_pattern": "password|secret",
  "timeout_sec": 30
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `urls` | string[] | required | HTTP URLs to poll |
| `method` | string | `GET` | HTTP method |
| `headers` | map | — | Custom request headers |
| `body` | string | — | Request body |
| `monitor_mode` | string | `body` | See modes below |
| `metadata_fields` | string[] | — | Fields for metadata mode |
| `regex_pattern` | string | — | Pattern for regex mode |
| `timeout_sec` | int | 30 | Request timeout |

**Monitor modes:**

| Mode | Output |
|------|--------|
| `body` | Response body only |
| `full` | HTTP status line + all headers + body |
| `metadata` | JSON with `status_code`, `content_length`, `title` (extracted from HTML `<title>`) |
| `regex` | Lines matching `regex_pattern` only |

**Multi-URL behavior:**
- Each URL is fetched separately
- Output format: `[url]\ncontent\n---\n[next_url]\n...`
- Per-URL errors are logged but don't stop the batch
- Diff viewer shows per-URL sections with independent collapse/expand

### 3. Subdomain Monitor

**Purpose:** Continuous subdomain discovery using subfinder + httpx.

**Config:**
```json
{
  "domains": ["target.com", "sub.target.com"],
  "httpx_sc": true,
  "httpx_ct": false,
  "httpx_title": true,
  "httpx_td": true,
  "threads": 5
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `domains` | string[] | required | Target domains |
| `httpx_sc` | bool | false | Include HTTP status codes |
| `httpx_ct` | bool | false | Include content type |
| `httpx_title` | bool | false | Include page title |
| `httpx_td` | bool | false | Include technology detection |
| `threads` | int | 5 | Parallel processing threads |

**Pipeline:**
1. For each domain, run `subfinder -d <domain> -all -silent`
2. Pipe discovered subdomains through `httpx` with selected flags
3. Collect output lines, sort alphabetically for stable ordering
4. Key each line by URL so reordering doesn't create false positives

**Concurrency:** Processes domains in parallel using a semaphore channel limited by `threads`.

### 4. Bbscope Monitor

**Purpose:** Monitor HackerOne and Bugcrowd for scope changes.

**Config (HackerOne):**
```json
{
  "platform": "h1",
  "token": "your_api_token",
  "username": "your_h1_username",
  "bounty_only": false,
  "output_type": "tc"
}
```

**Config (Bugcrowd):**
```json
{
  "platform": "bc",
  "email": "your_email",
  "password": "your_password",
  "otp_command": "oathtool --totp -b YOUR_SECRET",
  "bounty_only": true,
  "output_type": "tc"
}
```

| Field | Type | Platform | Description |
|-------|------|----------|-------------|
| `platform` | string | both | `h1` (HackerOne) or `bc` (Bugcrowd) |
| `token` | string | h1 | HackerOne API token |
| `username` | string | h1 | HackerOne username (optional) |
| `email` | string | bc | Bugcrowd email |
| `password` | string | bc | Bugcrowd password |
| `otp_command` | string | bc | Shell command to generate OTP (e.g., oathtool) |
| `bounty_only` | bool | both | Only include bounty programs |
| `output_type` | string | both | Output format (e.g., `tc` = target + category) |

**Implementation:** Calls `bbscope` CLI (v1, NOT v2) with appropriate flags. Output is sorted for stable diffing.

---

## Diff Engine

Located in `internal/diff/diff.go`.

**Algorithm:** Uses `sergi/go-diff` for line-by-line comparison.

**Features:**

| Feature | Description |
|---------|-------------|
| Unified diff | Standard `+`/`-` format with context lines |
| Line counting | Counts `diff_added` and `diff_removed` per check |
| First-time detection | Each new `+` line is compared against the full output history of the task. A line is flagged as "first-time" only if it has never appeared in any previous check |
| Multi-URL sectioning | Endpoint monitors with multiple URLs get per-URL diff sections |
| Hash comparison | SHA256 hash of output — if hash matches previous check, skip diff entirely |

**Diff API response formats:**

Single-output:
```json
{
  "is_multi": false,
  "diff": "unified diff text",
  "first_time_lines": ["line1", "line2"],
  "first_time_added": 2
}
```

Multi-URL:
```json
{
  "is_multi": true,
  "sections": [
    {
      "url": "https://target.com/api",
      "has_changes": true,
      "added": 3,
      "removed": 1,
      "diff": "per-url diff text"
    }
  ],
  "total_added": 3,
  "total_removed": 1
}
```

---

## Scheduling System

Located in `internal/scheduler/scheduler.go`.

**Schedule types:**

| Type | Value | Example |
|------|-------|---------|
| `loop` | Interval in seconds | `300` = every 5 minutes |
| `cron` | 5-field cron expression | `*/15 * * * *` = every 15 minutes |

**Execution flow per task:**

```
1. Scheduler triggers task
2. Load task config from DB
3. Execute monitor (command/endpoint/subdomain/bbscope)
4. Hash output (SHA256)
5. Compare hash with previous check
6. If changed:
   a. Generate unified diff
   b. Count added/removed lines
   c. Check first-time lines against full history
   d. Create check record (status: changed)
   e. Trigger alerts
7. If unchanged:
   a. Create check record (status: success)
8. If error:
   a. Create check record (status: error, error_msg set)
   b. Trigger error alerts
9. Update task counters (total_checks, total_changes, last_check_at)
10. Apply data retention (delete old checks if configured)
```

**Concurrency:** Each task runs in its own goroutine. Context cancellation stops running tasks on shutdown.

**Dynamic reload:** When a task is updated via API, the scheduler cancels the old goroutine and starts a new one with updated config.

---

## Alert System

Located in `internal/alert/alert.go`.

### Alert Matching

When a check completes, the alert manager:

1. Queries all enabled `AlertConfig` records where:
   - `task_id` is NULL (global) OR matches the check's task_id
   - `on_change` is true AND check status is `changed`, OR
   - `on_error` is true AND check status is `error`
2. For each matching config:
   - If `keyword_filter` is set, check if the output contains the keyword
   - Format the message using the template (custom or default)
   - Send via the configured provider

### Providers

| Provider | Config Fields | Delivery |
|----------|--------------|----------|
| **Slack** | `webhook_url` | POST JSON `{"text": "message"}` to webhook |
| **Discord** | `webhook_url` | POST JSON `{"content": "message"}` to webhook |
| **Telegram** | `api_key`, `chat_id` | POST to `api.telegram.org/bot<key>/sendMessage` with Markdown |
| **Custom** | `url`, `method`, `content_type` | HTTP request with JSON body containing all check data |

### Message Templates

Uses Go `text/template` syntax. Available variables:

| Variable | Type | Description |
|----------|------|-------------|
| `{{.TaskName}}` | string | Task name |
| `{{.TaskType}}` | string | Task type (command/endpoint/subdomain/bbscope) |
| `{{.CheckStatus}}` | string | Check result (changed/error/success) |
| `{{.CheckVersion}}` | int | Check version number |
| `{{.DurationMs}}` | int64 | Execution time in milliseconds |
| `{{.DiffAdded}}` | int | Number of lines added |
| `{{.DiffRemoved}}` | int | Number of lines removed |
| `{{.DiffText}}` | string | Diff content (truncated to 50 lines) |
| `{{.HasDiff}}` | bool | Whether diff exists (use in `{{if .HasDiff}}` blocks) |
| `{{.ErrorMsg}}` | string | Error message (when status = error) |
| `{{.Timestamp}}` | string | Check timestamp |

**Default template:**
```
MonMon: `{{.TaskName}}`
Type: `{{.TaskType}}`
Status: `{{.CheckStatus}}`
Version: `#{{.CheckVersion}}`
Duration: `{{.DurationMs}}ms`{{if .HasDiff}}
Changes: `+{{.DiffAdded}} -{{.DiffRemoved}}`{{end}}
```

---

## Authentication & Authorization

Located in `internal/auth/auth.go`.

### JWT Flow

1. Client POSTs `{"username": "...", "password": "..."}` to `/api/login`
2. Server validates credentials against bcrypt hash in DB
3. Returns JWT token (HS256, 24h expiry)
4. Client sends `Authorization: Bearer <token>` on all subsequent requests
5. Middleware validates token on every protected route

### User Management

| Source | Priority | Description |
|--------|----------|-------------|
| Environment vars | Highest | `MONMON_ADMIN_USER` + `MONMON_ADMIN_PASSWORD` — creates or updates user on every startup |
| Credentials file | Medium | `credentials.yaml` — synced on startup. Format: `username: bcrypt_hash` |
| Seed user | Lowest | `monmon:monmon` — created only if DB has zero users |

### JWT Secret

- If `auth.jwt_secret` is set in config, use that
- Otherwise, auto-generate a 32-byte random hex string and persist it

---

## API Reference

Base URL: `/api`

All routes except `/api/login` require `Authorization: Bearer <jwt>`.

### Authentication

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/login` | `{"username": "...", "password": "..."}` | `{"token": "jwt_string"}` |

### Tasks

| Method | Path | Query / Body | Response |
|--------|------|-------------|----------|
| GET | `/api/tasks` | `?page=1&per_page=20&type=&status=&tag=&search=&sort=created_at&order=desc` | `{"data": [Task], "total": N}` |
| POST | `/api/tasks` | Task JSON (name, type, config, schedule_type, schedule_value) | Task |
| GET | `/api/tasks/:id` | — | Task |
| PUT | `/api/tasks/:id` | Partial Task JSON (name, config, schedule_type, schedule_value, tags, data_retention) | Task |
| DELETE | `/api/tasks/:id` | — | `{"message": "deleted"}` (cascades to checks + alerts) |
| POST | `/api/tasks/:id/pause` | — | Task |
| POST | `/api/tasks/:id/resume` | — | Task |
| POST | `/api/tasks/:id/run` | — | Check (triggers immediate execution) |

### Checks

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/api/tasks/:id/checks` | `?page=1&per_page=25&status=&order=desc` | `{"data": [Check], "total": N}` |
| GET | `/api/checks/:id` | — | Check |
| GET | `/api/checks/:id/output` | — | `{"output": "raw text"}` |
| GET | `/api/checks/:id/diff` | — | Structured diff (see Diff Engine section) |
| GET | `/api/checks/compare` | `?from=<check_id>&to=<check_id>` | Diff between any two checks |

### Alerts

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/alerts` | — | `{"data": [AlertConfig]}` |
| POST | `/api/alerts` | AlertConfig JSON | AlertConfig |
| PUT | `/api/alerts/:id` | Partial AlertConfig JSON | AlertConfig |
| DELETE | `/api/alerts/:id` | — | `{"message": "deleted"}` |
| POST | `/api/alerts/:id/test` | — | `{"message": "sent"}` (sends test alert) |

### Logs

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/api/logs` | `?page=1&per_page=50&level=&source=&task_id=` | `{"data": [Log], "total": N}` |
| WS | `/api/ws/logs` | `?token=<jwt>` | Real-time log stream (JSON messages, 1s poll interval) |

### Dashboard

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/stats` | `{"tasks": {total, active, paused, error}, "checks": {total, changes, changes_24h, errors_24h}, "recent_activity": [...]}` |

### System

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/system/tools` | `{"tools": [{name, found, path, required_by}], "all_ok": bool}` |
| GET | `/api/system/version` | `{"current": "0.1.0", "latest": "0.2.0", "update_available": true, "release_url": "..."}` |

### Middleware

| Middleware | Applied to | Purpose |
|-----------|-----------|---------|
| Recovery | All routes | Panic recovery |
| Fingerprint | All routes | Sets `X-MonMon: MonMon/<version>` header |
| CORS | All routes | `Access-Control-Allow-Origin: *` |
| Auth | Protected routes | JWT validation via `Authorization` header |

---

## CLI Reference

```
monmon [command] [flags]

Commands:
  server          Start the MonMon server
  version         Print version string
  update          Check for updates and self-update from GitHub
  task            Manage monitoring tasks
  check           View check history and diffs
  logs            View recent logs
```

### Server

```bash
monmon server                          # Start on default port (8888)
monmon server -p 9090                  # Custom port
monmon server -c /path/to/config.yaml  # Custom config file
```

Global flag: `-c, --config <path>` — config file path (applies to all commands)

### Task Commands

```bash
monmon task list                                         # List all tasks
monmon task add-cmd "gau target.com | sort -u"           # Add command task
monmon task add-cmd "nuclei -t cves/" --interval 7200    # Add with 2h interval
monmon task add-cmd "cat /tmp/out.txt" --name "Custom"   # Add with custom name
monmon task add-url "https://target.com/api"             # Add endpoint task
monmon task add-url "https://target.com" --mode metadata # Add with metadata mode
monmon task add-domain target.com                        # Add subdomain task
monmon task add-domain target.com --interval 21600       # Add with 6h interval
monmon task run <id>                                     # Trigger immediate check
monmon task pause <id>                                   # Pause task
monmon task resume <id>                                  # Resume task
monmon task delete <id>                                  # Delete task + all checks
```

| Flag | Command | Default | Description |
|------|---------|---------|-------------|
| `--interval` | add-cmd | `3600` | Check interval in seconds |
| `--interval` | add-url | `1800` | Check interval in seconds |
| `--interval` | add-domain | `21600` | Check interval in seconds |
| `--mode` | add-url | `body` | Monitor mode: body/full/metadata/regex |
| `--flow` | add-domain | `builtin` | Flow mode: builtin/full/custom |
| `--name` | all add-* | auto | Custom task name |

### Check Commands

```bash
monmon check list <task_id>    # List 20 most recent checks
monmon check diff <check_id>   # Print unified diff
```

### Logs

```bash
monmon logs    # Print 50 most recent logs (chronological order)
```

### Update

```bash
monmon update  # Check GitHub releases, download and replace binary if newer
```

---

## Web Dashboard

### Pages

#### Login (`/login`)
- Username + password form
- JWT stored in `localStorage` as `monmon_token`
- Auto-redirect to dashboard on success

#### Dashboard (`/`)
- **Stat cards** (5): Total Tasks, Active, Paused, Changes 24h, Errors 24h
  - Animated number counting (20 frames at 30ms)
  - Conditional styling: pulsing accent for active, yellow for warnings, red for errors
- **Recent activity table**: Task name (linked), status badge, version, duration (human-readable), timestamp
  - Timeout detection: shows "killed" in red if error starts with "timeout"
  - Duration warning: yellow if > 5 seconds
- **Skeleton loading**: Placeholder cards and rows while API loads

#### Tasks (`/tasks`)
- **Filter bar**: Search by name, filter by type, filter by status, clear button
- **Create form**: Task name, type selector (endpoint/command/subdomain/bbscope), schedule type (loop/cron), interval with s/m/h unit selector, dynamic config editor (ConfigForm component)
- **Task table**: ID, name (linked to detail), type badge (color-coded), status badge with icon, schedule (human-readable), checks count, changes count (yellow if > 0), last check timestamp, action buttons (Pause/Resume, Run, Delete)
- **Sortable columns**: name, status, total_checks, total_changes, last_check_at
- **Pagination**: Page X of Y with prev/next buttons

#### Task Detail (`/tasks/:id`)
- **Breadcrumb**: ← Tasks
- **Header**: Task name, status badge, Edit button, Run Now button
- **Edit panel** (toggle): Editable name, schedule with s/m/h selector, config JSON textarea. Validates JSON before saving
- **Stats row** (4 cards): Type, Schedule (human-readable), Total Checks, Total Changes
- **Config collapsible**: Pretty-printed JSON config
- **Check history table**: Version, status badge with icon, changes (+N / -N), duration (human-readable), timestamp, actions (View Diff link, error indicator)
- **Filters**: Status filter, sort order toggle (newest/oldest)
- **Pagination**

#### Diff View (`/checks/:id/diff`)
- **Header**: Check ID, added/removed badges, first-time count
- **Multi-URL mode**: Tab bar showing all endpoints + changed-only filter, search within diff, collapsible per-URL sections
- **Single mode**: Full diff with line filter (all/changed/first-time)
- **Syntax highlighting**: Green for additions, red for removals, yellow for first-time lines, gray for context
- **Collapse/expand**: Per-section and global toggle

#### Alerts (`/alerts`)
- **Create/Edit form**: Name, Task ID (empty = global), provider selector (tabbed buttons), dynamic provider config fields, keyword filter, trigger checkboxes (on_change, on_error, enabled), message template (default/custom toggle with variable reference grid)
- **Alert table**: Name, provider badge, scope (Global/Task #N), triggers, keyword, ON/OFF toggle, Edit/Test/Delete buttons
- **Filters**: Search by name, scope filter (all/global/task-specific)

#### Logs (`/logs`)
- **Live mode**: WebSocket connection, auto-scrolling terminal-style display
- **Filters**: Level (debug/info/warn/error), source (scheduler/api/server), search
- **Display**: Colored dots by level, timestamp, level tag, source, message
- **Pagination**: When not in live mode

#### System (`/system`)
- **Tools table**: Tool name, status (found/missing with color), binary path, required by (task type)
- **Checks**: subfinder, httpx, bbscope, oathtool

### Components

#### Layout (`components/Layout.tsx`)
- Fixed sidebar (220px) with glass effect
- Brand section: Animated eye logo (uses theme gradient), "MONMON" title, "Always watching." tagline
- Navigation: 5 items (Dashboard, Tasks, Alerts, Logs, System) with active state highlighting
- Footer: Theme picker button with swatch dot, version display with update badge, Sign out button
- Theme picker panel: Renders as fixed overlay at z-index 1000

#### ConfigForm (`components/ConfigForm.tsx`)
- Dynamic form that changes based on task type
- Endpoint: URL inputs (add/remove), method selector, headers, monitor mode, regex pattern
- Command: Command input, output mode, timeout
- Subdomain: Domain inputs (add/remove), httpx flag checkboxes, threads
- Bbscope: Platform selector, credentials fields, options
- Outputs minified JSON to parent

#### ThemePicker
- 3x2 grid of mini app previews (ThemeCard)
- Each card shows: miniature sidebar, content area, accent colors
- Active theme: checkmark overlay, accent border, glow shadow
- Click-outside-to-close
- Click triggers View Transitions API circle-reveal animation from click origin

---

## Theme System

Located in `web/src/themes.ts` and `web/src/context/ThemeContext.tsx`.

### Available Themes

| ID | Name | Accent | Style |
|----|------|--------|-------|
| `phantom` | Phantom | `#6366f1` (indigo) | Dark, deep purple-black background |
| `midnight` | Midnight | `#06B6D4` (cyan) | Dark, cold blue-black |
| `terminal` | Terminal | `#22C55E` (green) | Dark, Matrix-style green |
| `obsidian` | Obsidian | `#F59E0B` (amber) | Dark, warm amber-black |
| `crimson` | Crimson | `#EF4444` (red) | Dark, danger red |
| `frost` | Frost | `#6366f1` (indigo) | Light mode, white background |

### CSS Variables (per theme)

Each theme defines 40+ CSS custom properties:

| Variable | Description |
|----------|-------------|
| `--bg-base` | Page background |
| `--bg-surface` | Sidebar / elevated surface |
| `--bg-card` | Card background |
| `--border`, `--border-subtle` | Border colors |
| `--text-primary`, `--text-muted`, `--text-faint` | Text hierarchy |
| `--accent`, `--accent-dim`, `--accent-solid`, `--accent-glow` | Accent color variants |
| `--warn`, `--warn-dim` | Warning colors |
| `--critical`, `--critical-dim` | Error/danger colors |
| `--diff-added-bg`, `--diff-removed-bg`, `--diff-first-bg` | Diff highlighting |
| `--scrollbar-thumb`, `--scrollbar-track` | Scrollbar colors |
| `--noise-opacity` | Background noise texture opacity |
| `--select-option-bg` | Select dropdown background |
| `--font-mono`, `--font-body` | Font families |

### View Transitions API

When switching themes (Chrome 111+):
1. Capture click coordinates (x, y)
2. Set CSS variables `--vt-x`, `--vt-y`
3. Call `document.startViewTransition()`
4. Apply new theme CSS variables to `:root`
5. Animate with `clip-path: circle()` from click origin

Fallback: Instant theme swap on unsupported browsers.

### Persistence

Theme ID stored in `localStorage` as `monmon_theme`. Restored on page load. Default: `phantom`.

---

## Self-Update System

Located in `internal/updater/updater.go`.

### CLI: `monmon update`

1. Queries `https://api.github.com/repos/0xNayel/MonMon/releases/latest`
2. Compares `tag_name` (stripped `v` prefix) with current version
3. If newer:
   - Looks for binary asset matching `monmon_<GOOS>_<GOARCH>`
   - If found: downloads, backs up current binary, replaces, removes backup
   - If not found: suggests `go install` command
4. If current: prints "Already up to date"

### API: `GET /api/system/version`

Returns:
```json
{
  "current": "0.1.0",
  "latest": "0.2.0",
  "update_available": true,
  "release_url": "https://github.com/0xNayel/MonMon/releases/tag/v0.2.0",
  "download_url": "https://github.com/.../monmon_linux_amd64",
  "release_notes": "..."
}
```

### UI

Sidebar footer shows `v<current>`. If update is available, shows an animated badge linking to the releases page.

---

## Configuration

### Config File (`configs/monmon.yaml`)

```yaml
server:
  port: 8888                        # HTTP port

database:
  path: "./data/monmon.db"          # SQLite database path

auth:
  jwt_secret: ""                    # Auto-generated if empty (32-byte hex)
  credentials_file: ""              # Path to credentials.yaml

notify:
  provider_config: ""               # Path to notify provider config

logging:
  level: "info"                     # debug / info / warn / error
  file: "./data/monmon.log"         # Log file path

retention:
  default_keep: 0                   # 0 = keep all checks, N = keep last N per task
  cleanup_interval: "1h"            # How often to run cleanup

tools:
  subfinder: "subfinder"            # Path to subfinder binary
  httpx: "httpx"                    # Path to httpx binary
```

### Environment Variables

All config values can be overridden with `MONMON_` prefix:

| Variable | Config Path | Description |
|----------|-----------|-------------|
| `MONMON_SERVER_PORT` | `server.port` | Server port |
| `MONMON_DATABASE_PATH` | `database.path` | SQLite path |
| `MONMON_LOGGING_LEVEL` | `logging.level` | Log level |
| `MONMON_ADMIN_USER` | — | Admin username (created on startup) |
| `MONMON_ADMIN_PASSWORD` | — | Admin password (created on startup) |

### Credentials File (`configs/credentials.yaml`)

```yaml
admin: $2a$10$...bcrypt_hash...
readonly: $2a$10$...bcrypt_hash...
```

Users are synced from this file on every server startup.

---

## Logging System

Located in `internal/logger/logger.go`.

### Multi-Writer Architecture

Every log entry is written to three destinations simultaneously:

| Destination | Format | Purpose |
|-------------|--------|---------|
| Console (stderr) | Colored, human-readable | Developer visibility |
| File | Plain text, timestamped | Persistent record |
| SQLite `logs` table | Structured (level, source, task_id, message) | API queries + WebSocket streaming |

### Log Levels

| Level | Use |
|-------|-----|
| `debug` | Detailed execution traces |
| `info` | Normal operations (task started, check complete) |
| `warn` | Non-critical issues (retry, degraded) |
| `error` | Failures (task error, alert delivery failure) |

### WebSocket Streaming

`/api/ws/logs?token=<jwt>` opens a WebSocket connection that:
1. Authenticates via JWT in query parameter
2. Polls the `logs` table every 1 second for new entries
3. Sends new log entries as JSON to the client
4. UI renders in terminal-style with colored level indicators

---

## Data Retention

Configurable per-task via `data_retention` field (0 = unlimited).

When `data_retention = N`:
- After each new check, count total checks for the task
- If count exceeds N, delete the oldest checks (by version) until count = N
- Cleanup runs as part of the check execution flow

Global cleanup runs on an interval defined by `retention.cleanup_interval` (default: 1 hour) to catch any missed cleanups.

---

## Docker & Deployment

### Dockerfile (multi-stage)

```
Stage 1: node:22-alpine
  → npm install + npm run build (React SPA)

Stage 2: golang:1.25-alpine
  → go mod download
  → Install bbscope, subfinder, httpx via go install
  → Copy React dist into internal/webui/dist
  → CGO_ENABLED=0 go build (pure Go, no C compiler needed)

Stage 3: alpine:3.19 (runtime)
  → ca-certificates, bash, oath-toolkit-oathtool
  → Copy monmon binary + tool binaries + configs
  → EXPOSE 8888
  → ENTRYPOINT ["monmon"]
  → CMD ["server", "-c", "/etc/monmon/monmon.yaml"]
```

### Docker Compose

```yaml
services:
  monmon:
    image: nayelxx/monmon:latest     # Pre-built from Docker Hub
    # build: .                       # Or build from source
    ports: ["8888:8888"]
    volumes:
      - monmon-data:/var/lib/monmon/data    # Persistent DB + logs
      - ./configs:/etc/monmon                # Config files
    environment:
      - MONMON_ADMIN_USER=${MONMON_ADMIN_USER}
      - MONMON_ADMIN_PASSWORD=${MONMON_ADMIN_PASSWORD}
    restart: unless-stopped
```

### Running in Background

| Method | Command |
|--------|---------|
| Docker | `docker compose up -d` |
| Screen | `screen -dmS monmon monmon server` |
| tmux | `tmux new -d -s monmon 'monmon server'` |
| nohup | `nohup monmon server > /dev/null 2>&1 &` |

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/docker.yml`)

**Trigger:** Push to `main` or tag push (`v*`)

**Steps:**
1. Checkout code
2. Set up Docker Buildx
3. Login to Docker Hub (secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`)
4. Extract version from git tag (or `dev` for main branch)
5. Build and push Docker image
   - Tags: `nayelxx/monmon:<version>` + `nayelxx/monmon:latest` (on tag)
   - Tags: `nayelxx/monmon:dev` (on main branch push)
   - Build arg: `VERSION=<extracted_version>`
   - Cache: GitHub Actions cache (gha)

**To publish a release:**
```bash
git tag v0.2.0
git push --tags
# → Builds and pushes nayelxx/monmon:0.2.0 + nayelxx/monmon:latest
```

---

## External Tool Dependencies

| Tool | Required By | Install |
|------|------------|---------|
| subfinder | `subdomain` tasks | `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` |
| httpx | `subdomain` tasks | `go install github.com/projectdiscovery/httpx/cmd/httpx@latest` |
| bbscope (v1) | `bbscope` tasks | `go install github.com/sw33tLie/bbscope@latest` |
| oathtool | `bbscope` (OTP) | `apt install oathtool` / `brew install oath-toolkit` |

All tools are pre-installed in the Docker image. Only needed for native installs using `subdomain` or `bbscope` task types. Not required for `command` or `endpoint` tasks.
