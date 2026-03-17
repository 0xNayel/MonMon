package monitor

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
	"sync"

	"github.com/monmon-io/monmon/internal/models"
)

// SubdomainMonitor discovers and monitors subdomains using subfinder and httpx.
// Each domain runs the full subfinder → httpx pipeline independently.
// Up to Threads (default 5) domains run concurrently.
// Output is keyed by endpoint URL for stable diffs.
type SubdomainMonitor struct {
	subfinderPath string
	httpxPath     string
}

// NewSubdomainMonitor returns a new SubdomainMonitor.
func NewSubdomainMonitor(subfinderPath, httpxPath string) *SubdomainMonitor {
	return &SubdomainMonitor{subfinderPath: subfinderPath, httpxPath: httpxPath}
}

// Execute runs subdomain discovery and monitoring according to task.Config.
func (m *SubdomainMonitor) Execute(ctx context.Context, task *models.Task) (*models.CheckResult, error) {
	var cfg models.SubdomainConfig
	if err := json.Unmarshal([]byte(task.Config), &cfg); err != nil {
		return nil, fmt.Errorf("invalid subdomain config: %w", err)
	}
	if len(cfg.Domains) == 0 {
		return nil, fmt.Errorf("no domains specified")
	}

	threads := cfg.Threads
	if threads <= 0 {
		threads = 5
	}

	type domainResult struct {
		endpoints map[string]string // url → httpx output line
		err       error
	}

	results := make([]domainResult, len(cfg.Domains))
	sem := make(chan struct{}, threads)
	var wg sync.WaitGroup

	for i, domain := range cfg.Domains {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, d string) {
			defer wg.Done()
			defer func() { <-sem }()
			eps, err := m.runDomainFlow(ctx, d, cfg)
			results[idx] = domainResult{endpoints: eps, err: err}
		}(i, domain)
	}
	wg.Wait()

	// Merge all endpoints; URL is the unique key to prevent ordering collisions.
	all := map[string]string{}
	for i, r := range results {
		if r.err != nil {
			key := fmt.Sprintf("ERROR:%s", cfg.Domains[i])
			all[key] = fmt.Sprintf("[ERROR] %s: %s", cfg.Domains[i], r.err.Error())
			continue
		}
		for url, line := range r.endpoints {
			all[url] = line
		}
	}

	// Sort for stable output.
	keys := make([]string, 0, len(all))
	for u := range all {
		keys = append(keys, u)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, all[k])
	}

	output := strings.Join(lines, "\n")
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(output)))
	return &models.CheckResult{Output: output, Hash: hash}, nil
}

// runDomainFlow runs subfinder then httpx for a single domain.
func (m *SubdomainMonitor) runDomainFlow(ctx context.Context, domain string, cfg models.SubdomainConfig) (map[string]string, error) {
	// Step 1: subfinder -all -d domain -silent
	sfOut, err := runTool(ctx, m.subfinderPath, []string{"-all", "-d", domain, "-silent"})
	if err != nil {
		return nil, fmt.Errorf("subfinder: %w", err)
	}

	subs := strings.TrimSpace(sfOut)
	if subs == "" {
		return map[string]string{}, nil
	}

	// Write discovered subdomains to a temp file for httpx.
	tmp, err := os.CreateTemp("", "monmon-subs-*.txt")
	if err != nil {
		return nil, fmt.Errorf("temp file: %w", err)
	}
	defer os.Remove(tmp.Name())
	tmp.WriteString(subs)
	tmp.Close()

	// Step 2: httpx -l file -silent [optional flags]
	hxArgs := []string{"-l", tmp.Name(), "-silent"}
	if cfg.HttpxSC    { hxArgs = append(hxArgs, "-sc")    }
	if cfg.HttpxCT    { hxArgs = append(hxArgs, "-ct")    }
	if cfg.HttpxTitle { hxArgs = append(hxArgs, "-title") }
	if cfg.HttpxTD    { hxArgs = append(hxArgs, "-td")    }

	hxOut, err := runTool(ctx, m.httpxPath, hxArgs)
	if err != nil {
		return nil, fmt.Errorf("httpx: %w", err)
	}

	// Parse: first field of each line is the endpoint URL (the unique key).
	endpoints := map[string]string{}
	for _, line := range strings.Split(strings.TrimSpace(hxOut), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) > 0 {
			endpoints[fields[0]] = line
		}
	}
	return endpoints, nil
}

// runTool executes an external binary with args and returns combined output.
func runTool(ctx context.Context, tool string, args []string) (string, error) {
	out, err := exec.CommandContext(ctx, tool, args...).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}
