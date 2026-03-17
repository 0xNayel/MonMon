package alert

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"text/template"

	"github.com/0xNayel/MonMon/internal/models"
	"github.com/projectdiscovery/notify/pkg/providers"
	"github.com/projectdiscovery/notify/pkg/types"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

// Default message template used when AlertConfig.MessageTemplate is empty.
// Wrapped in a code block with <> delimiters; diff content is intentionally excluded.
const defaultTemplate = "MonMon: `{{.TaskName}}`\nType: `{{.TaskType}}`\nStatus: `{{.CheckStatus}}`\nVersion: `#{{.CheckVersion}}`\nDuration: `{{.DurationMs}}ms`{{if .HasDiff}}\nChanges: `+{{.DiffAdded}} -{{.DiffRemoved}}`{{end}}"

// AlertManager handles alert processing and delivery.
type AlertManager struct {
	db *gorm.DB
}

// NewAlertManager creates a new AlertManager.
// The providerConfig argument is kept for API compatibility but is no longer used —
// each AlertConfig stores its own delivery settings.
func NewAlertManager(db *gorm.DB, _ string) *AlertManager {
	return &AlertManager{db: db}
}

// Process evaluates all alert configs for a task+check and sends matching alerts.
func (a *AlertManager) Process(task *models.Task, check *models.Check) {
	var configs []models.AlertConfig
	a.db.Where("(task_id = ? OR task_id IS NULL) AND enabled = ?", task.ID, true).Find(&configs)

	for _, cfg := range configs {
		if !a.shouldAlert(cfg, check) {
			continue
		}
		msg := a.renderMessage(cfg, task, check)
		a.send(cfg, msg)
	}
}

// Test sends a test message for a specific alert config and returns any error.
func (a *AlertManager) Test(cfg *models.AlertConfig) error {
	testTask := &models.Task{Name: "Test Alert", Type: "command"}
	testCheck := &models.Check{
		Version:     1,
		Status:      models.CheckChanged,
		DiffText:    "+test line added\n-test line removed",
		DiffAdded:   1,
		DiffRemoved: 1,
		DurationMs:  42,
	}
	msg := a.renderMessage(*cfg, testTask, testCheck)
	return a.sendErr(*cfg, msg)
}

// shouldAlert checks whether a check matches an alert config's filters.
func (a *AlertManager) shouldAlert(cfg models.AlertConfig, check *models.Check) bool {
	switch check.Status {
	case models.CheckChanged:
		if !cfg.OnChange {
			return false
		}
	case models.CheckError:
		if !cfg.OnError {
			return false
		}
	default:
		return false
	}

	if cfg.KeywordFilter != "" {
		if !strings.Contains(check.Output, cfg.KeywordFilter) &&
			!strings.Contains(check.DiffText, cfg.KeywordFilter) {
			return false
		}
	}

	return true
}

// renderMessage applies the message template to the task+check data.
func (a *AlertManager) renderMessage(cfg models.AlertConfig, task *models.Task, check *models.Check) string {
	tmplStr := cfg.MessageTemplate
	if tmplStr == "" {
		tmplStr = defaultTemplate
	}

	tmpl, err := template.New("alert").Parse(tmplStr)
	if err != nil {
		return fmt.Sprintf("MonMon Alert: %s — %s (template error: %v)", task.Name, check.Status, err)
	}

	diffText := check.DiffText
	lines := strings.Split(diffText, "\n")
	if len(lines) > 50 {
		diffText = strings.Join(lines[:50], "\n") + fmt.Sprintf("\n... (%d more lines)", len(lines)-50)
	}

	data := map[string]any{
		"TaskName":     task.Name,
		"TaskType":     task.Type,
		"CheckStatus":  check.Status,
		"CheckVersion": check.Version,
		"DurationMs":   check.DurationMs,
		"DiffAdded":    check.DiffAdded,
		"DiffRemoved":  check.DiffRemoved,
		"DiffText":     diffText,
		"HasDiff":      check.DiffText != "",
		"ErrorMsg":     check.ErrorMsg,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return fmt.Sprintf("MonMon Alert: %s — %s", task.Name, check.Status)
	}
	return buf.String()
}

// send delivers the alert; logs any error to stderr.
func (a *AlertManager) send(cfg models.AlertConfig, message string) {
	if err := a.sendErr(cfg, message); err != nil {
		fmt.Fprintf(os.Stderr, "monmon: notify error: %v\n", err)
	}
}

// sendErr delivers the alert message via a per-alert notify client.
func (a *AlertManager) sendErr(cfg models.AlertConfig, message string) error {
	if cfg.ProviderConfig == "" {
		return fmt.Errorf("alert %q: no provider config", cfg.Name)
	}

	yamlData, err := buildProviderYAML(cfg.Provider, cfg.ProviderConfig)
	if err != nil {
		return fmt.Errorf("alert %q: %w", cfg.Name, err)
	}

	var opts providers.ProviderOptions
	if err := yaml.Unmarshal(yamlData, &opts); err != nil {
		return fmt.Errorf("alert %q: parsing provider options: %w", cfg.Name, err)
	}

	client, err := providers.New(&opts, &types.Options{})
	if err != nil {
		return fmt.Errorf("alert %q: creating notify client: %w", cfg.Name, err)
	}

	if err := client.Send(message); err != nil {
		return fmt.Errorf("alert %q: send: %w", cfg.Name, err)
	}
	return nil
}

// buildProviderYAML constructs the notify-compatible YAML from a provider type and its JSON config.
// Supported providers: slack, discord, telegram, custom.
func buildProviderYAML(provider, configJSON string) ([]byte, error) {
	var cfg map[string]string
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, fmt.Errorf("parsing provider config: %w", err)
	}

	entry := map[string]interface{}{"id": "monmon-alert"}

	switch provider {
	case "slack":
		entry["slack_webhook_url"] = cfg["webhook_url"]
		entry["slack_format"] = "{{data}}"
	case "discord":
		entry["discord_webhook_url"] = cfg["webhook_url"]
		entry["discord_format"] = "{{data}}"
	case "telegram":
		entry["telegram_api_key"] = cfg["api_key"]
		entry["telegram_chat_id"] = cfg["chat_id"]
		entry["telegram_format"] = "{{data}}"
		entry["telegram_parsemode"] = "Markdown"
	case "custom":
		entry["custom_webhook_url"] = cfg["url"]
		method := cfg["method"]
		if method == "" {
			method = "POST"
		}
		entry["custom_method"] = method
		entry["custom_format"] = "{{data}}"
		if ct := cfg["content_type"]; ct != "" {
			entry["custom_headers"] = map[string]string{"Content-Type": ct}
		}
	default:
		return nil, fmt.Errorf("unknown provider %q", provider)
	}

	wrapper := map[string]interface{}{provider: []interface{}{entry}}
	return yaml.Marshal(wrapper)
}

// --- CRUD helpers for API layer ---

func (a *AlertManager) GetAlertConfigs(taskID uint) []models.AlertConfig {
	var configs []models.AlertConfig
	a.db.Where("task_id = ? OR task_id IS NULL", taskID).Find(&configs)
	return configs
}

func (a *AlertManager) ListAll() []models.AlertConfig {
	var configs []models.AlertConfig
	a.db.Find(&configs)
	return configs
}

func (a *AlertManager) Create(cfg *models.AlertConfig) error {
	return a.db.Create(cfg).Error
}

func (a *AlertManager) Update(cfg *models.AlertConfig) error {
	return a.db.Save(cfg).Error
}

func (a *AlertManager) Delete(id uint) error {
	return a.db.Delete(&models.AlertConfig{}, id).Error
}

func (a *AlertManager) GetByID(id uint) (*models.AlertConfig, error) {
	var cfg models.AlertConfig
	if err := a.db.First(&cfg, id).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}
