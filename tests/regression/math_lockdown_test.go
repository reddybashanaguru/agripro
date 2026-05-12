package regression_test

// ═══════════════════════════════════════════════════════════════
// MATH LOCKDOWN — IMMUTABLE REGRESSION SUITE
// DO NOT MODIFY THIS FILE. Any change requires sign-off from the
// Principal Engineer AND LogicAuditor sub-agent.
//
// This test is a contract: it encodes the 50/25/5/20 Math Laws
// and will block any merge that alters payout split arithmetic.
// ═══════════════════════════════════════════════════════════════

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/finagra/unity/domain"
)

const lockdownPrecision = 8 // decimal places verified

// TestMathLockdown verifies the immutable 50/25/5/20 split constants.
// This test MUST pass on every commit. CI blocks merges on failure.
func TestMathLockdown(t *testing.T) {
	t.Run("split_constants_match_law", func(t *testing.T) {
		expected := map[string]string{
			"farmer":   "0.50",
			"platform": "0.25",
			"agent":    "0.05",
			"reserve":  "0.20",
		}

		assert.Equal(t, expected["farmer"],
			domain.SplitFarmer.StringFixed(2),
			"FARMER split must be exactly 0.50 (50%%)")

		assert.Equal(t, expected["platform"],
			domain.SplitPlatform.StringFixed(2),
			"PLATFORM split must be exactly 0.25 (25%%)")

		assert.Equal(t, expected["agent"],
			domain.SplitAgent.StringFixed(2),
			"AGENT split must be exactly 0.05 (5%%)")

		assert.Equal(t, expected["reserve"],
			domain.SplitReserve.StringFixed(2),
			"RESERVE split must be exactly 0.20 (20%%)")
	})

	t.Run("splits_sum_to_one", func(t *testing.T) {
		sum := domain.SplitFarmer.
			Add(domain.SplitPlatform).
			Add(domain.SplitAgent).
			Add(domain.SplitReserve)

		one := decimal.NewFromInt(1)
		assert.True(t, sum.Equal(one),
			"50+25+5+20 MUST equal 100%% exactly. Got: %s", sum.String())
	})

	t.Run("no_paisa_lost_on_round_amount", func(t *testing.T) {
		gross, _ := domain.NewMoney(decimal.NewFromInt(10000), "INR")
		split, err := domain.ComputeSplit(gross)
		require.NoError(t, err)

		assert.Equal(t, "5000.00", split.Farmer.Amount.StringFixed(2), "farmer 50%%")
		assert.Equal(t, "2500.00", split.Platform.Amount.StringFixed(2), "platform 25%%")
		assert.Equal(t, "500.00", split.Agent.Amount.StringFixed(2), "agent 5%%")
		assert.Equal(t, "2000.00", split.Reserve.Amount.StringFixed(2), "reserve 20%%")

		sum := split.Farmer.Amount.Add(split.Platform.Amount).
			Add(split.Agent.Amount).Add(split.Reserve.Amount)
		assert.True(t, sum.Equal(gross.Amount),
			"no paisa lost: sum=%s gross=%s", sum, gross.Amount)
	})

	t.Run("no_paisa_lost_on_odd_amount", func(t *testing.T) {
		// ₹333.33 — non-divisible amount, tests Allocate() remainder handling
		gross, _ := domain.NewMoney(mustDecimal("333.33"), "INR")
		split, err := domain.ComputeSplit(gross)
		require.NoError(t, err)

		sum := split.Farmer.Amount.Add(split.Platform.Amount).
			Add(split.Agent.Amount).Add(split.Reserve.Amount)

		assert.True(t, sum.Equal(gross.Amount),
			"no paisa lost on odd amount: sum=%s gross=%s", sum, gross.Amount)
	})

	t.Run("no_paisa_lost_on_one_paisa", func(t *testing.T) {
		// Smallest possible INR unit: ₹0.01
		gross, _ := domain.NewMoney(mustDecimal("0.01"), "INR")
		split, err := domain.ComputeSplit(gross)
		require.NoError(t, err)

		sum := split.Farmer.Amount.Add(split.Platform.Amount).
			Add(split.Agent.Amount).Add(split.Reserve.Amount)

		assert.True(t, sum.Equal(gross.Amount),
			"no paisa lost on minimum amount: sum=%s gross=%s", sum, gross.Amount)
	})

	t.Run("reject_zero_gross", func(t *testing.T) {
		gross, _ := domain.NewMoney(decimal.Zero, "INR")
		_, err := domain.ComputeSplit(gross)
		assert.Error(t, err, "zero gross must be rejected")
	})

	t.Run("farmer_split_is_majority", func(t *testing.T) {
		// Verify farmer always gets the largest single share
		assert.True(t, domain.SplitFarmer.GreaterThan(domain.SplitPlatform),
			"farmer (50%%) must exceed platform (25%%)")
		assert.True(t, domain.SplitFarmer.GreaterThan(domain.SplitAgent),
			"farmer (50%%) must exceed agent (5%%)")
		assert.True(t, domain.SplitFarmer.GreaterThan(domain.SplitReserve),
			"farmer (50%%) must exceed reserve (20%%)")
	})

	t.Run("precision_8_decimal_places", func(t *testing.T) {
		gross, _ := domain.NewMoney(mustDecimal("999999999.9999"), "INR")
		split, err := domain.ComputeSplit(gross)
		require.NoError(t, err)

		sum := split.Farmer.Amount.Add(split.Platform.Amount).
			Add(split.Agent.Amount).Add(split.Reserve.Amount)

		// Allow at most 1 unit of last place on 8 decimal precision
		diff := sum.Sub(gross.Amount).Abs()
		maxAllowedDiff := decimal.NewFromFloat(1e-8)
		assert.True(t, diff.LessThanOrEqual(maxAllowedDiff),
			"precision loss at 8dp: diff=%s", diff.String())
	})
}

// TestDoubleEntryBalance verifies journal entry balancing.
func TestDoubleEntryBalance(t *testing.T) {
	t.Run("balanced_entries_pass", func(t *testing.T) {
		entries := []domain.JournalEntry{
			{EntryType: domain.EntryDebit, Amount: mustDecimal("5000")},
			{EntryType: domain.EntryCredit, Amount: mustDecimal("5000")},
		}
		err := domain.ValidateJournalBalance(entries)
		assert.NoError(t, err)
	})

	t.Run("unbalanced_entries_fail", func(t *testing.T) {
		entries := []domain.JournalEntry{
			{EntryType: domain.EntryDebit, Amount: mustDecimal("5000")},
			{EntryType: domain.EntryCredit, Amount: mustDecimal("4999.99")},
		}
		err := domain.ValidateJournalBalance(entries)
		assert.Error(t, err)

		de, ok := domain.AsDomainError(err)
		require.True(t, ok)
		assert.Equal(t, domain.ErrCodeDoubleEntryViolation, de.Code)
	})

	t.Run("zero_amount_entry_rejected", func(t *testing.T) {
		entries := []domain.JournalEntry{
			{EntryType: domain.EntryDebit, Amount: decimal.Zero},
			{EntryType: domain.EntryCredit, Amount: decimal.Zero},
		}
		err := domain.ValidateJournalBalance(entries)
		assert.Error(t, err, "zero-amount entries must be rejected")
	})
}

// TestDomainErrors verifies error types carry correct HTTP status codes.
func TestDomainErrors(t *testing.T) {
	tests := []struct {
		name       string
		err        *domain.DomainError
		wantStatus int
	}{
		{"not_found", domain.ErrNotFound("farmer", "abc"), 404},
		{"validation", domain.ErrValidation("bad input"), 422},
		{"math_violation", domain.ErrMathViolation("split drift"), 422},
		{"double_entry", domain.ErrDoubleEntry("unbalanced"), 422},
		{"idempotency", domain.ErrIdempotencyConflict("key-123"), 409},
		{"internal", domain.ErrInternal(assert.AnError), 500},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.wantStatus, tt.err.HTTPStatus())
		})
	}
}

func mustDecimal(s string) decimal.Decimal {
	d, err := decimal.NewFromString(s)
	if err != nil {
		panic("test helper mustDecimal: invalid decimal: " + s)
	}
	return d
}
