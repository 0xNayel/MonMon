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
		return nil, fmt.Errorf("platform is required (h1, bc, it, or ywh)")
	}

	args := []string{"poll", cfg.Platform}

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
		if cfg.Token == "" && (cfg.Email == "" || cfg.Password == "") {
			return nil, fmt.Errorf("token (-t) or email+password are required for platform bc")
		}
		if cfg.Token != "" {
			args = append(args, "-t", cfg.Token)
		}
		if cfg.Email != "" {
			args = append(args, "-E", cfg.Email)
		}
		if cfg.Password != "" {
			args = append(args, "-P", cfg.Password)
		}
		if cfg.OtpSecret != "" {
			args = append(args, "-O", cfg.OtpSecret)
		}
		if cfg.Concurrency > 0 {
			args = append(args, "--concurrency", fmt.Sprintf("%d", cfg.Concurrency))
		}
	case "it":
		if cfg.Token == "" {
			return nil, fmt.Errorf("token (-t) is required for platform it (Intigriti)")
		}
		args = append(args, "-t", cfg.Token)
	case "ywh":
		if cfg.Token == "" && (cfg.Email == "" || cfg.Password == "") {
			return nil, fmt.Errorf("token (-t) or email+password are required for platform ywh (YesWeHack)")
		}
		if cfg.Token != "" {
			args = append(args, "-t", cfg.Token)
		}
		if cfg.Email != "" {
			args = append(args, "-E", cfg.Email)
		}
		if cfg.Password != "" {
			args = append(args, "-P", cfg.Password)
		}
		if cfg.OtpSecret != "" {
			args = append(args, "-O", cfg.OtpSecret)
		}
	default:
		return nil, fmt.Errorf("unsupported platform %q (supported: h1, bc, it, ywh)", cfg.Platform)
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

	// Sort lines for stable diffs (scope order may vary between API calls).
	// Filter out bbscope log lines (time="..." level=...) that cause false diffs.
	var lines []string
	for _, l := range strings.Split(strings.TrimSpace(out), "\n") {
		if l = strings.TrimSpace(l); l != "" && !strings.HasPrefix(l, `time="`) {
			lines = append(lines, l)
		}
	}
	sort.Strings(lines)

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
