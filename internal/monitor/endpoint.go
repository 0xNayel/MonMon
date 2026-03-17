package monitor

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/monmon-io/monmon/internal/models"
)

// EndpointMonitor implements Monitor for HTTP endpoint checks.
type EndpointMonitor struct{}

// NewEndpointMonitor creates a new EndpointMonitor.
func NewEndpointMonitor() *EndpointMonitor {
	return &EndpointMonitor{}
}

// Execute performs the endpoint check described by the task.
func (m *EndpointMonitor) Execute(ctx context.Context, task *models.Task) (*models.CheckResult, error) {
	var cfg models.EndpointConfig
	if err := json.Unmarshal([]byte(task.Config), &cfg); err != nil {
		return nil, fmt.Errorf("parsing endpoint config: %w", err)
	}

	if len(cfg.URLs) == 0 {
		return nil, fmt.Errorf("no urls specified in endpoint config")
	}

	method := cfg.Method
	if method == "" {
		method = http.MethodGet
	}

	// timeout_sec == 0 means disabled (no timeout).
	var timeout time.Duration
	if cfg.TimeoutSec > 0 {
		timeout = time.Duration(cfg.TimeoutSec) * time.Second
	}

	mode := cfg.MonitorMode
	if mode == "" {
		mode = "body"
	}

	var compiledRegex *regexp.Regexp
	if mode == "regex" {
		var err error
		compiledRegex, err = regexp.Compile(cfg.RegexPattern)
		if err != nil {
			return nil, fmt.Errorf("invalid regex_pattern: %w", err)
		}
	}

	client := &http.Client{Timeout: timeout} // Timeout == 0 means no limit in http.Client

	aggregatedMeta := map[string]any{}
	var outputs []string
	var urlErrors []string

	for i, rawURL := range cfg.URLs {
		output, meta, err := m.fetchURL(ctx, client, rawURL, method, cfg, mode, compiledRegex)
		if err != nil {
			if len(cfg.URLs) == 1 {
				// Single URL: propagate as check error
				return &models.CheckResult{
					Error:    err,
					Metadata: aggregatedMeta,
				}, nil
			}
			// Multi-URL: record error inline, log it, and continue with remaining URLs
			errMsg := fmt.Sprintf("%s: %s", rawURL, err.Error())
			outputs = append(outputs, fmt.Sprintf("[%s]\n[ERROR] %s", rawURL, err.Error()))
			aggregatedMeta[fmt.Sprintf("url_%d_error", i)] = err.Error()
			urlErrors = append(urlErrors, errMsg)
			continue
		}

		// Store per-URL metadata; for single URL use flat keys, for multiple prefix with index.
		if len(cfg.URLs) == 1 {
			for k, v := range meta {
				aggregatedMeta[k] = v
			}
		} else {
			for k, v := range meta {
				aggregatedMeta[fmt.Sprintf("url_%d_%s", i, k)] = v
			}
		}

		if len(cfg.URLs) > 1 {
			outputs = append(outputs, fmt.Sprintf("[%s]\n%s", rawURL, output))
		} else {
			outputs = append(outputs, output)
		}
	}

	finalOutput := strings.Join(outputs, "\n---\n")
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(finalOutput)))

	return &models.CheckResult{
		Output:    finalOutput,
		Hash:      hash,
		Metadata:  aggregatedMeta,
		URLErrors: urlErrors,
	}, nil
}

func (m *EndpointMonitor) fetchURL(
	ctx context.Context,
	client *http.Client,
	rawURL, method string,
	cfg models.EndpointConfig,
	mode string,
	compiledRegex *regexp.Regexp,
) (string, map[string]any, error) {
	var bodyReader io.Reader
	if cfg.Body != "" {
		bodyReader = strings.NewReader(cfg.Body)
	}

	req, err := http.NewRequestWithContext(ctx, method, rawURL, bodyReader)
	if err != nil {
		return "", nil, fmt.Errorf("creating request for %s: %w", rawURL, err)
	}

	for k, v := range cfg.Headers {
		req.Header.Set(k, v)
	}

	start := time.Now()
	resp, err := client.Do(req)
	elapsed := time.Since(start)
	if err != nil {
		return "", nil, fmt.Errorf("requesting %s: %w", rawURL, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, fmt.Errorf("reading response from %s: %w", rawURL, err)
	}

	meta := map[string]any{
		"status_code":      resp.StatusCode,
		"content_length":   len(respBody),
		"response_time_ms": elapsed.Milliseconds(),
	}

	var output string
	switch mode {
	case "full":
		var sb strings.Builder
		for k, vals := range resp.Header {
			for _, v := range vals {
				sb.WriteString(fmt.Sprintf("%s: %s\n", k, v))
			}
		}
		sb.WriteString("\n")
		sb.Write(respBody)
		output = sb.String()

	case "metadata":
		metaOut := map[string]any{}
		for _, field := range cfg.MetadataFields {
			switch field {
			case "status_code":
				metaOut["status_code"] = resp.StatusCode
			case "content_length":
				metaOut["content_length"] = len(respBody)
			case "title":
				metaOut["title"] = extractTitle(string(respBody))
			}
		}
		jsonBytes, _ := json.Marshal(metaOut)
		output = string(jsonBytes)

	case "regex":
		matches := compiledRegex.FindAllString(string(respBody), -1)
		output = strings.Join(matches, "\n")

	default: // "body"
		output = string(respBody)
	}

	return output, meta, nil
}

// extractTitle parses the first <title>...</title> from HTML.
func extractTitle(html string) string {
	lower := strings.ToLower(html)
	start := strings.Index(lower, "<title>")
	if start == -1 {
		return ""
	}
	start += len("<title>")
	end := strings.Index(lower[start:], "</title>")
	if end == -1 {
		return ""
	}
	return strings.TrimSpace(html[start : start+end])
}
