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

// LedgerRepository reads aggregated journal data for audit and balance checks.
type LedgerRepository interface {
	// GlobalBalance returns the sum of all DEBIT and CREDIT entries in the ledger.
	GlobalBalance(ctx context.Context) (*domain.LedgerBalance, error)
	// EntriesForTransaction returns all journal entries for a specific transaction.
	EntriesForTransaction(ctx context.Context, txnID uuid.UUID) ([]domain.JournalEntry, error)
}

// SatelliteRepository reads and writes satellite NDVI observations (Step 7).
type SatelliteRepository interface {
	// Create persists a new observation (used for seeding mock data in tests and staging).
	Create(ctx context.Context, obs *domain.SatelliteObservation, plotGeoJSON string) error
	// LatestForPlot returns the most recent observation for a plot, or nil if none exists.
	LatestForPlot(ctx context.Context, plotID uuid.UUID) (*domain.SatelliteObservation, error)
}

// ProofOfActionRepository persists GPS field-verification records (Step 6).
type ProofOfActionRepository interface {
	Create(ctx context.Context, proof *domain.ProofOfAction) error
	// PhotoHashExists checks for replay attacks: same photo submitted twice.
	PhotoHashExists(ctx context.Context, hash string) (bool, error)
}

// LandPlotRepository is the Dependency Inversion boundary for spatial data.
// Usecases never import PostGIS or pgx — only this interface.
type LandPlotRepository interface {
	Create(ctx context.Context, plot *domain.LandPlot) error
	FindByID(ctx context.Context, id uuid.UUID) (*domain.LandPlot, error)
	FindByFarmerID(ctx context.Context, farmerID uuid.UUID) ([]*domain.LandPlot, error)
	// FindInBBox returns plots whose geometry intersects the given WGS84 bounding box.
	// Uses GIST index for O(log N) performance.
	FindInBBox(ctx context.Context, minLon, minLat, maxLon, maxLat float64) ([]*domain.LandPlot, error)
	// ContainsPoint checks if a GPS coordinate falls inside a specific plot boundary.
	// Foundation for Step 6 Proof-of-Action GPS verification.
	ContainsPoint(ctx context.Context, plotID uuid.UUID, lon, lat float64) (bool, error)
	// DistanceToBoundary returns metres from a point to the nearest plot boundary edge.
	DistanceToBoundary(ctx context.Context, plotID uuid.UUID, lon, lat float64) (float64, error)
	// HasOverlap checks if a new polygon overlaps any existing plot owned by the same farmer.
	HasOverlap(ctx context.Context, farmerID uuid.UUID, geoJSON string) (bool, error)
}
