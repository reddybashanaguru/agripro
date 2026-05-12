package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
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

// skipPaths exact paths that manage their own idempotency at the DB level.
var skipPaths = map[string]bool{
	"/api/v1/sync/push":              true,
	"/api/v1/satellite/observations": true,
}

// skipSuffixes path suffixes exempt from the X-Idempotency-Key requirement.
// Used for routes with dynamic segments (e.g. /land-plots/:id/proof-of-action)
// that enforce uniqueness via a domain-level key (photo_hash DB unique index).
var skipSuffixes = []string{
	"/proof-of-action",
	"/verify-gps",
}

// IdempotencyMiddleware enforces idempotency on POST/PUT/PATCH endpoints.
// On first call: processes normally and caches response in Redis.
// On replay: returns 200 OK with the cached body, skipping all handlers.
// Routes in skipPaths bypass this middleware (they own their idempotency guarantee).
func IdempotencyMiddleware(rdb *redis.Client) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			req := c.Request()

			// Only apply to mutating methods
			if req.Method != http.MethodPost && req.Method != http.MethodPut && req.Method != http.MethodPatch {
				return next(c)
			}

			// Skip routes that own their own idempotency
			if skipPaths[req.URL.Path] {
				return next(c)
			}
			for _, suffix := range skipSuffixes {
				if strings.HasSuffix(req.URL.Path, suffix) {
					return next(c)
				}
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
					// Replays always return 200 regardless of original status (e.g. 201 → 200)
					return c.JSONBlob(http.StatusOK, resp.Body)
				}
			}

			// Wrap the underlying http.ResponseWriter to tee status + body
			rec := &teeResponseWriter{
				ResponseWriter: c.Response().Writer,
				status:         http.StatusOK, // default if WriteHeader is never called
			}
			c.Response().Writer = rec

			if err := next(c); err != nil {
				return err
			}

			// Cache successful responses for future replays
			if rec.status >= 200 && rec.status < 300 && rec.body.Len() > 0 {
				payload, _ := json.Marshal(cachedResponse{
					Status: rec.status,
					Body:   json.RawMessage(rec.body.Bytes()),
				})
				rdb.Set(ctx, cacheKey, payload, idempotencyTTL)
			}

			return nil
		}
	}
}

// teeResponseWriter intercepts WriteHeader and Write so we can cache the response.
// It forwards everything to the real underlying writer so the client still receives it.
type teeResponseWriter struct {
	http.ResponseWriter
	status int
	body   bytes.Buffer
}

func (t *teeResponseWriter) WriteHeader(code int) {
	t.status = code
	t.ResponseWriter.WriteHeader(code)
}

func (t *teeResponseWriter) Write(b []byte) (int, error) {
	t.body.Write(b) // capture for caching
	return t.ResponseWriter.Write(b)
}
