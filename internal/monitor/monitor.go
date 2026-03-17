package monitor

import (
	"context"

	"github.com/0xNayel/MonMon/internal/models"
)

// Monitor is the interface all monitoring engines must implement.
type Monitor interface {
	Execute(ctx context.Context, task *models.Task) (*models.CheckResult, error)
}
