package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/finagra/unity/domain"
)

type postgresProofRepo struct {
	db *pgxpool.Pool
}

func NewPostgresProofRepo(db *pgxpool.Pool) ProofOfActionRepository {
	return &postgresProofRepo{db: db}
}

func (r *postgresProofRepo) Create(ctx context.Context, p *domain.ProofOfAction) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO proof_of_action
			(id, plot_id, farmer_id, longitude, latitude, accuracy_m,
			 photo_hash, verdict, distance_to_boundary_m, spoof_reason, submitted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::action_verdict, $9, $10, $11)`,
		p.ID, p.PlotID, p.FarmerID,
		p.Longitude, p.Latitude, p.AccuracyM,
		p.PhotoHash, string(p.Verdict),
		p.DistanceToBoundaryM, p.SpoofReason,
		p.SubmittedAt,
	)
	if err != nil {
		return domain.ErrInternal(err)
	}
	return nil
}

func (r *postgresProofRepo) PhotoHashExists(ctx context.Context, hash string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM proof_of_action WHERE photo_hash = $1)`, hash).
		Scan(&exists)
	if err != nil {
		return false, domain.ErrInternal(err)
	}
	return exists, nil
}
