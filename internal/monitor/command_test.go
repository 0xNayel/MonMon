package monitor

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"runtime"
	"strings"
	"testing"

	"github.com/0xNayel/MonMon/internal/models"
)

func TestCommandMonitor_SimpleEcho(t *testing.T) {
	m := NewCommandMonitor()

	var command string
	if runtime.GOOS == "windows" {
		command = "echo hello"
	} else {
		command = "echo hello"
	}

	cfg := models.CommandConfig{Command: command, TimeoutSec: 5}
	cfgJSON, _ := json.Marshal(cfg)

	task := &models.Task{
		Type:   models.TaskTypeCommand,
		Config: string(cfgJSON),
	}

	result, err := m.Execute(context.Background(), task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error != nil {
		t.Fatalf("unexpected result error: %v", result.Error)
	}

	output := strings.TrimSpace(result.Output)
	if output != "hello" {
		t.Errorf("expected output 'hello', got %q", output)
	}

	expectedHash := fmt.Sprintf("%x", sha256.Sum256([]byte(result.Output)))
	if result.Hash != expectedHash {
		t.Errorf("hash mismatch: got %q, want %q", result.Hash, expectedHash)
	}
}

func TestCommandMonitor_NonZeroExit(t *testing.T) {
	m := NewCommandMonitor()

	var command string
	if runtime.GOOS == "windows" {
		command = "cmd /C \"echo fail output & exit /b 1\""
	} else {
		command = "echo fail output && exit 1"
	}

	cfg := models.CommandConfig{Command: command, TimeoutSec: 5}
	cfgJSON, _ := json.Marshal(cfg)

	task := &models.Task{
		Type:   models.TaskTypeCommand,
		Config: string(cfgJSON),
	}

	result, err := m.Execute(context.Background(), task)
	if err != nil {
		t.Fatalf("Execute should not return error, got: %v", err)
	}
	if result.Error == nil {
		t.Error("expected result.Error to be set for non-zero exit")
	}
	if !strings.Contains(result.Output, "fail output") {
		t.Errorf("expected output to be captured, got %q", result.Output)
	}
}

func TestCommandMonitor_Timeout(t *testing.T) {
	m := NewCommandMonitor()

	var command string
	if runtime.GOOS == "windows" {
		command = "ping -n 10 127.0.0.1"
	} else {
		command = "sleep 10"
	}

	cfg := models.CommandConfig{Command: command, TimeoutSec: 1}
	cfgJSON, _ := json.Marshal(cfg)

	task := &models.Task{
		Type:   models.TaskTypeCommand,
		Config: string(cfgJSON),
	}

	result, err := m.Execute(context.Background(), task)
	if err != nil {
		t.Fatalf("Execute should not return error, got: %v", err)
	}
	if result.Error == nil {
		t.Error("expected result.Error due to timeout")
	}
}
