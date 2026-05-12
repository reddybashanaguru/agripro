package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// EventType identifies the kind of domain event.
type EventType string

const (
	EventPayoutCompleted EventType = "payout.completed"
	EventProofVerdict    EventType = "proof.verdict"
	EventNDVIAlert       EventType = "ndvi.alert"
	EventSyncBatch       EventType = "sync.batch"
)

// NATS subject for each event type.
const (
	SubjectPayoutCompleted = "finagra.payout.completed"
	SubjectProofVerdict    = "finagra.proof.verdict"
	SubjectNDVIAlert       = "finagra.ndvi.alert"
	SubjectSyncBatch       = "finagra.sync.batch"
	SubjectAll             = "finagra.>"
)

// PlatformEvent is the canonical envelope for all domain events streamed via NATS + SSE.
type PlatformEvent struct {
	ID        string          `json:"id"`
	Type      EventType       `json:"type"`
	Timestamp time.Time       `json:"timestamp"`
	Data      json.RawMessage `json:"data"`
}

func NewEvent(eventType EventType, data any) (PlatformEvent, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return PlatformEvent{}, err
	}
	return PlatformEvent{
		ID:        uuid.NewString(),
		Type:      eventType,
		Timestamp: time.Now().UTC(),
		Data:      raw,
	}, nil
}

// PayoutCompletedData is the payload for EventPayoutCompleted.
type PayoutCompletedData struct {
	TxnID       string `json:"txn_id"`
	FarmerID    string `json:"farmer_id"`
	GrossAmount string `json:"gross_amount"`
	FarmerGets  string `json:"farmer_gets"`
	Currency    string `json:"currency"`
}

// ProofVerdictData is the payload for EventProofVerdict.
type ProofVerdictData struct {
	ProofID    string `json:"proof_id"`
	PlotID     string `json:"plot_id"`
	FarmerID   string `json:"farmer_id"`
	Verdict    string `json:"verdict"`
	AccuracyM  float64 `json:"accuracy_m"`
	SpoofReason string `json:"spoof_reason,omitempty"`
}

// NDVIAlertData is the payload for EventNDVIAlert.
type NDVIAlertData struct {
	PlotID   string `json:"plot_id"`
	NDVIMean string `json:"ndvi_mean"`
	Source   string `json:"source"`
	Threshold string `json:"threshold"`
}

// SyncBatchData is the payload for EventSyncBatch.
type SyncBatchData struct {
	FarmersCreated int `json:"farmers_created"`
	PlotsCreated   int `json:"plots_created"`
	TotalRecords   int `json:"total_records"`
}
