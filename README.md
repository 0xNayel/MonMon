<p align="center">
<pre align="center">
   __  __             __  __
  |  \/  | ___  _ __ |  \/  | ___  _ __
  | |\/| |/ _ \| '_ \| |\/| |/ _ \| '_ \
  | |  | | (_) | | | | |  | | (_) | | | |
  |_|  |_|\___/|_| |_|_|  |_|\___/|_| |_|
</pre>
</p>

<h3 align="center">Continuous recon & change monitoring for bug bounty hunters</h3>

<p align="center">
  <a href="https://github.com/0xNayel/MonMon/releases"><img src="https://img.shields.io/github/v/release/0xNayel/MonMon?color=6366f1&label=release&style=flat-square" alt="release"/></a>
  <a href="https://github.com/0xNayel/MonMon/blob/main/LICENSE"><img src="https://img.shields.io/github/license/0xNayel/MonMon?color=6366f1&style=flat-square" alt="license"/></a>
  <a href="https://golang.org/"><img src="https://img.shields.io/badge/go-1.22%2B-6366f1?style=flat-square" alt="go"/></a>
  <a href="https://github.com/0xNayel/MonMon/stargazers"><img src="https://img.shields.io/github/stars/0xNayel/MonMon?style=flat-square&color=6366f1" alt="stars"/></a>
  <a href="https://hub.docker.com/r/0xnayel/monmon"><img src="https://img.shields.io/badge/docker-ready-6366f1?style=flat-square" alt="docker"/></a>
</p>

<p align="center">
  <a href="#installation">Install</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#task-types">Tasks</a> &bull;
  <a href="#alerts">Alerts</a> &bull;
  <a href="#cli">CLI</a> &bull;
  <a href="#api-reference">API</a>
</p>

---

MonMon runs your recon on autopilot. Point it at targets, set intervals, and get alerted the second anything changes — new subdomain, scope expansion, endpoint diff, command output shift. Everything is diffed, versioned, and delivered to Telegram, Slack, or Discord before anyone else notices.

Single binary. Embedded dashboard. Zero external dependencies.

---

## Screenshots

<!-- SCREENSHOT: Dashboard overview -->
<p align="center">
  <img src="" width="800" alt="MonMon Dashboard"/>
  <br/><sub>Dashboard — real-time system overview with animated stats</sub>
</p>

<!-- SCREENSHOT: Task list -->
<p align="center">
  <img src="" width="800" alt="MonMon Tasks"/>
  <br/><sub>Tasks — manage all monitoring jobs with filters, search, and inline actions</sub>
</p>

<!-- SCREENSHOT: Task detail + check history -->
<p align="center">
  <img src="" width="800" alt="MonMon Task Detail"/>
  <br/><sub>Task Detail — full check history with pagination, status filters, and diff links</sub>
</p>

<!-- SCREENSHOT: Diff viewer -->
<p align="center">
  <img src="" width="800" alt="MonMon Diff Viewer"/>
  <br/><sub>Diff Viewer — unified diffs with syntax highlighting, collapse/expand, and first-time detection</sub>
</p>

<!-- SCREENSHOT: Alerts configuration -->
<p align="center">
  <img src="" width="800" alt="MonMon Alerts"/>
  <br/><sub>Alerts — per-task or global, multi-provider, custom message templates</sub>
</p>

<!-- SCREENSHOT: Theme picker -->
<p align="center">
  <img src="" width="800" alt="MonMon Themes"/>
  <br/><sub>Themes — 6 built-in themes with live preview and smooth transitions</sub>
</p>

---

## Features

| Category | Details |
|----------|---------|
| **Monitoring Modes** | `command` · `endpoint` · `subdomain` · `bbscope` — four task types covering shell output, HTTP responses, subdomain discovery, and bug bounty scope |
| **Smart Diff Engine** | Unified diffs with per-URL breakdown for bulk endpoints. Filters: All / Changed / First-time. Every new line is checked against full task history, not just the previous run |
| **Subdomain Pipeline** | `subfinder -all` → `httpx` per domain, threaded execution, stable keyed output — reordering never creates false positives |
| **Scope Monitoring** | HackerOne + Bugcrowd via `bbscope`. Diff scope expansions instantly |
| **Bulk Endpoints** | Monitor multiple URLs in a single task. Each URL gets its own diff section. Modes: `body` · `full` · `metadata` · `regex` |
| **Alerts** | Slack, Discord, Telegram, custom webhook. Per-task or global scope. Keyword filter. Custom message templates. Test button per config |
| **Dashboard** | React SPA embedded in the binary. Task manager, diff viewer with collapse + search, real-time log stream (WebSocket), animated stats |
| **Multi-Theme UI** | 6 themes (Phantom, Midnight, Terminal, Obsidian, Crimson, Frost) with live preview, View Transitions API, and localStorage persistence |
| **Self-Update** | `monmon update` checks GitHub releases and self-updates the binary |
| **Single Binary** | SQLite (WAL), embedded frontend, JWT auth, auto-generated secret. No external services |

---

## Installation

### Docker Hub (recommended)

Pre-built image with all tools (`subfinder`, `httpx`, `bbscope`, `oathtool`) included.

```bash
git clone https://github.com/0xNayel/MonMon.git && cd MonMon

# Set admin credentials
echo "MONMON_ADMIN_USER=admin" >> .env
echo "MONMON_ADMIN_PASSWORD=changeme" >> .env

docker compose up -d
```

Open **http://localhost:8888**

#### Updating (Docker)

```bash
docker compose pull && docker compose up -d
```

#### Build from source (Docker)

Edit `docker-compose.yml`: comment out the `image:` line and uncomment `build: .`, then:

```bash
docker compose build --no-cache && docker compose up -d
```

---

### go install

```bash
go install github.com/0xNayel/MonMon/cmd/monmon@latest
monmon server
```

Open **http://localhost:8888** — requires Go 1.22+.

#### Updating (go install)

```bash
monmon update
```

Or manually:

```bash
go install github.com/0xNayel/MonMon/cmd/monmon@latest
```

---

### Build from source

```bash
git clone https://github.com/0xNayel/MonMon.git && cd MonMon
make build
./monmon server
```

---

## Prerequisites

Required **only** for `subdomain` and `bbscope` task types. Not needed for `command` / `endpoint` tasks, or when using Docker.

```bash
# subfinder
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest

# httpx
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest

# bbscope (use v1, NOT v2)
go install github.com/sw33tLie/bbscope@latest

# oathtool (for bbscope HackerOne OTP) — install via package manager
# Debian/Ubuntu: apt install oathtool
# macOS: brew install oath-toolkit
# Alpine: apk add oath-toolkit-oathtool
```

> Verify tools: open **System** in the dashboard, or check the API at `/api/system/tools`.

---

## Task Types

### `command` — run any shell command, diff the output

```json
{
  "command": "gau target.com | sort -u",
  "output_mode": "stdout",
  "timeout_sec": 120
}
```

Pipe anything — `nuclei`, `ffuf`, `gau`, `waybackurls`, `katana`, custom scripts. MonMon diffs the stdout.

---

### `endpoint` — poll HTTP endpoints, diff the response

```json
{
  "urls": ["https://target.com/api/v1/", "https://target.com/api/v2/"],
  "method": "GET",
  "monitor_mode": "body"
}
```

Monitor modes: `body` · `full` (headers + body) · `metadata` (status / length / title) · `regex`

Multiple URLs per task — each gets its own diff section.

---

### `subdomain` — continuous subdomain discovery

```json
{
  "domains": ["target.com", "sub.target.com"],
  "httpx_sc": true,
  "httpx_title": true,
  "httpx_td": true,
  "threads": 5
}
```

`subfinder -all` per domain → `httpx`. Stable keyed output means reordering never creates false diffs.

---

### `bbscope` — bug bounty scope monitoring

```json
{
  "platform": "h1",
  "token": "your_api_token",
  "username": "your_h1_username",
  "bounty_only": false,
  "output_type": "tc"
}
```

Platforms: `h1` (HackerOne) · `bc` (Bugcrowd). Get alerted the moment a scope expansion drops.

---

## Alerts

Configured entirely from the dashboard UI.

1. **Alerts** → **+ NEW ALERT**
2. Name it, pick a provider (Slack / Discord / Telegram / Webhook)
3. Set scope: global or per-task
4. Trigger: on change, on error, or both
5. Optional keyword filter
6. Optional custom message template with variables:

| Variable | Description |
|----------|-------------|
| `{{.TaskName}}` | Task name |
| `{{.TaskType}}` | Task type |
| `{{.CheckStatus}}` | Check result status |
| `{{.Version}}` | Check version number |
| `{{.DurationMs}}` | Execution time in ms |
| `{{.DiffAdded}}` | Lines added |
| `{{.DiffRemoved}}` | Lines removed |
| `{{.ErrorMsg}}` | Error message (if any) |
| `{{.Timestamp}}` | Check timestamp |

---

## Configuration

Settings via YAML or environment variables with `MONMON_` prefix.

```yaml
server:
  port: 8888

database:
  path: "./data/monmon.db"

auth:
  jwt_secret: ""            # auto-generated if empty

logging:
  level: "info"             # debug / info / warn / error
  file: "./data/monmon.log"

retention:
  default_keep: 0           # 0 = keep all, N = keep last N checks
  cleanup_interval: "1h"

tools:
  subfinder: "subfinder"
  httpx: "httpx"
```

Environment override example: `MONMON_SERVER_PORT=9090`

---

## CLI

```bash
monmon server                              # Start server (default :8888)
monmon server -p 9090 -c config.yaml       # Custom port + config
monmon version                             # Print version
monmon update                              # Self-update from GitHub

monmon task list                           # List all tasks
monmon task add-cmd "gau target.com"       # Add command task
monmon task add-url "https://target.com"   # Add endpoint task
monmon task add-domain target.com          # Add subdomain task
monmon task run <id>                       # Trigger immediate check
monmon task pause <id>                     # Pause task
monmon task resume <id>                    # Resume task
monmon task delete <id>                    # Delete task + checks

monmon check list <task_id>                # List checks for a task
monmon check diff <check_id>               # Show diff output

monmon logs                                # View recent logs
```

---

## API Reference

All routes except `/api/login` require `Authorization: Bearer <jwt>`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/login` | Authenticate → JWT |
| `GET` | `/api/tasks` | List tasks (filter: `type`, `status`, `search`, `sort`, `order`, `page`, `per_page`) |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/tasks/:id` | Get task |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task + checks |
| `POST` | `/api/tasks/:id/pause` | Pause task |
| `POST` | `/api/tasks/:id/resume` | Resume task |
| `POST` | `/api/tasks/:id/run` | Trigger immediate run |
| `GET` | `/api/tasks/:id/checks` | Check history (filter: `status`, `order`, `page`, `per_page`) |
| `GET` | `/api/checks/:id` | Check metadata |
| `GET` | `/api/checks/:id/output` | Raw output text |
| `GET` | `/api/checks/:id/diff` | Structured diff |
| `GET` | `/api/checks/compare` | Compare any two checks (`from`, `to`) |
| `GET` | `/api/alerts` | List alert configs |
| `POST` | `/api/alerts` | Create alert config |
| `PUT` | `/api/alerts/:id` | Update alert config |
| `DELETE` | `/api/alerts/:id` | Delete alert config |
| `POST` | `/api/alerts/:id/test` | Send test alert |
| `GET` | `/api/logs` | Query logs (`level`, `source`, `task_id`, `page`) |
| `WS` | `/api/ws/logs` | Real-time log stream |
| `GET` | `/api/stats` | Dashboard stats |
| `GET` | `/api/system/tools` | Tool availability check |
| `GET` | `/api/system/version` | Current + latest version info |

---

## Architecture

```
MonMon/
├── cmd/monmon/main.go            # CLI entry + Cobra commands
├── internal/
│   ├── api/                      # Gin REST handlers + WebSocket
│   ├── alert/                    # Multi-provider alert delivery
│   ├── auth/                     # JWT + bcrypt + env-based admin
│   ├── config/                   # Viper config loading
│   ├── db/                       # SQLite init + auto-migrations
│   ├── diff/                     # Unified diff engine
│   ├── logger/                   # Zerolog + DB writer
│   ├── models/                   # GORM models
│   ├── monitor/
│   │   ├── command.go            # Shell command executor
│   │   ├── endpoint.go           # HTTP fetcher (bulk multi-URL)
│   │   ├── subdomain.go          # subfinder → httpx pipeline
│   │   └── bbscope.go            # Bug bounty scope monitor
│   ├── scheduler/                # Cron + loop scheduling
│   ├── updater/                  # Self-update from GitHub releases
│   └── webui/                    # Embedded React SPA (go:embed)
├── web/                          # React + TypeScript source
├── configs/                      # Example YAML configs
├── Dockerfile                    # Multi-stage (node → go → alpine)
├── docker-compose.yml
└── Makefile
```

---

## Running in Background

**Docker** (recommended):
```bash
docker compose up -d
```

**Screen / tmux**:
```bash
screen -dmS monmon monmon server
# or
tmux new -d -s monmon 'monmon server'
```

**nohup**:
```bash
nohup monmon server > /dev/null 2>&1 &
```

---

## License

[MIT](LICENSE)
