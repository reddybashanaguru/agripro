package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/finagra/unity/domain"
)

type postgresFarmerRepo struct {
	db *pgxpool.Pool
}

func NewPostgresFarmerRepo(db *pgxpool.Pool) FarmerRepository {
	return &postgresFarmerRepo{db: db}
}

func (r *postgresFarmerRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.Farmer, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, phone, name, aadhaar_hash, kyc_status, fpo_id,
		       created_at, updated_at, deleted_at, last_synced_at
		FROM farmers WHERE id = $1 AND deleted_at IS NULL`, id)

	return scanFarmer(row)
}

func (r *postgresFarmerRepo) FindByPhone(ctx context.Context, phone string) (*domain.Farmer, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, phone, name, aadhaar_hash, kyc_status, fpo_id,
		       created_at, updated_at, deleted_at, last_synced_at
		FROM farmers WHERE phone = $1 AND deleted_at IS NULL`, phone)

	return scanFarmer(row)
}

func (r *postgresFarmerRepo) Create(ctx context.Context, f *domain.Farmer) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO farmers (id, phone, name, aadhaar_hash, kyc_status, fpo_id, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
		f.ID, f.Phone, f.Name, f.AadhaarHash, string(f.KYCStatus), f.FPOID,
	)
	if err != nil {
		return domain.ErrInternal(err)
	}
	return nil
}

func (r *postgresFarmerRepo) Update(ctx context.Context, f *domain.Farmer) error {
	_, err := r.db.Exec(ctx, `
		UPDATE farmers SET name=$1, kyc_status=$2, fpo_id=$3, updated_at=NOW()
		WHERE id=$4 AND deleted_at IS NULL`,
		f.Name, string(f.KYCStatus), f.FPOID, f.ID,
	)
	if err != nil {
		return domain.ErrInternal(err)
	}
	return nil
}

func scanFarmer(row pgx.Row) (*domain.Farmer, error) {
	var f domain.Farmer
	var kycStr string
	err := row.Scan(
		&f.ID, &f.Phone, &f.Name, &f.AadhaarHash, &kycStr, &f.FPOID,
		&f.CreatedAt, &f.UpdatedAt, &f.DeletedAt, &f.LastSyncedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, domain.ErrInternal(err)
	}
	f.KYCStatus = domain.KYCStatus(kycStr)
	return &f, nil
}
