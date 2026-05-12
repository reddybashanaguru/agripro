package usecase

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/shopspring/decimal"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/repository"
)

type SeedObservationRequest struct {
	PlotID     uuid.UUID
	Source     string
	ObservedAt time.Time
	NDVIMean   decimal.Decimal
	NDVIMin    decimal.Decimal
	NDVIMax    decimal.Decimal
	// GeoJSON of the observed polygon (must match or overlap the registered plot)
	GeoJSON string
}

type SatelliteUsecase struct {
	satelliteRepo repository.SatelliteRepository
	plotRepo      repository.LandPlotRepository
	publisher     EventPublisher
	log           zerolog.Logger
}

func NewSatelliteUsecase(
	satelliteRepo repository.SatelliteRepository,
	plotRepo repository.LandPlotRepository,
	publisher EventPublisher,
	log zerolog.Logger,
) *SatelliteUsecase {
	return &SatelliteUsecase{
		satelliteRepo: satelliteRepo,
		plotRepo:      plotRepo,
		publisher:     publisher,
		log:           log,
	}
}

// SeedObservation persists a mock (or real) NDVI observation for a plot.
// Uses the plot's registered boundary geometry when no explicit GeoJSON is provided.
func (u *SatelliteUsecase) SeedObservation(ctx context.Context, req SeedObservationRequest) (*domain.SatelliteObservation, error) {
	plot, err := u.plotRepo.FindByID(ctx, req.PlotID)
	if err != nil {
		return nil, err
	}
	if plot == nil {
		return nil, domain.ErrNotFound("land_plot", req.PlotID.String())
	}

	if req.NDVIMean.IsNegative() || req.NDVIMean.GreaterThan(decimal.NewFromInt(1)) {
		return nil, domain.ErrValidation("ndvi_mean must be between 0 and 1")
	}

	// Use plot's registered geometry when no override is given
	geoJSON := req.GeoJSON
	if geoJSON == "" {
		b, _ := json.Marshal(plot.Geometry)
		geoJSON = string(b)
	}

	obs := &domain.SatelliteObservation{
		ID:         uuid.New(),
		PlotID:     req.PlotID,
		Source:     req.Source,
		ObservedAt: req.ObservedAt,
		NDVIMean:   req.NDVIMean,
		NDVIMin:    req.NDVIMin,
		NDVIMax:    req.NDVIMax,
	}

	if err := u.satelliteRepo.Create(ctx, obs, geoJSON); err != nil {
		return nil, err
	}

	u.log.Info().
		Str("obs_id", obs.ID.String()).
		Str("plot_id", req.PlotID.String()).
		Str("source", req.Source).
		Str("ndvi_mean", req.NDVIMean.String()).
		Msg("satellite observation seeded")

	// Publish NDVI alert when observation is below the payout-block threshold
	ndviThreshold := decimal.NewFromFloat(0.30)
	if req.NDVIMean.LessThan(ndviThreshold) {
		if evt, err := domain.NewEvent(domain.EventNDVIAlert, domain.NDVIAlertData{
			PlotID:    req.PlotID.String(),
			NDVIMean:  req.NDVIMean.String(),
			Source:    req.Source,
			Threshold: ndviThreshold.String(),
		}); err == nil {
			_ = u.publisher.Publish(ctx, domain.SubjectNDVIAlert, evt)
		}
	}

	return obs, nil
}

// GetLatestForPlot fetches the most recent NDVI observation for a plot.
// Returns (nil, nil) when no data exists — payout layer treats this as "no block".
func (u *SatelliteUsecase) GetLatestForPlot(ctx context.Context, plotID uuid.UUID) (*domain.SatelliteObservation, error) {
	return u.satelliteRepo.LatestForPlot(ctx, plotID)
}
