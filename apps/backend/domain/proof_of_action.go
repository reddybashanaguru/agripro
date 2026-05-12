package domain

import (
	"time"

	"github.com/google/uuid"
)

// ActionVerdict is the outcome of a Proof-of-Action GPS submission.
type ActionVerdict string

const (
	VerdictVerified ActionVerdict = "VERIFIED" // GPS inside plot, no spoof signals
	VerdictRejected ActionVerdict = "REJECTED" // GPS outside plot boundary
	VerdictSpoofed  ActionVerdict = "SPOOFED"  // Anti-spoof rule triggered
)

// ProofOfAction is an immutable GPS field-verification record.
// Once created it is never updated — audit trail must be append-only.
type ProofOfAction struct {
	ID                  uuid.UUID
	PlotID              uuid.UUID
	FarmerID            uuid.UUID
	Longitude           float64
	Latitude            float64
	AccuracyM           float64
	PhotoHash           string // SHA-256 hex of the field photo (unique per submission)
	Verdict             ActionVerdict
	DistanceToBoundaryM float64 // metres; 0 when VERIFIED
	SpoofReason         string  // human-readable when SPOOFED
	SubmittedAt         time.Time
	CreatedAt           time.Time
}

// ─── Anti-spoofing rules ──────────────────────────────────────────────────────

// EvaluateAccuracy returns (spoofed=true, reason) when the claimed GPS accuracy
// is physically impossible or suspiciously precise for a consumer smartphone.
// Real Android/iOS GPS never reports < 1 m accuracy in open fields.
func EvaluateAccuracy(accuracyM float64) (bool, string) {
	if accuracyM <= 0 {
		return true, "impossible GPS accuracy: accuracy_m must be > 0 (real GPS hardware cannot report ≤ 0)"
	}
	if accuracyM < 1.0 {
		return true, "suspiciously precise GPS: accuracy_m < 1 m is physically impossible for consumer smartphone GPS — indicates a spoofing application"
	}
	return false, ""
}
