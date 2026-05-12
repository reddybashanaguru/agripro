//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 3 — DELTA-SYNC VALIDATION (integration gate)
//
// Simulates the offline-first mobile scenario end-to-end:
//   1. Mobile creates a farmer + land plot while offline
//      (local WatermelonDB IDs, no server_id)
//   2. Connectivity restored → pushes to Go backend
//   3. Backend assigns server UUIDs and returns ID mapping
//   4. Pull with since=0 confirms records are retrievable
//   5. Second identical push is a no-op (idempotency: same server UUIDs, no duplicates)
//
// Run with: go test -tags integration -v ./... -run TestSync
// Requires: backend running at TEST_API_URL (default http://localhost:8888)
// ═══════════════════════════════════════════════════════════════

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func apiBase() string {
	if u := os.Getenv("TEST_API_URL"); u != "" {
		return u + "/api/v1"
	}
	return "http://localhost:8888/api/v1"
}

// pushPayload builds the WatermelonDB-shaped push body with one farmer + one land plot.
// Local IDs use a "local-<uuid>" prefix — they have no server_id yet.
func pushPayload(localFarmerID, localPlotID string, nowMs int64) map[string]any {
	return map[string]any{
		"last_pulled_at": 0,
		"changes": map[string]any{
			"farmers": map[string]any{
				"created": []map[string]any{
					{
						"id":          localFarmerID,
						"name":        "Raju Test Farmer",
						"phone":       fmt.Sprintf("+91900%08d", nowMs%100_000_000),
						"village":     "Test Village",
						"state":       "Telangana",
						"is_verified": false,
						"created_at":  nowMs - 5000,
						"updated_at":  nowMs - 5000,
					},
				},
				"updated": []map[string]any{},
				"deleted": []string{},
			},
			"land_plots": map[string]any{
				"created": []map[string]any{
					{
						"id":        localPlotID,
						"farmer_id": localFarmerID,
						"name":      "Test Plot Alpha",
						"state":     "Telangana",
						"geojson": `{"type":"Polygon","coordinates":[[[78.4,17.4],[78.5,17.4],[78.5,17.5],[78.4,17.5],[78.4,17.4]]]}`,
						"created_at": nowMs - 4000,
						"updated_at": nowMs - 4000,
					},
				},
				"updated": []map[string]any{},
				"deleted": []string{},
			},
		},
	}
}

// TestSyncOfflinePushPullCycle covers the core offline-first guarantee:
//   push offline records → server assigns UUIDs → pull confirms records exist
func TestSyncOfflinePushPullCycle(t *testing.T) {
	nowMs := time.Now().UnixMilli()
	localFarmerID := "local-" + uuid.NewString()
	localPlotID := "local-" + uuid.NewString()

	payload := pushPayload(localFarmerID, localPlotID, nowMs)

	// ── Step 1: Push offline records ─────────────────────────────
	pushResp := doPost(t, apiBase()+"/sync/push", payload)

	assert.Equal(t, http.StatusOK, pushResp.Code, "push should return 200")

	var pushBody map[string]any
	require.NoError(t, json.Unmarshal(pushResp.Body, &pushBody))

	serverIDs, ok := pushBody["server_ids"].(map[string]any)
	require.True(t, ok, "push response must contain server_ids")

	farmerIDs, ok := serverIDs["farmers"].(map[string]any)
	require.True(t, ok, "server_ids must contain farmers mapping")
	serverFarmerID, ok := farmerIDs[localFarmerID].(string)
	require.True(t, ok, "server must assign a UUID for the local farmer ID")
	assert.NotEmpty(t, serverFarmerID, "server farmer UUID must not be empty")

	plotIDs, ok := serverIDs["land_plots"].(map[string]any)
	require.True(t, ok, "server_ids must contain land_plots mapping")
	serverPlotID, ok := plotIDs[localPlotID].(string)
	require.True(t, ok, "server must assign a UUID for the local plot ID")
	assert.NotEmpty(t, serverPlotID, "server plot UUID must not be empty")

	t.Logf("[Sync] Push OK: farmer=%s plot=%s", serverFarmerID, serverPlotID)

	// ── Step 2: Pull from epoch → records must appear ─────────────
	pullResp := doGet(t, apiBase()+"/sync/pull?since=0")
	assert.Equal(t, http.StatusOK, pullResp.Code, "pull should return 200")

	var pullBody map[string]any
	require.NoError(t, json.Unmarshal(pullResp.Body, &pullBody))

	changes, ok := pullBody["changes"].(map[string]any)
	require.True(t, ok, "pull response must have changes")

	farmersChange := changes["farmers"].(map[string]any)
	createdFarmers := farmersChange["created"].([]any)
	require.Greater(t, len(createdFarmers), 0, "at least one farmer must be in pull response")

	// Verify our farmer is in the created set
	found := false
	for _, raw := range createdFarmers {
		f := raw.(map[string]any)
		if f["id"] == serverFarmerID {
			found = true
			break
		}
	}
	assert.True(t, found, "pushed farmer should appear in pull response by server UUID")

	// ── Step 3: Timestamp returned is a valid unix-ms value ────────
	ts, ok := pullBody["timestamp"]
	require.True(t, ok, "pull response must include timestamp")
	tsFloat, _ := ts.(float64)
	assert.Greater(t, int64(tsFloat), int64(0), "timestamp must be a positive unix-ms value")

	t.Logf("[Sync] Pull OK: timestamp=%v farmers_created=%d", int64(tsFloat), len(createdFarmers))
}

// TestSyncPushIdempotency verifies that pushing the same payload twice
// is a no-op — the second push must not create duplicates.
// Server IDs returned on first push == server IDs returned on second push.
func TestSyncPushIdempotency(t *testing.T) {
	nowMs := time.Now().UnixMilli()
	localFarmerID := "local-" + uuid.NewString()
	localPlotID := "local-" + uuid.NewString()

	payload := pushPayload(localFarmerID, localPlotID, nowMs)

	// First push
	resp1 := doPost(t, apiBase()+"/sync/push", payload)
	require.Equal(t, http.StatusOK, resp1.Code)

	var body1 map[string]any
	require.NoError(t, json.Unmarshal(resp1.Body, &body1))

	serverIDs1 := body1["server_ids"].(map[string]any)
	farmerIDs1 := serverIDs1["farmers"].(map[string]any)
	serverFarmerID1 := farmerIDs1[localFarmerID].(string)

	// Second push — identical payload
	resp2 := doPost(t, apiBase()+"/sync/push", payload)
	require.Equal(t, http.StatusOK, resp2.Code)

	var body2 map[string]any
	require.NoError(t, json.Unmarshal(resp2.Body, &body2))

	serverIDs2 := body2["server_ids"].(map[string]any)
	farmerIDs2 := serverIDs2["farmers"].(map[string]any)
	serverFarmerID2 := farmerIDs2[localFarmerID].(string)

	// Server UUIDs must be identical — no second record was created
	assert.Equal(t, serverFarmerID1, serverFarmerID2,
		"duplicate push must return same server UUID — no duplicate rows")

	t.Logf("[Sync] Idempotency OK: both pushes returned farmerID=%s", serverFarmerID1)

	// Confirm only one row exists: pull and count records with that server UUID
	pullResp := doGet(t, apiBase()+"/sync/pull?since=0")
	require.Equal(t, http.StatusOK, pullResp.Code)

	var pullBody map[string]any
	require.NoError(t, json.Unmarshal(pullResp.Body, &pullBody))

	changes := pullBody["changes"].(map[string]any)
	createdFarmers := changes["farmers"].(map[string]any)["created"].([]any)

	duplicateCount := 0
	for _, raw := range createdFarmers {
		f := raw.(map[string]any)
		if f["id"] == serverFarmerID1 {
			duplicateCount++
		}
	}
	assert.Equal(t, 1, duplicateCount,
		"exactly one farmer row must exist after double-push — no duplicates in DB")

	t.Logf("[Sync] No duplicate rows: count=%d", duplicateCount)
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

type httpResult struct {
	Code int
	Body []byte
}

func doPost(t *testing.T, url string, payload any) httpResult {
	t.Helper()
	b, err := json.Marshal(payload)
	require.NoError(t, err)

	resp, err := http.Post(url, "application/json", bytes.NewReader(b)) //nolint:noctx
	require.NoError(t, err, "POST %s failed", url)
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return httpResult{Code: resp.StatusCode, Body: body}
}

func doGet(t *testing.T, url string) httpResult {
	t.Helper()
	resp, err := http.Get(url) //nolint:noctx
	require.NoError(t, err, "GET %s failed", url)
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return httpResult{Code: resp.StatusCode, Body: body}
}
