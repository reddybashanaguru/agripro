package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"github.com/finagra/unity/domain"
)

type postgresTransactionRepo struct {
	db *pgxpool.Pool
}

func NewPostgresTransactionRepo(db *pgxpool.Pool) TransactionRepository {
	return &postgresTransactionRepo{db: db}
}

func (r *postgresTransactionRepo) FindByIdempotencyKey(ctx context.Context, key string) (*domain.Transaction, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, idempotency_key, gross_amount::text, currency, status::text,
		       farmer_id, COALESCE(description,''), COALESCE(external_ref,''),
		       created_at, updated_at, completed_at
		FROM transactions WHERE idempotency_key = $1`, key)

	var t domain.Transaction
	var grossStr, statusStr string
	var completedAt *time.Time
	err := row.Scan(
		&t.ID, &t.IdempotencyKey, &grossStr, &t.Currency, &statusStr,
		&t.FarmerID, &t.Description, &t.ExternalRef,
		&t.CreatedAt, &t.UpdatedAt, &completedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, domain.ErrInternal(err)
	}

	t.GrossAmount, _ = decimal.NewFromString(grossStr)
	t.Status = domain.PayoutStatus(statusStr)
	t.CompletedAt = completedAt
	return &t, nil
}

func (r *postgresTransactionRepo) Create(ctx context.Context, txn *domain.Transaction) error {
	// Pass gross_amount as string so pgx doesn't need to encode decimal.Decimal natively.
	_, err := r.db.Exec(ctx, `
		INSERT INTO transactions (id, idempotency_key, gross_amount, currency, status,
		                          farmer_id, description, created_at, updated_at)
		VALUES ($1,$2,$3::numeric,$4,$5::payout_status,$6,$7,NOW(),NOW())`,
		txn.ID, txn.IdempotencyKey, txn.GrossAmount.String(), txn.Currency, string(txn.Status),
		txn.FarmerID, txn.Description,
	)
	if err != nil {
		return domain.ErrInternal(err)
	}
	return nil
}

func (r *postgresTransactionRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.PayoutStatus) error {
	_, err := r.db.Exec(ctx, `
		UPDATE transactions SET status = $1::payout_status, updated_at = NOW(),
		    completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END
		WHERE id = $2`, string(status), id)
	if err != nil {
		return domain.ErrInternal(err)
	}
	return nil
}

// ListTransactions returns a page of transactions ordered by created_at DESC
// along with the total count of all transactions in the table.
func (r *postgresTransactionRepo) ListTransactions(ctx context.Context, limit, offset int) ([]domain.Transaction, int, error) {
	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM transactions`).Scan(&total); err != nil {
		return nil, 0, domain.ErrInternal(err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, idempotency_key, gross_amount::text, currency, status::text,
		       farmer_id, COALESCE(description,''), created_at, completed_at
		FROM transactions
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, domain.ErrInternal(err)
	}
	defer rows.Close()

	var txns []domain.Transaction
	for rows.Next() {
		var t domain.Transaction
		var grossStr, statusStr string
		var completedAt *time.Time
		if err := rows.Scan(
			&t.ID, &t.IdempotencyKey, &grossStr, &t.Currency, &statusStr,
			&t.FarmerID, &t.Description, &t.CreatedAt, &completedAt,
		); err != nil {
			return nil, 0, domain.ErrInternal(err)
		}
		t.GrossAmount, _ = decimal.NewFromString(grossStr)
		t.Status = domain.PayoutStatus(statusStr)
		t.CompletedAt = completedAt
		txns = append(txns, t)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, domain.ErrInternal(err)
	}
	return txns, total, nil
}

func (r *postgresTransactionRepo) CreateJournalEntries(ctx context.Context, entries []domain.JournalEntry) error {
	if err := domain.ValidateJournalBalance(entries); err != nil {
		return err
	}

	batch := &pgx.Batch{}
	for _, e := range entries {
		// Pass amount as string so pgx doesn't need a registered decimal codec.
		batch.Queue(`
			INSERT INTO journal_entries (id, txn_id, account_id, entry_type, amount, description, created_at)
			VALUES ($1,$2,$3,$4::entry_type,$5::numeric,$6,NOW())`,
			e.ID, e.TxnID, e.AccountID, string(e.EntryType), e.Amount.String(), e.Description,
		)
	}

	results := r.db.SendBatch(ctx, batch)
	defer results.Close()

	for range entries {
		if _, err := results.Exec(); err != nil {
			return domain.ErrInternal(err)
		}
	}
	return nil
}
