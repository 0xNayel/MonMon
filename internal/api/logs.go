package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/monmon-io/monmon/internal/models"
)

func (s *Server) handleListLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 200 {
		perPage = 50
	}

	level := c.Query("level")
	source := c.Query("source")
	taskIDStr := c.Query("task_id")

	var taskID *uint
	if taskIDStr != "" {
		id, _ := strconv.ParseUint(taskIDStr, 10, 64)
		tid := uint(id)
		taskID = &tid
	}

	logs, total := s.Logger.GetRecentLogs(level, source, taskID, page, perPage)

	c.JSON(http.StatusOK, gin.H{
		"data":     logs,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func (s *Server) handleStats(c *gin.Context) {
	var totalTasks, activeTasks, pausedTasks, errorTasks int64
	s.DB.Model(&models.Task{}).Count(&totalTasks)
	s.DB.Model(&models.Task{}).Where("status = ?", "active").Count(&activeTasks)
	s.DB.Model(&models.Task{}).Where("status = ?", "paused").Count(&pausedTasks)
	s.DB.Model(&models.Task{}).Where("status = ?", "error").Count(&errorTasks)

	var totalChecks, totalChanges int64
	s.DB.Model(&models.Check{}).Count(&totalChecks)
	s.DB.Model(&models.Check{}).Where("status = ?", "changed").Count(&totalChanges)

	// Changes in last 24h
	var changes24h int64
	yesterday := time.Now().Add(-24 * time.Hour)
	s.DB.Model(&models.Check{}).Where("status = ? AND created_at > ?", "changed", yesterday).Count(&changes24h)

	// Errors in last 24h
	var errors24h int64
	s.DB.Model(&models.Check{}).Where("status = ? AND created_at > ?", "error", yesterday).Count(&errors24h)

	// Recent activity (last 20 checks)
	var recentChecks []struct {
		TaskID     uint      `json:"task_id"`
		TaskName   string    `json:"task_name"`
		Status     string    `json:"status"`
		Version    int       `json:"version"`
		Time       time.Time `json:"time"`
		DurationMs int64     `json:"duration_ms"`
		ErrorMsg   string    `json:"error_msg"`
	}
	s.DB.Table("checks").
		Select("checks.task_id, tasks.name as task_name, checks.status, checks.version, checks.created_at as time, checks.duration_ms, checks.error_msg").
		Joins("JOIN tasks ON tasks.id = checks.task_id").
		Order("checks.created_at DESC").
		Limit(20).
		Scan(&recentChecks)

	c.JSON(http.StatusOK, gin.H{
		"tasks": gin.H{
			"total":  totalTasks,
			"active": activeTasks,
			"paused": pausedTasks,
			"error":  errorTasks,
		},
		"checks": gin.H{
			"total":       totalChecks,
			"changes":     totalChanges,
			"changes_24h": changes24h,
			"errors_24h":  errors24h,
		},
		"recent_activity": recentChecks,
	})
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) handleWSLogs(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// Stream logs: poll DB every second for new entries
	var lastID uint
	// Get current max ID
	var maxLog models.Log
	if s.DB.Order("id DESC").First(&maxLog).Error == nil {
		lastID = maxLog.ID
	}

	for {
		time.Sleep(1 * time.Second)

		var logs []models.Log
		s.DB.Where("id > ?", lastID).Order("id ASC").Limit(50).Find(&logs)

		for _, l := range logs {
			if err := conn.WriteJSON(l); err != nil {
				return
			}
			lastID = l.ID
		}
	}
}
