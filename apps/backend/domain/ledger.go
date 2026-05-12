package domain

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ─────────────────────────────────────────────────────────────
// IMMUTABLE MATH LAWS — 50/25/5/20
// Any change here will fail TestMathLockdown in tests/regression.
// ─────────────────────────────────────────────────────────────

var (
	SplitFarmerPayment   = decimal.NewFromString // see init
	splitFarmerRaw       = "0.50"
	splitPlatformRaw     = "0.25"
	splitAgentRaw        = "0.05"
	splitReserveRaw      = "0.20"
)

var (
	SplitFarmer   decimal.Decimal
	SplitPlatform decimal.Decimal
	SplitAgent    decimal.Decimal
	SplitReserve  decimal.Decimal
	splitSum      decimal.Decimal
)

func init() {
	SplitFarmer, _ = decimal.NewFromString(splitFarmerRaw)
	SplitPlatform, _ = decimal.NewFromString(splitPlatformRaw)
	SplitAgent, _ = decimal.NewFromString(splitAgentRaw)
	SplitReserve, _ = decimal.NewFromString(splitReserveRaw)
	splitSum = SplitFarmer.Add(SplitPlatform).Add(SplitAgent).Add(SplitReserve)

	one := decimal.NewFromInt(1)
	if !splitSum.Equal(one) {
		// Panic at startup if invariant is broken — fail fast, never silently corrupt.
		panic("FATAL: Math Law violation — 50/25/5/20 splits do not sum to 1.0")
	}
}

// ─────────────────────────────────────────────────────────────
// VALUE OBJECTS
// ─────────────────────────────────────────────────────────────

type Money struct {
	Amount   decimal.Decimal
	Currency string // ISO 4217, e.g. "INR"
}

func NewMoney(amount decimal.Decimal, currency string) (Money, error) {
	if amount.IsNegative() {
		return Money{}, ErrValidation("amount cannot be negative")
	}
	if currency == "" {
		return Money{}, ErrValidation("currency is required")
	}
	return Money{Amount: amount, Currency: currency}, nil
}

func (m Money) IsZero() bool { return m.Amount.IsZero() }

// PayoutSplit is the result of applying the 50/25/5/20 rule to a gross amount.
// Uses decimal.Allocate to distribute remainder cents without drift.
type PayoutSplit struct {
	Gross    Money
	Farmer   Money
	Platform Money
	Agent    Money
	Reserve  Money
}

// ComputeSplit applies the Math Laws to gross.
// Uses truncate-then-assign-remainder pattern: farmer, platform, and agent
// are truncated to 4 decimal places; reserve absorbs any remainder so no
// paisa is ever lost or created.
func ComputeSplit(gross Money) (PayoutSplit, error) {
	if gross.IsZero() {
		return PayoutSplit{}, ErrValidation("gross amount must be greater than zero")
	}

	hundred := decimal.NewFromInt(100)

	farmerAmt := gross.Amount.Mul(decimal.NewFromInt(50)).Div(hundred).Truncate(4)
	platformAmt := gross.Amount.Mul(decimal.NewFromInt(25)).Div(hundred).Truncate(4)
	agentAmt := gross.Amount.Mul(decimal.NewFromInt(5)).Div(hundred).Truncate(4)
	// Reserve absorbs all remainder — guarantees exact reconstruction
	reserveAmt := gross.Amount.Sub(farmerAmt).Sub(platformAmt).Sub(agentAmt)

	farmer, _ := NewMoney(farmerAmt, gross.Currency)
	platform, _ := NewMoney(platformAmt, gross.Currency)
	agent, _ := NewMoney(agentAmt, gross.Currency)
	reserve, _ := NewMoney(reserveAmt, gross.Currency)

	// Hard invariant: no paisa lost or created
	reconstructed := farmerAmt.Add(platformAmt).Add(agentAmt).Add(reserveAmt)
	if !reconstructed.Equal(gross.Amount) {
		return PayoutSplit{}, ErrMathViolation(
			"split reconstruction mismatch: possible rounding error",
		)
	}

	return PayoutSplit{
		Gross:    gross,
		Farmer:   farmer,
		Platform: platform,
		Agent:    agent,
		Reserve:  reserve,
	}, nil
}

// ─────────────────────────────────────────────────────────────
// ENTITIES
// ─────────────────────────────────────────────────────────────

type EntryType string

const (
	EntryDebit  EntryType = "DEBIT"
	EntryCredit EntryType = "CREDIT"
)

type JournalEntry struct {
	ID          uuid.UUID
	TxnID       uuid.UUID
	AccountID   uuid.UUID
	EntryType   EntryType
	Amount      decimal.Decimal
	Description string
	CreatedAt   time.Time
}

type Transaction struct {
	ID             uuid.UUID
	IdempotencyKey string
	GrossAmount    decimal.Decimal
	Currency       string
	Status         PayoutStatus
	FarmerID       uuid.UUID
	InitiatedBy    uuid.UUID
	Description    string
	ExternalRef    string
	Entries        []JournalEntry
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CompletedAt    *time.Time
}

type PayoutStatus string

const (
	PayoutPending    PayoutStatus = "PENDING"
	PayoutProcessing PayoutStatus = "PROCESSING"
	PayoutCompleted  PayoutStatus = "COMPLETED"
	PayoutFailed     PayoutStatus = "FAILED"
	PayoutReversed   PayoutStatus = "REVERSED"
)

// ValidateJournalBalance enforces double-entry integrity on a set of entries.
func ValidateJournalBalance(entries []JournalEntry) error {
	debitSum := decimal.Zero
	creditSum := decimal.Zero
	for _, e := range entries {
		if e.Amount.IsNegative() || e.Amount.IsZero() {
			return ErrDoubleEntry("journal entry amount must be positive")
		}
		switch e.EntryType {
		case EntryDebit:
			debitSum = debitSum.Add(e.Amount)
		case EntryCredit:
			creditSum = creditSum.Add(e.Amount)
		}
	}
	if !debitSum.Equal(creditSum) {
		return ErrDoubleEntry(
			"double-entry violation: debit sum " + debitSum.String() +
				" != credit sum " + creditSum.String(),
		)
	}
	return nil
}
