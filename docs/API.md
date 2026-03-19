# MonMon API Reference

All routes except `/api/login` require `Authorization: Bearer <jwt>`.

---

## Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/login` | Authenticate with username/password → returns JWT |

**Request:**
```json
{ "username": "admin", "password": "yourpassword" }
```

**Response:**
```json
{ "token": "eyJhbG..." }
```

---

## Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List tasks |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/tasks/:id` | Get task by ID |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task and all its checks |
| `POST` | `/api/tasks/:id/pause` | Pause task |
| `POST` | `/api/tasks/:id/resume` | Resume task |
| `POST` | `/api/tasks/:id/run` | Trigger immediate run |

### List Tasks — Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by task type: `command`, `endpoint`, `subdomain`, `bbscope` |
| `status` | string | Filter by status: `active`, `paused`, `error` |
| `search` | string | Search by task name |
| `sort` | string | Sort field (default: `created_at`) |
| `order` | string | `asc` or `desc` (default: `desc`) |
| `page` | int | Page number (default: 1) |
| `per_page` | int | Results per page (default: 25) |

### Create Task — Body

```json
{
  "name": "Monitor target scope",
  "type": "bbscope",
  "schedule_type": "loop",
  "schedule_value": "3600",
  "config": "{\"platform\":\"h1\",\"token\":\"...\",\"bounty_only\":true,\"output_type\":\"tc\"}"
}
```

**Task types:** `command` · `endpoint` · `subdomain` · `bbscope`
**Schedule types:** `loop` (interval in seconds) · `cron` (cron expression)

---

## Checks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks/:id/checks` | List checks for a task |
| `GET` | `/api/checks/:id` | Get check metadata |
| `GET` | `/api/checks/:id/output` | Get raw check output text |
| `GET` | `/api/checks/:id/diff` | Get structured diff |
| `GET` | `/api/checks/compare` | Compare any two checks |

### List Checks — Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `success`, `changed`, `error` |
| `order` | string | `asc` or `desc` (default: `desc`) |
| `page` | int | Page number |
| `per_page` | int | Results per page |

### Compare Checks

```
GET /api/checks/compare?from=10&to=15
```

Returns a diff between any two check IDs.

---

## Alerts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/alerts` | List all alert configs |
| `POST` | `/api/alerts` | Create alert config |
| `PUT` | `/api/alerts/:id` | Update alert config |
| `DELETE` | `/api/alerts/:id` | Delete alert config |
| `POST` | `/api/alerts/:id/test` | Send a test alert |

### Create/Update Alert — Body

```json
{
  "name": "Slack — all changes",
  "task_id": null,
  "provider": "slack",
  "provider_config": "{\"webhook_url\":\"https://hooks.slack.com/services/...\"}",
  "enabled": true,
  "on_change": true,
  "on_error": false,
  "keyword_filter": "",
  "message_template": ""
}
```

**Providers:** `slack` · `discord` · `telegram` · `custom`

| Provider | Config fields |
|----------|---------------|
| `slack` | `webhook_url` |
| `discord` | `webhook_url` |
| `telegram` | `api_key`, `chat_id` |
| `custom` | `url`, `method`, `content_type` |

**Scope:** Set `task_id` to a task ID for task-specific alerts, or `null` for global.

---

## System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/system/tools` | Check external tool availability (subfinder, httpx, bbscope, oathtool) |
| `GET` | `/api/system/version` | Current version + latest available version |
| `GET` | `/api/stats` | Dashboard statistics |

---

## Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/logs` | Query stored logs |
| `WS` | `/api/ws/logs` | Real-time log stream via WebSocket |

### Query Logs — Parameters

| Param | Type | Description |
|-------|------|-------------|
| `level` | string | Filter: `debug`, `info`, `warn`, `error` |
| `source` | string | Filter by source component |
| `task_id` | int | Filter by task ID |
| `page` | int | Page number |
