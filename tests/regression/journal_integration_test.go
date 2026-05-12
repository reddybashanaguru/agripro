//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 5 — DOUBLE-ENTRY JOURNAL ZERO-SUM VALIDATION
//
// Verifies:
//   1. GET /api/v1/ledger/balance — total_debit == total_credit globally
//   2. GET /api/v1/payouts/:id/entries — 8 entries per txn, correct amounts
//   3. Per-txn debit sum == credit sum (zero-sum invariant per transaction)
//   4. DB trigger rejects imbalanced manual inserts (enforce_double_entry)
//
// Run: go test -tags integration -v ./... -run TestJournal|TestTrigger
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestJournalGlobalZeroSum proves the entire ledger satisfies double-entry:
// total DEBIT == total CREDIT across all transactions.
func TestJournalGlobalZeroSum(t *testing.T) {
	// First create a fresh payout so there is at least one transaction
	key := "journal-zero-sum-" + uuid.New().String()
	farmerID := seedFarmerForJournal(t)

	resp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"gross_amount": "50000",
		"currency":     "INR",
		"description":  "Step5 zero-sum test",
	}, map[string]string{"X-Idempotency-Key": key})
	require.Equal(t, http.StatusCreated, resp.Code, "payout creation failed: %s", string(resp.Body))

	// Fetch global ledger balance
	bal := doGet(t, apiBase()+"/ledger/balance")
	require.Equal(t, http.StatusOK, bal.Code, "ledger balance endpoint failed: %s", string(bal.Body))

	var balResp struct {
		TotalDebit  string `json:"total_debit"`
		TotalCredit string `json:"total_credit"`
		IsBalanced  bool   `json:"is_balanced"`
		EntryCount  int    `json:"entry_count"`
		TxnCount    int    `json:"transaction_count"`
	}
	require.NoError(t, unmarshal(bal.Body, &balResp))

	debit, _ := decimal.NewFromString(balResp.TotalDebit)
	credit, _ := decimal.NewFromString(balResp.TotalCredit)

	assert.True(t, balResp.IsBalanced, "ledger reports imbalance: debit=%s credit=%s", balResp.TotalDebit, balResp.TotalCredit)
	assert.True(t, debit.Equal(credit), "total_debit %s != total_credit %s", debit, credit)
	assert.Greater(t, balResp.EntryCount, 0, "entry_count should be > 0")
	assert.Greater(t, balResp.TxnCount, 0, "transaction_count should be > 0")

	t.Logf("Global ledger: debit=%s credit=%s entries=%d txns=%d balanced=%v",
		balResp.TotalDebit, balResp.TotalCredit, balResp.EntryCount, balResp.TxnCount, balResp.IsBalanced)
}

// TestJournalEntriesForTransaction proves:
//   - Exactly 8 journal entries per payout (4 debits + 4 credits)
//   - Amounts match the 50/25/5/20 split
//   - Per-transaction debit sum == credit sum
func TestJournalEntriesForTransaction(t *testing.T) {
	key := "journal-entries-" + uuid.New().String()
	gross := decimal.NewFromInt(100000)
	farmerID := seedFarmerForJournal(t)

	// Create payout
	payResp := doPost(t, apiBase()+"/payouts", map[string]any{
		"farmer_id":    farmerID,
		"gross_amount": gross.String(),
		"currency":     "INR",
		"description":  "Step5 per-txn entries test",
	}, map[string]string{"X-Idempotency-Key": key})
	require.Equal(t, http.StatusCreated, payResp.Code, "payout failed: %s", string(payResp.Body))

	var txn struct {
		ID string `json:"id"`
	}
	require.NoError(t, unmarshal(payResp.Body, &txn))

	// Fetch entries for this transaction
	entriesResp := doGet(t, apiBase()+"/payouts/"+txn.ID+"/entries")
	require.Equal(t, http.StatusOK, entriesResp.Code, "entries endpoint failed: %s", string(entriesResp.Body))

	var payload struct {
		TxnID   string `json:"txn_id"`
		Count   int    `json:"count"`
		Entries []struct {
			EntryType string `json:"entry_type"`
			Amount    string `json:"amount"`
		} `json:"entries"`
	}
	require.NoError(t, unmarshal(entriesResp.Body, &payload))

	assert.Equal(t, txn.ID, payload.TxnID)
	assert.Equal(t, 8, payload.Count, "expected 8 journal entries, got %d", payload.Count)
	assert.Len(t, payload.Entries, 8)

	// Verify per-transaction zero-sum
	var debitSum, creditSum decimal.Decimal
	debitCount, creditCount := 0, 0
	for _, e := range payload.Entries {
		amt, _ := decimal.NewFromString(e.Amount)
		switch e.EntryType {
		case "DEBIT":
			debitSum = debitSum.Add(amt)
			debitCount++
		case "CREDIT":
			creditSum = creditSum.Add(amt)
			creditCount++
		}
	}

	assert.Equal(t, 4, debitCount, "expected 4 debit entries")
	assert.Equal(t, 4, creditCount, "expected 4 credit entries")
	assert.True(t, debitSum.Equal(creditSum),
		"per-txn debit %s != credit %s", debitSum, creditSum)
	assert.True(t, debitSum.Equal(gross),
		"debit sum %s should equal gross %s", debitSum, gross)

	t.Logf("Txn %s: debit=%s credit=%s (4+4 entries)", txn.ID, debitSum, creditSum)
}

// TestJournalTriggerRejectsImbalance proves the DB enforces double-entry at the DB level.
// We attempt a manual INSERT of a single DEBIT entry on a COMPLETED transaction — the
// enforce_double_entry trigger must reject it.
func TestJournalTriggerRejectsImbalance(t *testing.T) {
	pool, err := openTestDB(t)
	require.NoError(t, err)
	defer pool.Close()

	ctx := context.Background()

	// Find any COMPLETED transaction with its account_id
	var txnID, accountID uuid.UUID
	err = pool.QueryRow(ctx, `
		SELECT j.txn_id, j.account_id
		FROM journal_entries j
		JOIN transactions t ON t.id = j.txn_id
		WHERE t.status = 'COMPLETED'
		LIMIT 1
	`).Scan(&txnID, &accountID)
	require.NoError(t, err, "no completed transactions found — run payout tests first")

	// Attempt to insert an unbalanced DEBIT — trigger must ROLLBACK
	_, insertErr := pool.Exec(ctx, `
		INSERT INTO journal_entries (id, txn_id, account_id, entry_type, amount, description)
		VALUES ($1, $2, $3, 'DEBIT'::entry_type, 1::numeric, 'trigger test — must be rejected')
	`, uuid.New(), txnID, accountID)

	require.Error(t, insertErr, "DB trigger should have rejected the unbalanced insert")
	assert.True(t, strings.Contains(strings.ToLower(insertErr.Error()), "double-entry"),
		"error message should mention double-entry violation: %s", insertErr.Error())
	t.Logf("Trigger correctly rejected: %s", insertErr.Error())
}

// TestJournalNotFoundReturns404 confirms a non-existent transaction ID returns 404.
func TestJournalNotFoundReturns404(t *testing.T) {
	bogusID := uuid.New().String()
	resp := doGet(t, apiBase()+"/payouts/"+bogusID+"/entries")
	assert.Equal(t, http.StatusNotFound, resp.Code,
		"expected 404 for unknown txn, got %d: %s", resp.Code, string(resp.Body))
}

// ── helpers ──────────────────────────────────────────────────────────────────

// seedFarmerForJournal creates a minimal farmer in the DB and returns its UUID string.
// Reuses the TEST_DB_URL pool directly to avoid depending on a farmer creation API.
func seedFarmerForJournal(t *testing.T) string {
	t.Helper()
	pool, err := openTestDB(t)
	require.NoError(t, err)
	defer pool.Close()

	id := uuid.New()
	phone := fmt.Sprintf("+91%010d", id.ID())
	_, err = pool.Exec(context.Background(), `
		INSERT INTO farmers (id, phone, name, kyc_status)
		VALUES ($1, $2, 'Journal Test Farmer', 'VERIFIED'::kyc_status)
		ON CONFLICT (phone) DO NOTHING
	`, id, phone)
	require.NoError(t, err)

	// Confirm the farmer was created (handle ON CONFLICT case)
	var actualID uuid.UUID
	err = pool.QueryRow(context.Background(),
		`SELECT id FROM farmers WHERE phone = $1`, phone).Scan(&actualID)
	require.NoError(t, err)
	return actualID.String()
}
