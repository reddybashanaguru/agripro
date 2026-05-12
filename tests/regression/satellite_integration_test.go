//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 7 — SATELLITE SENTINEL NDVI VALIDATION
//
// Verifies:
//   1. NDVI ≥ 0.3 → payout proceeds (COMPLETED)
//   2. NDVI < 0.3 → payout blocked (NDVI_BELOW_THRESHOLD, 422)
//   3. No satellite data → payout proceeds (no block on missing data)
//   4. GET /land-plots/:id/satellite returns latest observation
//
// Run: go test -tags integration -v ./... -run TestSatellite|TestNDVI
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNDVIAboveThresholdAllowsPayout: healthy NDVI (0.65) → payout COMPLETED
func TestNDVIAboveThresholdAllowsPayout(t *testing.T) {
	farmerID, plotID := seedPlotForSatellite(t)
	key := "ndvi-pass-" + uuid.New().String()

	// Seed a healthy NDVI observation
	seedResp := doPost(t, apiBase()+"/satellite/observations", map[string]any{
		"plot_id":     plotID,
		"source":      "SENTINEL-2",
		"ndvi_mean":   "0.65",
		"ndvi_min":    "0.55",
		"ndvi_max":    "0.75",
		"observed_at": time.Now().UTC().Format(time.RFC3339),
	})
	require.Equal(t, http.StatusCreated, seedResp.Code, "NDVI seed failed: %s", string(seedResp.Body))

	// Payout with plot_id — sentinel should pass
	resp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"plot_id":      plotID,
		"gross_amount": "100000",
		"currency":     "INR",
		"description":  "Step7 NDVI pass test",
	}, map[string]string{"X-Idempotency-Key": key})
	require.Equal(t, http.StatusCreated, resp.Code, "payout should succeed: %s", string(resp.Body))

	var txn struct {
		Status string `json:"status"`
		ID     string `json:"id"`
	}
	require.NoError(t, unmarshal(resp.Body, &txn))
	assert.Equal(t, "COMPLETED", txn.Status)
	t.Logf("NDVI 0.65 → payout COMPLETED txn=%s", txn.ID)
}

// TestNDVIBelowThresholdBlocksPayout: stress NDVI (0.18) → payout blocked with 422
func TestNDVIBelowThresholdBlocksPayout(t *testing.T) {
	farmerID, plotID := seedPlotForSatellite(t)
	key := "ndvi-block-" + uuid.New().String()

	// Seed a low NDVI observation (crop stress)
	seedResp := doPost(t, apiBase()+"/satellite/observations", map[string]any{
		"plot_id":     plotID,
		"source":      "SENTINEL-2",
		"ndvi_mean":   "0.18",
		"ndvi_min":    "0.10",
		"ndvi_max":    "0.25",
		"observed_at": time.Now().UTC().Format(time.RFC3339),
	})
	require.Equal(t, http.StatusCreated, seedResp.Code, "NDVI seed failed: %s", string(seedResp.Body))

	// Payout with plot_id — sentinel must block
	resp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"plot_id":      plotID,
		"gross_amount": "100000",
		"currency":     "INR",
		"description":  "Step7 NDVI block test",
	}, map[string]string{"X-Idempotency-Key": key})
	require.Equal(t, http.StatusUnprocessableEntity, resp.Code,
		"payout should be blocked (422): %s", string(resp.Body))

	var errResp struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	require.NoError(t, unmarshal(resp.Body, &errResp))
	assert.Equal(t, "NDVI_BELOW_THRESHOLD", errResp.Code)
	assert.Contains(t, errResp.Message, "0.18")
	assert.Contains(t, errResp.Message, "0.3")
	t.Logf("NDVI 0.18 → blocked: %s", errResp.Message)
}

// TestNDVINoDataAllowsPayout: no satellite observations → payout proceeds (no block on missing data)
func TestNDVINoDataAllowsPayout(t *testing.T) {
	farmerID, plotID := seedPlotForSatellite(t)
	key := "ndvi-nodata-" + uuid.New().String()

	// No NDVI seeded for this fresh plot

	// Payout with plot_id — no satellite data → should NOT block
	resp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"plot_id":      plotID,
		"gross_amount": "50000",
		"currency":     "INR",
		"description":  "Step7 no NDVI data test",
	}, map[string]string{"X-Idempotency-Key": key})
	require.Equal(t, http.StatusCreated, resp.Code,
		"payout should succeed when no satellite data: %s", string(resp.Body))

	var txn struct {
		Status string `json:"status"`
	}
	require.NoError(t, unmarshal(resp.Body, &txn))
	assert.Equal(t, "COMPLETED", txn.Status)
	t.Logf("No NDVI data → payout COMPLETED (no block on missing data)")
}

// TestSatelliteGetLatest: GET /land-plots/:id/satellite returns most recent observation
func TestSatelliteGetLatest(t *testing.T) {
	_, plotID := seedPlotForSatellite(t)

	// Seed two observations with distinct timestamps; only the later one should be returned
	base := time.Now().UTC()
	for i, ndvi := range []string{"0.40", "0.72"} {
		r := doPost(t, apiBase()+"/satellite/observations", map[string]any{
			"plot_id":     plotID,
			"source":      "SENTINEL-2",
			"ndvi_mean":   ndvi,
			"ndvi_min":    ndvi,
			"ndvi_max":    ndvi,
			"observed_at": base.Add(time.Duration(i) * time.Hour).Format(time.RFC3339),
		})
		require.Equal(t, http.StatusCreated, r.Code, "seed failed: %s", string(r.Body))
	}

	resp := doGet(t, apiBase()+"/land-plots/"+plotID+"/satellite")
	require.Equal(t, http.StatusOK, resp.Code, "GET satellite failed: %s", string(resp.Body))

	var obs struct {
		PlotID   string `json:"plot_id"`
		NDVIMean string `json:"ndvi_mean"`
		Source   string `json:"source"`
	}
	require.NoError(t, unmarshal(resp.Body, &obs))
	assert.Equal(t, plotID, obs.PlotID)
	assert.Equal(t, "0.72", obs.NDVIMean, "should return the latest (highest NDVI) observation")
	assert.Equal(t, "SENTINEL-2", obs.Source)
	t.Logf("Latest NDVI for plot=%s → ndvi_mean=%s", plotID, obs.NDVIMean)
}

// ── helpers ──────────────────────────────────────────────────────────────────

// seedPlotForSatellite creates a VERIFIED farmer + land plot and returns their IDs.
func seedPlotForSatellite(t *testing.T) (farmerID, plotID string) {
	t.Helper()
	pool, err := openTestDB(t)
	require.NoError(t, err)
	defer pool.Close()

	ctx := context.Background()

	fid := uuid.New()
	phone := fmt.Sprintf("+91%010d", fid.ID())
	_, err = pool.Exec(ctx, `
		INSERT INTO farmers (id, phone, name, kyc_status)
		VALUES ($1, $2, 'Satellite Test Farmer', 'VERIFIED'::kyc_status)
		ON CONFLICT (phone) DO NOTHING`, fid, phone)
	require.NoError(t, err)
	var actualFarmerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM farmers WHERE phone=$1`, phone).Scan(&actualFarmerID))

	pid := uuid.New()
	geoJSON := `{"type":"Polygon","coordinates":[[[78.400,17.400],[78.401,17.400],[78.401,17.401],[78.400,17.401],[78.400,17.400]]]}`
	_, err = pool.Exec(ctx, `
		INSERT INTO land_plots (id, farmer_id, plot_name, geom, soil_type, survey_number, district, state)
		VALUES ($1, $2, 'Satellite Test Plot', ST_SetSRID(ST_GeomFromGeoJSON($3),4326),
		        'LOAM', 'SV-SAT', 'Hyderabad', 'Telangana')
		ON CONFLICT (id) DO NOTHING`, pid, actualFarmerID, geoJSON)
	require.NoError(t, err)

	return actualFarmerID.String(), pid.String()
}
