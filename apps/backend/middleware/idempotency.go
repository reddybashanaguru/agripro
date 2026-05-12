package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

const (
	idempotencyKeyHeader = "X-Idempotency-Key"
	idempotencyKeyPrefix = "idempotency:"
	idempotencyTTL       = 24 * time.Hour
)

type cachedResponse struct {
	Status int             `json:"status"`
	Body   json.RawMessage `json:"body"`
}

// skipPaths lists routes that manage their own idempotency at the DB level
// and are not expected to send X-Idempotency-Key (e.g. WatermelonDB sync protocol).
var skipPaths = map[string]bool{
	"/api/v1/sync/push": true,
}

// IdempotencyMiddleware enforces idempotency on POST/PUT/PATCH endpoints.
// On first call: processes normally and caches response in Redis.
// On replay: returns the cached response immediately, skipping all handlers.
// Routes in skipPaths bypass this middleware (they own their idempotency guarantee).
func IdempotencyMiddleware(rdb *redis.Client) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			req := c.Request()

			// Only apply to mutating methods
			if req.Method != http.MethodPost && req.Method != http.MethodPut && req.Method != http.MethodPatch {
				return next(c)
			}

			// Skip routes that own their own idempotency (e.g. sync push)
			if skipPaths[req.URL.Path] {
				return next(c)
			}

			key := req.Header.Get(idempotencyKeyHeader)
			if key == "" {
				return echo.NewHTTPError(
					http.StatusBadRequest,
					map[string]string{
						"code":    "MISSING_IDEMPOTENCY_KEY",
						"message": "X-Idempotency-Key header is required for all write operations",
					},
				)
			}

			cacheKey := idempotencyKeyPrefix + key
			ctx := context.Background()

			// Check Redis for cached response
			cached, err := rdb.Get(ctx, cacheKey).Bytes()
			if err == nil {
				var resp cachedResponse
				if json.Unmarshal(cached, &resp) == nil {
					c.Response().Header().Set("X-Idempotency-Replay", "true")
					return c.JSONBlob(resp.Status, resp.Body)
				}
			}

			// Process request, intercept response
			rec := newResponseRecorder(c.Response())
			c.Response().Writer = rec

			if err := next(c); err != nil {
				return err
			}

			// Cache the response for future replays
			if rec.status >= 200 && rec.status < 300 {
				payload, _ := json.Marshal(cachedResponse{
					Status: rec.status,
					Body:   rec.body.Bytes(),
				})
				rdb.Set(ctx, cacheKey, payload, idempotencyTTL)
			}

			return nil
		}
	}
}

// responseRecorder captures the response body and status for caching.
type responseRecorder struct {
	echo.Response
	status int
	body   *bodyBuffer
}

func newResponseRecorder(resp *echo.Response) *responseRecorder {
	return &responseRecorder{Response: *resp, body: &bodyBuffer{}}
}

type bodyBuffer struct {
	data []byte
}

func (b *bodyBuffer) Bytes() json.RawMessage { return b.data }
func (b *bodyBuffer) Write(p []byte) (int, error) {
	b.data = append(b.data, p...)
	return len(p), nil
}
