//go:build integration

package regression_test

// ═══════════════════════════════════════════════════════════════
// STEP 10 — AUDIT LOG IMMUTABILITY
//
// Proves the DB-level trigger `audit_log_no_update` correctly
// rejects any UPDATE or DELETE on the audit_log table.
//
//   1. Seed a farmer and trigger an audit entry via UPDATE
//   2. Attempt UPDATE on audit_log → trigger must RAISE EXCEPTION
//   3. Attempt DELETE on audit_log → trigger must RAISE EXCEPTION
//   4. Record still exists after both rejections
//
// Run: go test -tags integration -v ./... -run TestAuditLogImmutable
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuditLogImmutable(t *testing.T) {
	pool, err := openTestDB(t)
	require.NoError(t, err)
	defer pool.Close()

	ctx := context.Background()

	// Seed a farmer so we can trigger an audit entry via UPDATE
	farmerID := uuid.New()
	phone := fmt.Sprintf("+91804%08d", farmerID.ID()%100_000_000)
	_, err = pool.Exec(ctx, `
		INSERT INTO farmers (id, phone, name, kyc_status)
		VALUES ($1, $2, 'AuditTest Farmer', 'PENDING'::kyc_status)
		ON CONFLICT (phone) DO NOTHING`, farmerID, phone)
	require.NoError(t, err)

	// Trigger the audit trigger: UPDATE fires audit_trigger_fn which INSERTs into audit_log
	_, err = pool.Exec(ctx,
		`UPDATE farmers SET kyc_status = 'VERIFIED'::kyc_status WHERE id = $1`, farmerID)
	require.NoError(t, err, "farmer update must succeed")

	// Confirm at least one audit log entry was created
	var auditID int64
	err = pool.QueryRow(ctx,
		`SELECT id FROM audit_log ORDER BY changed_at DESC LIMIT 1`).Scan(&auditID)
	require.NoError(t, err, "no audit_log entries found — audit trigger may not be installed")
	t.Logf("[AuditImmutability] Found audit_log entry id=%d", auditID)

	// ── Test 1: UPDATE must be rejected ──────────────────────────
	t.Run("update_rejected", func(t *testing.T) {
		_, updateErr := pool.Exec(ctx,
			`UPDATE audit_log SET actor_id = NULL WHERE id = $1`, auditID)
		require.Error(t, updateErr,
			"UPDATE on audit_log must be rejected by the immutability trigger")
		assert.True(t,
			strings.Contains(strings.ToLower(updateErr.Error()), "immutable"),
			"error must mention 'immutable': %s", updateErr.Error())
		t.Logf("[AuditImmutability] UPDATE correctly rejected: %s", updateErr.Error())
	})

	// ── Test 2: DELETE must be rejected ──────────────────────────
	t.Run("delete_rejected", func(t *testing.T) {
		_, deleteErr := pool.Exec(ctx,
			`DELETE FROM audit_log WHERE id = $1`, auditID)
		require.Error(t, deleteErr,
			"DELETE on audit_log must be rejected by the immutability trigger")
		assert.True(t,
			strings.Contains(strings.ToLower(deleteErr.Error()), "immutable"),
			"error must mention 'immutable': %s", deleteErr.Error())
		t.Logf("[AuditImmutability] DELETE correctly rejected: %s", deleteErr.Error())
	})

	// ── Test 3: Entry survives both failed operations ─────────────
	t.Run("record_survives_rejected_operations", func(t *testing.T) {
		var count int
		require.NoError(t, pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM audit_log WHERE id = $1`, auditID).Scan(&count))
		assert.Equal(t, 1, count,
			"audit_log entry id=%d must still exist after rejected UPDATE and DELETE", auditID)
		t.Logf("[AuditImmutability] Record id=%d survived both rejected ops ✓", auditID)
	})
}
