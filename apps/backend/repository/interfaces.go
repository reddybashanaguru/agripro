package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/finagra/unity/domain"
)

// TransactionRepository handles all transaction + journal persistence.
// Usecases depend on this interface — never on the concrete Postgres impl.
type TransactionRepository interface {
	// FindByIdempotencyKey returns (nil, nil) if not found.
	FindByIdempotencyKey(ctx context.Context, key string) (*domain.Transaction, error)
	Create(ctx context.Context, txn *domain.Transaction) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status domain.PayoutStatus) error
	CreateJournalEntries(ctx context.Context, entries []domain.JournalEntry) error
}

// FarmerRepository handles farmer persistence.
type FarmerRepository interface {
	FindByID(ctx context.Context, id uuid.UUID) (*domain.Farmer, error)
	FindByPhone(ctx context.Context, phone string) (*domain.Farmer, error)
	Create(ctx context.Context, farmer *domain.Farmer) error
	Update(ctx context.Context, farmer *domain.Farmer) error
}
