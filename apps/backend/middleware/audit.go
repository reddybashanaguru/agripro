package middleware

import (
	"bytes"
	"io"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog"
)

// AuditMiddleware logs every mutating request (non-GET) to structured log.
// In production, hook this to write to the audit_log table via async NATS event.
func AuditMiddleware(log zerolog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			req := c.Request()

			// Only audit mutations
			if req.Method == "GET" || req.Method == "HEAD" || req.Method == "OPTIONS" {
				return next(c)
			}

			// Buffer request body for audit (capped at 64KB)
			var bodyBuf bytes.Buffer
			if req.Body != nil {
				_, _ = io.Copy(&bodyBuf, io.LimitReader(req.Body, 65536))
				req.Body = io.NopCloser(bytes.NewReader(bodyBuf.Bytes()))
			}

			start := time.Now()
			err := next(c)
			duration := time.Since(start)

			event := log.Info().
				Str("method", req.Method).
				Str("path", req.URL.Path).
				Str("ip", c.RealIP()).
				Int("status", c.Response().Status).
				Dur("duration_ms", duration).
				Str("correlation_id", c.Response().Header().Get("X-Correlation-ID"))

			// Log actor from JWT claims if available
			if userID, ok := c.Get("user_id").(string); ok && userID != "" {
				event = event.Str("actor_id", userID)
			}

			if bodyBuf.Len() > 0 {
				event = event.RawJSON("request_body", bodyBuf.Bytes())
			}

			if err != nil {
				event.Err(err).Msg("audit: mutation failed")
			} else {
				event.Msg("audit: mutation")
			}

			return err
		}
	}
}
