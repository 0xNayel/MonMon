package service

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"

	"github.com/kardianos/service"
)

const serviceName = "monmon"
const serviceDisplayName = "MonMon - Monitoring Monster"
const serviceDescription = "Diff-based monitoring for commands, endpoints, and subdomains"

// Program implements service.Interface for kardianos/service.
type Program struct {
	RunFunc  func() error
	StopFunc func()
}

func (p *Program) Start(s service.Service) error {
	go p.RunFunc()
	return nil
}

func (p *Program) Stop(s service.Service) error {
	if p.StopFunc != nil {
		p.StopFunc()
	}
	return nil
}

// Config returns the service configuration.
func Config(configPath string) *service.Config {
	args := []string{"server"}
	if configPath != "" {
		args = append(args, "-c", configPath)
	}
	return &service.Config{
		Name:        serviceName,
		DisplayName: serviceDisplayName,
		Description: serviceDescription,
		Arguments:   args,
	}
}

// Install installs MonMon as an OS service.
func Install(configPath string) error {
	if runtime.GOOS == "linux" {
		if err := setupLinux(); err != nil {
			return fmt.Errorf("linux setup: %w", err)
		}
	}

	prg := &Program{}
	svc, err := service.New(prg, Config(configPath))
	if err != nil {
		return fmt.Errorf("creating service: %w", err)
	}

	if err := svc.Install(); err != nil {
		return fmt.Errorf("installing service: %w", err)
	}

	// Enable and start
	if err := svc.Start(); err != nil {
		// Non-fatal: service installed but might need manual start
		fmt.Fprintf(os.Stderr, "Warning: installed but could not start: %v\n", err)
	}

	fmt.Println("MonMon service installed and started successfully.")
	fmt.Println("  Config: /etc/monmon/monmon.yaml")
	fmt.Println("  Data:   /var/lib/monmon/data/")
	fmt.Println("  Logs:   journalctl -u monmon -f")
	return nil
}

// Uninstall removes the MonMon service (keeps data).
func Uninstall() error {
	prg := &Program{}
	svc, err := service.New(prg, Config(""))
	if err != nil {
		return fmt.Errorf("creating service: %w", err)
	}

	_ = svc.Stop() // ignore error if not running
	if err := svc.Uninstall(); err != nil {
		return fmt.Errorf("uninstalling service: %w", err)
	}

	fmt.Println("MonMon service removed.")
	fmt.Println("Data preserved at /var/lib/monmon — remove manually if desired.")
	return nil
}

// Start starts the installed service.
func Start() error {
	prg := &Program{}
	svc, err := service.New(prg, Config(""))
	if err != nil {
		return err
	}
	return svc.Start()
}

// Stop stops the installed service.
func Stop() error {
	prg := &Program{}
	svc, err := service.New(prg, Config(""))
	if err != nil {
		return err
	}
	return svc.Stop()
}

// Restart restarts the installed service.
func Restart() error {
	if err := Stop(); err != nil {
		// Try start anyway
		_ = err
	}
	return Start()
}

// Status prints the service status.
func Status() error {
	prg := &Program{}
	svc, err := service.New(prg, Config(""))
	if err != nil {
		return err
	}
	status, err := svc.Status()
	if err != nil {
		return fmt.Errorf("getting status: %w", err)
	}
	switch status {
	case service.StatusRunning:
		fmt.Println("MonMon is running")
	case service.StatusStopped:
		fmt.Println("MonMon is stopped")
	default:
		fmt.Println("MonMon status: unknown")
	}
	return nil
}

// RunAsService wraps the server in a service context.
// Call this from the server command when detecting service mode.
func RunAsService(runFn func() error, stopFn func(), configPath string) error {
	prg := &Program{RunFunc: runFn, StopFunc: stopFn}
	svc, err := service.New(prg, Config(configPath))
	if err != nil {
		return err
	}
	return svc.Run()
}

// IsRunningAsService returns true if the process is managed by a service manager.
func IsRunningAsService() bool {
	return !service.Interactive()
}

// setupLinux creates the monmon user, directories, and copies configs.
func setupLinux() error {
	// Create system user (ignore if exists)
	_ = exec.Command("useradd", "--system", "--no-create-home", "--shell", "/usr/sbin/nologin", "monmon").Run()

	// Create directories
	dirs := []string{"/etc/monmon", "/var/lib/monmon/data"}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return fmt.Errorf("creating %s: %w", d, err)
		}
	}

	// Copy binary if not already at /usr/local/bin
	exe, err := os.Executable()
	if err == nil && exe != "/usr/local/bin/monmon" {
		input, err := os.ReadFile(exe)
		if err == nil {
			_ = os.WriteFile("/usr/local/bin/monmon", input, 0755)
		}
	}

	// Copy example configs if config doesn't exist
	if _, err := os.Stat("/etc/monmon/monmon.yaml"); os.IsNotExist(err) {
		for _, pair := range [][2]string{
			{"configs/monmon.yaml.example", "/etc/monmon/monmon.yaml"},
			{"configs/notify-provider.yaml.example", "/etc/monmon/notify-provider.yaml"},
		} {
			if data, err := os.ReadFile(pair[0]); err == nil {
				_ = os.WriteFile(pair[1], data, 0644)
			}
		}
	}

	// Set ownership
	_ = exec.Command("chown", "-R", "monmon:monmon", "/var/lib/monmon").Run()
	_ = exec.Command("chown", "-R", "monmon:monmon", "/etc/monmon").Run()

	return nil
}
