package logger

import (
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/monmon-io/monmon/internal/models"
	"github.com/rs/zerolog"
	"gorm.io/gorm"
)

// AppLogger provides structured logging to console, file, and SQLite.
type AppLogger struct {
	zl zerolog.Logger
	db *gorm.DB
	mu sync.Mutex
}

// New creates an AppLogger that writes colored output to stderr,
// plain output to logFile, and persists entries to the DB.
func New(level string, logFile string, db *gorm.DB) *AppLogger {
	zlLevel := parseLevel(level)

	consoleWriter := zerolog.ConsoleWriter{
		Out:        os.Stderr,
		TimeFormat: time.RFC3339,
	}

	writers := []io.Writer{consoleWriter}

	if logFile != "" {
		f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err == nil {
			writers = append(writers, f)
		}
	}

	multi := zerolog.MultiLevelWriter(writers...)
	zl := zerolog.New(multi).With().Timestamp().Logger().Level(zlLevel)

	return &AppLogger{zl: zl, db: db}
}

// Debug logs a debug-level message.
func (l *AppLogger) Debug(source string, taskID *uint, message string) {
	l.log(models.LogDebug, source, taskID, message)
}

// Info logs an info-level message.
func (l *AppLogger) Info(source string, taskID *uint, message string) {
	l.log(models.LogInfo, source, taskID, message)
}

// Warn logs a warn-level message.
func (l *AppLogger) Warn(source string, taskID *uint, message string) {
	l.log(models.LogWarn, source, taskID, message)
}

// Error logs an error-level message.
func (l *AppLogger) Error(source string, taskID *uint, message string) {
	l.log(models.LogError, source, taskID, message)
}

func (l *AppLogger) log(level, source string, taskID *uint, message string) {
	// Zerolog output
	evt := l.event(level)
	evt.Str("source", source)
	if taskID != nil {
		evt.Uint("task_id", *taskID)
	}
	evt.Msg(message)

	// Persist to SQLite
	if l.db != nil {
		entry := models.Log{
			Level:     level,
			Source:    source,
			TaskID:    taskID,
			Message:   message,
			CreatedAt: time.Now(),
		}
		l.mu.Lock()
		l.db.Create(&entry)
		l.mu.Unlock()
	}
}

func (l *AppLogger) event(level string) *zerolog.Event {
	switch level {
	case models.LogDebug:
		return l.zl.Debug()
	case models.LogWarn:
		return l.zl.Warn()
	case models.LogError:
		return l.zl.Error()
	default:
		return l.zl.Info()
	}
}

// GetRecentLogs queries log entries from the database with optional filters and pagination.
// Returns the matching logs and total count.
func (l *AppLogger) GetRecentLogs(level, source string, taskID *uint, page, perPage int) ([]models.Log, int64) {
	var logs []models.Log
	var total int64

	if l.db == nil {
		return logs, 0
	}

	q := l.db.Model(&models.Log{})

	if level != "" {
		q = q.Where("level = ?", level)
	}
	if source != "" {
		q = q.Where("source = ?", source)
	}
	if taskID != nil {
		q = q.Where("task_id = ?", *taskID)
	}

	q.Count(&total)

	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 50
	}

	q.Order("created_at DESC").
		Offset((page - 1) * perPage).
		Limit(perPage).
		Find(&logs)

	return logs, total
}

func parseLevel(level string) zerolog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return zerolog.DebugLevel
	case "warn":
		return zerolog.WarnLevel
	case "error":
		return zerolog.ErrorLevel
	default:
		return zerolog.InfoLevel
	}
}
