package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/0xNayel/MonMon/internal/alert"
	"github.com/0xNayel/MonMon/internal/models"
)

func (s *Server) alertMgr() *alert.AlertManager {
	return alert.NewAlertManager(s.DB, "")
}

func (s *Server) handleListAlerts(c *gin.Context) {
	mgr := s.alertMgr()
	configs := mgr.ListAll()
	c.JSON(http.StatusOK, gin.H{"data": configs})
}

func (s *Server) handleCreateAlert(c *gin.Context) {
	var cfg models.AlertConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if cfg.Name == "" || cfg.Provider == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and provider are required"})
		return
	}
	if cfg.ProviderConfig == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider_config is required"})
		return
	}
	mgr := s.alertMgr()
	if err := mgr.Create(&cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create alert"})
		return
	}
	c.JSON(http.StatusCreated, cfg)
}

func (s *Server) handleUpdateAlert(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	mgr := s.alertMgr()
	cfg, err := mgr.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert config not found"})
		return
	}

	var updates models.AlertConfig
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if updates.Name != "" {
		cfg.Name = updates.Name
	}
	if updates.Provider != "" {
		cfg.Provider = updates.Provider
	}
	if updates.ProviderConfig != "" {
		cfg.ProviderConfig = updates.ProviderConfig
	}
	cfg.Enabled = updates.Enabled
	cfg.OnChange = updates.OnChange
	cfg.OnError = updates.OnError
	cfg.KeywordFilter = updates.KeywordFilter
	cfg.MessageTemplate = updates.MessageTemplate

	mgr.Update(cfg)
	c.JSON(http.StatusOK, cfg)
}

func (s *Server) handleDeleteAlert(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	mgr := s.alertMgr()
	if err := mgr.Delete(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert config not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "alert config deleted"})
}

func (s *Server) handleTestAlert(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	mgr := s.alertMgr()
	cfg, err := mgr.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert config not found"})
		return
	}

	if err := mgr.Test(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "test alert sent"})
}
