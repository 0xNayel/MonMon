package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"github.com/0xNayel/MonMon/internal/alert"
	"github.com/0xNayel/MonMon/internal/api"
	"github.com/0xNayel/MonMon/internal/auth"
	"github.com/0xNayel/MonMon/internal/config"
	"github.com/0xNayel/MonMon/internal/db"
	"github.com/0xNayel/MonMon/internal/diff"
	"github.com/0xNayel/MonMon/internal/logger"
	"github.com/0xNayel/MonMon/internal/models"
	"github.com/0xNayel/MonMon/internal/monitor"
	"github.com/0xNayel/MonMon/internal/scheduler"
	"github.com/0xNayel/MonMon/internal/updater"
	"github.com/spf13/cobra"
)

const banner = `
   __  __             __  __
  |  \/  | ___  _ __ |  \/  | ___  _ __
  | |\/| |/ _ \| '_ \| |\/| |/ _ \| '_ \
  | |  | | (_) | | | | |  | | (_) | | | |
  |_|  |_|\___/|_| |_|_|  |_|\___/|_| |_|
  Monitoring Monster by 0xNayel
`

var (
	version   = "0.1.0"
	cfgFile   string
	port      int
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "monmon",
		Short: "MonMon — Monitoring Monster",
		Long:  "Diff-based monitoring for commands, endpoints, and subdomains.",
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			fmt.Print(banner)
		},
	}

	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "config file path")

	// --- server command ---
	serverCmd := &cobra.Command{
		Use:   "server",
		Short: "Start the MonMon server",
		RunE:  runServer,
	}
	serverCmd.Flags().IntVarP(&port, "port", "p", 0, "server port (overrides config)")
	rootCmd.AddCommand(serverCmd)

	// --- version command ---
	rootCmd.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run:   func(cmd *cobra.Command, args []string) { fmt.Println("MonMon v" + version) },
	})

	// --- update command ---
	rootCmd.AddCommand(&cobra.Command{
		Use:   "update",
		Short: "Check for updates and self-update from GitHub",
		RunE: func(cmd *cobra.Command, args []string) error {
			return updater.SelfUpdate(version)
		},
	})

	// --- config init ---
	rootCmd.AddCommand(&cobra.Command{
		Use:   "config",
		Short: "Configuration commands",
	})

	// --- task commands ---
	taskCmd := &cobra.Command{
		Use:   "task",
		Short: "Manage monitoring tasks",
	}
	addCmdCmd := &cobra.Command{
		Use:   "add-cmd [command]",
		Short: "Add a command monitoring task",
		Args:  cobra.ExactArgs(1),
		RunE:  runTaskAddCmd,
	}
	addCmdCmd.Flags().String("interval", "3600", "check interval in seconds")
	addCmdCmd.Flags().String("name", "", "task name")

	addURLCmd := &cobra.Command{
		Use:   "add-url [url]",
		Short: "Add an endpoint monitoring task",
		Args:  cobra.ExactArgs(1),
		RunE:  runTaskAddURL,
	}
	addURLCmd.Flags().String("interval", "1800", "check interval in seconds")
	addURLCmd.Flags().String("mode", "body", "monitor mode: body|full|metadata|regex")
	addURLCmd.Flags().String("name", "", "task name")

	addDomainCmd := &cobra.Command{
		Use:   "add-domain [domain]",
		Short: "Add a subdomain monitoring task",
		Args:  cobra.ExactArgs(1),
		RunE:  runTaskAddDomain,
	}
	addDomainCmd.Flags().String("interval", "21600", "check interval in seconds")
	addDomainCmd.Flags().String("flow", "builtin", "flow mode: builtin|full|custom")
	addDomainCmd.Flags().String("name", "", "task name")

	addBbscopeCmd := &cobra.Command{
		Use:   "add-bbscope [platform]",
		Short: "Add a bbscope monitoring task (h1, bc, it, ywh)",
		Args:  cobra.ExactArgs(1),
		RunE:  runTaskAddBbscope,
	}
	addBbscopeCmd.Flags().String("interval", "3600", "check interval in seconds")
	addBbscopeCmd.Flags().String("name", "", "task name")
	addBbscopeCmd.Flags().StringP("token", "t", "", "API token (h1, it, ywh)")
	addBbscopeCmd.Flags().StringP("username", "u", "", "username (h1)")
	addBbscopeCmd.Flags().StringP("email", "E", "", "email (bc, ywh)")
	addBbscopeCmd.Flags().StringP("password", "P", "", "password (bc, ywh)")
	addBbscopeCmd.Flags().String("otp-secret", "", "TOTP secret base32 (bc, ywh)")
	addBbscopeCmd.Flags().Int("concurrency", 0, "concurrent fetches, 0=default (bc)")
	addBbscopeCmd.Flags().BoolP("bounty-only", "b", false, "bounty-only programs")
	addBbscopeCmd.Flags().StringP("output-type", "o", "tc", "output type (default: tc)")

	taskCmd.AddCommand(
		&cobra.Command{Use: "list", Short: "List tasks", RunE: runTaskList},
		addCmdCmd,
		addURLCmd,
		addDomainCmd,
		addBbscopeCmd,
		&cobra.Command{Use: "run [id]", Short: "Trigger immediate check", Args: cobra.ExactArgs(1), RunE: runTaskRun},
		&cobra.Command{Use: "pause [id]", Short: "Pause a task", Args: cobra.ExactArgs(1), RunE: runTaskPause},
		&cobra.Command{Use: "resume [id]", Short: "Resume a task", Args: cobra.ExactArgs(1), RunE: runTaskResume},
		&cobra.Command{Use: "delete [id]", Short: "Delete a task", Args: cobra.ExactArgs(1), RunE: runTaskDelete},
	)
	rootCmd.AddCommand(taskCmd)

	// --- check commands ---
	checkCmd := &cobra.Command{
		Use:   "check",
		Short: "View check history and diffs",
	}
	checkCmd.AddCommand(
		&cobra.Command{
			Use:   "list [task_id]",
			Short: "List checks for a task",
			Args:  cobra.ExactArgs(1),
			RunE:  runCheckList,
		},
		&cobra.Command{
			Use:   "diff [check_id]",
			Short: "Show diff for a check",
			Args:  cobra.ExactArgs(1),
			RunE:  runCheckDiff,
		},
	)
	rootCmd.AddCommand(checkCmd)

	// --- logs command ---
	rootCmd.AddCommand(&cobra.Command{
		Use:   "logs",
		Short: "View logs",
		RunE:  runLogs,
	})

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func runServer(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load(cfgFile)
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}
	if port > 0 {
		cfg.Server.Port = port
	}

	// Init database
	database, err := db.Init(cfg)
	if err != nil {
		return fmt.Errorf("init db: %w", err)
	}

	// Init logger
	log := logger.New(cfg.Logging.Level, cfg.Logging.File, database)
	log.Info("server", nil, "Starting MonMon v"+version)

	// Init auth
	authSvc := auth.NewAuthService(database, cfg.Auth)

	// Init monitors
	monitors := map[string]monitor.Monitor{
		models.TaskTypeCommand:   monitor.NewCommandMonitor(),
		models.TaskTypeEndpoint:  monitor.NewEndpointMonitor(),
		models.TaskTypeSubdomain: monitor.NewSubdomainMonitor(cfg.Tools.Subfinder, cfg.Tools.Httpx),
		models.TaskTypeBbscope:   monitor.NewBbscopeMonitor(),
	}

	// Init alert manager
	alertMgr := alert.NewAlertManager(database, cfg.Notify.ProviderConfig)

	// Init scheduler
	sched := scheduler.New(database, monitors, alertMgr, log)

	// Init API server
	gin.SetMode(gin.ReleaseMode)
	srv := &api.Server{
		DB:        database,
		Auth:      authSvc,
		Scheduler: sched,
		Logger:    log,
		Version:   version,
	}
	router := srv.SetupRouter()

	// Start scheduler
	sched.Start()

	// Handle signals
	go func() {
		log.Info("server", nil, fmt.Sprintf("Listening on :%d", cfg.Server.Port))
		if err := router.Run(fmt.Sprintf(":%d", cfg.Server.Port)); err != nil {
			log.Error("server", nil, fmt.Sprintf("Server error: %v", err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("server", nil, "Shutting down...")
	sched.Stop()
	return nil
}

// --- CLI task helpers (direct DB access for CLI commands) ---

func getDB() (*gorm.DB, error) {
	cfg, err := config.Load(cfgFile)
	if err != nil {
		return nil, err
	}
	database, err := db.Init(cfg)
	if err != nil {
		return nil, err
	}
	return database, nil
}

func runTaskList(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}
	var tasks []models.Task
	database.Find(&tasks)

	if len(tasks) == 0 {
		fmt.Println("No tasks found.")
		return nil
	}

	fmt.Printf("%-4s %-25s %-10s %-8s %-15s %-8s %-8s\n", "ID", "Name", "Type", "Status", "Schedule", "Checks", "Changes")
	fmt.Println("---- ------------------------- ---------- -------- --------------- -------- --------")
	for _, t := range tasks {
		sched := t.ScheduleType + ":" + t.ScheduleValue
		if len(sched) > 15 {
			sched = sched[:15]
		}
		fmt.Printf("%-4d %-25s %-10s %-8s %-15s %-8d %-8d\n",
			t.ID, truncate(t.Name, 25), t.Type, t.Status, sched, t.TotalChecks, t.TotalChanges)
	}
	return nil
}

func runTaskAddCmd(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}

	interval, _ := cmd.Flags().GetString("interval")
	name, _ := cmd.Flags().GetString("name")
	if interval == "" {
		interval = "3600" // default 1h
	}
	if name == "" {
		name = "Command: " + truncate(args[0], 40)
	}

	configJSON := fmt.Sprintf(`{"command":%q,"output_mode":"stdout","timeout_sec":60}`, args[0])
	task := models.Task{
		Name:          name,
		Type:          models.TaskTypeCommand,
		Status:        models.TaskStatusActive,
		Config:        configJSON,
		ScheduleType:  models.ScheduleLoop,
		ScheduleValue: interval,
	}
	database.Create(&task)
	fmt.Printf("Task #%d created. Start the server to begin monitoring.\n", task.ID)
	return nil
}

func runTaskAddURL(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}

	interval, _ := cmd.Flags().GetString("interval")
	mode, _ := cmd.Flags().GetString("mode")
	name, _ := cmd.Flags().GetString("name")
	if interval == "" {
		interval = "1800"
	}
	if mode == "" {
		mode = "body"
	}
	if name == "" {
		name = "Endpoint: " + truncate(args[0], 35)
	}

	configJSON := fmt.Sprintf(`{"urls":[%q],"monitor_mode":%q,"timeout_sec":30}`, args[0], mode)
	task := models.Task{
		Name:          name,
		Type:          models.TaskTypeEndpoint,
		Status:        models.TaskStatusActive,
		Config:        configJSON,
		ScheduleType:  models.ScheduleLoop,
		ScheduleValue: interval,
	}
	database.Create(&task)
	fmt.Printf("Task #%d created. Start the server to begin monitoring.\n", task.ID)
	return nil
}

func runTaskAddDomain(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}

	interval, _ := cmd.Flags().GetString("interval")
	flow, _ := cmd.Flags().GetString("flow")
	name, _ := cmd.Flags().GetString("name")
	if interval == "" {
		interval = "21600" // 6h
	}
	if flow == "" {
		flow = "builtin"
	}
	if name == "" {
		name = "Subdomain: " + args[0]
	}

	configJSON := fmt.Sprintf(`{"domains":[%q],"flow_mode":%q}`, args[0], flow)
	task := models.Task{
		Name:          name,
		Type:          models.TaskTypeSubdomain,
		Status:        models.TaskStatusActive,
		Config:        configJSON,
		ScheduleType:  models.ScheduleLoop,
		ScheduleValue: interval,
	}
	database.Create(&task)
	fmt.Printf("Task #%d created. Start the server to begin monitoring.\n", task.ID)
	return nil
}

func runTaskAddBbscope(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}

	platform := args[0]
	switch platform {
	case "h1", "bc", "it", "ywh":
	default:
		return fmt.Errorf("unsupported platform %q (supported: h1, bc, it, ywh)", platform)
	}

	interval, _ := cmd.Flags().GetString("interval")
	name, _ := cmd.Flags().GetString("name")
	token, _ := cmd.Flags().GetString("token")
	username, _ := cmd.Flags().GetString("username")
	email, _ := cmd.Flags().GetString("email")
	password, _ := cmd.Flags().GetString("password")
	otpSecret, _   := cmd.Flags().GetString("otp-secret")
	concurrency, _ := cmd.Flags().GetInt("concurrency")
	bountyOnly, _  := cmd.Flags().GetBool("bounty-only")
	outputType, _ := cmd.Flags().GetString("output-type")

	if interval == "" {
		interval = "3600"
	}
	if name == "" {
		platforms := map[string]string{"h1": "HackerOne", "bc": "Bugcrowd", "it": "Intigriti", "ywh": "YesWeHack"}
		name = "BBScope: " + platforms[platform]
	}

	cfg := models.BbscopeConfig{
		Platform:   platform,
		Token:      token,
		Username:   username,
		Email:      email,
		Password:   password,
		OtpSecret:   otpSecret,
		Concurrency: concurrency,
		BountyOnly:  bountyOnly,
		OutputType: outputType,
	}
	cfgJSON, _ := json.Marshal(cfg)

	task := models.Task{
		Name:          name,
		Type:          models.TaskTypeBbscope,
		Status:        models.TaskStatusActive,
		Config:        string(cfgJSON),
		ScheduleType:  models.ScheduleLoop,
		ScheduleValue: interval,
	}
	database.Create(&task)
	fmt.Printf("Task #%d created. Start the server to begin monitoring.\n", task.ID)
	return nil
}

func runTaskRun(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}
	id, _ := strconv.ParseUint(args[0], 10, 64)

	var task models.Task
	if err := database.First(&task, id).Error; err != nil {
		return fmt.Errorf("task #%d not found", id)
	}

	cfg, err := config.Load(cfgFile)
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	monitors := map[string]monitor.Monitor{
		models.TaskTypeCommand:   monitor.NewCommandMonitor(),
		models.TaskTypeEndpoint:  monitor.NewEndpointMonitor(),
		models.TaskTypeSubdomain: monitor.NewSubdomainMonitor(cfg.Tools.Subfinder, cfg.Tools.Httpx),
		models.TaskTypeBbscope:   monitor.NewBbscopeMonitor(),
	}

	mon, ok := monitors[task.Type]
	if !ok {
		return fmt.Errorf("unknown task type %q", task.Type)
	}

	fmt.Printf("Running task #%d (%s)...\n", task.ID, task.Name)
	start := time.Now()
	ctx := context.Background()
	result, err := mon.Execute(ctx, &task)
	elapsed := time.Since(start)
	if err != nil {
		return fmt.Errorf("execution failed: %w", err)
	}
	if result.Error != nil {
		fmt.Printf("Check completed with error: %v\n", result.Error)
		return nil
	}

	// Get previous check for diff
	var prevCheck models.Check
	hasPrev := database.Where("task_id = ?", task.ID).Order("version DESC").First(&prevCheck).Error == nil

	var diffText string
	var added, removed int
	if hasPrev && prevCheck.Output != result.Output {
		diffText, added, removed = diff.ComputeDiff(prevCheck.Output, result.Output)
	}

	status := models.CheckSuccess
	if diffText != "" {
		status = models.CheckChanged
	}

	newVersion := 1
	if hasPrev {
		newVersion = prevCheck.Version + 1
	}

	check := models.Check{
		TaskID:     task.ID,
		Version:    newVersion,
		Status:     status,
		Output:     result.Output,
		OutputHash: result.Hash,
		DiffText:   diffText,
		DiffAdded:  added,
		DiffRemoved: removed,
		DurationMs: elapsed.Milliseconds(),
	}
	database.Create(&check)

	// Update task stats
	database.Model(&task).Updates(map[string]any{
		"last_check_at": time.Now(),
		"total_checks":  gorm.Expr("total_checks + 1"),
	})
	if status == models.CheckChanged {
		database.Model(&task).Update("total_changes", gorm.Expr("total_changes + 1"))
	}

	fmt.Printf("Check #%d (v%d) — %s — %s\n", check.ID, check.Version, status, elapsed.Round(time.Millisecond))
	if diffText != "" {
		fmt.Printf("+%d -%d lines changed\n", added, removed)
		fmt.Println(diffText)
	} else if !hasPrev {
		fmt.Println("First check recorded.")
	} else {
		fmt.Println("No changes.")
	}
	return nil
}

func runTaskPause(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}
	id, _ := strconv.ParseUint(args[0], 10, 64)
	database.Model(&models.Task{}).Where("id = ?", id).Update("status", models.TaskStatusPaused)
	fmt.Printf("Task #%d paused.\n", id)
	return nil
}

func runTaskResume(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}
	id, _ := strconv.ParseUint(args[0], 10, 64)
	database.Model(&models.Task{}).Where("id = ?", id).Update("status", models.TaskStatusActive)
	fmt.Printf("Task #%d resumed. Restart server to pick up changes.\n", id)
	return nil
}

func runTaskDelete(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}
	id, _ := strconv.ParseUint(args[0], 10, 64)
	database.Where("task_id = ?", id).Delete(&models.Check{})
	database.Where("task_id = ?", id).Delete(&models.AlertConfig{})
	database.Delete(&models.Task{}, id)
	fmt.Printf("Task #%d deleted.\n", id)
	return nil
}

func runCheckList(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}
	taskID, _ := strconv.ParseUint(args[0], 10, 64)

	var checks []models.Check
	database.Where("task_id = ?", taskID).Order("version DESC").Limit(20).Find(&checks)

	if len(checks) == 0 {
		fmt.Println("No checks found.")
		return nil
	}

	fmt.Printf("%-4s %-6s %-10s %-6s %-6s %-8s %-20s\n", "ID", "Ver", "Status", "+Add", "-Rem", "Duration", "Time")
	fmt.Println("---- ------ ---------- ------ ------ -------- --------------------")
	for _, ch := range checks {
		fmt.Printf("%-4d %-6d %-10s %-6d %-6d %-8s %s\n",
			ch.ID, ch.Version, ch.Status, ch.DiffAdded, ch.DiffRemoved,
			fmt.Sprintf("%dms", ch.DurationMs), ch.CreatedAt.Format("2006-01-02 15:04:05"))
	}
	return nil
}

func runCheckDiff(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}
	checkID, _ := strconv.ParseUint(args[0], 10, 64)

	var check models.Check
	if err := database.First(&check, checkID).Error; err != nil {
		return fmt.Errorf("check not found")
	}

	if check.DiffText == "" {
		fmt.Println("No diff (unchanged or first check).")
		return nil
	}
	fmt.Println(check.DiffText)
	return nil
}

func runLogs(cmd *cobra.Command, args []string) error {
	database, err := getDB()
	if err != nil {
		return err
	}

	var logs []models.Log
	database.Order("created_at DESC").Limit(50).Find(&logs)

	// Print in reverse (oldest first)
	for i := len(logs) - 1; i >= 0; i-- {
		l := logs[i]
		fmt.Printf("%s [%-5s] %-20s │ %s\n", l.CreatedAt.Format("15:04:05"), l.Level, l.Source, l.Message)
	}
	return nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}

