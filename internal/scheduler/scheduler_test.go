package scheduler

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/0xNayel/MonMon/internal/alert"
	"github.com/0xNayel/MonMon/internal/logger"
	"github.com/0xNayel/MonMon/internal/models"
	"github.com/0xNayel/MonMon/internal/monitor"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	db.AutoMigrate(&models.User{}, &models.Task{}, &models.Check{}, &models.AlertConfig{}, &models.Log{})
	return db
}

func setupScheduler(t *testing.T, db *gorm.DB) *Scheduler {
	t.Helper()
	monitors := map[string]monitor.Monitor{
		models.TaskTypeCommand:  monitor.NewCommandMonitor(),
		models.TaskTypeEndpoint: monitor.NewEndpointMonitor(),
	}
	alertMgr := alert.NewAlertManager(db, "")
	log := logger.New("error", "", db)
	return New(db, monitors, alertMgr, log)
}

func TestScheduler_AddTaskCreatesCheck(t *testing.T) {
	db := setupTestDB(t)
	s := setupScheduler(t, db)
	s.cron.Start()
	defer s.Stop()

	cfg := models.CommandConfig{Command: "echo scheduler-test", TimeoutSec: 5}
	cfgJSON, _ := json.Marshal(cfg)

	task := &models.Task{
		Name:          "test-cmd",
		Type:          models.TaskTypeCommand,
		Status:        models.TaskStatusActive,
		Config:        string(cfgJSON),
		ScheduleType:  models.ScheduleLoop,
		ScheduleValue: "0", // back-to-back, but we'll stop quickly
	}
	db.Create(task)

	// Add task and wait for at least one check
	s.AddTask(task)
	time.Sleep(3 * time.Second)
	s.RemoveTask(task.ID)

	var count int64
	db.Model(&models.Check{}).Where("task_id = ?", task.ID).Count(&count)
	if count == 0 {
		t.Error("expected at least one check record after adding task")
	}

	// Verify the check has expected fields
	var check models.Check
	db.Where("task_id = ?", task.ID).First(&check)
	if check.Version < 1 {
		t.Errorf("expected version >= 1, got %d", check.Version)
	}
	if check.OutputHash == "" {
		t.Error("expected non-empty output hash")
	}
}

func TestScheduler_PauseResume(t *testing.T) {
	db := setupTestDB(t)
	s := setupScheduler(t, db)
	s.cron.Start()
	defer s.Stop()

	cfg := models.CommandConfig{Command: "echo pause-test", TimeoutSec: 5}
	cfgJSON, _ := json.Marshal(cfg)

	task := &models.Task{
		Name:          "pause-test",
		Type:          models.TaskTypeCommand,
		Status:        models.TaskStatusActive,
		Config:        string(cfgJSON),
		ScheduleType:  models.ScheduleLoop,
		ScheduleValue: "1",
	}
	db.Create(task)

	// Add and let it run
	s.AddTask(task)
	time.Sleep(2 * time.Second)

	// Pause: remove from scheduler and set status to paused
	s.RemoveTask(task.ID)
	db.Model(task).Update("status", models.TaskStatusPaused)

	var countAtPause int64
	db.Model(&models.Check{}).Where("task_id = ?", task.ID).Count(&countAtPause)

	// Wait and verify no new checks
	time.Sleep(2 * time.Second)
	var countAfterPause int64
	db.Model(&models.Check{}).Where("task_id = ?", task.ID).Count(&countAfterPause)

	if countAfterPause != countAtPause {
		t.Errorf("expected no new checks after pause, had %d now %d", countAtPause, countAfterPause)
	}

	// Resume
	db.Model(task).Update("status", models.TaskStatusActive)
	s.AddTask(task)
	time.Sleep(2 * time.Second)
	s.RemoveTask(task.ID)

	var countAfterResume int64
	db.Model(&models.Check{}).Where("task_id = ?", task.ID).Count(&countAfterResume)

	if countAfterResume <= countAtPause {
		t.Errorf("expected new checks after resume, had %d at pause, now %d", countAtPause, countAfterResume)
	}
}
