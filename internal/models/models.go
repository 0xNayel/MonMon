package models

import (
	"time"
)

// Task types
const (
	TaskTypeCommand   = "command"
	TaskTypeEndpoint  = "endpoint"
	TaskTypeSubdomain = "subdomain"
	TaskTypeBbscope   = "bbscope"
)

// Task statuses
const (
	TaskStatusActive = "active"
	TaskStatusPaused = "paused"
	TaskStatusError  = "error"
)

// Schedule types
const (
	ScheduleLoop = "loop"
	ScheduleCron = "cron"
)

// Check statuses
const (
	CheckSuccess = "success"
	CheckChanged = "changed"
	CheckError   = "error"
)

// Log levels
const (
	LogDebug = "debug"
	LogInfo  = "info"
	LogWarn  = "warn"
	LogError = "error"
)

// User represents an authenticated user.
type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"not null" json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// Task represents a monitoring job.
type Task struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Name          string    `gorm:"not null" json:"name"`
	Type          string    `gorm:"not null" json:"type"`
	Status        string    `gorm:"not null;default:active" json:"status"`
	Config        string    `gorm:"not null;type:text" json:"config"`
	ScheduleType  string    `gorm:"not null" json:"schedule_type"`
	ScheduleValue string    `gorm:"not null" json:"schedule_value"`
	Tags          string    `gorm:"default:''" json:"tags"`
	DataRetention int       `gorm:"default:0" json:"data_retention"`
	LastCheckAt   *time.Time `json:"last_check_at"`
	TotalChecks   int64     `gorm:"default:0" json:"total_checks"`
	TotalChanges  int64     `gorm:"default:0" json:"total_changes"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Check represents a single monitoring check result.
type Check struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	TaskID      uint      `gorm:"not null;index" json:"task_id"`
	Version     int       `gorm:"not null" json:"version"`
	Status      string    `gorm:"not null" json:"status"`
	OutputHash  string    `json:"output_hash,omitempty"`
	Output      string    `gorm:"type:text" json:"-"`
	DiffText    string    `gorm:"type:text" json:"diff_text,omitempty"`
	DiffAdded   int       `gorm:"default:0" json:"diff_added"`
	DiffRemoved int       `gorm:"default:0" json:"diff_removed"`
	Metadata    string    `gorm:"type:text" json:"metadata,omitempty"`
	DurationMs  int64     `json:"duration_ms"`
	ErrorMsg    string    `json:"error_msg,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// AlertConfig defines how and when to send alerts.
type AlertConfig struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	TaskID          *uint     `gorm:"index" json:"task_id"`
	Name            string    `gorm:"not null" json:"name"`
	Provider        string    `gorm:"not null" json:"provider"`        // slack|discord|telegram|custom
	ProviderConfig  string    `gorm:"type:text" json:"provider_config"` // JSON with provider-specific settings
	Enabled         bool      `gorm:"default:true" json:"enabled"`
	OnChange        bool      `gorm:"default:true" json:"on_change"`
	OnError         bool      `gorm:"default:false" json:"on_error"`
	KeywordFilter   string    `json:"keyword_filter,omitempty"`
	MessageTemplate string    `gorm:"type:text" json:"message_template,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// Log represents a persisted log entry for the web viewer.
type Log struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Level     string    `gorm:"not null;index" json:"level"`
	Source    string    `gorm:"not null" json:"source"`
	TaskID    *uint     `gorm:"index" json:"task_id,omitempty"`
	Message   string    `gorm:"not null" json:"message"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}

// CheckResult is the output from a monitor execution (not stored directly).
type CheckResult struct {
	Output    string
	Hash      string
	Metadata  map[string]any
	Error     error
	URLErrors []string // non-fatal per-URL errors in bulk endpoint mode
}

// --- JSON config structs for task configs ---

// CommandConfig is the JSON config for command-type tasks.
type CommandConfig struct {
	Command    string `json:"command"`
	OutputMode string `json:"output_mode"` // "stdout" | "file"
	OutputFile string `json:"output_file,omitempty"`
	TimeoutSec int    `json:"timeout_sec,omitempty"`
}

// EndpointConfig is the JSON config for endpoint-type tasks.
type EndpointConfig struct {
	URLs           []string          `json:"urls"`
	Method         string            `json:"method,omitempty"`
	Headers        map[string]string `json:"headers,omitempty"`
	Body           string            `json:"body,omitempty"`
	MonitorMode    string            `json:"monitor_mode"`    // "body" | "full" | "metadata" | "regex"
	MetadataFields []string          `json:"metadata_fields,omitempty"`
	RegexPattern   string            `json:"regex_pattern,omitempty"`
	TimeoutSec     int               `json:"timeout_sec,omitempty"`
}

// SubdomainConfig is the JSON config for subdomain-type tasks.
// Flow: subfinder -all → httpx (with optional flags), threaded per domain.
type SubdomainConfig struct {
	Domains    []string `json:"domains"`
	HttpxSC    bool     `json:"httpx_sc"`    // -sc  status code
	HttpxCT    bool     `json:"httpx_ct"`    // -ct  content type
	HttpxTitle bool     `json:"httpx_title"` // -title
	HttpxTD    bool     `json:"httpx_td"`    // -td  tech detect
	Threads    int      `json:"threads"`     // max parallel domain flows (default 5)
}

// BbscopeConfig is the JSON config for bbscope-type tasks.
type BbscopeConfig struct {
	Platform   string `json:"platform"`              // "h1" | "bc" | "it" | "ywh"
	Token      string `json:"token,omitempty"`       // h1/it/ywh: API token; bc: _bugcrowd_session cookie
	Username   string `json:"username,omitempty"`    // h1: username
	Email      string `json:"email,omitempty"`       // bc/ywh: email
	Password   string `json:"password,omitempty"`    // bc/ywh: password
	OtpSecret   string `json:"otp_secret,omitempty"`   // bc/ywh: TOTP secret (base32)
	Concurrency int    `json:"concurrency,omitempty"`  // bc: --concurrency (default 5)
	BountyOnly  bool   `json:"bounty_only"`            // -b flag
	OutputType string `json:"output_type"`           // "tc" etc.
}

// TaskFilter holds query parameters for listing tasks.
type TaskFilter struct {
	Type    string
	Status  string
	Tag     string
	Search  string
	Sort    string
	Order   string
	Page    int
	PerPage int
}

// CheckFilter holds query parameters for listing checks.
type CheckFilter struct {
	Page    int
	PerPage int
}
