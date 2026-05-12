package usecase

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/rs/zerolog"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/repository"
)

// PayoutRequest is the input DTO for initiating a payout.
type PayoutRequest struct {
	IdempotencyKey string
	FarmerID       uuid.UUID
	// PlotID triggers the Step 7 Satellite Sentinel NDVI check before payout.
	// nil = no NDVI gate (e.g. non-crop payouts).
	PlotID         *uuid.UUID
	GrossAmount    decimal.Decimal
	Currency       string
	Description    string
	InitiatedBy    uuid.UUID
	// Account IDs for the four buckets — provided by config/setup
	FarmerAccountID   uuid.UUID
	PlatformAccountID uuid.UUID
	AgentAccountID    uuid.UUID
	ReserveAccountID  uuid.UUID
}

type PayoutUsecase struct {
	txnRepo       repository.TransactionRepository
	farmerRepo    repository.FarmerRepository
	satelliteRepo repository.SatelliteRepository
	log           zerolog.Logger
}

func NewPayoutUsecase(
	txnRepo repository.TransactionRepository,
	farmerRepo repository.FarmerRepository,
	satelliteRepo repository.SatelliteRepository,
	log zerolog.Logger,
) *PayoutUsecase {
	return &PayoutUsecase{
		txnRepo:       txnRepo,
		farmerRepo:    farmerRepo,
		satelliteRepo: satelliteRepo,
		log:           log,
	}
}

// ExecutePayout processes a farmer payout with full ledger integrity.
// Idempotent: returns existing transaction if key already used.
func (u *PayoutUsecase) ExecutePayout(ctx context.Context, req PayoutRequest) (*domain.Transaction, error) {
	log := u.log.With().Str("idempotency_key", req.IdempotencyKey).Logger()

	// 1. Idempotency check — return existing if already processed
	existing, err := u.txnRepo.FindByIdempotencyKey(ctx, req.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		log.Info().Str("txn_id", existing.ID.String()).Msg("idempotent replay — returning cached transaction")
		return existing, nil
	}

	// 2. Validate farmer eligibility
	farmer, err := u.farmerRepo.FindByID(ctx, req.FarmerID)
	if err != nil {
		return nil, err
	}
	if farmer == nil {
		return nil, domain.ErrNotFound("farmer", req.FarmerID.String())
	}
	if err := farmer.CanReceivePayout(); err != nil {
		return nil, err
	}

	// 3. Satellite Sentinel — NDVI check (only when a plot is associated with this payout)
	if req.PlotID != nil {
		obs, err := u.satelliteRepo.LatestForPlot(ctx, *req.PlotID)
		if err != nil {
			return nil, err
		}
		if obs != nil {
			if err := domain.CheckNDVI(obs); err != nil {
				log.Warn().
					Str("plot_id", req.PlotID.String()).
					Str("ndvi_mean", obs.NDVIMean.String()).
					Str("source", obs.Source).
					Msg("payout blocked by Satellite Sentinel — NDVI below threshold")
				return nil, err
			}
		}
		// obs == nil → no satellite data yet → allow payout (no block on missing data)
	}

	// 4. Compute 50/25/5/20 split
	grossMoney, err := domain.NewMoney(req.GrossAmount, req.Currency)
	if err != nil {
		return nil, err
	}
	split, err := domain.ComputeSplit(grossMoney)
	if err != nil {
		return nil, err
	}

	// 5. Build transaction record
	txnID := uuid.New()
	now := time.Now().UTC()
	txn := &domain.Transaction{
		ID:             txnID,
		IdempotencyKey: req.IdempotencyKey,
		GrossAmount:    req.GrossAmount,
		Currency:       req.Currency,
		Status:         domain.PayoutPending,
		FarmerID:       req.FarmerID,
		InitiatedBy:    req.InitiatedBy,
		Description:    req.Description,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if err := u.txnRepo.Create(ctx, txn); err != nil {
		return nil, err
	}

	// 6. Build double-entry journal (8 entries: 4 debits + 4 credits)
	entries := buildPayoutJournalEntries(txnID, split, req)

	if err := u.txnRepo.CreateJournalEntries(ctx, entries); err != nil {
		// Rollback: mark transaction failed
		_ = u.txnRepo.UpdateStatus(ctx, txnID, domain.PayoutFailed)
		return nil, err
	}

	// 7. Mark completed
	if err := u.txnRepo.UpdateStatus(ctx, txnID, domain.PayoutCompleted); err != nil {
		return nil, err
	}

	txn.Status = domain.PayoutCompleted
	txn.Entries = entries

	log.Info().
		Str("txn_id", txnID.String()).
		Str("gross", req.GrossAmount.String()).
		Str("farmer_gets", split.Farmer.Amount.String()).
		Msg("payout completed")

	return txn, nil
}

// buildPayoutJournalEntries constructs 8 balanced journal entries for a payout.
// Debit source (escrow/revenue) and Credit each beneficiary bucket.
func buildPayoutJournalEntries(txnID uuid.UUID, split domain.PayoutSplit, req PayoutRequest) []domain.JournalEntry {
	return []domain.JournalEntry{
		// FARMER: Debit expense / Credit farmer wallet
		{ID: uuid.New(), TxnID: txnID, AccountID: req.FarmerAccountID,
			EntryType: domain.EntryDebit, Amount: split.Farmer.Amount,
			Description: "Farmer payment — 50% of gross"},
		{ID: uuid.New(), TxnID: txnID, AccountID: req.FarmerAccountID,
			EntryType: domain.EntryCredit, Amount: split.Farmer.Amount,
			Description: "Farmer wallet credit"},

		// PLATFORM: Debit revenue pool / Credit platform account
		{ID: uuid.New(), TxnID: txnID, AccountID: req.PlatformAccountID,
			EntryType: domain.EntryDebit, Amount: split.Platform.Amount,
			Description: "Platform fee — 25% of gross"},
		{ID: uuid.New(), TxnID: txnID, AccountID: req.PlatformAccountID,
			EntryType: domain.EntryCredit, Amount: split.Platform.Amount,
			Description: "Platform revenue credit"},

		// AGENT: Debit expense / Credit agent commission
		{ID: uuid.New(), TxnID: txnID, AccountID: req.AgentAccountID,
			EntryType: domain.EntryDebit, Amount: split.Agent.Amount,
			Description: "Agent commission — 5% of gross"},
		{ID: uuid.New(), TxnID: txnID, AccountID: req.AgentAccountID,
			EntryType: domain.EntryCredit, Amount: split.Agent.Amount,
			Description: "Agent commission credit"},

		// RESERVE: Debit expense / Credit reserve fund
		{ID: uuid.New(), TxnID: txnID, AccountID: req.ReserveAccountID,
			EntryType: domain.EntryDebit, Amount: split.Reserve.Amount,
			Description: "Reserve fund — 20% of gross"},
		{ID: uuid.New(), TxnID: txnID, AccountID: req.ReserveAccountID,
			EntryType: domain.EntryCredit, Amount: split.Reserve.Amount,
			Description: "Reserve fund credit"},
	}
}
