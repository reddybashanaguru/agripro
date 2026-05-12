//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 11 — NATS EVENT STREAMING INTEGRATION
//
// Verifies that domain events are published to NATS when actions occur:
//   1. POST /payouts → finagra.payout.completed event delivered to NATS
//   2. POST /proof-of-action (VERIFIED) → finagra.proof.verdict event
//   3. POST /satellite/observations (NDVI < 0.3) → finagra.ndvi.alert event
//   4. POST /sync/push (new records) → finagra.sync.batch event
//   5. GET /events/stream returns text/event-stream with 200 status
//
// Run: go test -tags integration -v ./... -run TestEvents|TestSSE
// Requires: backend + NATS at localhost:4222
// ═══════════════════════════════════════════════════════════════

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	natsio "github.com/nats-io/nats.go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func natsURL() string {
	if u := os.Getenv("NATS_URL"); u != "" {
		return u
	}
	return natsio.DefaultURL // nats://127.0.0.1:4222
}

// connectNATS connects to NATS or skips the test when NATS is unavailable.
func connectNATS(t *testing.T) *natsio.Conn {
	t.Helper()
	nc, err := natsio.Connect(natsURL(), natsio.Timeout(3*time.Second))
	if err != nil {
		t.Skipf("NATS not available at %s — skipping event tests: %v", natsURL(), err)
	}
	t.Cleanup(func() { nc.Drain() })
	return nc
}

// subscribeAndWait subscribes to a NATS subject, runs action(), and waits up to
// timeout for a matching message. Returns the decoded message payload.
func subscribeAndWait(t *testing.T, nc *natsio.Conn, subject string, timeout time.Duration, action func()) map[string]any {
	t.Helper()
	msgs := make(chan *natsio.Msg, 4)
	sub, err := nc.ChanSubscribe(subject, msgs)
	require.NoError(t, err)
	t.Cleanup(func() { sub.Unsubscribe() })

	action()

	select {
	case msg := <-msgs:
		var payload map[string]any
		require.NoError(t, json.Unmarshal(msg.Data, &payload), "NATS message must be valid JSON")
		return payload
	case <-time.After(timeout):
		t.Fatalf("timeout waiting for NATS message on subject %q", subject)
		return nil
	}
}

// ── Test 1: Payout publishes payout.completed ─────────────────────

func TestEventsPayoutCompleted(t *testing.T) {
	nc := connectNATS(t)

	farmerID, _ := seedPlotForSatellite(t)
	key := "evt-payout-" + uuid.NewString()

	payload := subscribeAndWait(t, nc, "finagra.payout.completed", 5*time.Second, func() {
		resp := doPost(t, apiBase()+"/payouts", map[string]any{
			"farmer_id":    farmerID,
			"gross_amount": "50000",
			"currency":     "INR",
			"description":  "Event streaming test",
		}, map[string]string{"X-Idempotency-Key": key})
		require.Equal(t, http.StatusCreated, resp.Code,
			"payout must succeed: %s", string(resp.Body))
	})

	assert.Equal(t, "payout.completed", payload["type"],
		"event type must be payout.completed")

	data, ok := payload["data"].(map[string]any)
	require.True(t, ok, "event must have a data object")
	assert.NotEmpty(t, data["txn_id"], "data.txn_id must not be empty")
	assert.Equal(t, "50000", data["gross_amount"])
	assert.Equal(t, "25000", data["farmer_gets"], "farmer gets 50%% of 50000")

	t.Logf("[Events] payout.completed received: txn_id=%v gross=%v farmer_gets=%v",
		data["txn_id"], data["gross_amount"], data["farmer_gets"])
}

// ── Test 2: GPS proof publishes proof.verdict ─────────────────────

func TestEventsProofVerdict(t *testing.T) {
	nc := connectNATS(t)
	farmerID, plotID := seedPlotForProof(t)
	hash := uniqueHash("evt-proof-" + uuid.NewString())

	payload := subscribeAndWait(t, nc, "finagra.proof.verdict", 5*time.Second, func() {
		resp := doPost(t, apiBase()+"/land-plots/"+plotID+"/proof-of-action", map[string]any{
			"farmer_id":  farmerID,
			"longitude":  78.4005,
			"latitude":   17.4005,
			"accuracy_m": 5.0,
			"photo_hash": hash,
		})
		require.Equal(t, http.StatusCreated, resp.Code,
			"proof must be VERIFIED: %s", string(resp.Body))
	})

	assert.Equal(t, "proof.verdict", payload["type"])
	data, ok := payload["data"].(map[string]any)
	require.True(t, ok, "event must have a data object")
	assert.Equal(t, "VERIFIED", data["verdict"])
	assert.Equal(t, plotID, data["plot_id"])
	assert.Equal(t, farmerID, data["farmer_id"])

	t.Logf("[Events] proof.verdict received: verdict=%v plot_id=%v", data["verdict"], data["plot_id"])
}

// ── Test 3: Low NDVI observation publishes ndvi.alert ─────────────

func TestEventsNDVIAlert(t *testing.T) {
	nc := connectNATS(t)
	_, plotID := seedPlotForSatellite(t)

	payload := subscribeAndWait(t, nc, "finagra.ndvi.alert", 5*time.Second, func() {
		resp := doPost(t, apiBase()+"/satellite/observations", map[string]any{
			"plot_id":     plotID,
			"source":      "SENTINEL-2",
			"ndvi_mean":   "0.15",
			"ndvi_min":    "0.10",
			"ndvi_max":    "0.20",
			"observed_at": time.Now().UTC().Format(time.RFC3339),
		})
		require.Equal(t, http.StatusCreated, resp.Code,
			"NDVI seed must succeed: %s", string(resp.Body))
	})

	assert.Equal(t, "ndvi.alert", payload["type"])
	data, ok := payload["data"].(map[string]any)
	require.True(t, ok, "event must have a data object")
	assert.Equal(t, plotID, data["plot_id"])
	assert.Equal(t, "0.15", data["ndvi_mean"])
	assert.Equal(t, "SENTINEL-2", data["source"])
	assert.NotEmpty(t, data["threshold"])

	t.Logf("[Events] ndvi.alert received: plot_id=%v ndvi_mean=%v", data["plot_id"], data["ndvi_mean"])
}

// ── Test 4: Healthy NDVI observation does NOT publish ndvi.alert ──

func TestEventsNoAlertForHealthyNDVI(t *testing.T) {
	nc := connectNATS(t)
	_, plotID := seedPlotForSatellite(t)

	msgs := make(chan *natsio.Msg, 4)
	sub, err := nc.ChanSubscribe("finagra.ndvi.alert", msgs)
	require.NoError(t, err)
	defer sub.Unsubscribe()

	resp := doPost(t, apiBase()+"/satellite/observations", map[string]any{
		"plot_id":     plotID,
		"source":      "SENTINEL-2",
		"ndvi_mean":   "0.72",
		"ndvi_min":    "0.65",
		"ndvi_max":    "0.80",
		"observed_at": time.Now().UTC().Format(time.RFC3339),
	})
	require.Equal(t, http.StatusCreated, resp.Code)

	select {
	case msg := <-msgs:
		t.Fatalf("unexpected ndvi.alert for healthy NDVI: %s", msg.Data)
	case <-time.After(500 * time.Millisecond):
		t.Log("[Events] no ndvi.alert for healthy NDVI=0.72 ✓")
	}
}

// ── Test 5: Sync push publishes sync.batch ────────────────────────

func TestEventsSyncBatch(t *testing.T) {
	nc := connectNATS(t)
	nowMs := time.Now().UnixMilli()
	localFarmerID := "local-" + uuid.NewString()
	localPlotID := "local-" + uuid.NewString()

	payload := subscribeAndWait(t, nc, "finagra.sync.batch", 5*time.Second, func() {
		resp := doPost(t, apiBase()+"/sync/push",
			pushPayload(localFarmerID, localPlotID, nowMs))
		require.Equal(t, http.StatusOK, resp.Code,
			"sync push must succeed: %s", string(resp.Body))
	})

	assert.Equal(t, "sync.batch", payload["type"])
	data, ok := payload["data"].(map[string]any)
	require.True(t, ok)
	farmersCreated := data["farmers_created"].(float64)
	assert.GreaterOrEqual(t, int(farmersCreated), 1, "at least 1 farmer created in sync")

	t.Logf("[Events] sync.batch received: farmers_created=%v plots_created=%v",
		data["farmers_created"], data["plots_created"])
}

// ── Test 6: SSE endpoint returns text/event-stream ────────────────

func TestSSEEndpointHeaders(t *testing.T) {
	url := apiBase() + "/events/stream"

	req, err := http.NewRequest(http.MethodGet, url, nil)
	require.NoError(t, err)
	req.Header.Set("Accept", "text/event-stream")

	// Open the connection — use a client with no response body timeout
	client := &http.Client{Timeout: 0}
	resp, err := client.Do(req)
	require.NoError(t, err, "GET /events/stream must not return an error")
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "text/event-stream")
	assert.Equal(t, "no-cache", resp.Header.Get("Cache-Control"))

	// Read the first line — must be a "data:" frame (the connected ping)
	scanner := bufio.NewScanner(resp.Body)
	scanner.Scan()
	firstLine := scanner.Text()

	assert.True(t,
		strings.HasPrefix(firstLine, "data:") || strings.HasPrefix(firstLine, ":"),
		"first SSE frame must start with 'data:' or ': ping', got: %q", firstLine)

	t.Logf("[SSE] first frame: %q", firstLine)
}

// ── Test 7: Full round-trip — payout → SSE client receives event ──

func TestSSERoundTripPayoutEvent(t *testing.T) {
	farmerID, _ := seedPlotForSatellite(t)
	key := "sse-rt-" + uuid.NewString()

	// Open SSE connection first
	sseURL := fmt.Sprintf("http://localhost:8888/api/v1/events/stream")
	sseReq, _ := http.NewRequest(http.MethodGet, sseURL, nil)
	sseClient := &http.Client{Timeout: 0}
	sseResp, err := sseClient.Do(sseReq)
	require.NoError(t, err)
	defer sseResp.Body.Close()

	// Drain the initial "connected" frame
	scanner := bufio.NewScanner(sseResp.Body)
	// Skip until we get a blank line (end of first event)
	for scanner.Scan() {
		if scanner.Text() == "" {
			break
		}
	}

	// Now trigger a payout
	payResp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"gross_amount": "20000",
		"currency":     "INR",
		"description":  "SSE round-trip test",
	}, map[string]string{"X-Idempotency-Key": key})
	require.Equal(t, http.StatusCreated, payResp.Code)

	// Read lines until we find a payout.completed data frame
	eventCh := make(chan string, 1)
	go func() {
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data:") && strings.Contains(line, "payout.completed") {
				eventCh <- line
				return
			}
		}
	}()

	select {
	case line := <-eventCh:
		assert.Contains(t, line, "payout.completed")
		maxLen := min(100, len(line))
		t.Logf("[SSE Round-trip] Received payout event via SSE ✓: %s", line[:maxLen])
	case <-time.After(5 * time.Second):
		t.Fatal("SSE round-trip timeout: payout.completed event not received within 5s")
	}
}

// pushPayload is defined in sync_integration_test.go (same package) — no redeclaration needed.
