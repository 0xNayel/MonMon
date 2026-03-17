# MonMon (Monitoring Monster) — Full Implementation Plan

> A modular, self-hosted monitoring framework that detects diffs between outputs across commands, endpoints, and subdomains — with scheduling, alerting, and a full dashboard.

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Architecture Overview](#2-architecture-overview)
3. [Project Structure](#3-project-structure)
4. [Module Breakdown](#4-module-breakdown)
5. [Database Schema](#5-database-schema)
6. [Monitoring Engines](#6-monitoring-engines)
7. [Scheduling System](#7-scheduling-system)
8. [Diff Engine](#8-diff-engine)
9. [Alert System](#9-alert-system)
10. [Explorer & Analytics](#10-explorer--analytics)
11. [Web Dashboard](#11-web-dashboard)
12. [REST API](#12-rest-api)
13. [CLI Commands](#13-cli-commands)
14. [Authentication](#14-authentication)
15. [Logging System](#15-logging-system)
16. [Data Retention](#16-data-retention)
17. [Ideas from Analyzed Tools](#17-ideas-from-analyzed-tools)
18. [Test Cases](#18-test-cases)
19. [Docker Setup](#19-docker-setup)
20. [README Outline](#20-readme-outline)
21. [Implementation Phases](#21-implementation-phases)

---

## 1. Technology Stack

| Component | Choice | Justification |
|-----------|--------|---------------|
| **Backend** | **Go 1.22+** | Concurrency (goroutines for parallel monitors), single binary, same language as subfinder/httpx/notify (can import as libraries), excellent subprocess management, low memory footprint |
| **Frontend** | **React 18 + TypeScript + Vite** | Rich interactive dashboard, diff viewer components, real-time WebSocket updates, Tailwind CSS for styling |
| **Database** | **SQLite (default) + PostgreSQL (optional)** | SQLite: zero-config embedded, WAL mode for concurrent reads, perfect for single-instance. PostgreSQL: optional for multi-instance/high-volume deployments |
| **ORM** | **GORM** | Supports both SQLite and PostgreSQL with same codebase, migrations, hooks |
| **Blob Storage** | **Filesystem** | Response bodies / command outputs stored as files, keeps DB lean, easy backup |
| **CLI Framework** | **Cobra + Viper** | Industry standard Go CLI, config file + env var + flag support |
| **HTTP Router** | **Gin** | Fast, middleware support, WebSocket compatible |
| **WebSocket** | **gorilla/websocket** | Real-time log streaming, task status updates |
| **Diff Library** | **go-diff (sergi/go-diff)** | Line/word/character level diffs, unified diff format |
| **Notify** | **projectdiscovery/notify** (Go library import) | Native Go integration, no subprocess overhead |
| **Scheduler** | **robfig/cron/v3** | Cron expressions, timezone support, custom schedules |
| **Logging** | **zerolog** | Structured JSON logging, colored console output, zero allocation |
| **Auth** | **JWT + bcrypt** | Stateless session tokens, secure password hashing |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MonMon Server                            │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  CLI     │  │  REST API    │  │  Web Dashboard (React)    │  │
│  │  (Cobra) │  │  (Gin)       │  │  served by Go as static   │  │
│  └────┬─────┘  └──────┬───────┘  └────────────┬──────────────┘  │
│       │               │                       │                 │
│       └───────────────┼───────────────────────┘                 │
│                       │                                         │
│              ┌────────▼────────┐                                │
│              │   Core Engine   │                                │
│              └────────┬────────┘                                │
│                       │                                         │
│       ┌───────────────┼───────────────────┐                     │
│       │               │                   │                     │
│  ┌────▼─────┐  ┌──────▼──────┐  ┌────────▼────────┐           │
│  │ Command  │  │  Endpoint   │  │   Subdomain     │           │
│  │ Monitor  │  │  Monitor    │  │   Monitor       │           │
│  └────┬─────┘  └──────┬──────┘  └────────┬────────┘           │
│       │               │                   │                     │
│       └───────────────┼───────────────────┘                     │
│                       │                                         │
│              ┌────────▼────────┐                                │
│              │  Diff Engine    │                                │
│              └────────┬────────┘                                │
│                       │                                         │
│            ┌──────────┼──────────┐                              │
│            │          │          │                               │
│     ┌──────▼──┐ ┌─────▼────┐ ┌──▼───────┐                     │
│     │ Storage │ │  Alert   │ │  Logger  │                      │
│     │ (SQLite │ │ (Notify) │ │(zerolog) │                      │
│     │ + FS)   │ │          │ │          │                      │
│     └─────────┘ └──────────┘ └──────────┘                      │
│                                                                 │
│              ┌────────────────┐                                 │
│              │   Scheduler    │                                 │
│              │ (Loop + Cron)  │                                 │
│              └────────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Data Flow:**
```
Task Created → Scheduler Picks Up → Monitor Executes → Output Captured
    → Hash Compared → If Changed: Diff Computed → Stored → Alert Sent
    → If Unchanged: Stored (metadata only) → Next Cycle
```

---

## 3. Project Structure

```
monmon/
├── cmd/
│   └── monmon/
│       └── main.go                  # Entry point
│
├── internal/
│   ├── config/
│   │   ├── config.go                # Config struct & loading
│   │   ├── defaults.go              # Default values
│   │   └── validate.go              # Config validation
│   │
│   ├── core/
│   │   ├── interfaces.go            # Monitor, Storage, Scheduler interfaces
│   │   ├── task.go                  # Task domain model
│   │   ├── check.go                 # Check result model
│   │   ├── diff.go                  # Diff result model
│   │   └── errors.go                # Domain-specific errors
│   │
│   ├── monitor/
│   │   ├── base.go                  # Shared monitoring logic
│   │   ├── command/
│   │   │   ├── executor.go          # Command execution engine
│   │   │   ├── file_watcher.go      # File output mode
│   │   │   └── stdout_capture.go    # Stdout capture mode
│   │   ├── endpoint/
│   │   │   ├── fetcher.go           # HTTP fetching engine
│   │   │   ├── modes.go             # Response body / whole / metadata / regex
│   │   │   └── parser.go            # Response parsing & extraction
│   │   └── subdomain/
│   │       ├── engine.go            # Subdomain monitoring orchestrator
│   │       ├── builtin.go           # Built-in flow (subfinder | httpx)
│   │       ├── full.go              # Full flow (all responses)
│   │       └── custom.go            # User-created flow (.sh runner)
│   │
│   ├── scheduler/
│   │   ├── scheduler.go             # Scheduler manager
│   │   ├── loop.go                  # Loop-with-sleep scheduler
│   │   └── cron.go                  # Cron-based scheduler
│   │
│   ├── diff/
│   │   ├── engine.go                # Diff computation orchestrator
│   │   ├── text.go                  # Line/word/character diff
│   │   ├── metadata.go              # Metadata comparison
│   │   ├── stats.go                 # +added/-removed statistics
│   │   └── render.go                # HTML/terminal diff rendering
│   │
│   ├── alert/
│   │   ├── manager.go               # Alert orchestration
│   │   ├── notify.go                # projectdiscovery/notify integration
│   │   ├── filter.go                # Alert filtering rules
│   │   └── template.go             # Message templates
│   │
│   ├── storage/
│   │   ├── repository.go            # Repository interfaces
│   │   ├── sqlite/
│   │   │   ├── sqlite.go            # SQLite implementation
│   │   │   └── migrations.go        # Schema migrations
│   │   ├── postgres/
│   │   │   ├── postgres.go          # PostgreSQL implementation
│   │   │   └── migrations.go        # Schema migrations
│   │   └── blob/
│   │       └── filesystem.go        # File-based blob storage
│   │
│   ├── auth/
│   │   ├── auth.go                  # Auth service
│   │   ├── jwt.go                   # JWT token management
│   │   └── middleware.go            # Gin auth middleware
│   │
│   ├── api/
│   │   ├── router.go                # Route definitions
│   │   ├── handlers/
│   │   │   ├── tasks.go             # Task CRUD
│   │   │   ├── checks.go            # Check results & history
│   │   │   ├── alerts.go            # Alert config management
│   │   │   ├── explorer.go          # Explorer & analytics
│   │   │   ├── logs.go              # Log viewer
│   │   │   ├── auth.go              # Login/logout
│   │   │   ├── dashboard.go         # Dashboard stats
│   │   │   └── ws.go                # WebSocket handlers
│   │   ├── middleware/
│   │   │   ├── auth.go              # JWT validation
│   │   │   ├── cors.go              # CORS config
│   │   │   └── logger.go            # Request logging
│   │   └── dto/
│   │       ├── request.go           # Request DTOs
│   │       └── response.go          # Response DTOs
│   │
│   ├── logger/
│   │   ├── logger.go                # Logger setup & config
│   │   ├── store.go                 # Log persistence for web viewer
│   │   └── formatter.go            # Colored terminal formatter
│   │
│   └── cli/
│       ├── root.go                  # Root command
│       ├── server.go                # `monmon server` command
│       ├── task.go                  # `monmon task` commands
│       ├── config.go                # `monmon config` commands
│       └── version.go               # `monmon version` command
│
├── web/                             # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── tasks/
│   │   │   │   ├── TaskList.tsx
│   │   │   │   ├── TaskForm.tsx
│   │   │   │   ├── TaskCard.tsx
│   │   │   │   └── TaskFilters.tsx
│   │   │   ├── explorer/
│   │   │   │   ├── DiffViewer.tsx    # GitHub-style diff
│   │   │   │   ├── VersionHistory.tsx
│   │   │   │   ├── CompareView.tsx
│   │   │   │   └── Analytics.tsx
│   │   │   ├── alerts/
│   │   │   │   ├── AlertConfig.tsx
│   │   │   │   ├── WebhookManager.tsx
│   │   │   │   └── AlertHistory.tsx
│   │   │   ├── logs/
│   │   │   │   ├── LogViewer.tsx     # Real-time colored logs
│   │   │   │   └── LogFilters.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── StatsCards.tsx
│   │   │   │   └── ActivityFeed.tsx
│   │   │   └── common/
│   │   │       ├── SearchBar.tsx
│   │   │       ├── SortControls.tsx
│   │   │       ├── Pagination.tsx
│   │   │       └── Badge.tsx
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── TasksPage.tsx
│   │   │   ├── TaskDetailPage.tsx
│   │   │   ├── ExplorerPage.tsx
│   │   │   ├── AlertsPage.tsx
│   │   │   ├── LogsPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── LoginPage.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useTasks.ts
│   │   │   └── useAuth.ts
│   │   ├── services/
│   │   │   └── api.ts               # API client
│   │   ├── types/
│   │   │   └── index.ts             # TypeScript types
│   │   ├── utils/
│   │   │   ├── diff.ts              # Client-side diff rendering
│   │   │   └── format.ts            # Date/size formatters
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── configs/
│   ├── monmon.yaml.example          # Main config example
│   ├── notify-provider.yaml.example # Notify provider config
│   └── credentials.yaml             # Default creds (monmon:monmon)
│
├── scripts/
│   ├── build.sh                     # Build script
│   ├── dev.sh                       # Dev mode (hot reload)
│   └── migrate.sh                   # DB migration helper
│
├── docker/
│   ├── Dockerfile                   # Multi-stage build
│   ├── Dockerfile.dev               # Dev with hot reload
│   └── docker-compose.yml           # Full stack compose
│
├── tests/
│   ├── integration/
│   │   ├── command_test.go
│   │   ├── endpoint_test.go
│   │   ├── subdomain_test.go
│   │   ├── scheduler_test.go
│   │   ├── alert_test.go
│   │   └── api_test.go
│   ├── e2e/
│   │   └── full_flow_test.go
│   └── testdata/
│       ├── sample_responses/
│       ├── sample_commands/
│       └── sample_scripts/
│
├── go.mod
├── go.sum
├── Makefile
├── .goreleaser.yml
├── .gitignore
├── CLAUDE.md
└── README.md
```

---

## 4. Module Breakdown

### 4.1 Config Module (`internal/config/`)

**Config file: `monmon.yaml`**

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  mode: "release"           # debug / release

database:
  driver: "sqlite"          # sqlite / postgres
  sqlite:
    path: "./data/monmon.db"
    wal_mode: true
  postgres:
    host: "localhost"
    port: 5432
    name: "monmon"
    user: "monmon"
    password: "monmon"

storage:
  blob_dir: "./data/blobs"  # where outputs/diffs are stored

auth:
  jwt_secret: "auto"        # auto-generated on first run
  token_expiry: "24h"
  credentials_file: "./configs/credentials.yaml"

notify:
  provider_config: "./configs/notify-provider.yaml"
  default_char_limit: 4000
  rate_limit: 5             # requests per second

logging:
  level: "info"             # debug / info / warn / error
  file: "./data/logs/monmon.log"
  max_size_mb: 100
  max_backups: 5
  console_color: true

data_retention:
  default_keep: 0           # 0 = keep all
  cleanup_interval: "1h"

subdomain_tools:
  subfinder_path: "subfinder"
  httpx_path: "httpx"
```

### 4.2 Core Domain (`internal/core/`)

**Interfaces:**

```go
// Monitor is the interface all monitoring engines must implement
type Monitor interface {
    Execute(ctx context.Context, task *Task) (*CheckResult, error)
    Validate(config json.RawMessage) error
}

// Storage is the data persistence interface
type Storage interface {
    TaskRepository
    CheckRepository
    AlertRepository
    LogRepository
}

type TaskRepository interface {
    CreateTask(ctx context.Context, task *Task) error
    GetTask(ctx context.Context, id int64) (*Task, error)
    ListTasks(ctx context.Context, filter TaskFilter) ([]*Task, int64, error)
    UpdateTask(ctx context.Context, task *Task) error
    DeleteTask(ctx context.Context, id int64) error
}

type CheckRepository interface {
    CreateCheck(ctx context.Context, check *Check) error
    GetCheck(ctx context.Context, id int64) (*Check, error)
    GetLatestCheck(ctx context.Context, taskID int64) (*Check, error)
    ListChecks(ctx context.Context, taskID int64, filter CheckFilter) ([]*Check, int64, error)
    GetCheckOutput(ctx context.Context, checkID int64) ([]byte, error)
    GetCheckDiff(ctx context.Context, checkID int64) ([]byte, error)
    CleanupOldChecks(ctx context.Context, taskID int64, keepCount int) error
}
```

**Task Model:**

```go
type TaskType string

const (
    TaskTypeCommand   TaskType = "command"
    TaskTypeEndpoint  TaskType = "endpoint"
    TaskTypeSubdomain TaskType = "subdomain"
)

type ScheduleType string

const (
    ScheduleLoop ScheduleType = "loop"
    ScheduleCron ScheduleType = "cron"
)

type Task struct {
    ID             int64           `json:"id"`
    Name           string          `json:"name"`
    Type           TaskType        `json:"type"`
    Status         string          `json:"status"` // active, paused, error
    Config         json.RawMessage `json:"config"` // type-specific
    ScheduleType   ScheduleType    `json:"schedule_type"`
    ScheduleConfig json.RawMessage `json:"schedule_config"`
    Tags           []string        `json:"tags"`
    DataRetention  int             `json:"data_retention"` // 0 = use global default
    LastCheckAt    *time.Time      `json:"last_check_at"`
    NextCheckAt    *time.Time      `json:"next_check_at"`
    TotalChecks    int64           `json:"total_checks"`
    TotalChanges   int64           `json:"total_changes"`
    CreatedAt      time.Time       `json:"created_at"`
    UpdatedAt      time.Time       `json:"updated_at"`
}
```

**Type-Specific Config Structs:**

```go
// Command monitoring config
type CommandConfig struct {
    Command    string `json:"command"`              // shell command to execute
    Shell      string `json:"shell,omitempty"`      // default: /bin/bash
    Timeout    int    `json:"timeout,omitempty"`     // seconds, default: 60
    OutputMode string `json:"output_mode"`           // "stdout" or "file"
    OutputFile string `json:"output_file,omitempty"` // path when mode=file
    WorkDir    string `json:"work_dir,omitempty"`    // working directory
}

// Endpoint monitoring config
type EndpointConfig struct {
    URLs        []string          `json:"urls"`
    Method      string            `json:"method,omitempty"`      // GET, POST, etc.
    Headers     map[string]string `json:"headers,omitempty"`
    Body        string            `json:"body,omitempty"`
    Timeout     int               `json:"timeout,omitempty"`     // seconds
    MonitorMode string            `json:"monitor_mode"`          // "body", "full", "metadata", "regex"
    // Metadata mode options
    MetadataFields []string `json:"metadata_fields,omitempty"` // ["status_code", "content_length", "title"]
    // Regex mode options
    RegexPattern string `json:"regex_pattern,omitempty"`
    // Advanced
    FollowRedirects bool   `json:"follow_redirects,omitempty"`
    Proxy           string `json:"proxy,omitempty"`
    TLSSkipVerify   bool   `json:"tls_skip_verify,omitempty"`
}

// Subdomain monitoring config
type SubdomainConfig struct {
    Domains     []string `json:"domains"`
    FlowMode    string   `json:"flow_mode"`             // "builtin", "full", "custom"
    MonitorMode string   `json:"monitor_mode,omitempty"` // same as endpoint (for full/custom)
    MetadataFields []string `json:"metadata_fields,omitempty"`
    RegexPattern   string   `json:"regex_pattern,omitempty"`
    // Custom flow
    ScriptPath string `json:"script_path,omitempty"` // path to .sh file
    // Built-in flow options
    SubfinderFlags string `json:"subfinder_flags,omitempty"` // extra flags
    HttpxFlags     string `json:"httpx_flags,omitempty"`     // extra flags
}
```

**Schedule Config Structs:**

```go
// Loop schedule: run → sleep → run → sleep
type LoopScheduleConfig struct {
    IntervalSeconds int `json:"interval_seconds"` // 0 = no sleep, run immediately
}

// Cron schedule: periodic execution
type CronScheduleConfig struct {
    Expression string `json:"expression"`  // cron expression
    Timezone   string `json:"timezone"`    // e.g., "UTC", "America/New_York"
}
// Helper cron expressions:
// "0 0 1 * *"      = every 1st of the month at midnight
// "0 0 * * 5"      = every Friday at midnight
// "0 12 * * *"     = every day at 12:00 PM
// "0 0 * * *"      = every hour at :00
```

### 4.3 Check Result Model

```go
type CheckStatus string

const (
    CheckSuccess   CheckStatus = "success"    // completed, no change
    CheckChanged   CheckStatus = "changed"    // completed, diff detected
    CheckError     CheckStatus = "error"      // execution failed
)

type Check struct {
    ID           int64           `json:"id"`
    TaskID       int64           `json:"task_id"`
    Version      int             `json:"version"`     // incremental per task
    Status       CheckStatus     `json:"status"`
    OutputHash   string          `json:"output_hash"` // SHA-256 for quick compare
    OutputPath   string          `json:"-"`            // filesystem path
    DiffPath     string          `json:"-"`            // filesystem path (if changed)
    DiffStats    *DiffStats      `json:"diff_stats,omitempty"`
    Metadata     json.RawMessage `json:"metadata,omitempty"` // HTTP status, content-length, etc.
    DurationMs   int64           `json:"duration_ms"`
    ErrorMessage string          `json:"error_message,omitempty"`
    CreatedAt    time.Time       `json:"created_at"`
}

type DiffStats struct {
    Added   int `json:"added"`
    Removed int `json:"removed"`
    Changed int `json:"changed"`
}
```

---

## 5. Database Schema

```sql
-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default: monmon:monmon (bcrypt hash inserted on first run)

-- ============================================================
-- TASKS (monitoring jobs)
-- ============================================================
CREATE TABLE tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT     NOT NULL,
    type            TEXT     NOT NULL CHECK(type IN ('command','endpoint','subdomain')),
    status          TEXT     NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','error')),
    config          TEXT     NOT NULL,  -- JSON blob, type-specific
    schedule_type   TEXT     NOT NULL CHECK(schedule_type IN ('loop','cron')),
    schedule_config TEXT     NOT NULL,  -- JSON blob
    tags            TEXT,               -- comma-separated
    data_retention  INTEGER  DEFAULT 0, -- 0 = global default
    last_check_at   DATETIME,
    next_check_at   DATETIME,
    total_checks    INTEGER  DEFAULT 0,
    total_changes   INTEGER  DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_next_check ON tasks(next_check_at);
CREATE INDEX idx_tasks_tags ON tasks(tags);

-- ============================================================
-- CHECKS (monitoring results / versions)
-- ============================================================
CREATE TABLE checks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    status        TEXT    NOT NULL CHECK(status IN ('success','changed','error')),
    output_hash   TEXT,             -- SHA-256
    output_path   TEXT,             -- filesystem path to output blob
    diff_path     TEXT,             -- filesystem path to diff blob
    diff_added    INTEGER DEFAULT 0,
    diff_removed  INTEGER DEFAULT 0,
    diff_changed  INTEGER DEFAULT 0,
    metadata      TEXT,             -- JSON: status_code, content_length, title, etc.
    duration_ms   INTEGER,
    error_message TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checks_task_id ON checks(task_id);
CREATE INDEX idx_checks_task_version ON checks(task_id, version);
CREATE INDEX idx_checks_status ON checks(status);
CREATE INDEX idx_checks_created ON checks(created_at);

-- ============================================================
-- ALERT CONFIGS
-- ============================================================
CREATE TABLE alert_configs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,  -- NULL = global
    name            TEXT    NOT NULL,
    provider        TEXT    NOT NULL,   -- slack, discord, telegram, etc.
    provider_id     TEXT,               -- specific provider instance ID
    enabled         INTEGER DEFAULT 1,
    -- Filters: what triggers this alert
    on_change       INTEGER DEFAULT 1,  -- alert on any change
    on_error        INTEGER DEFAULT 0,  -- alert on errors
    on_recovery     INTEGER DEFAULT 0,  -- alert when error → success
    keyword_include TEXT,               -- only alert if output contains keyword
    keyword_exclude TEXT,               -- don't alert if output contains keyword
    min_diff_lines  INTEGER DEFAULT 0,  -- minimum diff size to trigger
    -- Template
    message_template TEXT,              -- Go template for message body
    include_diff     INTEGER DEFAULT 1, -- include diff in alert
    include_metadata INTEGER DEFAULT 1, -- include metadata in alert
    max_diff_lines   INTEGER DEFAULT 50,-- truncate diff in alert after N lines
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_configs_task ON alert_configs(task_id);

-- ============================================================
-- ALERT HISTORY
-- ============================================================
CREATE TABLE alert_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_config_id INTEGER NOT NULL REFERENCES alert_configs(id) ON DELETE CASCADE,
    check_id        INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    status          TEXT    NOT NULL CHECK(status IN ('sent','failed','filtered')),
    error_message   TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- LOGS (persisted for web viewer)
-- ============================================================
CREATE TABLE logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    level      TEXT    NOT NULL CHECK(level IN ('debug','info','warn','error')),
    source     TEXT    NOT NULL,  -- module: monitor.command, scheduler, alert, etc.
    task_id    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    message    TEXT    NOT NULL,
    metadata   TEXT,              -- JSON extra context
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_source ON logs(source);
CREATE INDEX idx_logs_task ON logs(task_id);
CREATE INDEX idx_logs_created ON logs(created_at);
```

---

## 6. Monitoring Engines

### 6.1 Command Monitor (`internal/monitor/command/`)

**Modes:**
1. **stdout mode** (default): Run command, capture stdout+stderr, compare with previous
2. **file mode**: Run command, read specified output file, compare with previous

**Flow:**
```
1. Validate command config
2. Create temp working directory (if needed)
3. Execute command via os/exec with context timeout
4. Capture output (stdout or read file)
5. Compute SHA-256 hash of output
6. Compare hash with previous check
7. If different → compute diff → store output + diff
8. If same → store metadata only (no blob duplication)
9. Return CheckResult
```

**Security considerations:**
- Commands run as the monmon process user
- Configurable timeout (default 60s)
- Optional working directory isolation
- No shell injection — commands parsed and executed safely

### 6.2 Endpoint Monitor (`internal/monitor/endpoint/`)

**Modes:**
1. **body** (default): Compare response body only
2. **full**: Compare entire response (headers + body)
3. **metadata**: Compare selected metadata fields (status_code, content_length, title, headers)
4. **regex**: Extract matching content via regex, compare extracted text

**Flow:**
```
1. For each URL in config:
   a. Build HTTP request (method, headers, body, proxy)
   b. Execute request with timeout
   c. Parse response based on monitor_mode
   d. Apply regex filter if mode=regex
   e. Hash the extracted content
   f. Compare with previous → compute diff if changed
   g. Store result
2. Aggregate results for multi-URL tasks
```

**Metadata extraction:**
```go
type EndpointMetadata struct {
    StatusCode    int               `json:"status_code"`
    ContentLength int64             `json:"content_length"`
    Title         string            `json:"title"`          // parsed from <title>
    Headers       map[string]string `json:"headers"`
    ContentType   string            `json:"content_type"`
    ResponseTime  int64             `json:"response_time_ms"`
}
```

### 6.3 Subdomain Monitor (`internal/monitor/subdomain/`)

**Modes:**

#### Built-in Flow
```bash
# Executed internally (Go subprocess pipeline):
subfinder -d <domain> -all -silent | httpx -sc -location -title -cl -td -silent
```
- Monitors: metadata output (status codes, titles, content-lengths, tech detect)
- Compares full httpx output between runs
- Detects: new subdomains, removed subdomains, changed metadata

#### Full Flow
```bash
subfinder -d <domain> -all -silent | httpx -silent
```
- Then fetches each live URL's full response body
- Monitors: every response body for changes
- Heavy but comprehensive

#### Custom Flow
```bash
# User provides: /path/to/script.sh
# MonMon calls: /path/to/script.sh /tmp/monmon_domains_<id>.txt
# MonMon writes domain list to temp file, passes as $1
```
- Framework writes domains to temp file
- Executes user script with temp file as argument
- Captures stdout as monitoring output
- User has full control over the pipeline

**Subdomain-specific diff logic:**
```
Previous run subdomains: [a.example.com, b.example.com, c.example.com]
Current run subdomains:  [a.example.com, c.example.com, d.example.com]

Diff output:
  + d.example.com [200] [New Page] [1234]     # NEW subdomain
  - b.example.com [403] [Forbidden] [0]        # REMOVED subdomain
  ~ c.example.com: title changed "Old" → "New" # CHANGED metadata
```

---

## 7. Scheduling System

### 7.1 Architecture

```go
type Scheduler struct {
    store     Storage
    monitors  map[TaskType]Monitor
    alertMgr  *AlertManager
    diffEng   *DiffEngine
    logger    *Logger

    tasks     sync.Map              // active task goroutines
    cron      *cron.Cron            // robfig/cron instance
    ctx       context.Context
    cancel    context.CancelFunc
}
```

### 7.2 Loop Scheduler

```go
// For each task with schedule_type=loop:
func (s *Scheduler) runLoop(task *Task) {
    interval := parseLoopConfig(task.ScheduleConfig)
    for {
        select {
        case <-s.ctx.Done():
            return
        default:
            s.executeCheck(task)
            if interval > 0 {
                time.Sleep(interval)
            }
            // interval=0 means run immediately after completion
        }
    }
}
```

### 7.3 Cron Scheduler

```go
// For each task with schedule_type=cron:
func (s *Scheduler) registerCron(task *Task) {
    config := parseCronConfig(task.ScheduleConfig)
    s.cron.AddFunc(config.Expression, func() {
        s.executeCheck(task)
    })
}

// Common cron patterns (exposed in UI):
// ┌───────── minute (0-59)
// │ ┌─────── hour (0-23)
// │ │ ┌───── day of month (1-31)
// │ │ │ ┌─── month (1-12)
// │ │ │ │ ┌─ day of week (0-6, Sun=0)
// "0 0 1 * *"   → Monthly on the 1st at midnight
// "0 0 * * 5"   → Every Friday at midnight
// "0 12 * * *"  → Every day at noon
// "0 * * * *"   → Every hour at :00
// "@every 30m"  → Every 30 minutes (robfig extension)
```

### 7.4 Check Execution (shared)

```go
func (s *Scheduler) executeCheck(task *Task) {
    // 1. Get appropriate monitor engine
    monitor := s.monitors[task.Type]

    // 2. Execute the check
    result, err := monitor.Execute(s.ctx, task)

    // 3. Get previous check for comparison
    prev, _ := s.store.GetLatestCheck(s.ctx, task.ID)

    // 4. Compare hashes
    if prev != nil && prev.OutputHash == result.OutputHash {
        result.Status = CheckSuccess // no change
    } else if prev != nil {
        result.Status = CheckChanged
        // 5. Compute diff
        diff := s.diffEng.Compute(prevOutput, result.Output)
        result.DiffStats = diff.Stats
        s.store.SaveDiff(result.ID, diff.Unified)
    }

    // 6. Store check result
    s.store.CreateCheck(s.ctx, result)

    // 7. Trigger alerts if changed or error
    if result.Status == CheckChanged || result.Status == CheckError {
        s.alertMgr.Process(task, result)
    }

    // 8. Update task metadata
    s.store.UpdateTaskAfterCheck(task.ID, result)
}
```

---

## 8. Diff Engine

### 8.1 Diff Modes

| Mode | Use Case | Algorithm |
|------|----------|-----------|
| **Line diff** | Default for all text outputs | Myers diff (go-diff) |
| **Word diff** | Endpoint body changes | Word-level tokenization + Myers |
| **Character diff** | Small metadata changes | Character-level Myers |
| **Structured diff** | JSON API responses | Key-path comparison |
| **Metadata diff** | Status code, headers | Field-by-field comparison |

### 8.2 Diff Output Format (GitHub-style)

```
--- Version 4 (2026-03-12 10:00:00)
+++ Version 5 (2026-03-12 11:00:00)

@@ -12,4 +12,5 @@
 unchanged line
-removed line
+added line
+another added line
 unchanged line

Stats: +2 added, -1 removed
```

### 8.3 Diff Storage

- Diffs stored as unified diff format files in blob storage
- Path: `<blob_dir>/tasks/<task_id>/diffs/<check_id>.diff`
- Outputs: `<blob_dir>/tasks/<task_id>/outputs/<check_id>.out`
- Only changed outputs are stored as full blobs; unchanged checks reference previous blob via hash

---

## 9. Alert System

### 9.1 Notify Integration

```go
import (
    "github.com/projectdiscovery/notify/pkg/engine"
)

type AlertManager struct {
    notifier *engine.Notify
    store    Storage
    logger   *Logger
}

func (a *AlertManager) Process(task *Task, check *Check) {
    // 1. Load alert configs for this task + global configs
    configs := a.store.GetAlertConfigs(task.ID)

    for _, cfg := range configs {
        // 2. Apply filters
        if !a.passesFilter(cfg, check) {
            a.logFiltered(cfg, check)
            continue
        }

        // 3. Render message from template
        msg := a.renderTemplate(cfg, task, check)

        // 4. Send via notify
        err := a.notifier.SendNotification(msg, cfg.Provider, cfg.ProviderID)

        // 5. Log result
        a.store.CreateAlertHistory(cfg.ID, check.ID, err)
    }
}
```

### 9.2 Alert Dashboard Controls

The web dashboard provides granular control over what gets sent:

```
┌─────────────────────────────────────────────────┐
│ Alert Configuration: "Production API Monitor"    │
├─────────────────────────────────────────────────┤
│ Provider: [Slack ▼]  Channel: #alerts           │
│                                                  │
│ Triggers:                                        │
│   ☑ On Change    ☐ On Error    ☐ On Recovery    │
│                                                  │
│ Filters:                                         │
│   Include keyword: [____________]                │
│   Exclude keyword: [____________]                │
│   Min diff lines:  [0_________]                  │
│                                                  │
│ Message Content:                                 │
│   ☑ Include diff (max [50] lines)               │
│   ☑ Include metadata                             │
│   ☐ Include full output                          │
│                                                  │
│ Template:                                        │
│   ┌────────────────────────────────────────┐     │
│   │ 🔔 {{.Task.Name}} changed!            │     │
│   │ Version: {{.Check.Version}}             │     │
│   │ +{{.Diff.Added}} / -{{.Diff.Removed}} │     │
│   │ {{.DiffContent}}                        │     │
│   └────────────────────────────────────────┘     │
│                                                  │
│ [Test Alert]  [Save]  [Delete]                   │
└─────────────────────────────────────────────────┘
```

### 9.3 Default Message Template

```
MonMon Alert: {{.Task.Name}}
Type: {{.Task.Type}}
Status: {{.Check.Status}}
Version: #{{.Check.Version}}
Time: {{.Check.CreatedAt.Format "2006-01-02 15:04:05"}}
Duration: {{.Check.DurationMs}}ms

{{if .DiffStats}}
Changes: +{{.DiffStats.Added}} -{{.DiffStats.Removed}}
{{end}}

{{if .DiffContent}}
--- Diff ---
{{.DiffContent}}
{{end}}
```

---

## 10. Explorer & Analytics

### 10.1 Version History View

```
Task: "API Health Check" (endpoint)
URL: https://api.example.com/health

Version History:
┌─────┬───────────┬──────────┬────────┬───────────┬──────────┐
│  #  │ Timestamp │  Status  │  Diff  │ Duration  │ Actions  │
├─────┼───────────┼──────────┼────────┼───────────┼──────────┤
│  12 │ 03-13 11:00│ changed │ +3 -1  │   245ms  │ [View]   │
│  11 │ 03-13 10:00│ success │   —    │   198ms  │ [View]   │
│  10 │ 03-13 09:00│ changed │ +0 -5  │   312ms  │ [View]   │
│   9 │ 03-13 08:00│ error   │   —    │  5001ms  │ [View]   │
│  ...│           │          │        │          │          │
└─────┴───────────┴──────────┴────────┴───────────┴──────────┘

Compare: [v10 ▼] ⟷ [v12 ▼]  [Compare]
```

### 10.2 Diff Viewer (GitHub Theme)

```
Compare Version 10 → Version 12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 1  │   {
 2  │     "status": "healthy",
 3  │ -   "database": "connected",
    │ +   "database": "degraded",
 4  │     "cache": "active",
    │ +   "queue": "backing_up",
    │ +   "queue_size": 15234,
 5  │ -   "version": "2.3.0"
    │ +   "version": "2.4.0"
 6  │   }

Stats: 3 additions, 2 deletions
```

### 10.3 Analytics Dashboard

```
Task Analytics: "API Health Check"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Checks: 1,247          Changes Detected: 89 (7.1%)
Error Rate: 2.3%             Avg Response Time: 234ms

Change Frequency:
  ▁▂▃▅▇█▅▃▂▁▂▃  (last 30 days, bar chart)

Response Time Trend:
  ──╲──╱──────  (line chart, last 30 days)

Status Distribution:
  ████████████░░  Success: 85.6%
  ██░░░░░░░░░░░░  Changed: 7.1%
  █░░░░░░░░░░░░░  Error: 2.3%
```

---

## 11. Web Dashboard

### 11.1 Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Auth page |
| `/` | Dashboard | Overview stats, recent activity, active tasks |
| `/tasks` | Task List | All tasks with search/sort/filter |
| `/tasks/new` | Create Task | Multi-step form for task creation |
| `/tasks/:id` | Task Detail | Config, status, recent checks, quick actions |
| `/tasks/:id/history` | Version History | All check versions with diff access |
| `/tasks/:id/compare` | Compare View | Side-by-side or unified diff between versions |
| `/explorer` | Explorer | Cross-task analytics, global search |
| `/alerts` | Alert Config | Manage alert rules and webhook settings |
| `/alerts/history` | Alert History | Log of all sent/filtered alerts |
| `/logs` | Log Viewer | Real-time colored log stream |
| `/settings` | Settings | General settings, data retention, tools paths |

### 11.2 Dashboard Page

```
┌──────────────────────────────────────────────────────────────┐
│  MonMon Dashboard                              [user ▼]      │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                    │
│ ■ Dash   │   Active Tasks: 24    Changes (24h): 7            │
│ □ Tasks  │   Errors: 2           Alerts Sent: 12             │
│ □ Explore│                                                    │
│ □ Alerts │   ┌─ Recent Activity ─────────────────────────┐   │
│ □ Logs   │   │ 11:02 ✓ API Health - no change            │   │
│ □ Config │   │ 11:00 △ Subdomain Scan - 2 new found      │   │
│          │   │ 10:58 ✗ SSL Check - timeout                │   │
│          │   │ 10:55 △ Price Monitor - price changed      │   │
│          │   └───────────────────────────────────────────┘   │
│          │                                                    │
│          │   ┌─ Tasks by Type ──┐  ┌─ Error Rate ─────────┐ │
│          │   │ Command:    8    │  │  ▁▂▁▃▇▂▁ (7 days)   │ │
│          │   │ Endpoint:  12    │  │                       │ │
│          │   │ Subdomain:  4    │  │  Current: 2.3%       │ │
│          │   └──────────────────┘  └───────────────────────┘ │
└──────────┴───────────────────────────────────────────────────┘
```

### 11.3 Task Creation Flow

**Step 1: Choose Type**
```
[Command]  [Endpoint]  [Subdomain]
```

**Step 2: Configure (varies by type)**

Command:
```
Command: [nmap -sV target.com -oN /tmp/scan.txt____]
Output Mode: (●) stdout  (○) Monitor file: [__________]
Working Directory: [/tmp_______] (optional)
Timeout: [60] seconds
```

Endpoint:
```
URLs (one per line):
┌─────────────────────────────────────┐
│ https://api.example.com/health      │
│ https://api.example.com/status      │
└─────────────────────────────────────┘
Monitor Mode: (○) Response Body  (○) Full Response
              (●) Metadata       (○) Regex Pattern
Metadata Fields: ☑ Status Code  ☑ Content Length
                 ☑ Title        ☐ Headers
```

Subdomain:
```
Domains (one per line):
┌─────────────────────────────────────┐
│ example.com                          │
│ example.org                          │
└─────────────────────────────────────┘
Flow Mode: (●) Built-in (subfinder|httpx metadata)
           (○) Full (all responses)
           (○) Custom Script: [/path/to/script.sh]
```

**Step 3: Schedule**
```
Schedule Type: (●) Loop  (○) Periodic (Cron)

Loop Mode:
  Interval: [30] minutes  (0 = continuous)

Periodic Mode:
  Quick Presets:
    [Every Hour] [Daily at Noon] [Weekly Friday] [Monthly 1st]
  Custom Cron: [0 */6 * * *]
  Timezone: [UTC ▼]
```

**Step 4: Alert (optional)**
```
☑ Enable alerts for this task
Provider: [Slack ▼]
[Configure Alert →]
```

**Step 5: Advanced**
```
Tags: [security, production]
Data Retention: (●) Global default (keep all)
                (○) Keep last [__] versions
Name: [API Health Monitor_________________]
```

---

## 12. REST API

### 12.1 Endpoints

```
Authentication:
  POST   /api/auth/login              # Login, returns JWT
  POST   /api/auth/logout             # Invalidate token
  GET    /api/auth/me                  # Current user info

Tasks:
  GET    /api/tasks                    # List tasks (search, sort, filter, paginate)
  POST   /api/tasks                    # Create task
  GET    /api/tasks/:id                # Get task details
  PUT    /api/tasks/:id                # Update task
  DELETE /api/tasks/:id                # Delete task
  POST   /api/tasks/:id/pause         # Pause task
  POST   /api/tasks/:id/resume        # Resume task
  POST   /api/tasks/:id/run           # Trigger immediate check
  GET    /api/tasks/:id/stats         # Task analytics/stats

Checks:
  GET    /api/tasks/:id/checks         # List checks (paginate, filter by status)
  GET    /api/checks/:id               # Get check details
  GET    /api/checks/:id/output        # Get check output (raw)
  GET    /api/checks/:id/diff          # Get diff (raw unified format)
  GET    /api/checks/compare           # Compare two checks (?from=X&to=Y)

Alerts:
  GET    /api/alerts                    # List alert configs
  POST   /api/alerts                    # Create alert config
  GET    /api/alerts/:id                # Get alert config
  PUT    /api/alerts/:id                # Update alert config
  DELETE /api/alerts/:id                # Delete alert config
  POST   /api/alerts/:id/test          # Send test alert
  GET    /api/alerts/history            # Alert send history
  GET    /api/alerts/providers          # List available notify providers

Logs:
  GET    /api/logs                      # List logs (filter, paginate)
  WS     /api/ws/logs                   # Real-time log stream

Dashboard:
  GET    /api/dashboard/stats           # Global statistics
  GET    /api/dashboard/activity        # Recent activity feed

Explorer:
  GET    /api/explorer/search           # Global search across tasks/checks
  GET    /api/explorer/analytics        # Cross-task analytics

Settings:
  GET    /api/settings                  # Get current settings
  PUT    /api/settings                  # Update settings

Import/Export:
  POST   /api/import/tasks             # Import tasks from JSON
  GET    /api/export/tasks             # Export all tasks as JSON
```

### 12.2 Query Parameters for Task List

```
GET /api/tasks?type=endpoint&status=active&tag=production&search=api
    &sort=name&order=asc&page=1&per_page=20
```

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by task type |
| `status` | string | Filter by status |
| `tag` | string | Filter by tag |
| `search` | string | Search in name, command, URL |
| `sort` | string | Sort field: name, type, status, created_at, last_check_at, total_changes |
| `order` | string | asc / desc |
| `page` | int | Page number (default 1) |
| `per_page` | int | Items per page (default 20, max 100) |

---

## 13. CLI Commands

```bash
# Server
monmon server                          # Start server (web + scheduler)
monmon server --port 8080              # Custom port
monmon server --config /path/to/config # Custom config

# Tasks
monmon task list                       # List all tasks
monmon task list --type endpoint       # Filter by type
monmon task list --status active       # Filter by status
monmon task list --tag security        # Filter by tag
monmon task list --search "api"        # Search
monmon task list --sort name --order asc

monmon task create                     # Interactive task creation
monmon task create --from-file task.json

monmon task show <id>                  # Show task details + recent checks
monmon task run <id>                   # Trigger immediate check
monmon task pause <id>
monmon task resume <id>
monmon task delete <id>

# Quick task creation shortcuts
monmon task add-cmd "nmap -sV target" --interval 1h --name "Nmap Scan"
monmon task add-url "https://example.com" --mode metadata --interval 30m
monmon task add-domain "example.com" --flow builtin --interval 6h

# Checks / History
monmon check list <task_id>            # List check history
monmon check show <check_id>           # Show check details
monmon check diff <check_id>           # Show diff for a check
monmon check compare <id1> <id2>       # Compare two checks
monmon check output <check_id>         # Print raw output

# Alerts
monmon alert list
monmon alert test <alert_id>           # Send test notification

# Logs
monmon logs                            # Tail logs
monmon logs --level error              # Filter by level
monmon logs --task <id>                # Filter by task
monmon logs --follow                   # Stream mode

# Config
monmon config show                     # Show current config
monmon config init                     # Generate default config files
monmon config validate                 # Validate config

# Import/Export
monmon export > tasks.json
monmon import tasks.json

# Version
monmon version
```

---

## 14. Authentication

### 14.1 Default Credentials

```yaml
# configs/credentials.yaml (on host filesystem only)
users:
  - username: monmon
    password: monmon    # plaintext here, bcrypt-hashed on load
```

- On first startup, MonMon hashes the plaintext password and stores the hash in the database
- Credentials can ONLY be reset by editing `credentials.yaml` on the host OS and restarting
- The web UI does NOT have a password change feature (security: prevents remote credential tampering)
- On restart, MonMon checks `credentials.yaml` → if different from DB, updates the DB hash

### 14.2 JWT Flow

```
1. POST /api/auth/login { username, password }
2. Server verifies bcrypt hash
3. Returns JWT token (24h expiry, configurable)
4. Client stores token in localStorage
5. All API requests include: Authorization: Bearer <token>
6. Middleware validates token on protected routes
```

---

## 15. Logging System

### 15.1 Dual Output

1. **File/Console** — zerolog with colored output for terminal, JSON for file
2. **Database** — stored in `logs` table for web viewer

### 15.2 Log Levels & Colors

| Level | Color | Use |
|-------|-------|-----|
| DEBUG | Gray | Detailed execution info |
| INFO | Blue | Normal operations |
| WARN | Yellow | Non-critical issues |
| ERROR | Red | Failures, exceptions |

### 15.3 Log Format (Console)

```
2026-03-13 11:00:02 [INFO]  scheduler       │ Task #12 "API Monitor" check started
2026-03-13 11:00:02 [INFO]  monitor.endpoint │ Fetching https://api.example.com/health
2026-03-13 11:00:03 [INFO]  monitor.endpoint │ Response: 200 OK (245ms, 1.2KB)
2026-03-13 11:00:03 [INFO]  diff             │ Change detected: +3 -1 lines
2026-03-13 11:00:03 [INFO]  alert            │ Sending Slack notification → #alerts
2026-03-13 11:00:03 [INFO]  scheduler        │ Task #12 next check at 11:30:00
2026-03-13 11:00:05 [WARN]  monitor.command  │ Task #7 "SSL Check" timeout after 60s
2026-03-13 11:00:05 [ERROR] monitor.command  │ Task #7 exit code 1: connection refused
```

### 15.4 Web Log Viewer

- Real-time streaming via WebSocket
- Filter by: level, source module, task ID, date range, keyword search
- Color-coded by level
- Click on task reference to jump to task detail
- Auto-scroll with pause button
- Download logs as file

---

## 16. Data Retention

### 16.1 Configuration

```yaml
# Global default
data_retention:
  default_keep: 0           # 0 = keep all versions forever
  cleanup_interval: "1h"    # how often to run cleanup

# Per-task override (in task config)
data_retention: 5           # keep last 5 checks only
```

### 16.2 Cleanup Logic

```go
func (s *Storage) CleanupOldChecks(taskID int64, keepCount int) {
    if keepCount <= 0 {
        return // keep all
    }
    // 1. Get total checks for task
    // 2. If total > keepCount:
    //    a. Delete oldest checks (DB rows)
    //    b. Delete associated blob files (outputs + diffs)
    //    c. Log cleanup action
}
```

### 16.3 Behavior

- Cleanup runs on a configurable interval (default: every 1 hour)
- Per-task retention overrides global default
- When `data_retention=5`: keeps the 5 most recent checks, deletes older ones
- Blob files (outputs/diffs) are deleted alongside DB records
- Cleanup is logged for audit purposes

---

## 17. Ideas from Analyzed Tools

### 17.1 From changedetection.io

| Feature | Priority | Description |
|---------|----------|-------------|
| **CSS/XPath selector** | Medium | Filter endpoint response by CSS selector or XPath before comparing — useful for monitoring specific page sections |
| **JSONPath filter** | Medium | For JSON API endpoints, compare only specific JSON paths (e.g., `$.data.price`) |
| **Tag-based grouping** | High | Already in plan (tags field). Add UI tag filtering and color-coded badges |
| **Import/Export** | Medium | Import task list from JSON/CSV. Export for backup/migration |
| **Conditional triggers** | High | Already in alert filters (keyword_include/exclude). Extend with: diff size threshold, specific status codes |
| **Proxy per task** | Low | Already in endpoint config. Useful for monitoring geo-restricted content |
| **REST API** | High | Already in plan. Add OpenAPI spec generation |
| **Visual selector** | Low | Future: point-and-click CSS selector tool for non-technical users |

### 17.2 From Prometheus

| Feature | Priority | Description |
|---------|----------|-------------|
| **Labels/dimensions** | High | Tags system already covers this. Ensure multi-tag filtering works well |
| **Retention policies** | High | Already in plan (data_retention per task + global) |
| **Self-monitoring** | Medium | MonMon should monitor its own health: scheduler queue depth, check success rate, storage usage, alert delivery rate. Expose as `/api/health` |
| **Time-series metrics** | Medium | Store check duration, response size over time for trend analysis in explorer |
| **Service discovery** | Low | Future: auto-discover endpoints from config files or service mesh |

### 17.3 From Huginn

| Feature | Priority | Description |
|---------|----------|-------------|
| **Task chaining/pipelines** | Medium | Output of one task feeds as input to another (e.g., subdomain discovery → endpoint monitoring for each). Implement as `depends_on` field |
| **Spike detection** | Medium | Alert when change frequency exceeds normal baseline (e.g., "this endpoint usually changes once/week but changed 10 times today") |
| **Digest notifications** | Medium | Batch multiple changes into a single periodic summary instead of individual alerts. Add `digest_interval` to alert config |
| **Event-driven triggers** | Low | Future: trigger task on external webhook (not just schedule) |

### 17.4 Implementation Priority

**Phase 1 (Core):** All features from user requirements
**Phase 2 (Enhanced):** High-priority items from analyzed tools
**Phase 3 (Advanced):** Medium-priority items
**Phase 4 (Future):** Low-priority items

---

## 18. Test Cases

### 18.1 Command Monitor Tests

```
TC-CMD-001: Basic stdout monitoring
  Input:  Command "echo hello world", interval 10s
  Action: Execute twice with same output
  Expect: Check 1 = first capture (changed vs nothing), Check 2 = success (no change)

TC-CMD-002: Stdout change detection
  Input:  Command "date +%s" (outputs current timestamp)
  Action: Execute twice with >1s gap
  Expect: Check 2 = changed, diff shows old→new timestamp

TC-CMD-003: File output monitoring
  Input:  Command "echo test > /tmp/monmon_test.txt", mode=file, file=/tmp/monmon_test.txt
  Action: Execute, then modify file content, execute again
  Expect: Check 2 = changed, diff shows file content diff

TC-CMD-004: Command timeout
  Input:  Command "sleep 120", timeout=2
  Action: Execute
  Expect: Check = error, error_message contains "timeout"

TC-CMD-005: Command failure (non-zero exit)
  Input:  Command "exit 1"
  Action: Execute
  Expect: Check = error, error_message contains exit code

TC-CMD-006: Empty output handling
  Input:  Command "echo -n ''" (empty output)
  Action: Execute twice
  Expect: Both checks succeed, output_hash is hash of empty string

TC-CMD-007: Large output handling
  Input:  Command that generates 10MB output
  Action: Execute
  Expect: Output stored as blob file, hash computed correctly

TC-CMD-008: Working directory
  Input:  Command "pwd", work_dir="/tmp"
  Action: Execute
  Expect: Output = "/tmp"

TC-CMD-009: Multi-line output diff
  Input:  First run outputs lines 1-10, second run outputs lines 1-8,11-12
  Action: Execute twice
  Expect: Diff shows -2 removed (lines 9-10), +2 added (lines 11-12)

TC-CMD-010: Special characters in output
  Input:  Command outputs Unicode, ANSI codes, binary-like content
  Expect: Stored correctly, diff computed without corruption
```

### 18.2 Endpoint Monitor Tests

```
TC-EP-001: Basic body monitoring
  Input:  URL "https://httpbin.org/get", mode=body
  Action: Execute twice
  Expect: Body captured, hash compared (httpbin includes timestamp → will change)

TC-EP-002: Metadata monitoring
  Input:  URL "https://httpbin.org/status/200", mode=metadata, fields=[status_code, content_length]
  Action: Execute twice
  Expect: Metadata extracted and compared

TC-EP-003: Regex extraction
  Input:  URL "https://example.com", mode=regex, pattern="<title>(.*?)</title>"
  Action: Execute
  Expect: Only title text captured and stored

TC-EP-004: Full response monitoring
  Input:  URL "https://httpbin.org/get", mode=full
  Action: Execute
  Expect: Headers + body captured

TC-EP-005: Multiple URLs
  Input:  URLs ["https://example.com", "https://example.org"], mode=body
  Action: Execute
  Expect: Both responses captured, concatenated or stored separately

TC-EP-006: HTTP error handling
  Input:  URL "https://httpbin.org/status/500", mode=body
  Action: Execute
  Expect: Check captures the 500 response (not an error — server responded)

TC-EP-007: Connection failure
  Input:  URL "https://nonexistent.invalid.test"
  Action: Execute
  Expect: Check = error, error_message contains DNS/connection error

TC-EP-008: Timeout handling
  Input:  URL "https://httpbin.org/delay/30", timeout=2
  Expect: Check = error, timeout

TC-EP-009: POST request with body
  Input:  URL "https://httpbin.org/post", method=POST, body='{"key":"value"}'
  Expect: Response captured correctly

TC-EP-010: Custom headers
  Input:  URL with custom Authorization header
  Expect: Header sent, response captured

TC-EP-011: Redirect handling
  Input:  URL that 301 redirects, follow_redirects=true
  Expect: Final response captured

TC-EP-012: Title extraction in metadata
  Input:  URL "https://example.com", metadata_fields=["title"]
  Expect: Metadata contains {"title": "Example Domain"}

TC-EP-013: Content-length change detection
  Input:  Mock server returns 100 bytes, then 150 bytes
  Expect: Metadata diff shows content_length: 100 → 150

TC-EP-014: Status code change detection
  Input:  Mock server returns 200, then 503
  Expect: Metadata diff shows status_code: 200 → 503
```

### 18.3 Subdomain Monitor Tests

```
TC-SUB-001: Built-in flow execution
  Input:  Domain "example.com", flow=builtin
  Action: Execute (requires subfinder + httpx installed)
  Expect: Captures subfinder|httpx metadata output

TC-SUB-002: New subdomain detection
  Input:  Run 1: [a.ex.com, b.ex.com], Run 2: [a.ex.com, b.ex.com, c.ex.com]
  Action: Compare
  Expect: Diff shows + c.ex.com (new subdomain)

TC-SUB-003: Removed subdomain detection
  Input:  Run 1: [a.ex.com, b.ex.com], Run 2: [a.ex.com]
  Action: Compare
  Expect: Diff shows - b.ex.com (removed)

TC-SUB-004: Metadata change detection (built-in)
  Input:  Run 1: a.ex.com [200][Title A][1234], Run 2: a.ex.com [200][Title B][1234]
  Expect: Diff shows title change for a.ex.com

TC-SUB-005: Full flow execution
  Input:  Domain "example.com", flow=full
  Expect: Each live subdomain's full response body captured and stored

TC-SUB-006: Custom flow execution
  Input:  Domain "example.com", flow=custom, script="/path/to/custom.sh"
  Expect: Script called with domains file as $1, stdout captured

TC-SUB-007: Custom script missing
  Input:  flow=custom, script="/nonexistent.sh"
  Expect: Check = error, "script not found"

TC-SUB-008: Custom script not executable
  Input:  Script exists but not +x
  Expect: Check = error, "permission denied"

TC-SUB-009: Multiple domains
  Input:  domains: ["example.com", "example.org"]
  Expect: Both domains processed, results combined

TC-SUB-010: Empty subdomain results
  Input:  Domain with no subdomains found
  Expect: Check succeeds with empty output, no false diff
```

### 18.4 Scheduler Tests

```
TC-SCH-001: Loop scheduler basic
  Input:  Task with loop interval=5s
  Action: Start scheduler, wait 12s
  Expect: At least 2 checks executed

TC-SCH-002: Loop scheduler zero interval
  Input:  Task with loop interval=0
  Action: Start scheduler, wait 3s
  Expect: Multiple checks executed back-to-back (no sleep)

TC-SCH-003: Cron scheduler
  Input:  Task with cron="* * * * *" (every minute)
  Action: Start scheduler, wait for next minute boundary
  Expect: Check executes at the minute mark

TC-SCH-004: Task pause/resume
  Input:  Active task, pause it, wait, resume
  Expect: No checks while paused, checks resume after unpause

TC-SCH-005: Manual trigger
  Input:  Task with interval=1h
  Action: Trigger manual run via API
  Expect: Check executes immediately, next scheduled check unaffected

TC-SCH-006: Concurrent task execution
  Input:  20 tasks all due at the same time
  Expect: All execute concurrently (goroutines), no deadlocks

TC-SCH-007: Scheduler recovery after restart
  Input:  Stop server, restart
  Expect: All active tasks resume scheduling from where they left off

TC-SCH-008: Cron timezone
  Input:  Cron "0 12 * * *" timezone="US/Eastern"
  Expect: Executes at noon Eastern, not UTC
```

### 18.5 Diff Engine Tests

```
TC-DIFF-001: Identical content
  Input:  "hello world" vs "hello world"
  Expect: No diff, stats: {added:0, removed:0, changed:0}

TC-DIFF-002: Single line change
  Input:  "hello world" vs "hello earth"
  Expect: Diff shows word change, stats: {added:0, removed:0, changed:1}

TC-DIFF-003: Line addition
  Input:  "line1\nline2" vs "line1\nline2\nline3"
  Expect: Diff shows +line3, stats: {added:1, removed:0}

TC-DIFF-004: Line removal
  Input:  "line1\nline2\nline3" vs "line1\nline3"
  Expect: Diff shows -line2, stats: {removed:1}

TC-DIFF-005: Empty to content
  Input:  "" vs "new content"
  Expect: Diff shows all added

TC-DIFF-006: Content to empty
  Input:  "existing content" vs ""
  Expect: Diff shows all removed

TC-DIFF-007: Large diff performance
  Input:  10,000 line file with 100 scattered changes
  Expect: Diff computed in <1 second

TC-DIFF-008: Binary-like content
  Input:  Content with null bytes / non-UTF8
  Expect: Handled gracefully (hash comparison works, diff may show as "binary changed")

TC-DIFF-009: Metadata diff
  Input:  {status:200, title:"A"} vs {status:200, title:"B"}
  Expect: Diff shows title: "A" → "B"

TC-DIFF-010: GitHub-style rendering
  Input:  Multi-line diff
  Expect: HTML output with green (+) and red (-) lines, line numbers
```

### 18.6 Alert System Tests

```
TC-ALT-001: Alert on change
  Input:  Alert config with on_change=true, check status=changed
  Expect: Notification sent

TC-ALT-002: No alert on no change
  Input:  Alert config with on_change=true, check status=success
  Expect: No notification sent

TC-ALT-003: Alert on error
  Input:  Alert config with on_error=true, check status=error
  Expect: Notification sent

TC-ALT-004: Keyword include filter
  Input:  Alert with keyword_include="critical", output contains "critical error"
  Expect: Alert sent

TC-ALT-005: Keyword include filter - no match
  Input:  Alert with keyword_include="critical", output is "normal response"
  Expect: Alert filtered (not sent), logged as filtered

TC-ALT-006: Keyword exclude filter
  Input:  Alert with keyword_exclude="ignore", output contains "ignore this"
  Expect: Alert filtered

TC-ALT-007: Min diff lines filter
  Input:  Alert with min_diff_lines=5, diff has 2 lines
  Expect: Alert filtered

TC-ALT-008: Template rendering
  Input:  Template with {{.Task.Name}}, task name="API Monitor"
  Expect: Message contains "API Monitor"

TC-ALT-009: Diff truncation
  Input:  Alert with max_diff_lines=10, diff has 50 lines
  Expect: Message contains first 10 lines + "... (40 more lines)"

TC-ALT-010: Multiple providers
  Input:  Task with Slack + Telegram alert configs
  Expect: Both providers receive notifications

TC-ALT-011: Provider failure handling
  Input:  Invalid Slack webhook URL
  Expect: Alert history records status=failed with error, other providers unaffected

TC-ALT-012: Test alert
  Input:  POST /api/alerts/:id/test
  Expect: Test message sent with sample data
```

### 18.7 API Tests

```
TC-API-001: Login with valid credentials
  Input:  POST /api/auth/login {username:"monmon", password:"monmon"}
  Expect: 200, JWT token returned

TC-API-002: Login with invalid credentials
  Input:  POST /api/auth/login {username:"monmon", password:"wrong"}
  Expect: 401 Unauthorized

TC-API-003: Protected route without token
  Input:  GET /api/tasks (no Authorization header)
  Expect: 401 Unauthorized

TC-API-004: Create task
  Input:  POST /api/tasks with valid command task config
  Expect: 201 Created, task returned with ID

TC-API-005: Create task - invalid config
  Input:  POST /api/tasks with missing required fields
  Expect: 400 Bad Request, validation errors

TC-API-006: List tasks with filters
  Input:  GET /api/tasks?type=endpoint&status=active&sort=name&order=asc
  Expect: 200, filtered and sorted task list

TC-API-007: Search tasks
  Input:  GET /api/tasks?search=api
  Expect: Tasks matching "api" in name/config

TC-API-008: Pagination
  Input:  GET /api/tasks?page=2&per_page=5
  Expect: Correct page of results, total count in response

TC-API-009: Task CRUD cycle
  Input:  Create → Read → Update → Delete
  Expect: Each operation succeeds, final GET returns 404

TC-API-010: Check history
  Input:  GET /api/tasks/:id/checks
  Expect: Ordered check history with pagination

TC-API-011: Compare checks
  Input:  GET /api/checks/compare?from=1&to=5
  Expect: Diff between check 1 and check 5

TC-API-012: WebSocket log streaming
  Input:  Connect to /api/ws/logs
  Expect: Receives real-time log messages as they occur

TC-API-013: Import/export round-trip
  Input:  Export tasks → delete all → import exported file
  Expect: All tasks restored with same config
```

### 18.8 Auth & Security Tests

```
TC-SEC-001: JWT expiry
  Input:  Token created with 1s expiry, used after 2s
  Expect: 401 Unauthorized

TC-SEC-002: Credential reset via config
  Input:  Change credentials.yaml, restart server
  Expect: Old password fails, new password works

TC-SEC-003: No password change via API
  Input:  Attempt to change password via any API endpoint
  Expect: No such endpoint exists (405 or 404)

TC-SEC-004: SQL injection in search
  Input:  GET /api/tasks?search=' OR 1=1 --
  Expect: No injection, parameterized query, empty/normal results

TC-SEC-005: XSS in task name
  Input:  Create task with name "<script>alert(1)</script>"
  Expect: Name stored as-is, rendered escaped in UI

TC-SEC-006: Command injection prevention
  Input:  Task command "echo hello; rm -rf /"
  Expect: Command runs as provided (user is responsible for what they run)
  Note:   Document that MonMon executes commands as-is — user assumes responsibility
```

### 18.9 Data Retention Tests

```
TC-RET-001: Keep all (default)
  Input:  Task with data_retention=0, 100 checks
  Expect: All 100 checks preserved

TC-RET-002: Keep last N
  Input:  Task with data_retention=5, 10 checks
  Action: Run cleanup
  Expect: Only last 5 checks remain, older blobs deleted

TC-RET-003: Cleanup interval
  Input:  cleanup_interval=5s (for testing)
  Expect: Cleanup runs every 5 seconds

TC-RET-004: Blob cleanup
  Input:  Delete old checks
  Expect: Associated output and diff files removed from filesystem

TC-RET-005: Per-task override
  Input:  Global=0 (keep all), task=3
  Expect: This task keeps only 3, others keep all
```

### 18.10 Integration / E2E Tests

```
TC-E2E-001: Full command monitoring flow
  1. Create command task via API (echo "test")
  2. Wait for first check
  3. Verify check stored
  4. Modify command to "echo test2"... actually, change command output
  5. Wait for second check
  6. Verify diff detected
  7. Verify alert sent (mock notify provider)

TC-E2E-002: Full endpoint monitoring flow
  1. Start mock HTTP server returning "v1"
  2. Create endpoint task monitoring mock server
  3. Wait for first check
  4. Change mock response to "v2"
  5. Wait for second check
  6. Verify diff: -v1 +v2
  7. Verify alert sent

TC-E2E-003: Full subdomain monitoring flow
  1. Mock subfinder output: ["a.test.com", "b.test.com"]
  2. Create subdomain task with builtin flow
  3. Wait for first check
  4. Mock subfinder adds "c.test.com"
  5. Wait for second check
  6. Verify diff shows +c.test.com

TC-E2E-004: Dashboard data integrity
  1. Create 5 tasks of mixed types
  2. Run several checks
  3. Verify dashboard stats match reality
  4. Verify activity feed shows correct events

TC-E2E-005: Login → Create → Monitor → Alert → Explore flow
  1. Login with default creds
  2. Create an endpoint task
  3. Trigger manual check
  4. View check output
  5. Wait for change
  6. View diff in explorer
  7. Compare versions
  8. Verify alert history

TC-E2E-006: Server restart persistence
  1. Create tasks, run checks
  2. Stop server
  3. Restart server
  4. Verify all tasks, checks, configs persisted
  5. Verify scheduler resumes
```

---

## 19. Docker Setup

### 19.1 Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build backend
FROM golang:1.22-alpine AS backend
RUN apk add --no-cache gcc musl-dev sqlite-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/dist ./web/dist
RUN CGO_ENABLED=1 go build -o monmon ./cmd/monmon/

# Stage 3: Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates bash curl
# Install subfinder + httpx for subdomain monitoring
RUN curl -sL https://github.com/projectdiscovery/subfinder/releases/latest/... -o subfinder && \
    curl -sL https://github.com/projectdiscovery/httpx/releases/latest/... -o httpx && \
    chmod +x subfinder httpx && mv subfinder httpx /usr/local/bin/
WORKDIR /app
COPY --from=backend /app/monmon .
COPY configs/ ./configs/
RUN mkdir -p data/blobs data/logs
EXPOSE 8080
ENTRYPOINT ["./monmon"]
CMD ["server"]
```

### 19.2 docker-compose.yml

```yaml
version: "3.8"

services:
  monmon:
    build: .
    container_name: monmon
    ports:
      - "8080:8080"
    volumes:
      - monmon-data:/app/data           # persistent storage
      - ./configs:/app/configs           # mount config for credential reset
      - /var/run/docker.sock:/var/run/docker.sock  # optional: for container monitoring
    environment:
      - MONMON_SERVER_PORT=8080
      - MONMON_LOG_LEVEL=info
    restart: unless-stopped

  # Optional: PostgreSQL instead of SQLite
  # postgres:
  #   image: postgres:16-alpine
  #   environment:
  #     POSTGRES_DB: monmon
  #     POSTGRES_USER: monmon
  #     POSTGRES_PASSWORD: monmon
  #   volumes:
  #     - pg-data:/var/lib/postgresql/data
  #   ports:
  #     - "5432:5432"

volumes:
  monmon-data:
  # pg-data:
```

### 19.3 docker-compose.dev.yml

```yaml
version: "3.8"

services:
  monmon-backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.dev
    ports:
      - "8080:8080"
    volumes:
      - .:/app
      - monmon-data:/app/data
    command: ["air", "-c", ".air.toml"]  # hot reload

  monmon-frontend:
    image: node:20-alpine
    working_dir: /app/web
    ports:
      - "5173:5173"
    volumes:
      - ./web:/app/web
    command: ["npm", "run", "dev", "--", "--host"]

volumes:
  monmon-data:
```

---

## 20. README Outline

```
# MonMon — Monitoring Monster

## Overview
Brief description + key features list

## Architecture
Diagram from Section 2 + data flow explanation

## Quick Start
  ### Docker (Recommended)
  docker-compose up -d
  Open http://localhost:8080
  Login: monmon / monmon

  ### Binary
  Download from releases
  monmon config init
  monmon server

  ### Build from Source
  Prerequisites: Go 1.22+, Node 20+, subfinder, httpx
  make build
  ./monmon server

## Features
  ### Command Monitoring
  Full explanation + examples
  ### Endpoint Monitoring
  Full explanation + all modes
  ### Subdomain Monitoring
  Full explanation + all flow modes
  ### Scheduling
  Loop vs Cron + examples
  ### Alert System
  Notify integration + dashboard + filters
  ### Explorer
  Diff viewer + analytics + version comparison
  ### Data Retention
  Configuration + behavior

## Configuration
  ### Main Config (monmon.yaml)
  Full annotated config
  ### Notify Providers (notify-provider.yaml)
  Slack, Discord, Telegram examples
  ### Credentials (credentials.yaml)
  How to set/reset credentials

## CLI Reference
  Full command reference with examples

## API Reference
  All endpoints with request/response examples

## Web Dashboard
  Screenshots + feature walkthrough

## Docker Deployment
  ### Basic
  ### With PostgreSQL
  ### Custom Config
  ### Volumes & Persistence

## Development
  ### Prerequisites
  ### Running locally
  ### Project structure
  ### Adding a new monitor type
  ### Running tests

## FAQ / Troubleshooting

## License
```

---

## 21. Implementation Phases

### Phase 1: Foundation (Core Infrastructure)
```
□ Project scaffolding (Go module, folder structure)
□ Config module (Viper, YAML loading, validation)
□ Database layer (GORM, SQLite, migrations)
□ Blob storage (filesystem)
□ Core domain models
□ Logger (zerolog, dual output, DB persistence)
□ Auth (JWT, bcrypt, credentials.yaml)
□ Basic CLI (Cobra: server, version, config)
```

### Phase 2: Monitoring Engines
```
□ Monitor interface
□ Command monitor (stdout + file modes)
□ Endpoint monitor (body, full, metadata, regex modes)
□ Subdomain monitor (builtin, full, custom flows)
□ Diff engine (line, word, metadata)
□ Hash comparison + blob deduplication
```

### Phase 3: Scheduling & Execution
```
□ Scheduler manager
□ Loop scheduler (with zero-interval support)
□ Cron scheduler (robfig/cron, timezone)
□ Task lifecycle (create, pause, resume, delete)
□ Concurrent execution (goroutine pool)
□ Recovery on restart
```

### Phase 4: Alert System
```
□ projectdiscovery/notify integration
□ Alert config CRUD
□ Filtering engine (keywords, diff size, status)
□ Template rendering
□ Alert history logging
□ Test alert functionality
```

### Phase 5: REST API
```
□ Gin router setup
□ Auth endpoints (login, logout, me)
□ Task CRUD endpoints
□ Check/history endpoints
□ Alert endpoints
□ Log endpoints
□ Dashboard stats endpoint
□ Explorer/search/analytics endpoints
□ WebSocket (logs, task status)
□ Import/export
□ CORS + middleware
```

### Phase 6: Web Dashboard
```
□ React + Vite + TypeScript setup
□ Tailwind CSS + component library
□ Login page
□ Dashboard page (stats, activity)
□ Task list (search, sort, filter, pagination)
□ Task creation wizard (multi-step form)
□ Task detail page
□ Version history page
□ Diff viewer (GitHub theme: green/red, line numbers)
□ Compare view (side-by-side + unified)
□ Alert configuration page
□ Alert history page
□ Log viewer (real-time, colored, filterable)
□ Settings page
□ Explorer / analytics page
```

### Phase 7: Polish & Production
```
□ Data retention cleanup daemon
□ Self-health monitoring
□ Error recovery & resilience
□ Performance optimization
□ Comprehensive test suite
□ Docker build (multi-stage)
□ docker-compose (SQLite + PostgreSQL variants)
□ README with full documentation
□ CLAUDE.md for development guidance
□ Makefile
□ CI/CD (.github/workflows)
```

---

## Technology Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐    │
│  │  Web Browser  │    │  CLI (Cobra) │    │  External API      │    │
│  │  (React SPA)  │    │  monmon cmd  │    │  Consumer          │    │
│  └──────┬───────┘    └──────┬───────┘    └────────┬───────────┘    │
└─────────┼───────────────────┼─────────────────────┼────────────────┘
          │ HTTP/WS           │ Direct              │ HTTP
          │                   │                     │
┌─────────▼───────────────────▼─────────────────────▼────────────────┐
│                        API LAYER (Gin)                              │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌─────────────┐  │
│  │ Auth MW  │→│ CORS MW  │→│ Log MW │→│ Router │→│ Handlers    │  │
│  └──────────┘ └──────────┘ └────────┘ └────────┘ │ (tasks,     │  │
│                                                    │  checks,    │  │
│                                                    │  alerts,    │  │
│                                                    │  logs, ws)  │  │
│                                                    └──────┬──────┘  │
└───────────────────────────────────────────────────────────┼────────┘
                                                            │
┌───────────────────────────────────────────────────────────▼────────┐
│                       CORE ENGINE                                  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Scheduler                                 │   │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────────────┐ │   │
│  │  │ Loop       │  │ Cron       │  │ Manual Trigger        │ │   │
│  │  │ Scheduler  │  │ Scheduler  │  │ (API-driven)          │ │   │
│  │  └─────┬──────┘  └─────┬──────┘  └──────────┬────────────┘ │   │
│  │        └────────────────┼────────────────────┘              │   │
│  └─────────────────────────┼───────────────────────────────────┘   │
│                             │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │              Monitor Engines (goroutines)                    │   │
│  │                                                              │   │
│  │  ┌───────────┐  ┌──────────────┐  ┌───────────────────┐    │   │
│  │  │ Command   │  │  Endpoint    │  │   Subdomain       │    │   │
│  │  │ ┌───────┐ │  │ ┌──────────┐│  │ ┌───────────────┐ │    │   │
│  │  │ │stdout │ │  │ │body      ││  │ │builtin flow   │ │    │   │
│  │  │ │file   │ │  │ │full      ││  │ │full flow      │ │    │   │
│  │  │ └───────┘ │  │ │metadata  ││  │ │custom flow    │ │    │   │
│  │  │           │  │ │regex     ││  │ └───────────────┘ │    │   │
│  │  └───────────┘  │ └──────────┘│  └───────────────────┘    │   │
│  │                  └──────────────┘                           │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                             │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                    Diff Engine                               │   │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────────────┐  │   │
│  │  │ Line   │ │ Word   │ │ Metadata │ │ Stats Calculator  │  │   │
│  │  └────────┘ └────────┘ └──────────┘ └───────────────────┘  │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                             │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                    Alert Manager                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌─────────────┐  │   │
│  │  │ Filters  │ │ Templates│ │ PD Notify  │ │ History Log │  │   │
│  │  └──────────┘ └──────────┘ └────────────┘ └─────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│                      STORAGE LAYER                                │
│                                                                    │
│  ┌──────────────────────────────┐  ┌───────────────────────────┐  │
│  │   Database (SQLite/Postgres)  │  │  Filesystem Blob Store   │  │
│  │                               │  │                           │  │
│  │  ┌───────┐ ┌────────┐       │  │  data/blobs/              │  │
│  │  │ tasks │ │ checks │       │  │  ├── tasks/<id>/          │  │
│  │  ├───────┤ ├────────┤       │  │  │   ├── outputs/<cid>    │  │
│  │  │ alert │ │  logs  │       │  │  │   └── diffs/<cid>      │  │
│  │  │configs│ │        │       │  │  └── ...                   │  │
│  │  ├───────┤ ├────────┤       │  │                            │  │
│  │  │ alert │ │ users  │       │  │  Retention cleanup daemon  │  │
│  │  │history│ │        │       │  │  removes expired blobs     │  │
│  │  └───────┘ └────────┘       │  └───────────────────────────┘  │
│  └──────────────────────────────┘                                 │
└───────────────────────────────────────────────────────────────────┘
```

---

**Estimated Scope:** ~15,000-20,000 lines of Go + ~8,000-10,000 lines of React/TypeScript

**Key Dependencies:**
- `github.com/spf13/cobra` + `github.com/spf13/viper` (CLI + config)
- `github.com/gin-gonic/gin` (HTTP)
- `github.com/gorilla/websocket` (WebSocket)
- `gorm.io/gorm` + `gorm.io/driver/sqlite` + `gorm.io/driver/postgres` (DB)
- `github.com/robfig/cron/v3` (scheduling)
- `github.com/sergi/go-diff` (diff engine)
- `github.com/projectdiscovery/notify` (alerts)
- `github.com/rs/zerolog` (logging)
- `github.com/golang-jwt/jwt/v5` (auth)
- `golang.org/x/crypto/bcrypt` (password hashing)
