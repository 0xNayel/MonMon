package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"
)

const (
	repoOwner = "0xNayel"
	repoName  = "MonMon"
	githubAPI = "https://api.github.com/repos/" + repoOwner + "/" + repoName
)

// Release represents a GitHub release.
type Release struct {
	TagName string  `json:"tag_name"`
	Name    string  `json:"name"`
	Body    string  `json:"body"`
	HTMLURL string  `json:"html_url"`
	Assets  []Asset `json:"assets"`
}

// Asset represents a release binary asset.
type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// VersionInfo holds current vs latest version comparison.
type VersionInfo struct {
	Current     string `json:"current"`
	Latest      string `json:"latest"`
	UpdateAvail bool   `json:"update_available"`
	ReleaseURL  string `json:"release_url,omitempty"`
	DownloadURL string `json:"download_url,omitempty"`
	ReleaseBody string `json:"release_notes,omitempty"`
}

var httpClient = &http.Client{Timeout: 15 * time.Second}

// CheckLatest queries GitHub for the latest release and compares with current.
func CheckLatest(currentVersion string) (*VersionInfo, error) {
	req, err := http.NewRequest("GET", githubAPI+"/releases/latest", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "MonMon/"+currentVersion)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("checking for updates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return &VersionInfo{
			Current: currentVersion,
			Latest:  currentVersion,
		}, nil
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("parsing release: %w", err)
	}

	latest := strings.TrimPrefix(release.TagName, "v")
	info := &VersionInfo{
		Current:     currentVersion,
		Latest:      latest,
		UpdateAvail: latest != currentVersion,
		ReleaseURL:  release.HTMLURL,
		ReleaseBody: release.Body,
	}

	// Find matching binary for current platform
	target := fmt.Sprintf("monmon_%s_%s", runtime.GOOS, runtime.GOARCH)
	for _, a := range release.Assets {
		if strings.Contains(strings.ToLower(a.Name), target) {
			info.DownloadURL = a.BrowserDownloadURL
			break
		}
	}

	return info, nil
}

// SelfUpdate checks for and applies the latest update.
func SelfUpdate(currentVersion string) error {
	fmt.Printf("MonMon v%s — checking for updates...\n", currentVersion)

	info, err := CheckLatest(currentVersion)
	if err != nil {
		return fmt.Errorf("update check failed: %w", err)
	}

	if !info.UpdateAvail {
		fmt.Printf("Already up to date (v%s).\n", currentVersion)
		return nil
	}

	fmt.Printf("Update available: v%s → v%s\n", info.Current, info.Latest)

	if info.DownloadURL != "" {
		fmt.Println("Downloading binary...")
		if err := downloadAndReplace(info.DownloadURL); err != nil {
			return err
		}
		fmt.Printf("Updated to v%s. Restart MonMon to apply.\n", info.Latest)
		return nil
	}

	// No pre-built binary — suggest alternatives
	fmt.Println("\nNo pre-built binary for your platform.")
	fmt.Println("Update with:")
	fmt.Printf("  go install github.com/%s/%s/cmd/monmon@v%s\n\n", repoOwner, repoName, info.Latest)
	fmt.Println("Or build from source:")
	fmt.Println("  git pull && make build")
	return nil
}

func downloadAndReplace(url string) error {
	resp, err := httpClient.Get(url)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("download returned %d", resp.StatusCode)
	}

	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("finding executable path: %w", err)
	}

	tmp, err := os.CreateTemp("", "monmon-update-*")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpName := tmp.Name()

	n, err := io.Copy(tmp, resp.Body)
	tmp.Close()
	if err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("writing update: %w", err)
	}
	fmt.Printf("Downloaded %d bytes\n", n)

	if err := os.Chmod(tmpName, 0755); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("chmod: %w", err)
	}

	// Rename old binary as backup
	backup := exe + ".bak"
	os.Remove(backup) // ignore error
	if err := os.Rename(exe, backup); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("backing up current binary: %w", err)
	}

	if err := os.Rename(tmpName, exe); err != nil {
		// Restore backup
		os.Rename(backup, exe)
		return fmt.Errorf("replacing binary: %w", err)
	}

	os.Remove(backup)
	return nil
}
