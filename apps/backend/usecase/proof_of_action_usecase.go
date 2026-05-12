package usecase

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/repository"
)

type SubmitProofRequest struct {
	PlotID    uuid.UUID
	FarmerID  uuid.UUID
	Longitude float64
	Latitude  float64
	AccuracyM float64
	PhotoHash string // SHA-256 hex of field photo — enforces uniqueness
}

type ProofOfActionUsecase struct {
	proofRepo  repository.ProofOfActionRepository
	plotRepo   repository.LandPlotRepository
	farmerRepo repository.FarmerRepository
	publisher  EventPublisher
	log        zerolog.Logger
}

func NewProofOfActionUsecase(
	proofRepo repository.ProofOfActionRepository,
	plotRepo repository.LandPlotRepository,
	farmerRepo repository.FarmerRepository,
	publisher EventPublisher,
	log zerolog.Logger,
) *ProofOfActionUsecase {
	return &ProofOfActionUsecase{
		proofRepo:  proofRepo,
		plotRepo:   plotRepo,
		farmerRepo: farmerRepo,
		publisher:  publisher,
		log:        log,
	}
}

// SubmitProof evaluates a GPS reading against the registered plot boundary,
// applies anti-spoof rules, persists the result, and returns the proof record.
func (u *ProofOfActionUsecase) SubmitProof(ctx context.Context, req SubmitProofRequest) (*domain.ProofOfAction, error) {
	// 1. Validate plot exists
	plot, err := u.plotRepo.FindByID(ctx, req.PlotID)
	if err != nil {
		return nil, err
	}
	if plot == nil {
		return nil, domain.ErrNotFound("land_plot", req.PlotID.String())
	}

	// 2. Validate farmer exists
	farmer, err := u.farmerRepo.FindByID(ctx, req.FarmerID)
	if err != nil {
		return nil, err
	}
	if farmer == nil {
		return nil, domain.ErrNotFound("farmer", req.FarmerID.String())
	}

	// 3. Anti-spoof rule 1 — GPS accuracy
	verdict := domain.VerdictVerified
	var spoofReason string
	var distanceM float64

	if spoofed, reason := domain.EvaluateAccuracy(req.AccuracyM); spoofed {
		verdict = domain.VerdictSpoofed
		spoofReason = reason
	}

	// 4. Anti-spoof rule 2 — photo replay detection
	// Replay submissions are rejected immediately without creating a new DB record
	// (the original record is the evidence; replay junk does not belong in the audit trail).
	if verdict != domain.VerdictSpoofed {
		exists, err := u.proofRepo.PhotoHashExists(ctx, req.PhotoHash)
		if err != nil {
			return nil, err
		}
		if exists {
			u.log.Warn().
				Str("photo_hash", req.PhotoHash).
				Str("plot_id", req.PlotID.String()).
				Msg("proof-of-action replay attack detected — rejected without DB write")
			return &domain.ProofOfAction{
				ID:          uuid.New(),
				PlotID:      req.PlotID,
				FarmerID:    req.FarmerID,
				Longitude:   req.Longitude,
				Latitude:    req.Latitude,
				AccuracyM:   req.AccuracyM,
				PhotoHash:   req.PhotoHash,
				Verdict:     domain.VerdictSpoofed,
				SpoofReason: "photo hash already submitted — replay attack detected",
				SubmittedAt: time.Now().UTC(),
			}, nil
		}
	}

	// 5. GPS boundary check (only when not already spoofed)
	if verdict != domain.VerdictSpoofed {
		inside, err := u.plotRepo.ContainsPoint(ctx, req.PlotID, req.Longitude, req.Latitude)
		if err != nil {
			return nil, err
		}
		if inside {
			verdict = domain.VerdictVerified
		} else {
			verdict = domain.VerdictRejected
			distanceM, _ = u.plotRepo.DistanceToBoundary(ctx, req.PlotID, req.Longitude, req.Latitude)
		}
	}

	// 6. Persist the immutable proof record
	proof := &domain.ProofOfAction{
		ID:                  uuid.New(),
		PlotID:              req.PlotID,
		FarmerID:            req.FarmerID,
		Longitude:           req.Longitude,
		Latitude:            req.Latitude,
		AccuracyM:           req.AccuracyM,
		PhotoHash:           req.PhotoHash,
		Verdict:             verdict,
		DistanceToBoundaryM: distanceM,
		SpoofReason:         spoofReason,
		SubmittedAt:         time.Now().UTC(),
	}

	if err := u.proofRepo.Create(ctx, proof); err != nil {
		return nil, err
	}

	u.log.Info().
		Str("proof_id", proof.ID.String()).
		Str("plot_id", req.PlotID.String()).
		Str("farmer_id", req.FarmerID.String()).
		Str("verdict", string(verdict)).
		Float64("accuracy_m", req.AccuracyM).
		Msg("proof-of-action recorded")

	// Publish proof verdict event (fire-and-forget)
	if evt, err := domain.NewEvent(domain.EventProofVerdict, domain.ProofVerdictData{
		ProofID:     proof.ID.String(),
		PlotID:      req.PlotID.String(),
		FarmerID:    req.FarmerID.String(),
		Verdict:     string(verdict),
		AccuracyM:   req.AccuracyM,
		SpoofReason: spoofReason,
	}); err == nil {
		_ = u.publisher.Publish(ctx, domain.SubjectProofVerdict, evt)
	}

	return proof, nil
}
