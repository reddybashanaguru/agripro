package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"github.com/finagra/unity/domain"
)

type postgresLedgerRepo struct {
	db *pgxpool.Pool
}

func NewPostgresLedgerRepo(db *pgxpool.Pool) LedgerRepository {
	return &postgresLedgerRepo{db: db}
}

// GlobalBalance computes the total DEBIT and CREDIT sums across all journal entries.
// The two values must be equal for the ledger to satisfy double-entry invariants.
func (r *postgresLedgerRepo) GlobalBalance(ctx context.Context) (*domain.LedgerBalance, error) {
	var debitStr, creditStr string
	var entryCount, txnCount int

	err := r.db.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(amount) FILTER (WHERE entry_type = 'DEBIT'),  0)::text AS total_debit,
			COALESCE(SUM(amount) FILTER (WHERE entry_type = 'CREDIT'), 0)::text AS total_credit,
			COUNT(*)                                                             AS entry_count,
			COUNT(DISTINCT txn_id)                                               AS txn_count
		FROM journal_entries`).
		Scan(&debitStr, &creditStr, &entryCount, &txnCount)
	if err != nil {
		return nil, domain.ErrInternal(err)
	}

	totalDebit, _ := decimal.NewFromString(debitStr)
	totalCredit, _ := decimal.NewFromString(creditStr)

	return &domain.LedgerBalance{
		TotalDebit:  totalDebit,
		TotalCredit: totalCredit,
		IsBalanced:  totalDebit.Equal(totalCredit),
		EntryCount:  entryCount,
		TxnCount:    txnCount,
	}, nil
}

// EntriesForTransaction returns all journal entries for a given transaction ID,
// ordered by entry_type then amount for deterministic output.
func (r *postgresLedgerRepo) EntriesForTransaction(ctx context.Context, txnID uuid.UUID) ([]domain.JournalEntry, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, txn_id, account_id, entry_type::text, amount::text, COALESCE(description,''), created_at
		FROM journal_entries
		WHERE txn_id = $1
		ORDER BY entry_type, amount DESC`, txnID)
	if err != nil {
		return nil, domain.ErrInternal(err)
	}
	defer rows.Close()

	var entries []domain.JournalEntry
	for rows.Next() {
		var e domain.JournalEntry
		var entryTypeStr, amtStr string
		if err := rows.Scan(&e.ID, &e.TxnID, &e.AccountID, &entryTypeStr, &amtStr, &e.Description, &e.CreatedAt); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, domain.ErrInternal(err)
		}
		e.EntryType = domain.EntryType(entryTypeStr)
		e.Amount, _ = decimal.NewFromString(amtStr)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
