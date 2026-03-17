package db

import (
	"fmt"

	"github.com/monmon-io/monmon/internal/config"
	"github.com/monmon-io/monmon/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Init opens the SQLite database and runs auto-migrations.
func Init(cfg *config.Config) (*gorm.DB, error) {
	dsn := cfg.Database.Path + "?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=ON"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, fmt.Errorf("opening database: %w", err)
	}

	// Auto-migrate all models
	if err := db.AutoMigrate(
		&models.User{},
		&models.Task{},
		&models.Check{},
		&models.AlertConfig{},
		&models.Log{},
	); err != nil {
		return nil, fmt.Errorf("migrating database: %w", err)
	}

	return db, nil
}
