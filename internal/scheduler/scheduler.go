package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/0xNayel/MonMon/internal/alert"
	"github.com/0xNayel/MonMon/internal/diff"
	"github.com/0xNayel/MonMon/internal/logger"
	"github.com/0xNayel/MonMon/internal/models"
	"github.com/0xNayel/MonMon/internal/monitor"
	"github.com/robfig/cron/v3"
	"gorm.io/gorm"
)

// Scheduler manages the execution of monitoring tasks.
type Scheduler struct {
	db       *gorm.DB
	monitors map[string]monitor.Monitor
	alertMgr *alert.AlertManager
	log      *logger.AppLogger

	cron    *cron.Cron
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	cancels sync.Map // taskID -> context.CancelFunc
	cronIDs sync.Map // taskID -> cron.EntryID
}

// New creates a new Scheduler.
func New(db *gorm.DB, monitors map[string]monitor.Monitor, alertMgr *alert.AlertManager, log *logger.AppLogger) *Scheduler {
	ctx, cancel := context.WithCancel(context.Background())
	return &Scheduler{
		db:       db,
		monitors: monitors,
		alertMgr: alertMgr,
		log:      log,
		cron:     cron.New(),
		ctx:      ctx,
		cancel:   cancel,
	}
}

// Start loads all active tasks and begins scheduling.
func (s *Scheduler) Start() {
	var tasks []models.Task
	s.db.Where("status = ?", models.TaskStatusActive).Find(&tasks)

	for i := range tasks {
		s.addTask(&tasks[i])
	}
	s.cron.Start()
	s.log.Info("scheduler", nil, fmt.Sprintf("Started with %d active tasks", len(tasks)))
}

// Stop gracefully shuts down all scheduling.
func (s *Scheduler) Stop() {
	s.log.Info("scheduler", nil, "Shutting down scheduler")
	s.cron.Stop()
	s.cancel()
	s.wg.Wait()
}

// AddTask starts scheduling a task. Safe to call for new or updated tasks.
func (s *Scheduler) AddTask(task *models.Task) {
	s.RemoveTask(task.ID)
	s.addTask(task)
}

// RemoveTask stops scheduling a task.
func (s *Scheduler) RemoveTask(taskID uint) {
	// Cancel loop goroutine if exists
	if cancelFn, ok := s.cancels.LoadAndDelete(taskID); ok {
		cancelFn.(context.CancelFunc)()
	}
	// Remove cron entry if exists
	if entryID, ok := s.cronIDs.LoadAndDelete(taskID); ok {
		s.cron.Remove(entryID.(cron.EntryID))
	}
}

// TriggerNow runs a check immediately for a task (manual trigger).
func (s *Scheduler) TriggerNow(taskID uint) error {
	var task models.Task
	if err := s.db.First(&task, taskID).Error; err != nil {
		return err
	}
	go s.runCheck(&task)
	return nil
}

func (s *Scheduler) addTask(task *models.Task) {
	switch task.ScheduleType {
	case models.ScheduleLoop:
		s.startLoop(task)
	case models.ScheduleCron:
		s.startCron(task)
	}
}

func (s *Scheduler) startLoop(task *models.Task) {
	intervalSec, _ := strconv.Atoi(task.ScheduleValue)
	interval := time.Duration(intervalSec) * time.Second

	taskCtx, taskCancel := context.WithCancel(s.ctx)
	s.cancels.Store(task.ID, taskCancel)

	taskCopy := *task
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		for {
			select {
			case <-taskCtx.Done():
				return
			default:
				// Reload task from DB to get latest state
				var t models.Task
				if err := s.db.First(&t, taskCopy.ID).Error; err != nil {
					s.log.Error("scheduler", &taskCopy.ID, fmt.Sprintf("Failed to reload task: %v", err))
					return
				}
				if t.Status != models.TaskStatusActive {
					return
				}
				s.runCheck(&t)

				if interval == 0 {
					continue // back-to-back
				}
				select {
				case <-taskCtx.Done():
					return
				case <-time.After(interval):
				}
			}
		}
	}()
}

func (s *Scheduler) startCron(task *models.Task) {
	taskID := task.ID
	entryID, err := s.cron.AddFunc(task.ScheduleValue, func() {
		var t models.Task
		if err := s.db.First(&t, taskID).Error; err != nil {
			s.log.Error("scheduler", &taskID, fmt.Sprintf("Failed to reload task: %v", err))
			return
		}
		if t.Status != models.TaskStatusActive {
			return
		}
		s.runCheck(&t)
	})
	if err != nil {
		s.log.Error("scheduler", &task.ID, fmt.Sprintf("Invalid cron expression %q: %v", task.ScheduleValue, err))
		s.db.Model(task).Update("status", models.TaskStatusError)
		return
	}
	s.cronIDs.Store(task.ID, entryID)
}

// runCheck executes a single monitoring check for a task.
func (s *Scheduler) runCheck(task *models.Task) {
	mon, ok := s.monitors[task.Type]
	if !ok {
		s.log.Error("scheduler", &task.ID, fmt.Sprintf("No monitor for type %q", task.Type))
		return
	}

	s.log.Info("scheduler", &task.ID, fmt.Sprintf("Running check for %q", task.Name))
	start := time.Now()

	result, execErr := mon.Execute(s.ctx, task)
	elapsed := time.Since(start).Milliseconds()

	// Handle execution error
	if execErr != nil && result == nil {
		result = &models.CheckResult{
			Error: execErr,
		}
	}

	// Log non-fatal per-URL errors (bulk endpoint mode — check continues)
	for _, urlErr := range result.URLErrors {
		s.log.Error("scheduler", &task.ID, fmt.Sprintf("URL check failed (continuing): %s", urlErr))
	}

	// Get previous check
	var prev models.Check
	hasPrev := s.db.Where("task_id = ?", task.ID).Order("version DESC").First(&prev).Error == nil

	// Determine version
	version := 1
	if hasPrev {
		version = prev.Version + 1
	}

	// Determine status and compute diff
	status := models.CheckSuccess
	var diffText string
	var diffAdded, diffRemoved int
	errorMsg := ""

	if result.Error != nil {
		status = models.CheckError
		errorMsg = result.Error.Error()
	} else if !hasPrev {
		// First check — baseline
		status = models.CheckChanged
		diffText, diffAdded, diffRemoved = diff.ComputeDiff("", result.Output)
	} else if result.Hash != prev.OutputHash {
		// Changed
		status = models.CheckChanged
		diffText, diffAdded, diffRemoved = diff.ComputeDiff(prev.Output, result.Output)
	}
	// else: same hash → success (no change)

	// Serialize metadata
	var metaJSON string
	if result.Metadata != nil {
		if b, err := json.Marshal(result.Metadata); err == nil {
			metaJSON = string(b)
		}
	}

	// Store check
	check := &models.Check{
		TaskID:      task.ID,
		Version:     version,
		Status:      status,
		OutputHash:  result.Hash,
		Output:      result.Output,
		DiffText:    diffText,
		DiffAdded:   diffAdded,
		DiffRemoved: diffRemoved,
		Metadata:    metaJSON,
		DurationMs:  elapsed,
		ErrorMsg:    errorMsg,
	}
	if err := s.db.Create(check).Error; err != nil {
		s.log.Error("scheduler", &task.ID, fmt.Sprintf("Failed to store check: %v", err))
		return
	}

	// Update task stats
	now := time.Now()
	updates := map[string]any{
		"last_check_at": now,
		"total_checks":  gorm.Expr("total_checks + 1"),
	}
	if status == models.CheckChanged {
		updates["total_changes"] = gorm.Expr("total_changes + 1")
	}
	if status == models.CheckError {
		updates["status"] = models.TaskStatusError
	}
	s.db.Model(task).Updates(updates)

	// Log result
	switch status {
	case models.CheckChanged:
		s.log.Info("scheduler", &task.ID, fmt.Sprintf("Change detected: +%d -%d lines (%dms)", diffAdded, diffRemoved, elapsed))
	case models.CheckError:
		if len(errorMsg) >= 7 && errorMsg[:7] == "timeout" {
			s.log.Warn("scheduler", &task.ID, fmt.Sprintf("Task killed: %s — took %dms", errorMsg, elapsed))
		} else {
			s.log.Error("scheduler", &task.ID, fmt.Sprintf("Check error: %s (%dms)", errorMsg, elapsed))
		}
	default:
		s.log.Info("scheduler", &task.ID, fmt.Sprintf("No change (%dms)", elapsed))
	}

	// Send alerts if changed or error
	if status == models.CheckChanged || status == models.CheckError {
		s.alertMgr.Process(task, check)
	}

	// Data retention cleanup
	retention := task.DataRetention
	if retention > 0 {
		s.cleanupOldChecks(task.ID, retention)
	}
}

func (s *Scheduler) cleanupOldChecks(taskID uint, keep int) {
	var count int64
	s.db.Model(&models.Check{}).Where("task_id = ?", taskID).Count(&count)
	if count <= int64(keep) {
		return
	}

	// Find the version threshold
	var threshold models.Check
	s.db.Where("task_id = ?", taskID).Order("version DESC").Offset(keep).First(&threshold)

	result := s.db.Where("task_id = ? AND version <= ?", taskID, threshold.Version).Delete(&models.Check{})
	if result.RowsAffected > 0 {
		s.log.Info("scheduler", &taskID, fmt.Sprintf("Cleaned up %d old checks (keeping %d)", result.RowsAffected, keep))
	}
}
