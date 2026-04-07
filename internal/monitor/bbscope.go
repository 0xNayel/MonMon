package monitor

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/0xNayel/MonMon/internal/models"
)

// BbscopeMonitor monitors bug bounty program scope using bbscope.
type BbscopeMonitor struct{}

// NewBbscopeMonitor returns a new BbscopeMonitor.
func NewBbscopeMonitor() *BbscopeMonitor { return &BbscopeMonitor{} }

// bbscopeYAML mirrors the ~/.bbscope.yaml structure expected by bbscope v2.
type bbscopeYAML struct {
	Bugcrowd struct {
		Email     string `yaml:"email"`
		OtpSecret string `yaml:"otpsecret"`
		Password  string `yaml:"password"`
		Token     string `yaml:"token"`
	} `yaml:"bugcrowd"`
	HackerOne struct {
		Token    string `yaml:"token"`
		Username string `yaml:"username"`
	} `yaml:"hackerone"`
	Intigriti struct {
		Token string `yaml:"token"`
	} `yaml:"intigriti"`
	YesWeHack struct {
		Email     string `yaml:"email"`
		OtpSecret string `yaml:"otpsecret"`
		Password  string `yaml:"password"`
		Token     string `yaml:"token"`
	} `yaml:"yeswehack"`
}

// writeTempConfig writes credentials to a temp bbscope config file and returns
// its path. The caller must remove the file when done.
func writeTempConfig(taskID uint, cfg *models.BbscopeConfig) (string, error) {
	var y bbscopeYAML
	switch cfg.Platform {
	case "h1":
		y.HackerOne.Token = cfg.Token
		y.HackerOne.Username = cfg.Username
	case "bc":
		y.Bugcrowd.Token = cfg.Token
		y.Bugcrowd.Email = cfg.Email
		y.Bugcrowd.Password = cfg.Password
		y.Bugcrowd.OtpSecret = cfg.OtpSecret
	case "it":
		y.Intigriti.Token = cfg.Token
	case "ywh":
		y.YesWeHack.Token = cfg.Token
		y.YesWeHack.Email = cfg.Email
		y.YesWeHack.Password = cfg.Password
		y.YesWeHack.OtpSecret = cfg.OtpSecret
	}

	data, err := yaml.Marshal(&y)
	if err != nil {
		return "", err
	}

	f, err := os.CreateTemp("", fmt.Sprintf("bbscope-%d-*.yaml", taskID))
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

// Execute runs bbscope and returns sorted scope output for stable diffing.
func (m *BbscopeMonitor) Execute(ctx context.Context, task *models.Task) (*models.CheckResult, error) {
	var cfg models.BbscopeConfig
	if err := json.Unmarshal([]byte(task.Config), &cfg); err != nil {
		return nil, fmt.Errorf("invalid bbscope config: %w", err)
	}
	if cfg.Platform == "" {
		return nil, fmt.Errorf("platform is required (h1, bc, it, or ywh)")
	}

	// Validate credentials before writing config
	switch cfg.Platform {
	case "h1":
		if cfg.Token == "" || cfg.Username == "" {
			return nil, fmt.Errorf("token and username are required for platform h1")
		}
	case "bc":
		if cfg.Token == "" && (cfg.Email == "" || cfg.Password == "") {
			return nil, fmt.Errorf("token or email+password are required for platform bc")
		}
	case "it":
		if cfg.Token == "" {
			return nil, fmt.Errorf("token is required for platform it (Intigriti)")
		}
	case "ywh":
		if cfg.Token == "" && (cfg.Email == "" || cfg.Password == "") {
			return nil, fmt.Errorf("token or email+password are required for platform ywh (YesWeHack)")
		}
	default:
		return nil, fmt.Errorf("unsupported platform %q (supported: h1, bc, it, ywh)", cfg.Platform)
	}

	// Write credentials to a temp config file — bbscope v2 reads auth from
	// config file only (CLI credential flags are ignored by the tool).
	cfgFile, err := writeTempConfig(task.ID, &cfg)
	if err != nil {
		return nil, fmt.Errorf("bbscope: failed to write config: %w", err)
	}
	defer os.Remove(cfgFile)

	args := []string{"poll", cfg.Platform, "--config", cfgFile}

	if cfg.Platform == "bc" && cfg.Concurrency > 0 {
		args = append(args, "--concurrency", fmt.Sprintf("%d", cfg.Concurrency))
	}

	if cfg.BountyOnly {
		args = append(args, "-b")
	}

	outputType := cfg.OutputType
	if outputType == "" {
		outputType = "tc"
	}
	args = append(args, "-o", outputType)

	out, err := runTool(ctx, "bbscope", args)
	if err != nil {
		// Strip bbscope log lines from the error message — CombinedOutput mixes
		// stderr (time="..." log lines) into the error, making it unreadable.
		return nil, fmt.Errorf("bbscope: %s", filterBbscopeError(err.Error()))
	}

	// Sort + deduplicate lines (equivalent to | sort -u) for stable diffs.
	// Filter out bbscope log lines (time="..." level=...) that cause false diffs.
	var lines []string
	for _, l := range strings.Split(strings.TrimSpace(out), "\n") {
		if l = strings.TrimSpace(l); l != "" && !strings.HasPrefix(l, `time="`) {
			lines = append(lines, l)
		}
	}
	sort.Strings(lines)
	// Remove consecutive duplicates (sort -u)
	lines = slices.Compact(lines)

	output := strings.Join(lines, "\n")
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(output)))
	return &models.CheckResult{Output: output, Hash: hash}, nil
}

// filterBbscopeError removes time="..." log lines from a bbscope error string,
// keeping only the actual error signal/message (e.g. "signal: killed").
func filterBbscopeError(errMsg string) string {
	var kept []string
	for _, part := range strings.Split(errMsg, `time="`) {
		// Before the first time=" marker is the real error (e.g. "signal: killed: ")
		if len(kept) == 0 {
			s := strings.TrimRight(part, ": ")
			if s != "" {
				kept = append(kept, s)
			}
		}
		// Everything after the first time=" is a log line — skip it
	}
	if len(kept) == 0 {
		return errMsg
	}
	return strings.Join(kept, "")
}
