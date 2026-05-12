package usecase

import (
	"context"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/repository"
)

type LedgerUsecase struct {
	ledgerRepo repository.LedgerRepository
	log        zerolog.Logger
}

func NewLedgerUsecase(ledgerRepo repository.LedgerRepository, log zerolog.Logger) *LedgerUsecase {
	return &LedgerUsecase{ledgerRepo: ledgerRepo, log: log}
}

// GlobalBalance returns the aggregate debit/credit totals for the entire ledger.
func (u *LedgerUsecase) GlobalBalance(ctx context.Context) (*domain.LedgerBalance, error) {
	balance, err := u.ledgerRepo.GlobalBalance(ctx)
	if err != nil {
		return nil, err
	}
	if !balance.IsBalanced {
		u.log.Error().
			Str("total_debit", balance.TotalDebit.String()).
			Str("total_credit", balance.TotalCredit.String()).
			Msg("LEDGER IMBALANCE DETECTED — double-entry invariant violated")
	}
	return balance, nil
}

// EntriesForTransaction returns all journal entries for a specific transaction.
func (u *LedgerUsecase) EntriesForTransaction(ctx context.Context, txnID uuid.UUID) ([]domain.JournalEntry, error) {
	entries, err := u.ledgerRepo.EntriesForTransaction(ctx, txnID)
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, domain.ErrNotFound("transaction", txnID.String())
	}
	return entries, nil
}
