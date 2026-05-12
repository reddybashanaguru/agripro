package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/finagra/unity/domain"
)

type postgresLandPlotRepo struct {
	db *pgxpool.Pool
}

func NewPostgresLandPlotRepo(db *pgxpool.Pool) LandPlotRepository {
	return &postgresLandPlotRepo{db: db}
}

// Create inserts a land plot with PostGIS geometry.
// Geometry is passed as a GeoJSON string and stored as GEOMETRY(Polygon, 4326).
// area_sqm and area_acres are GENERATED ALWAYS columns — never INSERT them.
func (r *postgresLandPlotRepo) Create(ctx context.Context, plot *domain.LandPlot) error {
	geomJSON, err := json.Marshal(plot.Geometry)
	if err != nil {
		return domain.ErrInternal(fmt.Errorf("marshal geometry: %w", err))
	}

	row := r.db.QueryRow(ctx, `
		INSERT INTO land_plots (
			id, farmer_id, plot_name,
			geom,
			soil_type, survey_number, district, state,
			created_at, updated_at
		) VALUES (
			$1, $2, $3,
			ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
			$5, $6, $7, $8,
			NOW(), NOW()
		)
		RETURNING area_sqm, area_acres`,
		plot.ID, plot.FarmerID, plot.PlotName,
		string(geomJSON),
		plot.SoilType, plot.SurveyNumber, plot.District, plot.State,
	)

	// Read PostGIS-computed area back into the domain object
	if err := row.Scan(&plot.AreaSqM, &plot.AreaAcres); err != nil {
		return domain.ErrInternal(fmt.Errorf("insert land plot: %w", err))
	}
	return nil
}

func (r *postgresLandPlotRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.LandPlot, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, farmer_id, plot_name,
		       ST_AsGeoJSON(geom)::text,
		       area_sqm::float8, area_acres::float8,
		       soil_type, survey_number, district, state,
		       created_at, updated_at, deleted_at, last_synced_at
		FROM land_plots
		WHERE id = $1 AND deleted_at IS NULL`, id)
	return scanLandPlot(row)
}

func (r *postgresLandPlotRepo) FindByFarmerID(ctx context.Context, farmerID uuid.UUID) ([]*domain.LandPlot, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, farmer_id, plot_name,
		       ST_AsGeoJSON(geom)::text,
		       area_sqm::float8, area_acres::float8,
		       soil_type, survey_number, district, state,
		       created_at, updated_at, deleted_at, last_synced_at
		FROM land_plots
		WHERE farmer_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC`, farmerID)
	if err != nil {
		return nil, domain.ErrInternal(err)
	}
	defer rows.Close()

	var plots []*domain.LandPlot
	for rows.Next() {
		p, err := scanLandPlot(rows)
		if err != nil {
			return nil, err
		}
		plots = append(plots, p)
	}
	return plots, rows.Err()
}

// FindInBBox uses a two-step spatial query:
// Step 1: && bounding box operator (GIST index hit — O(log N))
// Step 2: ST_Intersects for precise filtering
func (r *postgresLandPlotRepo) FindInBBox(ctx context.Context, minLon, minLat, maxLon, maxLat float64) ([]*domain.LandPlot, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, farmer_id, plot_name,
		       ST_AsGeoJSON(geom)::text,
		       area_sqm::float8, area_acres::float8,
		       soil_type, survey_number, district, state,
		       created_at, updated_at, deleted_at, last_synced_at
		FROM land_plots
		WHERE deleted_at IS NULL
		  AND geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
		  AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
		ORDER BY area_acres DESC`,
		minLon, minLat, maxLon, maxLat)
	if err != nil {
		return nil, domain.ErrInternal(err)
	}
	defer rows.Close()

	var plots []*domain.LandPlot
	for rows.Next() {
		p, err := scanLandPlot(rows)
		if err != nil {
			return nil, err
		}
		plots = append(plots, p)
	}
	return plots, rows.Err()
}

// ContainsPoint uses ST_Contains for exact point-in-polygon test.
// This is the core primitive for Step 6 (GPS field verification).
func (r *postgresLandPlotRepo) ContainsPoint(ctx context.Context, plotID uuid.UUID, lon, lat float64) (bool, error) {
	var inside bool
	err := r.db.QueryRow(ctx, `
		SELECT ST_Contains(
			geom,
			ST_SetSRID(ST_MakePoint($2, $3), 4326)
		)
		FROM land_plots
		WHERE id = $1 AND deleted_at IS NULL`, plotID, lon, lat).Scan(&inside)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, domain.ErrNotFound("land_plot", plotID.String())
		}
		return false, domain.ErrInternal(err)
	}
	return inside, nil
}

// DistanceToBoundary returns metres from a point to the nearest plot boundary.
// Uses ST_Distance on geography type for spherical accuracy.
func (r *postgresLandPlotRepo) DistanceToBoundary(ctx context.Context, plotID uuid.UUID, lon, lat float64) (float64, error) {
	var distM float64
	err := r.db.QueryRow(ctx, `
		SELECT ST_Distance(
			geom::geography,
			ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
		)
		FROM land_plots
		WHERE id = $1 AND deleted_at IS NULL`, plotID, lon, lat).Scan(&distM)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, domain.ErrNotFound("land_plot", plotID.String())
		}
		return 0, domain.ErrInternal(err)
	}
	return distM, nil
}

// HasOverlap prevents double-registration of the same land parcel.
// Uses ST_Intersects so even partial overlap is detected.
func (r *postgresLandPlotRepo) HasOverlap(ctx context.Context, farmerID uuid.UUID, geoJSON string) (bool, error) {
	var overlaps bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM land_plots
			WHERE farmer_id = $1
			  AND deleted_at IS NULL
			  AND ST_Intersects(
			      geom,
			      ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
			  )
		)`, farmerID, geoJSON).Scan(&overlaps)
	if err != nil {
		return false, domain.ErrInternal(err)
	}
	return overlaps, nil
}

// ─── helpers ──────────────────────────────────────────────────────────────

type scannable interface {
	Scan(dest ...any) error
}

func scanLandPlot(row scannable) (*domain.LandPlot, error) {
	var p domain.LandPlot
	var geomJSON string

	err := row.Scan(
		&p.ID, &p.FarmerID, &p.PlotName,
		&geomJSON,
		&p.AreaSqM, &p.AreaAcres,
		&p.SoilType, &p.SurveyNumber, &p.District, &p.State,
		&p.CreatedAt, &p.UpdatedAt, &p.DeletedAt, &p.LastSyncedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, domain.ErrInternal(err)
	}

	if err := json.Unmarshal([]byte(geomJSON), &p.Geometry); err != nil {
		return nil, domain.ErrInternal(fmt.Errorf("unmarshal geometry: %w", err))
	}
	return &p, nil
}
