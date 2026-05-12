package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
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
		SELECT id, idempotency_key, gross_amount, currency, status,
		       farmer_id, description, external_ref, created_at, updated_at, completed_at
		FROM transactions WHERE idempotency_key = $1`, key)

	var t domain.Transaction
	var completedAt *interface{}
	err := row.Scan(
		&t.ID, &t.IdempotencyKey, &t.GrossAmount, &t.Currency, &t.Status,
		&t.FarmerID, &t.Description, &t.ExternalRef, &t.CreatedAt, &t.UpdatedAt, &completedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, domain.ErrInternal(err)
	}
	return &t, nil
}

func (r *postgresTransactionRepo) Create(ctx context.Context, txn *domain.Transaction) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO transactions (id, idempotency_key, gross_amount, currency, status,
		                          farmer_id, description, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
		txn.ID, txn.IdempotencyKey, txn.GrossAmount, txn.Currency, txn.Status,
		txn.FarmerID, txn.Description,
	)
	if err != nil {
		return domain.ErrInternal(err)
	}
	return nil
}

func (r *postgresTransactionRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.PayoutStatus) error {
	_, err := r.db.Exec(ctx, `
		UPDATE transactions SET status = $1, updated_at = NOW(),
		    completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END
		WHERE id = $2`, status, id)
	if err != nil {
		return domain.ErrInternal(err)
	}
	return nil
}

func (r *postgresTransactionRepo) CreateJournalEntries(ctx context.Context, entries []domain.JournalEntry) error {
	if err := domain.ValidateJournalBalance(entries); err != nil {
		return err
	}

	batch := &pgx.Batch{}
	for _, e := range entries {
		batch.Queue(`
			INSERT INTO journal_entries (id, txn_id, account_id, entry_type, amount, description, created_at)
			VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
			e.ID, e.TxnID, e.AccountID, string(e.EntryType), e.Amount, e.Description,
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
