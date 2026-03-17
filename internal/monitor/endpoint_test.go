package monitor

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/0xNayel/MonMon/internal/models"
)

func TestEndpointMonitor_BodyMode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("hello world"))
	}))
	defer srv.Close()

	m := NewEndpointMonitor()
	cfg := models.EndpointConfig{
		URLs:        []string{srv.URL},
		MonitorMode: "body",
		TimeoutSec:  5,
	}
	cfgJSON, _ := json.Marshal(cfg)
	task := &models.Task{Type: models.TaskTypeEndpoint, Config: string(cfgJSON)}

	result, err := m.Execute(context.Background(), task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error != nil {
		t.Fatalf("unexpected result error: %v", result.Error)
	}
	if result.Output != "hello world" {
		t.Errorf("expected 'hello world', got %q", result.Output)
	}
	if result.Hash == "" {
		t.Error("expected non-empty hash")
	}
}

func TestEndpointMonitor_MetadataMode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("<html><head><title>Test Page</title></head><body>hi</body></html>"))
	}))
	defer srv.Close()

	m := NewEndpointMonitor()
	cfg := models.EndpointConfig{
		URLs:           []string{srv.URL},
		MonitorMode:    "metadata",
		MetadataFields: []string{"status_code", "content_length", "title"},
		TimeoutSec:     5,
	}
	cfgJSON, _ := json.Marshal(cfg)
	task := &models.Task{Type: models.TaskTypeEndpoint, Config: string(cfgJSON)}

	result, err := m.Execute(context.Background(), task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Output should be JSON with the metadata fields
	var metaOut map[string]any
	if err := json.Unmarshal([]byte(result.Output), &metaOut); err != nil {
		t.Fatalf("output should be valid JSON: %v\noutput: %s", err, result.Output)
	}
	if metaOut["status_code"] != float64(200) {
		t.Errorf("expected status_code 200, got %v", metaOut["status_code"])
	}
	if metaOut["title"] != "Test Page" {
		t.Errorf("expected title 'Test Page', got %v", metaOut["title"])
	}
	if metaOut["content_length"] == nil {
		t.Error("expected content_length in metadata output")
	}
}

func TestEndpointMonitor_MultipleURLs(t *testing.T) {
	srv1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("page1"))
	}))
	defer srv1.Close()

	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("page2"))
	}))
	defer srv2.Close()

	m := NewEndpointMonitor()
	cfg := models.EndpointConfig{
		URLs:        []string{srv1.URL, srv2.URL},
		MonitorMode: "body",
		TimeoutSec:  5,
	}
	cfgJSON, _ := json.Marshal(cfg)
	task := &models.Task{Type: models.TaskTypeEndpoint, Config: string(cfgJSON)}

	result, err := m.Execute(context.Background(), task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.Output, "page1") || !strings.Contains(result.Output, "page2") {
		t.Errorf("expected both pages in output, got %q", result.Output)
	}
	if !strings.Contains(result.Output, "\n---\n") {
		t.Error("expected URL outputs separated by \\n---\\n")
	}
}
