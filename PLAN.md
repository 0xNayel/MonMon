# MonMon v1 — Compact Plan

> Diff-based monitoring for commands, endpoints, and subdomains. Single binary. SQLite. Open source.

---

## Tech Stack

| What | Choice | Why |
|------|--------|-----|
| Language | **Go** | Single binary, goroutines, same as subfinder/httpx/notify |
| DB | **SQLite** (CGO, WAL mode) | Zero config, embedded, enough for single-instance |
| HTTP | **Gin** | Lightweight, fast |
| Frontend | **Embedded SPA** (React+Vite+Tailwind) | `go:embed` — no separate server |
| CLI | **Cobra** | Standard Go CLI |
| Config | **Viper** (YAML) | File + env + flags |
| Diff | **sergi/go-diff** | Line-level unified diffs |
| Scheduler | **robfig/cron/v3** + goroutine loops | Cron + loop modes |
| Alerts | **projectdiscovery/notify** (library) | Direct Go import |
| Logging | **zerolog** | Structured, fast, colored |
| Auth | **JWT + bcrypt** | Simple, stateless |
| OS Service | **kardianos/service** | Cross-platform service manager (systemd/launchd/Windows SCM) |

---

## Project Structure

```
monmon/
├── cmd/monmon/main.go           # entry point
├── internal/
│   ├── config/config.go         # viper config loading
│   ├── models/models.go         # all DB models (GORM)
│   ├── db/db.go                 # sqlite init + migrations
│   ├── monitor/
│   │   ├── monitor.go           # Monitor interface
│   │   ├── command.go           # command executor
│   │   ├── endpoint.go          # HTTP fetcher
│   │   └── subdomain.go         # subdomain flows
│   ├── diff/diff.go             # diff computation + stats
│   ├── scheduler/scheduler.go   # loop + cron scheduling
│   ├── alert/alert.go           # notify wrapper
│   ├── auth/auth.go             # jwt + bcrypt + middleware
│   ├── api/
│   │   ├── router.go            # all routes
│   │   ├── tasks.go             # task handlers
│   │   ├── checks.go            # check/diff handlers
│   │   ├── alerts.go            # alert config handlers
│   │   ├── logs.go              # log handlers + websocket
│   │   └── auth.go              # login handler
│   ├── logger/logger.go         # zerolog setup + DB writer
│   └── service/service.go       # OS service integration (install/uninstall/status)
├── web/                         # React SPA (built → embedded)
│   ├── src/
│   │   ├── pages/               # Dashboard, Tasks, Explorer, Alerts, Logs, Login
│   │   ├── components/          # DiffViewer, TaskForm, LogStream, etc.
│   │   └── main.tsx
│   └── package.json
├── configs/
│   ├── monmon.yaml.example
│   └── notify-provider.yaml.example
├── init/
│   └── monmon.service           # systemd unit file
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── go.mod
├── LICENSE                      # MIT
└── README.md
```

**~25 Go files, ~15 React files.** That's it.

---

## Database (SQLite)

```sql
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK(type IN ('command','endpoint','subdomain')),
    status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','error')),
    config          TEXT NOT NULL,          -- JSON
    schedule_type   TEXT NOT NULL CHECK(schedule_type IN ('loop','cron')),
    schedule_value  TEXT NOT NULL,          -- seconds for loop, cron expr for cron
    tags            TEXT DEFAULT '',
    data_retention  INTEGER DEFAULT 0,     -- 0=keep all
    last_check_at   DATETIME,
    total_checks    INTEGER DEFAULT 0,
    total_changes   INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE checks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    status        TEXT NOT NULL CHECK(status IN ('success','changed','error')),
    output_hash   TEXT,
    output        TEXT,              -- stored inline (no blob FS for v1)
    diff_text     TEXT,              -- unified diff (if changed)
    diff_added    INTEGER DEFAULT 0,
    diff_removed  INTEGER DEFAULT 0,
    metadata      TEXT,              -- JSON: status_code, content_length, title
    duration_ms   INTEGER,
    error_msg     TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alert_configs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id          INTEGER REFERENCES tasks(id) ON DELETE CASCADE, -- NULL=global
    name             TEXT NOT NULL,
    provider         TEXT NOT NULL,
    enabled          INTEGER DEFAULT 1,
    on_change        INTEGER DEFAULT 1,
    on_error         INTEGER DEFAULT 0,
    keyword_filter   TEXT,             -- only alert if output contains this
    message_template TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    level      TEXT NOT NULL,
    source     TEXT NOT NULL,
    task_id    INTEGER,
    message    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checks_task ON checks(task_id, version);
CREATE INDEX idx_logs_created ON logs(created_at);
CREATE INDEX idx_tasks_status ON tasks(status);
```

**v1 stores output inline in SQLite** — no filesystem blob layer. Simple. Works fine for text outputs up to a few MB each.

---

## Core Interface

```go
type Monitor interface {
    Execute(ctx context.Context, task *models.Task) (*models.CheckResult, error)
}

type CheckResult struct {
    Output   string
    Hash     string
    Metadata map[string]any // status_code, content_length, title, etc.
    Error    error
}
```

All three monitors implement this. The scheduler calls `Execute()`, compares hashes, computes diff if changed, stores, alerts.

---

## Monitor Configs (JSON in `tasks.config`)

### Command
```json
{
  "command": "nmap -sV target.com",
  "output_mode": "stdout",
  "output_file": "",
  "timeout_sec": 60
}
```
`output_mode`: `stdout` (default) | `file` (read file after command runs)

### Endpoint
```json
{
  "urls": ["https://example.com/api"],
  "method": "GET",
  "headers": {"Authorization": "Bearer xxx"},
  "monitor_mode": "body",
  "metadata_fields": ["status_code", "content_length", "title"],
  "regex_pattern": ""
}
```
`monitor_mode`: `body` (default) | `full` (headers+body) | `metadata` | `regex`

### Subdomain
```json
{
  "domains": ["example.com"],
  "flow_mode": "builtin",
  "script_path": "",
  "monitor_mode": "metadata",
  "metadata_fields": ["status_code", "content_length", "title"]
}
```
`flow_mode`:
- `builtin` → `subfinder -d <domain> -all -silent | httpx -sc -location -title -cl -td -silent`
- `full` → `subfinder -all | httpx -silent` then fetch each URL's body
- `custom` → run `<script_path> <temp_domains_file>`, capture stdout

---

## Scheduling

**Loop mode:** goroutine per task, `Execute → sleep(interval) → repeat`. Interval=0 means back-to-back.

**Cron mode:** registered in `robfig/cron`. Expressions like `0 0 * * 5` (every Friday), `0 12 * * *` (daily noon), `@every 1h`.

```go
func (s *Scheduler) Start() {
    tasks := s.db.GetActiveTasks()
    for _, t := range tasks {
        switch t.ScheduleType {
        case "loop":
            go s.runLoop(t)
        case "cron":
            s.cron.AddFunc(t.ScheduleValue, func() { s.runCheck(t) })
        }
    }
    s.cron.Start()
}
```

---

## Diff Engine

One file. ~100 lines.

```go
func ComputeDiff(old, new string) (diffText string, added int, removed int)
```

- Uses `sergi/go-diff` for unified diff
- Returns diff text + line stats (+added, -removed)
- First check of a task: stored as "changed" with full output as diff (baseline)

---

## Alert Flow

```go
func (a *AlertManager) Process(task *models.Task, check *models.Check) {
    configs := a.db.GetAlertConfigs(task.ID) // task-specific + global (task_id=NULL)
    for _, cfg := range configs {
        if check.Status == "changed" && cfg.OnChange ||
           check.Status == "error" && cfg.OnError {
            if cfg.KeywordFilter != "" && !strings.Contains(check.Output, cfg.KeywordFilter) {
                continue
            }
            msg := a.renderMessage(cfg, task, check)
            a.notify.Send(msg, cfg.Provider)
        }
    }
}
```

Notify provider config lives at `configs/notify-provider.yaml` (standard PD notify format).

---

## API Endpoints

```
POST   /api/login                     → JWT token

GET    /api/tasks?type=&status=&tag=&search=&sort=&order=&page=&per_page=
POST   /api/tasks
GET    /api/tasks/:id
PUT    /api/tasks/:id
DELETE /api/tasks/:id
POST   /api/tasks/:id/pause
POST   /api/tasks/:id/resume
POST   /api/tasks/:id/run             → trigger immediate check

GET    /api/tasks/:id/checks?page=&per_page=
GET    /api/checks/:id
GET    /api/checks/:id/output
GET    /api/checks/:id/diff
GET    /api/checks/compare?from=&to=  → diff between any two checks

GET    /api/alerts
POST   /api/alerts
PUT    /api/alerts/:id
DELETE /api/alerts/:id
POST   /api/alerts/:id/test

GET    /api/logs?level=&source=&task_id=&page=
WS     /api/ws/logs                   → real-time stream

GET    /api/stats                     → dashboard numbers
```

All routes (except `/api/login` and static files) require `Authorization: Bearer <jwt>`.

---

## CLI

```bash
monmon server                    # start foreground (default :8080)
monmon server -p 9090 -c /path/to/config.yaml

# OS Service management (runs as systemd service — survives SSH logout, auto-starts on boot)
monmon service install           # install + enable + start systemd service
monmon service uninstall         # stop + disable + remove service
monmon service start             # start the service
monmon service stop              # stop the service
monmon service restart           # restart the service
monmon service status            # show service status (active/inactive, uptime, PID)

monmon task list [--type endpoint] [--status active] [--search "api"]
monmon task add-cmd "nmap -sV target" --interval 1h --name "Nmap Scan"
monmon task add-url "https://example.com" --mode metadata --interval 30m
monmon task add-domain "example.com" --flow builtin --interval 6h
monmon task run <id>
monmon task pause <id>
monmon task resume <id>
monmon task delete <id>

monmon check list <task_id>
monmon check diff <check_id>
monmon check compare <id1> <id2>

monmon logs [-f] [--level error] [--task <id>]

monmon config init               # generate example configs
monmon version
```

---

## Auth

- Default creds: `monmon:monmon`
- Stored bcrypt-hashed in `users` table on first boot
- Reset: edit `configs/credentials.yaml` → restart → DB updated
- No password change via web/API (security: host-only)
- JWT tokens, 24h expiry

---

## Web Pages

| Page | What it shows |
|------|---------------|
| **Login** | Username/password form |
| **Dashboard** | Active tasks count, recent changes, error count, activity feed |
| **Tasks** | Table with search/sort/filter, create button, status badges |
| **Task Detail** | Config, check history table, quick actions (run/pause/resume) |
| **Explorer** | Pick two versions → GitHub-style diff viewer (green/red lines, +N/-N stats) |
| **Alerts** | Alert rule list, create/edit form, test button |
| **Logs** | Real-time colored log stream (WebSocket), level/source filters |

**Diff viewer renders:**
```diff
--- v3  2026-03-12 10:00
+++ v4  2026-03-12 11:00
@@ -2,3 +2,4 @@
 unchanged
-old line
+new line
+added line

+2 -1
```

---

## Config File

```yaml
server:
  port: 8080

database:
  path: "./data/monmon.db"

auth:
  jwt_secret: ""              # auto-generated if empty
  credentials_file: "./configs/credentials.yaml"

notify:
  provider_config: "./configs/notify-provider.yaml"

logging:
  level: "info"               # debug/info/warn/error
  file: "./data/monmon.log"

retention:
  default_keep: 0             # 0=all, N=keep last N checks
  cleanup_interval: "1h"

tools:
  subfinder: "subfinder"
  httpx: "httpx"
```

---

## Docker

```dockerfile
FROM golang:1.22-alpine AS build
RUN apk add --no-cache gcc musl-dev sqlite-dev nodejs npm
WORKDIR /src
COPY . .
RUN cd web && npm ci && npm run build
RUN CGO_ENABLED=1 go build -o /monmon ./cmd/monmon/

FROM alpine:3.19
RUN apk add --no-cache ca-certificates bash
COPY --from=build /monmon /usr/local/bin/
COPY configs/ /etc/monmon/
# install subfinder + httpx
RUN wget -qO- https://github.com/projectdiscovery/subfinder/releases/latest/download/subfinder_linux_amd64.zip | unzip -d /usr/local/bin/ - && \
    wget -qO- https://github.com/projectdiscovery/httpx/releases/latest/download/httpx_linux_amd64.zip | unzip -d /usr/local/bin/ -
EXPOSE 8080
ENTRYPOINT ["monmon"]
CMD ["server", "-c", "/etc/monmon/monmon.yaml"]
```

```yaml
# docker-compose.yml
services:
  monmon:
    build: .
    ports: ["8080:8080"]
    volumes:
      - monmon-data:/data
      - ./configs:/etc/monmon
    restart: unless-stopped
volumes:
  monmon-data:
```

---

## OS Service (systemd)

MonMon runs as a native systemd service — like Apache/Nginx. Survives SSH logout, auto-starts on boot.

### systemd unit file (`init/monmon.service`)

```ini
[Unit]
Description=MonMon - Monitoring Monster
Documentation=https://github.com/<user>/monmon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=monmon
Group=monmon
ExecStart=/usr/local/bin/monmon server -c /etc/monmon/monmon.yaml
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

# Paths
WorkingDirectory=/var/lib/monmon
StandardOutput=journal
StandardError=journal
SyslogIdentifier=monmon

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/monmon /etc/monmon

[Install]
WantedBy=multi-user.target
```

### `monmon service install` does all of this automatically:

```bash
# 1. Copy binary
cp monmon /usr/local/bin/monmon

# 2. Create service user (no login shell, no home)
useradd --system --no-create-home --shell /usr/sbin/nologin monmon

# 3. Create directories
mkdir -p /etc/monmon /var/lib/monmon/data
cp configs/monmon.yaml.example /etc/monmon/monmon.yaml
cp configs/notify-provider.yaml.example /etc/monmon/notify-provider.yaml
chown -R monmon:monmon /var/lib/monmon /etc/monmon

# 4. Install + enable + start service
cp init/monmon.service /etc/systemd/system/monmon.service
systemctl daemon-reload
systemctl enable monmon
systemctl start monmon
```

### Config paths when running as service

| What | Path |
|------|------|
| Binary | `/usr/local/bin/monmon` |
| Config | `/etc/monmon/monmon.yaml` |
| Notify config | `/etc/monmon/notify-provider.yaml` |
| Credentials | `/etc/monmon/credentials.yaml` |
| Database | `/var/lib/monmon/data/monmon.db` |
| Logs | `/var/lib/monmon/data/monmon.log` |
| Service file | `/etc/systemd/system/monmon.service` |

### `service.go` implementation

Uses `github.com/kardianos/service` — cross-platform service library for Go. Handles:
- Linux: systemd (primary), SysV init (fallback)
- macOS: launchd
- Windows: Windows Service Manager

```go
import "github.com/kardianos/service"

type program struct {
    server *Server
}

func (p *program) Start(s service.Service) error {
    go p.server.Run()
    return nil
}

func (p *program) Stop(s service.Service) error {
    return p.server.Shutdown()
}

// monmon service install
func installService() {
    svcConfig := &service.Config{
        Name:        "monmon",
        DisplayName: "MonMon - Monitoring Monster",
        Description: "Diff-based monitoring for commands, endpoints, and subdomains",
        Arguments:   []string{"server", "-c", "/etc/monmon/monmon.yaml"},
    }
    // create user, dirs, copy files, install + enable + start
}
```

### Lifecycle

```
monmon service install   →  copies files, creates user, installs & starts service
monmon service status    →  "monmon is running (PID 1234, uptime 3d 2h 15m)"
monmon service restart   →  systemctl restart monmon
monmon service stop      →  systemctl stop monmon
monmon service uninstall →  stops, disables, removes service file + user (keeps data)
```

Data is **never deleted** on uninstall — DB and configs stay at `/var/lib/monmon` and `/etc/monmon`. User must manually remove if they want a clean slate.

### Viewing logs when running as service

```bash
# via journalctl (systemd native)
journalctl -u monmon -f              # follow live
journalctl -u monmon --since "1h ago"

# via monmon CLI (reads from DB log table)
monmon logs -f
monmon logs --level error

# via web dashboard
http://server:8080 → Logs tab
```

---

## Test Cases

### Command Monitor
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Stable output | `echo hello` ×2 | check1=changed (baseline), check2=success |
| 2 | Changed output | `date +%s` ×2 | check2=changed, diff shows old→new |
| 3 | File mode | cmd writes file, file changes | diff detected |
| 4 | Timeout | `sleep 999`, timeout=2s | status=error, msg=timeout |
| 5 | Nonzero exit | `exit 1` | status=error |
| 6 | Empty output | `echo -n ""` ×2 | both success, hash of empty string |

### Endpoint Monitor
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Body mode | httpbin.org/get ×2 | captures body, compares |
| 2 | Metadata mode | fields=[status_code] | extracts 200, stores as JSON |
| 3 | Regex mode | pattern=`<title>(.*?)</title>` | extracts title only |
| 4 | Full mode | same URL | headers+body captured |
| 5 | 500 response | httpbin.org/status/500 | captured (not error — server responded) |
| 6 | DNS failure | nonexistent.invalid | status=error |
| 7 | Timeout | httpbin.org/delay/30, timeout=2 | status=error |
| 8 | Multiple URLs | 2 URLs | both fetched, combined output |

### Subdomain Monitor
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Builtin flow | example.com | subfinder\|httpx output captured |
| 2 | New subdomain | run1=[a,b], run2=[a,b,c] | diff: +c |
| 3 | Removed subdomain | run1=[a,b], run2=[a] | diff: -b |
| 4 | Custom flow | valid script.sh | script called with domains file, stdout captured |
| 5 | Missing script | /nonexistent.sh | status=error |
| 6 | Empty results | no subs found | success, empty output |

### Scheduler
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Loop basic | interval=5s, wait 12s | ≥2 checks |
| 2 | Loop zero | interval=0, wait 3s | many checks back-to-back |
| 3 | Cron | `* * * * *`, wait ~60s | fires at minute mark |
| 4 | Pause/resume | pause task, wait, resume | no checks while paused |
| 5 | Manual trigger | POST /tasks/:id/run | immediate check |

### Diff
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | No change | same text | empty diff, +0 -0 |
| 2 | Addition | +1 line | diff shows +line, +1 -0 |
| 3 | Removal | -1 line | diff shows -line, +0 -1 |
| 4 | Mixed | +2 -1 | correct unified diff |
| 5 | Empty→content | "" → "hello" | all added |

### Alerts
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | On change | check=changed, on_change=true | alert sent |
| 2 | No change | check=success, on_change=true | no alert |
| 3 | On error | check=error, on_error=true | alert sent |
| 4 | Keyword hit | filter="critical", output has it | alert sent |
| 5 | Keyword miss | filter="critical", output lacks it | alert skipped |

### API
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Login valid | monmon:monmon | 200 + JWT |
| 2 | Login invalid | monmon:wrong | 401 |
| 3 | No token | GET /api/tasks | 401 |
| 4 | CRUD cycle | create→read→update→delete | all succeed, final GET=404 |
| 5 | Search/sort | ?search=api&sort=name | filtered results |
| 6 | Compare | ?from=1&to=3 | diff between check 1 and 3 |

### OS Service
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Install | `monmon service install` (as root) | binary copied, user created, service enabled+started |
| 2 | Status | `monmon service status` | shows running, PID, uptime |
| 3 | Survives logout | install → SSH disconnect → reconnect | service still running, tasks still executing |
| 4 | Auto-start on boot | reboot server | service starts automatically |
| 5 | Stop | `monmon service stop` | process gone, port freed |
| 6 | Restart | `monmon service restart` | new PID, tasks resume from DB |
| 7 | Uninstall | `monmon service uninstall` | service removed, data preserved at /var/lib/monmon |
| 8 | CLI while service runs | `monmon task list` | works (talks to running service via API) |

### Data Retention
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Keep all | retention=0, 50 checks | all 50 exist |
| 2 | Keep 5 | retention=5, 10 checks | only last 5 remain |

---

## Build Phases

**Phase 1 — Skeleton**
- Go module, folder structure, Makefile
- Config loading, SQLite init with GORM auto-migrate
- Logger setup, auth (JWT + default creds)
- `monmon server` and `monmon version` commands

**Phase 2 — Monitors + Diff**
- Monitor interface + 3 implementations (command, endpoint, subdomain)
- Diff engine
- Hash comparison logic

**Phase 3 — Scheduler + Storage**
- Loop + cron scheduler
- Check storage, task state management
- Data retention cleanup

**Phase 4 — Alerts + API**
- PD notify integration
- Alert config CRUD
- Full REST API
- WebSocket for logs

**Phase 5 — Frontend**
- React SPA with all pages
- Diff viewer (GitHub theme)
- Embed in Go binary via `go:embed`

**Phase 6 — OS Service + Docker**
- `internal/service/service.go` (kardianos/service)
- `monmon service install/uninstall/start/stop/restart/status` CLI commands
- systemd unit file (`init/monmon.service`)
- Auto-setup: create user, dirs, copy configs, enable on boot
- Dockerfile + docker-compose

**Phase 7 — Ship**
- README with install/usage/service/docker docs
- Tests
- `make build` produces single binary
