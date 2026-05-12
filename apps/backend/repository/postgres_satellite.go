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

type postgresSatelliteRepo struct {
	db *pgxpool.Pool
}

func NewPostgresSatelliteRepo(db *pgxpool.Pool) SatelliteRepository {
	return &postgresSatelliteRepo{db: db}
}

// Create inserts a new satellite observation. plotGeoJSON is the WKT/GeoJSON of the
// plot boundary used to populate the NOT NULL geom column.
func (r *postgresSatelliteRepo) Create(ctx context.Context, obs *domain.SatelliteObservation, plotGeoJSON string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO satellite_observations
			(id, plot_id, source, observed_at, geom, ndvi_mean, ndvi_min, ndvi_max)
		VALUES ($1, $2, $3, $4,
		        ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
		        $6::numeric, $7::numeric, $8::numeric)`,
		obs.ID, obs.PlotID, obs.Source, obs.ObservedAt,
		plotGeoJSON,
		obs.NDVIMean.String(), obs.NDVIMin.String(), obs.NDVIMax.String(),
	)
	if err != nil {
		return domain.ErrInternal(err)
	}
	return nil
}

// LatestForPlot returns the most recent NDVI observation for a given plot.
// Returns (nil, nil) if no observations exist — callers decide whether to block or allow.
func (r *postgresSatelliteRepo) LatestForPlot(ctx context.Context, plotID uuid.UUID) (*domain.SatelliteObservation, error) {
	var obs domain.SatelliteObservation
	var ndviMeanStr, ndviMinStr, ndviMaxStr string

	err := r.db.QueryRow(ctx, `
		SELECT id, plot_id, source, observed_at,
		       ndvi_mean::text, ndvi_min::text, ndvi_max::text,
		       created_at
		FROM satellite_observations
		WHERE plot_id = $1
		ORDER BY observed_at DESC
		LIMIT 1`, plotID).
		Scan(&obs.ID, &obs.PlotID, &obs.Source, &obs.ObservedAt,
			&ndviMeanStr, &ndviMinStr, &ndviMaxStr,
			&obs.CreatedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, domain.ErrInternal(err)
	}

	obs.NDVIMean, _ = decimal.NewFromString(ndviMeanStr)
	obs.NDVIMin, _ = decimal.NewFromString(ndviMinStr)
	obs.NDVIMax, _ = decimal.NewFromString(ndviMaxStr)
	return &obs, nil
}
