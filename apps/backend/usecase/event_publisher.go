package usecase

import (
	"context"
	"encoding/json"

	"github.com/nats-io/nats.go"
	"github.com/finagra/unity/domain"
)

// EventPublisher publishes domain events to the event bus (NATS).
// All implementations must be safe for concurrent use.
type EventPublisher interface {
	Publish(ctx context.Context, subject string, event domain.PlatformEvent) error
}

// NATSPublisher publishes domain events to a NATS server.
type NATSPublisher struct {
	nc *nats.Conn
}

func NewNATSPublisher(nc *nats.Conn) *NATSPublisher {
	return &NATSPublisher{nc: nc}
}

func (p *NATSPublisher) Publish(_ context.Context, subject string, event domain.PlatformEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return p.nc.Publish(subject, data)
}

// NoopPublisher silently drops all events.
// Used when NATS is unavailable — platform continues without event streaming.
type NoopPublisher struct{}

func NewNoopPublisher() *NoopPublisher { return &NoopPublisher{} }

func (p *NoopPublisher) Publish(_ context.Context, _ string, _ domain.PlatformEvent) error {
	return nil
}
