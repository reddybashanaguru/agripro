//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 10 — NDVI 0.30 BOUNDARY PRECISION TEST
//
// The NDVI threshold is exactly 0.30 (inclusive → payout allowed).
// Tests the three critical boundary values:
//
//   0.2999 → BLOCKED  (422 NDVI_BELOW_THRESHOLD)
//   0.3000 → ALLOWED  (201 COMPLETED)
//   0.3001 → ALLOWED  (201 COMPLETED)
//
// This guards against off-by-one errors in the comparison operator
// and floating-point precision issues when Postgres stores decimals.
//
// Run: go test -tags integration -v ./... -run TestNDVIBoundary
// ═══════════════════════════════════════════════════════════════

import (
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNDVIBoundary(t *testing.T) {
	cases := []struct {
		name        string
		ndvi        string
		wantBlocked bool
	}{
		{"0.2999_just_below_threshold", "0.2999", true},
		{"0.3000_exactly_at_threshold", "0.3000", false},
		{"0.3001_just_above_threshold", "0.3001", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			farmerID, plotID := seedPlotForSatellite(t)
			key := "ndvi-boundary-" + uuid.NewString()

			// Seed the exact boundary NDVI value
			seedResp := doPost(t, apiBase()+"/satellite/observations", map[string]any{
				"plot_id":     plotID,
				"source":      "SENTINEL-2",
				"ndvi_mean":   tc.ndvi,
				"ndvi_min":    tc.ndvi,
				"ndvi_max":    tc.ndvi,
				"observed_at": time.Now().UTC().Format(time.RFC3339),
			})
			require.Equal(t, http.StatusCreated, seedResp.Code,
				"NDVI seed failed for ndvi=%s: %s", tc.ndvi, string(seedResp.Body))

			// Attempt payout with this plot → triggers NDVI pre-check
			resp := doPost(t, apiBase()+"/payouts", map[string]any{
				"farmer_id":    farmerID,
				"plot_id":      plotID,
				"gross_amount": "10000",
				"currency":     "INR",
				"description":  "NDVI boundary test ndvi=" + tc.ndvi,
			}, map[string]string{"X-Idempotency-Key": key})

			if tc.wantBlocked {
				assert.Equal(t, http.StatusUnprocessableEntity, resp.Code,
					"NDVI=%s must be blocked (want 422), got %d: %s",
					tc.ndvi, resp.Code, string(resp.Body))

				var errResp struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				}
				require.NoError(t, unmarshal(resp.Body, &errResp))
				assert.Equal(t, "NDVI_BELOW_THRESHOLD", errResp.Code,
					"error code must be NDVI_BELOW_THRESHOLD for ndvi=%s", tc.ndvi)
				assert.Contains(t, errResp.Message, "0.3",
					"error message must reference the 0.3 threshold")
				t.Logf("[NDVIBoundary] ndvi=%s → BLOCKED ✓ (code=%s)", tc.ndvi, errResp.Code)

			} else {
				assert.Equal(t, http.StatusCreated, resp.Code,
					"NDVI=%s must allow payout (want 201), got %d: %s",
					tc.ndvi, resp.Code, string(resp.Body))

				var txn struct {
					Status string `json:"status"`
					ID     string `json:"id"`
				}
				require.NoError(t, unmarshal(resp.Body, &txn))
				assert.Equal(t, "COMPLETED", txn.Status,
					"payout status must be COMPLETED for ndvi=%s", tc.ndvi)
				t.Logf("[NDVIBoundary] ndvi=%s → ALLOWED ✓ txn=%s", tc.ndvi, txn.ID)
			}
		})
	}
}
