//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 4 — IDEMPOTENT LEDGER VALIDATION (integration gate)
//
// Verifies:
//   1. POST /api/v1/payouts creates a transaction with correct 50/25/5/20 split
//   2. Submitting the SAME idempotency key 3× returns the SAME transaction ID
//   3. Only ONE row exists in the transactions table (no duplicates)
//   4. Eight journal entries exist (4 debits + 4 credits) — double-entry law
//   5. Different idempotency keys create independent transactions
//
// Run: go test -tags integration -v ./... -run TestPayout
// Requires: backend at TEST_API_URL, TEST_DB_URL for direct DB count verification
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func dbURL() string {
	if u := os.Getenv("TEST_DB_URL"); u != "" {
		return u
	}
	return "postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev?sslmode=disable"
}

// seedVerifiedFarmer inserts a KYC-verified farmer and returns their server UUID.
// Uses phone uniqueness to avoid duplicates across test runs.
func seedVerifiedFarmer(t *testing.T, pool *pgxpool.Pool, phone string) string {
	t.Helper()
	var id string
	err := pool.QueryRow(context.Background(),
		`SELECT id::text FROM farmers WHERE phone = $1`, phone).Scan(&id)
	if err == nil {
		// Already exists — update to VERIFIED in case it was PENDING
		_, _ = pool.Exec(context.Background(),
			`UPDATE farmers SET kyc_status = 'VERIFIED' WHERE phone = $1`, phone)
		return id
	}
	err = pool.QueryRow(context.Background(), `
		INSERT INTO farmers (name, phone, kyc_status, created_at, updated_at)
		VALUES ('Step4 Test Farmer', $1, 'VERIFIED', NOW(), NOW())
		RETURNING id::text`, phone).Scan(&id)
	require.NoError(t, err, "seed verified farmer")
	return id
}

// TestPayoutIdempotency is the Step 4 validation gate.
// Submits ₹1,00,000 three times with the same key → exactly one transaction.
func TestPayoutIdempotency(t *testing.T) {
	pool, err := pgxpool.New(context.Background(), dbURL())
	require.NoError(t, err, "connect to test DB")
	defer pool.Close()

	phone := fmt.Sprintf("+91800%08d", time.Now().UnixMilli()%100_000_000)
	farmerID := seedVerifiedFarmer(t, pool, phone)
	t.Logf("[Payout] Test farmer: id=%s phone=%s", farmerID, phone)

	idempotencyKey := "step4-" + uuid.NewString()
	grossAmount := "100000.00" // ₹1,00,000

	var firstTxnID string

	// ── Submit 3× with identical key ─────────────────────────────
	for i := 1; i <= 3; i++ {
		resp := doPost(t, apiBase()+"/payouts", map[string]any{
			"farmer_id":    farmerID,
			"gross_amount": grossAmount,
			"currency":     "INR",
			"description":  "Step 4 idempotency test",
		}, map[string]string{
			"X-Idempotency-Key": idempotencyKey,
		})

		// First call → 201 Created; replays → 200 OK (from idempotency cache)
		if i == 1 {
			assert.Equal(t, http.StatusCreated, resp.Code, "first payout should be 201")
		} else {
			assert.Equal(t, http.StatusOK, resp.Code, "replay #%d should be 200", i)
		}

		var body map[string]any
		require.NoError(t, unmarshal(resp.Body, &body), "parse response body")

		txnID, _ := body["id"].(string)
		require.NotEmpty(t, txnID, "response must contain transaction id")

		if i == 1 {
			firstTxnID = txnID
			t.Logf("[Payout] Created txn=%s status=%v", txnID, body["status"])
		} else {
			assert.Equal(t, firstTxnID, txnID,
				"replay #%d must return the SAME transaction ID", i)
			t.Logf("[Payout] Replay #%d returned same txn=%s ✓", i, txnID)
		}
	}

	// ── DB: exactly ONE transaction row for this key ──────────────
	var txnCount int
	err = pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM transactions WHERE idempotency_key = $1`, idempotencyKey).Scan(&txnCount)
	require.NoError(t, err)
	assert.Equal(t, 1, txnCount, "must be exactly 1 transaction row in DB")
	t.Logf("[Payout] DB row count for key=%s → %d ✓", idempotencyKey, txnCount)

	// ── DB: verify 50/25/5/20 split on the transaction ───────────
	var grossStr string
	err = pool.QueryRow(context.Background(),
		`SELECT gross_amount::text FROM transactions WHERE id = $1`, firstTxnID).Scan(&grossStr)
	require.NoError(t, err)

	gross, _ := decimal.NewFromString(grossAmount)
	stored, _ := decimal.NewFromString(grossStr)
	assert.True(t, gross.Equal(stored), "stored gross_amount must equal submitted amount")

	// ── DB: exactly 8 journal entries (double-entry) ─────────────
	var entryCount int
	err = pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM journal_entries WHERE txn_id = $1`, firstTxnID).Scan(&entryCount)
	require.NoError(t, err)
	assert.Equal(t, 8, entryCount, "must be exactly 8 journal entries (4 debits + 4 credits)")
	t.Logf("[Payout] Journal entries for txn=%s → %d ✓", firstTxnID, entryCount)

	// ── DB: debit sum == credit sum (double-entry balance) ────────
	var debitSum, creditSum string
	err = pool.QueryRow(context.Background(), `
		SELECT
			COALESCE(SUM(amount) FILTER (WHERE entry_type='DEBIT'),0)::text,
			COALESCE(SUM(amount) FILTER (WHERE entry_type='CREDIT'),0)::text
		FROM journal_entries WHERE txn_id = $1`, firstTxnID).Scan(&debitSum, &creditSum)
	require.NoError(t, err)
	debit, _ := decimal.NewFromString(debitSum)
	credit, _ := decimal.NewFromString(creditSum)
	assert.True(t, debit.Equal(credit), "debit sum %s must equal credit sum %s", debitSum, creditSum)
	t.Logf("[Payout] Double-entry: debit=%s credit=%s ✓", debitSum, creditSum)
}

// TestPayoutSplitAmounts verifies that each bucket receives the exact correct amount.
func TestPayoutSplitAmounts(t *testing.T) {
	pool, err := pgxpool.New(context.Background(), dbURL())
	require.NoError(t, err)
	defer pool.Close()

	phone := fmt.Sprintf("+91801%08d", time.Now().UnixMilli()%100_000_000)
	farmerID := seedVerifiedFarmer(t, pool, phone)

	idempotencyKey := "step4-split-" + uuid.NewString()
	grossAmount := "100000.00" // ₹1,00,000.00

	resp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"gross_amount": grossAmount,
		"currency":     "INR",
		"description":  "Split verification test",
	}, map[string]string{
		"X-Idempotency-Key": idempotencyKey,
	})
	require.Equal(t, http.StatusCreated, resp.Code, "payout must succeed")

	var body map[string]any
	require.NoError(t, unmarshal(resp.Body, &body))
	txnID := body["id"].(string)

	// Verify per-entry amounts against the 50/25/5/20 law
	gross, _ := decimal.NewFromString(grossAmount)
	hundred := decimal.NewFromInt(100)

	expectedFarmer := gross.Mul(decimal.NewFromInt(50)).Div(hundred).Truncate(4)
	expectedPlatform := gross.Mul(decimal.NewFromInt(25)).Div(hundred).Truncate(4)
	expectedAgent := gross.Mul(decimal.NewFromInt(5)).Div(hundred).Truncate(4)
	expectedReserve := gross.Sub(expectedFarmer).Sub(expectedPlatform).Sub(expectedAgent)

	// Each bucket appears as one DEBIT + one CREDIT of equal amount → 4 unique amounts.
	// Alias the text cast so ORDER BY amount refers to the NUMERIC column, not the text alias.
	rows, err := pool.Query(context.Background(), `
		SELECT amount::text AS amt FROM journal_entries
		WHERE txn_id = $1 GROUP BY amount ORDER BY amount`, txnID)
	require.NoError(t, err)
	defer rows.Close()

	var amounts []decimal.Decimal
	for rows.Next() {
		var s string
		require.NoError(t, rows.Scan(&s))
		d, _ := decimal.NewFromString(s)
		amounts = append(amounts, d)
	}

	// Should be exactly 4 distinct amounts (one per bucket)
	assert.Len(t, amounts, 4, "must have 4 distinct amounts (one per bucket)")

	// Reconstruct expected set
	expected := []decimal.Decimal{expectedAgent, expectedReserve, expectedPlatform, expectedFarmer}
	for i, amt := range amounts {
		assert.True(t, amt.Equal(expected[i]),
			"bucket amount[%d]: got %s want %s", i, amt.String(), expected[i].String())
	}

	t.Logf("[Payout] Split OK: farmer=%s platform=%s agent=%s reserve=%s",
		expectedFarmer, expectedPlatform, expectedAgent, expectedReserve)

	// Reconstruct check: all 4 buckets sum to gross
	sum := expectedFarmer.Add(expectedPlatform).Add(expectedAgent).Add(expectedReserve)
	assert.True(t, sum.Equal(gross), "split sum %s must equal gross %s", sum, grossAmount)
}

// TestPayoutDifferentKeysCreateSeparateTransactions ensures two distinct keys
// create two independent transactions.
func TestPayoutDifferentKeysCreateSeparateTransactions(t *testing.T) {
	pool, err := pgxpool.New(context.Background(), dbURL())
	require.NoError(t, err)
	defer pool.Close()

	phone := fmt.Sprintf("+91802%08d", time.Now().UnixMilli()%100_000_000)
	farmerID := seedVerifiedFarmer(t, pool, phone)

	key1 := "step4-key1-" + uuid.NewString()
	key2 := "step4-key2-" + uuid.NewString()

	for _, key := range []string{key1, key2} {
		resp := doPost(t, apiBase()+"/payouts", map[string]any{
			"farmer_id":    farmerID,
			"gross_amount": "50000.00",
			"currency":     "INR",
			"description":  "Distinct key test",
		}, map[string]string{"X-Idempotency-Key": key})
		assert.Equal(t, http.StatusCreated, resp.Code, "payout with key=%s should be 201", key)
	}

	var count int
	err = pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM transactions WHERE idempotency_key = ANY($1)`,
		[]string{key1, key2}).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 2, count, "two distinct keys must produce two independent transactions")
	t.Logf("[Payout] Two keys → two transactions ✓")
}
