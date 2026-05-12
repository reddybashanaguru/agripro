package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

type HealthHandler struct {
	db  *pgxpool.Pool
	rdb *redis.Client
}

func NewHealthHandler(db *pgxpool.Pool, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{db: db, rdb: rdb}
}

type healthStatus struct {
	Status    string            `json:"status"`
	Timestamp string            `json:"timestamp"`
	Checks    map[string]string `json:"checks"`
}

// GET /health/live — Kubernetes liveness probe
func (h *HealthHandler) Liveness(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

// GET /health/ready — Kubernetes readiness probe (checks DB + Redis)
func (h *HealthHandler) Readiness(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 3*time.Second)
	defer cancel()

	checks := make(map[string]string)
	overallOK := true

	// Check Postgres
	if err := h.db.Ping(ctx); err != nil {
		checks["postgres"] = "unhealthy: " + err.Error()
		overallOK = false
	} else {
		checks["postgres"] = "ok"
	}

	// Check Redis
	if err := h.rdb.Ping(ctx).Err(); err != nil {
		checks["redis"] = "unhealthy: " + err.Error()
		overallOK = false
	} else {
		checks["redis"] = "ok"
	}

	statusCode := http.StatusOK
	statusText := "ok"
	if !overallOK {
		statusCode = http.StatusServiceUnavailable
		statusText = "degraded"
	}

	return c.JSON(statusCode, healthStatus{
		Status:    statusText,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Checks:    checks,
	})
}
