package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/0xNayel/MonMon/internal/models"
)

func (s *Server) handleListTasks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	query := s.DB.Model(&models.Task{})

	if t := c.Query("type"); t != "" {
		query = query.Where("type = ?", t)
	}
	if st := c.Query("status"); st != "" {
		query = query.Where("status = ?", st)
	}
	if tag := c.Query("tag"); tag != "" {
		query = query.Where("tags LIKE ?", "%"+tag+"%")
	}
	if search := c.Query("search"); search != "" {
		query = query.Where("name LIKE ? OR config LIKE ?", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	sortField := c.DefaultQuery("sort", "created_at")
	order := c.DefaultQuery("order", "desc")
	allowed := map[string]bool{"name": true, "type": true, "status": true, "created_at": true, "last_check_at": true, "total_changes": true, "total_checks": true}
	if !allowed[sortField] {
		sortField = "created_at"
	}
	if order != "asc" {
		order = "desc"
	}
	query = query.Order(sortField + " " + order)

	var tasks []models.Task
	query.Offset((page - 1) * perPage).Limit(perPage).Find(&tasks)

	c.JSON(http.StatusOK, gin.H{
		"data":     tasks,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func (s *Server) handleCreateTask(c *gin.Context) {
	var task models.Task
	if err := c.ShouldBindJSON(&task); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate required fields
	if task.Name == "" || task.Type == "" || task.Config == "" || task.ScheduleType == "" || task.ScheduleValue == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, type, config, schedule_type, and schedule_value are required"})
		return
	}

	validTypes := map[string]bool{
		models.TaskTypeCommand:   true,
		models.TaskTypeEndpoint:  true,
		models.TaskTypeSubdomain: true,
		models.TaskTypeBbscope:   true,
	}
	if !validTypes[task.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be command, endpoint, subdomain, or bbscope"})
		return
	}

	task.Status = models.TaskStatusActive
	if err := s.DB.Create(&task).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create task"})
		return
	}

	// Register with scheduler
	s.Scheduler.AddTask(&task)

	s.Logger.Info("api", nil, "Task created: "+task.Name)
	c.JSON(http.StatusCreated, task)
}

func (s *Server) handleGetTask(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var task models.Task
	if err := s.DB.First(&task, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	c.JSON(http.StatusOK, task)
}

func (s *Server) handleUpdateTask(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var task models.Task
	if err := s.DB.First(&task, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	var updates models.Task
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update allowed fields
	if updates.Name != "" {
		task.Name = updates.Name
	}
	if updates.Config != "" {
		task.Config = updates.Config
	}
	if updates.ScheduleType != "" {
		task.ScheduleType = updates.ScheduleType
	}
	if updates.ScheduleValue != "" {
		task.ScheduleValue = updates.ScheduleValue
	}
	if updates.Tags != "" {
		task.Tags = updates.Tags
	}
	if updates.DataRetention != 0 {
		task.DataRetention = updates.DataRetention
	}

	s.DB.Save(&task)

	// Re-register with scheduler
	s.Scheduler.AddTask(&task)

	c.JSON(http.StatusOK, task)
}

func (s *Server) handleDeleteTask(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	s.Scheduler.RemoveTask(uint(id))

	// Delete checks first (cascade), then task
	s.DB.Where("task_id = ?", id).Delete(&models.Check{})
	s.DB.Where("task_id = ?", id).Delete(&models.AlertConfig{})
	if err := s.DB.Delete(&models.Task{}, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "task deleted"})
}

func (s *Server) handlePauseTask(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	s.Scheduler.RemoveTask(uint(id))
	s.DB.Model(&models.Task{}).Where("id = ?", id).Update("status", models.TaskStatusPaused)
	c.JSON(http.StatusOK, gin.H{"message": "task paused"})
}

func (s *Server) handleResumeTask(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var task models.Task
	if err := s.DB.First(&task, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	task.Status = models.TaskStatusActive
	s.DB.Save(&task)
	s.Scheduler.AddTask(&task)
	c.JSON(http.StatusOK, gin.H{"message": "task resumed"})
}

func (s *Server) handleRunTask(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := s.Scheduler.TriggerNow(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "check triggered"})
}
