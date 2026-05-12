package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"github.com/finagra/unity/domain"
)

type postgresMetricsRepo struct {
	db *pgxpool.Pool
}

// NewPostgresMetricsRepo creates a MetricsRepository backed by Postgres.
func NewPostgresMetricsRepo(db *pgxpool.Pool) MetricsRepository {
	return &postgresMetricsRepo{db: db}
}

// GetPlatformMetrics executes a single query that aggregates all KPIs via sub-selects
// so the entire snapshot is consistent and requires only one round-trip.
func (r *postgresMetricsRepo) GetPlatformMetrics(ctx context.Context) (*domain.PlatformMetrics, error) {
	var (
		farmerCount      int
		plotCount        int
		transactionCount int
		totalDisbursedStr string
		totalNDVIAlerts  int
		totalProofRecords int
	)

	err := r.db.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM farmers WHERE deleted_at IS NULL)                       AS farmer_count,
			(SELECT COUNT(*) FROM land_plots WHERE deleted_at IS NULL)                    AS plot_count,
			(SELECT COUNT(*) FROM transactions)                                           AS transaction_count,
			COALESCE(
				(SELECT SUM(gross_amount) FROM transactions WHERE status = 'COMPLETED'),
				0
			)::text                                                                       AS total_disbursed,
			(SELECT COUNT(*) FROM satellite_observations WHERE ndvi_mean < 0.3)          AS total_ndvi_alerts,
			(SELECT COUNT(*) FROM proof_of_action)                                       AS total_proof_records
	`).Scan(
		&farmerCount,
		&plotCount,
		&transactionCount,
		&totalDisbursedStr,
		&totalNDVIAlerts,
		&totalProofRecords,
	)
	if err != nil {
		return nil, domain.ErrInternal(err)
	}

	totalDisbursed, _ := decimal.NewFromString(totalDisbursedStr)

	return &domain.PlatformMetrics{
		FarmerCount:       farmerCount,
		PlotCount:         plotCount,
		TransactionCount:  transactionCount,
		TotalDisbursed:    totalDisbursed,
		TotalNDVIAlerts:   totalNDVIAlerts,
		TotalProofRecords: totalProofRecords,
	}, nil
}
