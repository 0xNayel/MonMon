package monitor

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/0xNayel/MonMon/internal/models"
)

// BbscopeMonitor monitors bug bounty program scope using bbscope.
type BbscopeMonitor struct{}

// NewBbscopeMonitor returns a new BbscopeMonitor.
func NewBbscopeMonitor() *BbscopeMonitor { return &BbscopeMonitor{} }

// Execute runs bbscope and returns sorted scope output for stable diffing.
func (m *BbscopeMonitor) Execute(ctx context.Context, task *models.Task) (*models.CheckResult, error) {
	var cfg models.BbscopeConfig
	if err := json.Unmarshal([]byte(task.Config), &cfg); err != nil {
		return nil, fmt.Errorf("invalid bbscope config: %w", err)
	}
	if cfg.Platform == "" {
		return nil, fmt.Errorf("platform is required (h1 or bc)")
	}

	args := []string{cfg.Platform}

	switch cfg.Platform {
	case "h1":
		if cfg.Token == "" {
			return nil, fmt.Errorf("token (-t) is required for platform h1")
		}
		args = append(args, "-t", cfg.Token)
		if cfg.Username != "" {
			args = append(args, "-u", cfg.Username)
		}
	case "bc":
		if cfg.Email == "" || cfg.Password == "" {
			return nil, fmt.Errorf("email and password are required for platform bc")
		}
		args = append(args, "-E", cfg.Email, "-P", cfg.Password)
		if cfg.OtpCommand != "" {
			args = append(args, "--otpcommand", cfg.OtpCommand)
		}
	default:
		return nil, fmt.Errorf("unsupported platform %q (supported: h1, bc)", cfg.Platform)
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
		return nil, fmt.Errorf("bbscope: %w", err)
	}

	// Sort lines for stable diffs (scope order may vary between API calls).
	var lines []string
	for _, l := range strings.Split(strings.TrimSpace(out), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			lines = append(lines, l)
		}
	}
	sort.Strings(lines)

	output := strings.Join(lines, "\n")
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(output)))
	return &models.CheckResult{Output: output, Hash: hash}, nil
}
