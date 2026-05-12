package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/nats-io/nats.go"
	"github.com/finagra/unity/domain"
)

// EventsHandler streams domain events to clients via Server-Sent Events.
// Subscribes to the NATS `finagra.>` wildcard and forwards every message
// as an SSE `data:` frame in real time.
type EventsHandler struct {
	nc *nats.Conn // nil when NATS is unavailable
}

func NewEventsHandler(nc *nats.Conn) *EventsHandler {
	return &EventsHandler{nc: nc}
}

// Stream handles GET /api/v1/events/stream.
// The connection stays open until the client disconnects or the server shuts down.
// When NATS is unavailable, the endpoint remains open and sends keep-alive pings only.
func (h *EventsHandler) Stream(c echo.Context) error {
	w := c.Response().Writer

	// SSE headers
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no") // disable Nginx buffering
	c.Response().WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		return echo.NewHTTPError(http.StatusInternalServerError, "SSE not supported by this server")
	}

	// Send an initial connected event so the client knows the stream is live
	fmt.Fprintf(w, "data: {\"type\":\"connected\",\"message\":\"Finagra Unity event stream live\"}\n\n")
	flusher.Flush()

	ctx := c.Request().Context()
	keepAlive := time.NewTicker(15 * time.Second)
	defer keepAlive.Stop()

	// When NATS is unavailable, fall back to keep-alive only
	if h.nc == nil {
		for {
			select {
			case <-ctx.Done():
				return nil
			case <-keepAlive.C:
				fmt.Fprintf(w, ": ping\n\n")
				flusher.Flush()
			}
		}
	}

	// Subscribe to all finagra.* subjects
	msgs := make(chan *nats.Msg, 64)
	sub, err := h.nc.ChanSubscribe(domain.SubjectAll, msgs)
	if err != nil {
		// Subscription failed — fall back to keep-alive
		for {
			select {
			case <-ctx.Done():
				return nil
			case <-keepAlive.C:
				fmt.Fprintf(w, ": ping\n\n")
				flusher.Flush()
			}
		}
	}
	defer func() {
		_ = sub.Unsubscribe()
		close(msgs)
	}()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-keepAlive.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case msg, open := <-msgs:
			if !open {
				return nil
			}
			fmt.Fprintf(w, "data: %s\n\n", msg.Data)
			flusher.Flush()
		}
	}
}
