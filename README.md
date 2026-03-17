<p align="center">
<pre>
   __  __             __  __
  |  \/  | ___  _ __ |  \/  | ___  _ __
  | |\/| |/ _ \| '_ \| |\/| |/ _ \| '_ \
  | |  | | (_) | | | | |  | | (_) | | | |
  |_|  |_|\___/|_| |_|_|  |_|\___/|_| |_|
</pre>
</p>

<p align="center">
  <b>The monitoring monster for bug bounty hunters.</b><br/>
  Track subdomains, scope changes, endpoints, and recon output — get alerted the moment something shifts.
</p>

<p align="center">
  <a href="https://github.com/0xNayel/MonMon/releases"><img src="https://img.shields.io/github/v/release/0xNayel/MonMon?color=blue&label=version" alt="release"/></a>
  <a href="https://github.com/0xNayel/MonMon/blob/main/LICENSE"><img src="https://img.shields.io/github/license/0xNayel/MonMon?color=blue" alt="license"/></a>
  <a href="https://golang.org/"><img src="https://img.shields.io/badge/go-1.22%2B-blue" alt="go version"/></a>
  <a href="https://github.com/0xNayel/MonMon/stargazers"><img src="https://img.shields.io/github/stars/0xNayel/MonMon?style=flat&color=blue" alt="stars"/></a>
  <a href="https://hub.docker.com/r/0xnayel/monmon"><img src="https://img.shields.io/badge/docker-ready-blue" alt="docker"/></a>
</p>

---

Bug bounty targets are never static. Programs expand scope, new subdomains go live, API responses change, and JS files get updated overnight. Missing that window means duplicates. MonMon closes it.

Run it once, point it at your targets, and let it alert you the moment anything moves — new subdomain, scope expansion, endpoint diff, or custom recon output. Everything is diffed, versioned, and delivered to your Telegram, Slack, or Discord before anyone else notices.

---

## Features

- **Four monitoring modes** — `command`, `endpoint`, `subdomain`, `bbscope`
- **First-time detection** — every new diff line is checked against the full task history, not just the previous run. Know if a line is truly new or just re-appeared
- **Smart diff engine** — unified diffs, per-URL breakdown for bulk endpoints, filters: All / Changed only / First time
- **Subdomain pipeline** — `subfinder -all` → `httpx`, threaded per domain, stable keyed output so reordering never creates false diffs
- **Bug bounty scope monitoring** — HackerOne and Bugcrowd via `bbscope`, diff scope expansions and get alerted instantly
- **Bulk endpoint polling** — monitor multiple URLs in a single task, each with its own diff section; modes: `body`, `full`, `metadata`, `regex`
- **Flexible alerts** — Slack, Discord, Telegram, custom webhook; per-task or global scope; keyword filter; test button per config
- **Embedded web dashboard** — React SPA served from the binary, no separate server. Task manager, diff viewer with collapse + search, real-time log stream (WebSocket)
- **System health page** — check if `subfinder`, `httpx`, `bbscope` are installed and in PATH
- **Single binary, zero dependencies** — SQLite (WAL mode), embedded frontend, JWT auth, auto-generated secret

---

## Installation

### Docker (recommended)

Comes with `subfinder`, `httpx`, and `bbscope` pre-installed — no setup needed.

```bash
git clone https://github.com/0xNayel/MonMon.git
cd MonMon

# Set admin credentials
echo "MONMON_ADMIN_USER=admin" >> .env
echo "MONMON_ADMIN_PASSWORD=yourpassword" >> .env

docker compose up -d
```

Open `http://localhost:8888` — read-only account: `monmon` / `monmon`.

---

### go install

```bash
go install github.com/0xNayel/MonMon/cmd/monmon@latest
monmon server
```

Open `http://localhost:8888`. Requires Go 1.22+.

For subdomain and bbscope tasks, install the required tools first — see [Prerequisites](#prerequisites).

---

## Prerequisites

Required only for subdomain and bbscope task types. Not needed for `command` or `endpoint` tasks (or when using Docker).

**subfinder**
```bash
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
```

**httpx**
```bash
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
```

**bbscope** — use the original version, **not v2**
```bash
go install github.com/sw33tLie/bbscope@latest
```

> Verify all tools are detected: run `monmon server` and visit **System** in the dashboard, or run `./check-tools.sh`.

---

## Dashboard

<!-- Add screenshots here -->

---

## Task Types

### `command` — run any shell command, diff the output

```json
{
  "type": "command",
  "config": {
    "command": "gau target.com | sort -u",
    "output_mode": "stdout",
    "timeout_sec": 120
  }
}
```

Pipe anything — `nuclei`, `ffuf`, `gau`, `waybackurls`, `katana`, custom scripts. The diff shows exactly what changed.

---

### `endpoint` — poll HTTP endpoints, diff the response

```json
{
  "type": "endpoint",
  "config": {
    "urls": ["https://target.com/api/v1/", "https://target.com/api/v2/"],
    "method": "GET",
    "monitor_mode": "body"
  }
}
```

Monitor modes: `body` · `full` (headers + body) · `metadata` (status / length / title) · `regex`

Multiple URLs in one task — each gets its own diff section, never mixed.

---

### `subdomain` — continuous subdomain discovery

```json
{
  "type": "subdomain",
  "config": {
    "domains": ["target.com", "sub.target.com"],
    "httpx_sc": true,
    "httpx_title": true,
    "httpx_td": true,
    "threads": 5
  }
}
```

Runs `subfinder -all` per domain, pipes through `httpx`. Each result is a stable keyed line — new subdomains appear as genuine diffs, not noise.

---

### `bbscope` — bug bounty scope monitoring

```json
{
  "type": "bbscope",
  "config": {
    "platform": "h1",
    "token": "your_api_token",
    "username": "your_h1_username",
    "bounty_only": false,
    "output_type": "tc"
  }
}
```

Supported platforms: `h1` (HackerOne), `bc` (Bugcrowd). Diff scope expansions and get alerted the moment a new domain or asset class is added.

---

## Alerts

Configured entirely from the dashboard — no config files.

1. **Alerts** → **+ NEW ALERT**
2. Name it, pick a provider: Slack / Discord / Telegram / Custom webhook
3. Fill in credentials or webhook URL
4. Set scope: global (all tasks) or a specific task
5. Trigger: on change, on error, or both
6. Optional keyword filter — only alert when output contains a match

Alert message format:
```
MonMon: `target.com`
Type: `subdomain`
Status: `changed`
Version: `#42`
Duration: `8420ms`
Changes: `+3 -1`
```

---

## Configuration

All settings can be overridden with environment variables using the `MONMON_` prefix (e.g. `MONMON_SERVER_PORT=9090`).

```yaml
server:
  port: 8888

database:
  path: "./data/monmon.db"

auth:
  jwt_secret: ""          # auto-generated if empty

logging:
  level: "info"           # debug / info / warn / error
  file: "./data/monmon.log"

retention:
  default_keep: 0         # 0 = keep all, N = keep last N checks
  cleanup_interval: "1h"

tools:
  subfinder: "subfinder"
  httpx: "httpx"
```

---

## CLI

```bash
# Start server
monmon server
monmon server -p 9090 -c /path/to/config.yaml

# Tasks
monmon task list [--type subdomain] [--status active] [--search "target"]
monmon task run <id>
monmon task pause <id>
monmon task resume <id>
monmon task delete <id>

# Checks
monmon check list <task_id>
monmon check diff <check_id>

# Logs
monmon logs [-f] [--level error] [--task <id>]

# Other
monmon config init
monmon version
```

---

## API

All routes except `/api/login` require `Authorization: Bearer <jwt>`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/login` | Authenticate, returns JWT |
| `GET` | `/api/tasks` | List tasks (`type`, `status`, `tag`, `search`, `sort`, `order`, `page`, `per_page`) |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/tasks/:id` | Get task |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `POST` | `/api/tasks/:id/pause` | Pause task |
| `POST` | `/api/tasks/:id/resume` | Resume task |
| `POST` | `/api/tasks/:id/run` | Trigger immediate run |
| `GET` | `/api/tasks/:id/checks` | List checks (`page`, `per_page`, `status`, `order`) |
| `GET` | `/api/checks/:id` | Get check metadata |
| `GET` | `/api/checks/:id/output` | Raw output text |
| `GET` | `/api/checks/:id/diff` | Structured diff |
| `GET` | `/api/checks/compare` | Diff between any two checks (`from`, `to`) |
| `GET` | `/api/alerts` | List alert configs |
| `POST` | `/api/alerts` | Create alert config |
| `PUT` | `/api/alerts/:id` | Update alert config |
| `DELETE` | `/api/alerts/:id` | Delete alert config |
| `POST` | `/api/alerts/:id/test` | Send test alert |
| `GET` | `/api/logs` | Query logs (`level`, `source`, `task_id`, `page`) |
| `WS` | `/api/ws/logs` | Real-time log stream |
| `GET` | `/api/stats` | Dashboard stats |
| `GET` | `/api/system/tools` | Tool availability check |

---

## Architecture

```
MonMon/
├── cmd/monmon/main.go            # CLI entry point (Cobra)
├── internal/
│   ├── config/                   # Viper config loading
│   ├── models/                   # GORM models (Task, Check, AlertConfig, Log, User)
│   ├── db/                       # SQLite init + auto-migrations
│   ├── monitor/
│   │   ├── command.go            # Shell command executor
│   │   ├── endpoint.go           # HTTP fetcher (bulk multi-URL)
│   │   ├── subdomain.go          # subfinder → httpx pipeline (threaded)
│   │   └── bbscope.go            # Bug bounty scope monitor
│   ├── diff/                     # Unified diff engine (sergi/go-diff)
│   ├── scheduler/                # Cron + loop scheduling (robfig/cron)
│   ├── alert/                    # Per-alert delivery (projectdiscovery/notify)
│   ├── auth/                     # JWT + bcrypt + env-based admin sync
│   ├── api/                      # Gin REST + WebSocket handlers
│   └── logger/                   # Zerolog + DB log writer
├── web/                          # React + TypeScript SPA (go:embed)
├── configs/                      # Example YAML configs
├── check-tools.sh                # Tool dependency checker
├── Dockerfile                    # Multi-stage build (node → go → alpine)
├── docker-compose.yml
└── Makefile
```

---

## License

[MIT](LICENSE)
