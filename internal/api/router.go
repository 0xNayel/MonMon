package api

import (
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/0xNayel/MonMon/internal/auth"
	"github.com/0xNayel/MonMon/internal/logger"
	"github.com/0xNayel/MonMon/internal/scheduler"
	"github.com/0xNayel/MonMon/internal/webui"
	"gorm.io/gorm"
)

// Server holds all dependencies for the API.
type Server struct {
	DB        *gorm.DB
	Auth      *auth.AuthService
	Scheduler *scheduler.Scheduler
	Logger    *logger.AppLogger
	Version   string
}

// SetupRouter creates and returns the Gin router with all routes.
func (s *Server) SetupRouter() *gin.Engine {
	r := gin.New()
	r.RedirectTrailingSlash = false
	r.RedirectFixedPath = false
	r.Use(gin.Recovery())

	// Fingerprint header
	r.Use(func(c *gin.Context) {
		c.Header("X-MonMon", "MonMon/"+s.Version)
		c.Next()
	})

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	api := r.Group("/api")

	// Public
	api.POST("/login", s.handleLogin)

	// Protected
	protected := api.Group("")
	protected.Use(s.Auth.AuthMiddleware())
	{
		// Tasks
		protected.GET("/tasks", s.handleListTasks)
		protected.POST("/tasks", s.handleCreateTask)
		protected.GET("/tasks/:id", s.handleGetTask)
		protected.PUT("/tasks/:id", s.handleUpdateTask)
		protected.DELETE("/tasks/:id", s.handleDeleteTask)
		protected.POST("/tasks/:id/pause", s.handlePauseTask)
		protected.POST("/tasks/:id/resume", s.handleResumeTask)
		protected.POST("/tasks/:id/run", s.handleRunTask)

		// Checks
		protected.GET("/tasks/:id/checks", s.handleListChecks)
		protected.GET("/checks/:id", s.handleGetCheck)
		protected.GET("/checks/:id/output", s.handleGetCheckOutput)
		protected.GET("/checks/:id/diff", s.handleGetCheckDiff)
		protected.GET("/checks/compare", s.handleCompareChecks)

		// Alerts
		protected.GET("/alerts", s.handleListAlerts)
		protected.POST("/alerts", s.handleCreateAlert)
		protected.PUT("/alerts/:id", s.handleUpdateAlert)
		protected.DELETE("/alerts/:id", s.handleDeleteAlert)
		protected.POST("/alerts/:id/test", s.handleTestAlert)

		// Logs
		protected.GET("/logs", s.handleListLogs)

		// Dashboard
		protected.GET("/stats", s.handleStats)

		// System
		protected.GET("/system/tools", s.handleToolsCheck)
		protected.GET("/system/version", s.handleVersionCheck)

		// WebSocket
		protected.GET("/ws/logs", s.handleWSLogs)
	}

	// Redirect root to /login
	r.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusFound, "/login")
	})

	// Serve embedded React SPA for all non-API routes
	if uiFS, err := webui.FS(); err == nil {
		r.NoRoute(func(c *gin.Context) {
			p := c.Request.URL.Path

			// Only serve actual static files (has a file extension like .js, .css, .png)
			if ext := path.Ext(p); ext != "" && !strings.EqualFold(ext, ".html") {
				f, err := uiFS.Open(p)
				if err == nil {
					f.Close()
					http.FileServer(uiFS).ServeHTTP(c.Writer, c.Request)
					return
				}
			}

			// All other paths: serve index.html for SPA client-side routing
			c.FileFromFS("index.html", uiFS)
		})
	}

	return r
}
