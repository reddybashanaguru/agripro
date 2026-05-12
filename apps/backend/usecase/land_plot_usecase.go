package usecase

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/repository"
)

// CreatePlotRequest is the input DTO for registering a new land plot.
type CreatePlotRequest struct {
	FarmerID     uuid.UUID
	PlotName     string
	Geometry     domain.GeoJSONPolygon
	SurveyNumber string
	District     string
	State        string
	SoilType     string
}

// VerifyGPSRequest is the input for Step 6 GPS-in-polygon check.
type VerifyGPSRequest struct {
	PlotID    uuid.UUID
	Longitude float64
	Latitude  float64
}

type LandPlotUsecase struct {
	plotRepo   repository.LandPlotRepository
	farmerRepo repository.FarmerRepository
	log        zerolog.Logger
}

func NewLandPlotUsecase(
	plotRepo repository.LandPlotRepository,
	farmerRepo repository.FarmerRepository,
	log zerolog.Logger,
) *LandPlotUsecase {
	return &LandPlotUsecase{plotRepo: plotRepo, farmerRepo: farmerRepo, log: log}
}

// RegisterPlot validates the geometry and creates a land plot.
// Enforces: KYC verified farmer, valid polygon, no double-registration overlap.
func (u *LandPlotUsecase) RegisterPlot(ctx context.Context, req CreatePlotRequest) (*domain.LandPlot, error) {
	// 1. Validate geometry before hitting the DB
	if err := req.Geometry.Validate(); err != nil {
		return nil, err
	}

	// 2. Verify farmer exists and is KYC verified
	farmer, err := u.farmerRepo.FindByID(ctx, req.FarmerID)
	if err != nil {
		return nil, err
	}
	if farmer == nil {
		return nil, domain.ErrNotFound("farmer", req.FarmerID.String())
	}
	if farmer.KYCStatus != domain.KYCVerified {
		return nil, domain.ErrValidation("farmer KYC must be verified before registering land")
	}

	// 3. Check for overlapping plots (prevents double-registration fraud)
	geomBytes, _ := json.Marshal(req.Geometry)
	overlap, err := u.plotRepo.HasOverlap(ctx, req.FarmerID, string(geomBytes))
	if err != nil {
		return nil, err
	}
	if overlap {
		return nil, &domain.DomainError{
			Code:    domain.ErrCodeConflict,
			Message: "this plot boundary overlaps an existing registered plot for this farmer",
		}
	}

	// 4. Build and persist the plot
	plot := &domain.LandPlot{
		ID:           uuid.New(),
		FarmerID:     req.FarmerID,
		PlotName:     req.PlotName,
		Geometry:     req.Geometry,
		SurveyNumber: req.SurveyNumber,
		District:     req.District,
		State:        req.State,
		SoilType:     req.SoilType,
	}

	if err := u.plotRepo.Create(ctx, plot); err != nil {
		return nil, err
	}

	u.log.Info().
		Str("plot_id", plot.ID.String()).
		Str("farmer_id", req.FarmerID.String()).
		Str("district", req.District).
		Float64("area_acres", plot.AreaAcres).
		Msg("land plot registered")

	return plot, nil
}

// VerifyGPS checks if a GPS coordinate falls inside a plot boundary.
// Returns detailed result including distance to boundary if outside.
// This is the core primitive for Step 6 Proof-of-Action.
func (u *LandPlotUsecase) VerifyGPS(ctx context.Context, req VerifyGPSRequest) (*domain.GPSVerificationResult, error) {
	// Validate coordinate ranges
	if req.Longitude < -180 || req.Longitude > 180 {
		return nil, domain.ErrValidation("longitude must be between -180 and 180")
	}
	if req.Latitude < -90 || req.Latitude > 90 {
		return nil, domain.ErrValidation("latitude must be between -90 and 90")
	}

	inside, err := u.plotRepo.ContainsPoint(ctx, req.PlotID, req.Longitude, req.Latitude)
	if err != nil {
		return nil, err
	}

	result := &domain.GPSVerificationResult{
		PlotID:    req.PlotID,
		Longitude: req.Longitude,
		Latitude:  req.Latitude,
		IsInside:  inside,
	}

	// If outside, compute distance to boundary for the field rep's feedback
	if !inside {
		distM, err := u.plotRepo.DistanceToBoundary(ctx, req.PlotID, req.Longitude, req.Latitude)
		if err == nil {
			result.DistanceM = distM
		}
		u.log.Warn().
			Str("plot_id", req.PlotID.String()).
			Float64("lon", req.Longitude).
			Float64("lat", req.Latitude).
			Float64("distance_m", distM).
			Msg("GPS OUTSIDE plot boundary — possible spoof or position error")
	}

	return result, nil
}

func (u *LandPlotUsecase) GetPlot(ctx context.Context, id uuid.UUID) (*domain.LandPlot, error) {
	plot, err := u.plotRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if plot == nil {
		return nil, domain.ErrNotFound("land_plot", id.String())
	}
	return plot, nil
}

func (u *LandPlotUsecase) GetFarmerPlots(ctx context.Context, farmerID uuid.UUID) ([]*domain.LandPlot, error) {
	return u.plotRepo.FindByFarmerID(ctx, farmerID)
}

func (u *LandPlotUsecase) SearchByBBox(ctx context.Context, minLon, minLat, maxLon, maxLat float64) ([]*domain.LandPlot, error) {
	if minLon >= maxLon || minLat >= maxLat {
		return nil, domain.ErrValidation("invalid bounding box: min must be less than max")
	}
	return u.plotRepo.FindInBBox(ctx, minLon, minLat, maxLon, maxLat)
}
