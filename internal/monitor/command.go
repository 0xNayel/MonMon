package monitor

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/monmon-io/monmon/internal/models"
)

// CommandMonitor executes shell commands and captures their output.
type CommandMonitor struct{}

// NewCommandMonitor returns a new CommandMonitor.
func NewCommandMonitor() *CommandMonitor {
	return &CommandMonitor{}
}

// Execute runs the command described by task.Config and returns a CheckResult.
func (m *CommandMonitor) Execute(ctx context.Context, task *models.Task) (*models.CheckResult, error) {
	var cfg models.CommandConfig
	if err := json.Unmarshal([]byte(task.Config), &cfg); err != nil {
		return nil, fmt.Errorf("invalid command config: %w", err)
	}

	if cfg.Command == "" {
		return nil, fmt.Errorf("command is empty")
	}

	// timeout_sec == 0 means disabled (no timeout).
	var cmdCtx context.Context
	var cancelFn context.CancelFunc
	if cfg.TimeoutSec > 0 {
		cmdCtx, cancelFn = context.WithTimeout(ctx, time.Duration(cfg.TimeoutSec)*time.Second)
		defer cancelFn()
	} else {
		cmdCtx = ctx
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(cmdCtx, "cmd", "/C", cfg.Command)
	} else {
		cmd = exec.CommandContext(cmdCtx, "/bin/bash", "-c", cfg.Command)
	}

	combinedOutput, err := cmd.CombinedOutput()

	// Detect timeout: context deadline exceeded means the command was killed.
	if cfg.TimeoutSec > 0 && cmdCtx.Err() == context.DeadlineExceeded {
		return nil, fmt.Errorf("timeout: command killed after %ds", cfg.TimeoutSec)
	}

	var output string
	var cmdErr error

	switch cfg.OutputMode {
	case "file":
		if cfg.OutputFile == "" {
			return nil, fmt.Errorf("output_file is required when output_mode is \"file\"")
		}
		data, readErr := os.ReadFile(cfg.OutputFile)
		if readErr != nil {
			if err != nil {
				return nil, fmt.Errorf("command failed: %w; also failed to read output file: %v", err, readErr)
			}
			return nil, fmt.Errorf("failed to read output file: %w", readErr)
		}
		output = string(data)
		cmdErr = err
	default: // "stdout" or unset
		output = string(combinedOutput)
		cmdErr = err
	}

	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(output)))

	result := &models.CheckResult{
		Output:   output,
		Hash:     hash,
		Metadata: nil,
		Error:    cmdErr,
	}

	return result, nil
}
