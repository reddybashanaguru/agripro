//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 6 — PROOF-OF-ACTION GPS VALIDATION
//
// Verifies:
//   1. GPS inside plot + valid accuracy + unique photo → VERIFIED (201)
//   2. GPS outside plot + valid inputs → REJECTED (200) with distance
//   3. Same photo_hash submitted twice → second returns SPOOFED (200)
//   4. GPS accuracy_m ≤ 0 (impossible reading) → SPOOFED (200)
//   5. GPS accuracy_m < 1 m (impossibly precise) → SPOOFED (200)
//
// Run: go test -tags integration -v ./... -run TestProof
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// proofResponse mirrors handler.proofOfActionResponse for JSON decoding.
type proofResponse struct {
	ID                  string  `json:"id"`
	PlotID              string  `json:"plot_id"`
	FarmerID            string  `json:"farmer_id"`
	Verdict             string  `json:"verdict"`
	IsInside            bool    `json:"is_inside"`
	DistanceToBoundaryM float64 `json:"distance_to_boundary_m"`
	SpoofReason         string  `json:"spoof_reason"`
	AccuracyM           float64 `json:"accuracy_m"`
	SubmittedAt         string  `json:"submitted_at"`
}

// TestProofOfActionVerified: GPS inside registered plot → VERIFIED
func TestProofOfActionVerified(t *testing.T) {
	farmerID, plotID := seedPlotForProof(t)
	hash := uniqueHash("verified-test")

	resp := doPost(t, apiBase()+"/land-plots/"+plotID+"/proof-of-action", map[string]any{
		"farmer_id":  farmerID,
		"longitude":  78.4005,  // inside the seeded 78.400–78.401 polygon
		"latitude":   17.4005,
		"accuracy_m": 5.5,
		"photo_hash": hash,
	})
	require.Equal(t, http.StatusCreated, resp.Code, "expected 201 VERIFIED: %s", string(resp.Body))

	var pr proofResponse
	require.NoError(t, unmarshal(resp.Body, &pr))

	assert.Equal(t, "VERIFIED", pr.Verdict)
	assert.True(t, pr.IsInside)
	assert.Equal(t, plotID, pr.PlotID)
	assert.NotEmpty(t, pr.ID)
	t.Logf("VERIFIED: proof_id=%s plot=%s", pr.ID, pr.PlotID)
}

// TestProofOfActionRejected: GPS clearly outside the plot → REJECTED with distance
func TestProofOfActionRejected(t *testing.T) {
	farmerID, plotID := seedPlotForProof(t)
	hash := uniqueHash("rejected-test")

	resp := doPost(t, apiBase()+"/land-plots/"+plotID+"/proof-of-action", map[string]any{
		"farmer_id":  farmerID,
		"longitude":  77.0,  // far outside India polygon (Hyderabad area)
		"latitude":   16.0,
		"accuracy_m": 8.0,
		"photo_hash": hash,
	})
	require.Equal(t, http.StatusOK, resp.Code, "expected 200 REJECTED: %s", string(resp.Body))

	var pr proofResponse
	require.NoError(t, unmarshal(resp.Body, &pr))

	assert.Equal(t, "REJECTED", pr.Verdict)
	assert.False(t, pr.IsInside)
	assert.Greater(t, pr.DistanceToBoundaryM, 0.0, "distance should be > 0 when outside")
	t.Logf("REJECTED: distance_m=%.2f", pr.DistanceToBoundaryM)
}

// TestProofOfActionSpoofedReplay: same photo_hash on second submission → SPOOFED
func TestProofOfActionSpoofedReplay(t *testing.T) {
	farmerID, plotID := seedPlotForProof(t)
	hash := uniqueHash("replay-test")

	// First submission — should succeed (VERIFIED)
	first := doPost(t, apiBase()+"/land-plots/"+plotID+"/proof-of-action", map[string]any{
		"farmer_id":  farmerID,
		"longitude":  78.4005,
		"latitude":   17.4005,
		"accuracy_m": 6.0,
		"photo_hash": hash,
	})
	require.Equal(t, http.StatusCreated, first.Code, "first submission should be 201: %s", string(first.Body))

	// Second submission with same hash — must be SPOOFED
	second := doPost(t, apiBase()+"/land-plots/"+plotID+"/proof-of-action", map[string]any{
		"farmer_id":  farmerID,
		"longitude":  78.4005,
		"latitude":   17.4005,
		"accuracy_m": 6.0,
		"photo_hash": hash, // same hash!
	})
	require.Equal(t, http.StatusOK, second.Code, "replay should return 200: %s", string(second.Body))

	var pr proofResponse
	require.NoError(t, unmarshal(second.Body, &pr))

	assert.Equal(t, "SPOOFED", pr.Verdict)
	assert.NotEmpty(t, pr.SpoofReason, "spoof_reason must explain why it was flagged")
	assert.Contains(t, pr.SpoofReason, "replay")
	t.Logf("SPOOFED (replay): reason=%q", pr.SpoofReason)
}

// TestProofOfActionSpoofedZeroAccuracy: accuracy_m = 0 → impossible GPS → SPOOFED
func TestProofOfActionSpoofedZeroAccuracy(t *testing.T) {
	farmerID, plotID := seedPlotForProof(t)
	hash := uniqueHash("zero-accuracy-test")

	resp := doPost(t, apiBase()+"/land-plots/"+plotID+"/proof-of-action", map[string]any{
		"farmer_id":  farmerID,
		"longitude":  78.4005,
		"latitude":   17.4005,
		"accuracy_m": 0.0, // impossible
		"photo_hash": hash,
	})
	require.Equal(t, http.StatusOK, resp.Code, "zero accuracy should be 200 SPOOFED: %s", string(resp.Body))

	var pr proofResponse
	require.NoError(t, unmarshal(resp.Body, &pr))

	assert.Equal(t, "SPOOFED", pr.Verdict)
	assert.NotEmpty(t, pr.SpoofReason)
	t.Logf("SPOOFED (zero accuracy): reason=%q", pr.SpoofReason)
}

// TestProofOfActionSpoofedSubMeterAccuracy: accuracy_m < 1m → consumer GPS can't do this → SPOOFED
func TestProofOfActionSpoofedSubMeterAccuracy(t *testing.T) {
	farmerID, plotID := seedPlotForProof(t)
	hash := uniqueHash("sub-meter-test")

	resp := doPost(t, apiBase()+"/land-plots/"+plotID+"/proof-of-action", map[string]any{
		"farmer_id":  farmerID,
		"longitude":  78.4005,
		"latitude":   17.4005,
		"accuracy_m": 0.3, // < 1m — consumer smartphone cannot achieve this
		"photo_hash": hash,
	})
	require.Equal(t, http.StatusOK, resp.Code, "sub-meter accuracy should be 200 SPOOFED: %s", string(resp.Body))

	var pr proofResponse
	require.NoError(t, unmarshal(resp.Body, &pr))

	assert.Equal(t, "SPOOFED", pr.Verdict)
	assert.Contains(t, pr.SpoofReason, "1 m")
	t.Logf("SPOOFED (sub-meter): reason=%q", pr.SpoofReason)
}

// ── helpers ──────────────────────────────────────────────────────────────────

// seedPlotForProof seeds a VERIFIED farmer and a small plot in Hyderabad coords.
// Returns (farmerID string, plotID string).
func seedPlotForProof(t *testing.T) (string, string) {
	t.Helper()
	pool, err := openTestDB(t)
	require.NoError(t, err)
	defer pool.Close()

	ctx := context.Background()

	// Seed farmer (KYC VERIFIED required for plot registration)
	fid := uuid.New()
	phone := fmt.Sprintf("+91%010d", fid.ID())
	_, err = pool.Exec(ctx, `
		INSERT INTO farmers (id, phone, name, kyc_status)
		VALUES ($1, $2, 'ProofTest Farmer', 'VERIFIED'::kyc_status)
		ON CONFLICT (phone) DO NOTHING`, fid, phone)
	require.NoError(t, err)
	var actualFarmerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM farmers WHERE phone=$1`, phone).Scan(&actualFarmerID))

	// Seed a 0.001°×0.001° plot (≈110m × 110m) at Hyderabad
	// Coords: 78.400,17.400 → 78.401,17.401
	pid := uuid.New()
	geoJSON := `{"type":"Polygon","coordinates":[[[78.400,17.400],[78.401,17.400],[78.401,17.401],[78.400,17.401],[78.400,17.400]]]}`
	_, err = pool.Exec(ctx, `
		INSERT INTO land_plots (id, farmer_id, plot_name, geom, soil_type, survey_number, district, state)
		VALUES ($1, $2, 'ProofTest Plot', ST_SetSRID(ST_GeomFromGeoJSON($3),4326), 'CLAY', 'SV-PROOF', 'Hyderabad', 'Telangana')
		ON CONFLICT (id) DO NOTHING`, pid, actualFarmerID, geoJSON)
	require.NoError(t, err)

	return actualFarmerID.String(), pid.String()
}

// uniqueHash returns a deterministic unique SHA-256 hex string per label+uuid combo.
func uniqueHash(label string) string {
	h := sha256.Sum256([]byte(label + uuid.New().String()))
	return fmt.Sprintf("%x", h)
}
