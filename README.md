```
   __  __             __  __
  |  \/  | ___  _ __ |  \/  | ___  _ __
  | |\/| |/ _ \| '_ \| |\/| |/ _ \| '_ \
  | |  | | (_) | | | | |  | | (_) | | | |
  |_|  |_|\___/|_| |_|_|  |_|\___/|_| |_|
```

**Continuous recon & change monitoring for bug hunters and security teams.**

Stay on top of your targets 24/7 — get alerted the moment a new subdomain appears, a scope changes, an endpoint returns something different, or a command output shifts. MonMon runs quietly in the background and notifies you before anyone else notices.

Single binary. SQLite. Embedded web dashboard. No dependencies to manage.

---

## Why MonMon

Bug bounties and external attack surfaces are not static. Programs expand scope, new subdomains go live, APIs change their responses, and JS files get updated. Catching these changes fast is the difference between a duplicate and a unique find.

MonMon automates that surveillance loop:

- **New subdomain** discovered → you get pinged
- **Bug bounty scope** updated → diff lands in your Telegram
- **Endpoint response** changed → you know before the program does
- **Your recon command** returns new output → diff shows exactly what's new
- **First-time appearance** detection → never miss a truly new finding vs a re-appearing one

---

## Features

### Four Monitoring Modes

| Type | What it does |
|------|-------------|
| **command** | Run any shell command, track output changes — `nmap`, `nuclei`, `gau`, `katana`, custom scripts |
| **endpoint** | Poll HTTP endpoints in bulk — body, full response, metadata (status/length/title), or regex extract |
| **subdomain** | `subfinder -all` → `httpx` pipeline, threaded per domain, optional flags: status code, content type, page title, tech detect |
| **bbscope** | Monitor bug bounty scope via `bbscope` — HackerOne (token + username) and Bugcrowd (email + password + OTP) |

### First-Time Detection
For command, subdomain, and bbscope tasks, every new diff line is checked against the full history of that task. Lines flagged as **first time (new)** have never appeared before — not just new compared to yesterday, but new across all versions ever. Re-appeared lines are identified separately. One-click filter in the diff view.

### Diff Engine
- Unified diffs with line-level `+` / `-` stats per check
- Multi-URL endpoint diffs — each URL gets its own structured section, never mixed
- Per-URL diff breakdown: added, removed, has_changes
- DiffView filters: **All lines** · **Changed only** · **First time (N)**
- Amber badge in header when first-time lines exist

### Alerts
- Per-alert delivery config — no YAML files to manage, configure directly from the UI
- Providers: **Slack** · **Discord** · **Telegram** · **Custom webhook**
- Fire on change, error, or both
- Per-task or global (all tasks) scope
- Keyword filter — only alert when output contains a specific string
- Test button per alert config — fires a live test message immediately
- Message format: inline code per field, clean and readable in all providers

### Web Dashboard
- Embedded React SPA — no separate frontend server
- Task manager with pause / resume / manual trigger
- Structured diff viewer with collapse, search, and filters
- Real-time log stream (WebSocket)
- System health page — check if subfinder / httpx / bbscope are installed
- Tool check also available via `./check-tools.sh`

### Auth & Deployment

- `MONMON_ADMIN_USER` + `MONMON_ADMIN_PASSWORD` — required admin account via env vars
- JWT authentication, auto-generated secret if not set
- `X-MonMon` fingerprint header on all API responses
- SQLite with WAL mode — single file, zero config
- Runs as a binary, Docker container, or OS service (systemd / launchd / Windows)

---

## Quick Start

### Docker (recommended)

```bash
# 1. Clone
git clone https://github.com/0xNayel/MonMon.git
cd MonMon

# 2. Create .env with your admin credentials
echo "MONMON_ADMIN_USER=admin" >> .env
echo "MONMON_ADMIN_PASSWORD=yourpassword" >> .env

# 3. Run
docker compose up -d
```

Open `http://localhost:8888`.

The Docker image ships with `subfinder`, `httpx`, and `bbscope` pre-installed.

### go install

```bash
go install github.com/0xNayel/MonMon/cmd/monmon@latest
monmon server
```

Requires Go 1.22+ and GCC (CGO for SQLite). Open `http://localhost:8080`.

### From Source

```bash
git clone https://github.com/0xNayel/MonMon.git
cd MonMon
make build
./monmon server
```

Requires Go 1.22+, GCC (CGO for SQLite), and Node.js (for frontend).

### Check Tool Dependencies

```bash
./check-tools.sh
```

Or visit the **System** page in the web dashboard.

---

## Configuration

```yaml
server:
  port: 8080

database:
  path: "./data/monmon.db"

auth:
  jwt_secret: ""                    # auto-generated if empty
  credentials_file: "./configs/credentials.yaml"

logging:
  level: "info"                     # debug / info / warn / error
  file: "./data/monmon.log"

retention:
  default_keep: 0                   # 0 = keep all, N = keep last N checks
  cleanup_interval: "1h"

tools:
  subfinder: "subfinder"
  httpx: "httpx"
```

All values can be overridden with environment variables using the prefix `MONMON_` (e.g., `MONMON_SERVER_PORT=9090`).

---

## Task Examples

### Track a bug bounty program scope (HackerOne)

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

Alert when scope changes → never miss a newly added domain or asset class.

### Subdomain monitoring

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

Runs `subfinder -all` per domain, pipes to `httpx`. Each subdomain is a stable keyed line — reordering never creates false diffs.

### HTTP endpoint monitoring

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

Modes: `body` · `full` (headers + body) · `metadata` (status/length/title) · `regex`

### Custom recon command

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

Pipe any tool — `nuclei`, `ffuf`, `gau`, `waybackurls`, `katana`, etc. The diff shows you exactly what's new.

---

## Alert Setup

Alerts are configured entirely from the web dashboard — no YAML files needed.

1. Go to **Alerts** → **+ NEW ALERT**
2. Enter a name, select provider (Slack / Discord / Telegram / Custom webhook)
3. Fill in the webhook URL or API credentials
4. Set scope: global (all tasks) or a specific task ID
5. Choose trigger: on change, on error, or both
6. Optionally add a keyword filter

Message format example (Telegram / Discord / Slack):
```
MonMon: `target.com`
Type: `subdomain`
Status: `changed`
Version: `#42`
Duration: `8420ms`
Changes: `+3 -1`
```

---

## API Reference

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
| `GET` | `/api/checks/:id/diff` | Structured diff (per-URL sections for endpoint, first-time lines for others) |
| `GET` | `/api/checks/compare` | Diff between any two checks (`from`, `to`) |
| `GET` | `/api/alerts` | List alert configs |
| `POST` | `/api/alerts` | Create alert config |
| `PUT` | `/api/alerts/:id` | Update alert config |
| `DELETE` | `/api/alerts/:id` | Delete alert config |
| `POST` | `/api/alerts/:id/test` | Send test alert |
| `GET` | `/api/logs` | Query logs (`level`, `source`, `task_id`, `page`) |
| `WS` | `/api/ws/logs` | Real-time log stream |
| `GET` | `/api/stats` | Dashboard statistics |
| `GET` | `/api/system/tools` | External tool availability check |

---

## CLI Usage

```bash
# Server
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

# OS Service
monmon service install
monmon service uninstall
monmon service start / stop / restart / status

# Other
monmon config init
monmon version
```

---

## Architecture

```
monmon/
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
│   ├── diff/                     # Unified diff (sergi/go-diff)
│   ├── scheduler/                # Loop + cron scheduling (robfig/cron)
│   ├── alert/                    # Per-alert notify client (projectdiscovery/notify)
│   ├── auth/                     # JWT + bcrypt + env-based admin sync
│   ├── api/                      # Gin REST + WebSocket handlers
│   ├── logger/                   # Zerolog + DB log writer
│   └── service/                  # OS service management (kardianos/service)
├── web/                          # React + TypeScript SPA (go:embed)
├── configs/                      # Example YAML configs
├── check-tools.sh                # CLI tool dependency checker
├── Dockerfile                    # Multi-stage build (node → go → alpine)
├── docker-compose.yml
└── Makefile
```

---

## Docker

```bash
# Start
docker compose up -d

# Logs
docker compose logs -f monmon

# Stop
docker compose down
```

Requires a `.env` file:
```
MONMON_ADMIN_USER=admin
MONMON_ADMIN_PASSWORD=yourpassword
```

The image includes `subfinder`, `httpx`, and `bbscope` built from source — no network downloads at runtime.

---

## Building from Source

```bash
# Build everything
make build

# Development mode (hot reload)
make dev

# Tests
make test

# Install as system service
sudo make install

# Clean
make clean
```

---

## License

[MIT](LICENSE)
