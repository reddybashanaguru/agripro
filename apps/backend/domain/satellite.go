package domain

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// NDVIThreshold is the minimum healthy-vegetation score required for a payout.
// Readings below this value indicate bare soil, severe crop stress, or no crop.
// Source: FAO/Sentinel-2 standard for rainfed smallholder agriculture.
const NDVIThreshold = 0.3

// SatelliteObservation is a single NDVI reading from a remote sensing source
// (Sentinel-2, ISRO ResourceSat, etc.) for a registered land plot.
type SatelliteObservation struct {
	ID         uuid.UUID
	PlotID     uuid.UUID
	Source     string
	ObservedAt time.Time
	NDVIMean   decimal.Decimal
	NDVIMin    decimal.Decimal
	NDVIMax    decimal.Decimal
	CreatedAt  time.Time
}

// CheckNDVI returns an error if the observation's mean NDVI is below the payout threshold.
// This is the single authoritative gate — callers must not re-implement the threshold check.
func CheckNDVI(obs *SatelliteObservation) error {
	threshold := decimal.NewFromFloat(NDVIThreshold)
	if obs.NDVIMean.LessThan(threshold) {
		return &DomainError{
			Code: ErrCodeNDVIBlocked,
			Message: fmt.Sprintf(
				"payout blocked: NDVI %.4f is below threshold %.1f for plot %s (source: %s, observed: %s) — "+
					"crop stress or bare soil detected; retry after vegetation recovery",
				obs.NDVIMean.InexactFloat64(),
				NDVIThreshold,
				obs.PlotID,
				obs.Source,
				obs.ObservedAt.Format("2006-01-02"),
			),
		}
	}
	return nil
}
