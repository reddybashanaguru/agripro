//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 10 — FULL END-TO-END PIPELINE REGRESSION
//
// Exercises the complete happy path as a single coherent scenario:
//   1. Seed farmer + land plot
//   2. Seed healthy NDVI satellite observation (0.72)
//   3. Submit GPS proof-of-action → VERIFIED
//   4. Initiate payout with plot_id (triggers NDVI pre-check)
//   5. Verify payout is COMPLETED
//   6. Assert global ledger is balanced (debit == credit)
//   7. Assert platform metrics reflect new counts
//   8. Idempotency replay — same key returns same txn ID, no duplicate
//   9. DB-level: exactly 8 journal entries for the transaction
//  10. Health endpoints return ok
//
// Run: go test -tags integration -v ./... -run TestE2EPipeline
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestE2EPipeline(t *testing.T) {
	// ── Step 1: Seed unique farmer + plot ────────────────────────
	farmerID, plotID := seedPlotForSatellite(t)
	t.Logf("[E2E] farmer=%s plot=%s", farmerID, plotID)

	// ── Step 2: Seed healthy NDVI (0.72) ─────────────────────────
	ndviResp := doPost(t, apiBase()+"/satellite/observations", map[string]any{
		"plot_id":     plotID,
		"source":      "SENTINEL-2",
		"ndvi_mean":   "0.72",
		"ndvi_min":    "0.65",
		"ndvi_max":    "0.80",
		"observed_at": time.Now().UTC().Format(time.RFC3339),
	})
	require.Equal(t, http.StatusCreated, ndviResp.Code,
		"NDVI seed failed: %s", string(ndviResp.Body))
	t.Log("[E2E] NDVI seeded: mean=0.72 (healthy)")

	// ── Step 3: Submit GPS proof-of-action (inside plot) ─────────
	photoHash := uniqueHash(fmt.Sprintf("e2e-proof-%s", uuid.NewString()))
	proofResp := doPost(t, apiBase()+"/land-plots/"+plotID+"/proof-of-action", map[string]any{
		"farmer_id":  farmerID,
		"longitude":  78.4005,
		"latitude":   17.4005,
		"accuracy_m": 5.0,
		"photo_hash": photoHash,
	})
	require.Equal(t, http.StatusCreated, proofResp.Code,
		"proof should be VERIFIED: %s", string(proofResp.Body))

	var proof proofResponse
	require.NoError(t, unmarshal(proofResp.Body, &proof))
	assert.Equal(t, "VERIFIED", proof.Verdict, "GPS inside plot must be VERIFIED")
	assert.NotEmpty(t, proof.ID)
	t.Logf("[E2E] GPS proof VERIFIED: proof_id=%s", proof.ID)

	// ── Step 4 + 5: Initiate payout (NDVI pre-check included) ────
	idKey := "e2e-payout-" + uuid.NewString()
	grossAmount := "100000"
	payResp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"plot_id":      plotID,
		"gross_amount": grossAmount,
		"currency":     "INR",
		"description":  fmt.Sprintf("E2E pipeline %s", uuid.NewString()[:8]),
	}, map[string]string{"X-Idempotency-Key": idKey})
	require.Equal(t, http.StatusCreated, payResp.Code,
		"payout should complete (NDVI=0.72 > 0.30): %s", string(payResp.Body))

	var txn struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	require.NoError(t, unmarshal(payResp.Body, &txn))
	assert.Equal(t, "COMPLETED", txn.Status)
	assert.NotEmpty(t, txn.ID)
	t.Logf("[E2E] Payout COMPLETED: txn_id=%s", txn.ID)

	// ── Step 6: Ledger balance must be globally balanced ─────────
	balResp := doGet(t, apiBase()+"/ledger/balance")
	require.Equal(t, http.StatusOK, balResp.Code,
		"ledger balance endpoint failed: %s", string(balResp.Body))

	var bal struct {
		IsBalanced  bool   `json:"is_balanced"`
		TotalDebit  string `json:"total_debit"`
		TotalCredit string `json:"total_credit"`
		EntryCount  int    `json:"entry_count"`
		TxnCount    int    `json:"transaction_count"`
	}
	require.NoError(t, unmarshal(balResp.Body, &bal))
	assert.True(t, bal.IsBalanced, "global ledger must be balanced")

	debit, _ := decimal.NewFromString(bal.TotalDebit)
	credit, _ := decimal.NewFromString(bal.TotalCredit)
	assert.True(t, debit.Equal(credit),
		"debit %s must equal credit %s", bal.TotalDebit, bal.TotalCredit)
	assert.Greater(t, bal.EntryCount, 0)
	assert.Greater(t, bal.TxnCount, 0)
	t.Logf("[E2E] Ledger: debit=%s credit=%s balanced=%v", bal.TotalDebit, bal.TotalCredit, bal.IsBalanced)

	// ── Step 7: Platform metrics reflect the new transaction ──────
	metricsResp := doGet(t, apiBase()+"/metrics-platform")
	require.Equal(t, http.StatusOK, metricsResp.Code,
		"metrics endpoint failed: %s", string(metricsResp.Body))

	var metrics struct {
		FarmerCount      int    `json:"farmer_count"`
		PlotCount        int    `json:"plot_count"`
		TransactionCount int    `json:"transaction_count"`
		TotalDisbursed   string `json:"total_disbursed"`
		TotalProofRecords int   `json:"total_proof_records"`
	}
	require.NoError(t, unmarshal(metricsResp.Body, &metrics))
	assert.Greater(t, metrics.FarmerCount, 0, "farmer_count must be > 0")
	assert.Greater(t, metrics.PlotCount, 0, "plot_count must be > 0")
	assert.Greater(t, metrics.TransactionCount, 0, "transaction_count must be > 0")
	assert.Greater(t, metrics.TotalProofRecords, 0, "total_proof_records must be > 0")

	disbursed, _ := decimal.NewFromString(metrics.TotalDisbursed)
	assert.True(t, disbursed.IsPositive(), "total_disbursed must be positive")
	t.Logf("[E2E] Metrics: farmers=%d plots=%d txns=%d disbursed=%s proofs=%d",
		metrics.FarmerCount, metrics.PlotCount, metrics.TransactionCount,
		metrics.TotalDisbursed, metrics.TotalProofRecords)

	// ── Step 8: Idempotency replay → same txn ID, no duplicate ───
	replayResp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"plot_id":      plotID,
		"gross_amount": grossAmount,
		"currency":     "INR",
		"description":  "E2E idempotency replay",
	}, map[string]string{"X-Idempotency-Key": idKey})
	require.Equal(t, http.StatusOK, replayResp.Code,
		"idempotency replay must return 200: %s", string(replayResp.Body))

	var replayTxn struct {
		ID string `json:"id"`
	}
	require.NoError(t, unmarshal(replayResp.Body, &replayTxn))
	assert.Equal(t, txn.ID, replayTxn.ID, "replay must return the same transaction ID")
	t.Logf("[E2E] Idempotency replay OK: txn_id=%s (same) ✓", replayTxn.ID)

	// ── Step 9: DB — exactly 8 journal entries ───────────────────
	pool, err := openTestDB(t)
	require.NoError(t, err)
	defer pool.Close()

	var entryCount int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM journal_entries WHERE txn_id = $1`, txn.ID).Scan(&entryCount))
	assert.Equal(t, 8, entryCount,
		"must be exactly 8 journal entries (4 debits + 4 credits) for txn %s", txn.ID)
	t.Logf("[E2E] Journal entries: %d ✓", entryCount)

	// ── Step 10: Health probes are green ─────────────────────────
	liveResp := doGet(t, "http://localhost:8888/health/live")
	assert.Equal(t, http.StatusOK, liveResp.Code, "liveness probe must return 200")

	readyResp := doGet(t, "http://localhost:8888/health/ready")
	assert.Equal(t, http.StatusOK, readyResp.Code, "readiness probe must return 200")

	var health struct {
		Status string            `json:"status"`
		Checks map[string]string `json:"checks"`
	}
	require.NoError(t, unmarshal(readyResp.Body, &health))
	assert.Equal(t, "ok", health.Status)
	assert.Equal(t, "ok", health.Checks["postgres"])
	assert.Equal(t, "ok", health.Checks["redis"])
	t.Logf("[E2E] Health: status=%s postgres=%s redis=%s",
		health.Status, health.Checks["postgres"], health.Checks["redis"])

	t.Logf("[E2E] ✅ FULL PIPELINE COMPLETE: proof_id=%s txn_id=%s", proof.ID, txn.ID)
}
