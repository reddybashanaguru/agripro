package middleware

import (
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// CorrelationMiddleware injects a correlation ID into every request context
// and response header for distributed tracing.
func CorrelationMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			correlationID := c.Request().Header.Get("X-Correlation-ID")
			if correlationID == "" {
				correlationID = uuid.New().String()
			}
			c.Set("correlation_id", correlationID)
			c.Response().Header().Set("X-Correlation-ID", correlationID)
			return next(c)
		}
	}
}
