package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"
	"github.com/finagra/unity/usecase"
)

type SatelliteHandler struct {
	uc *usecase.SatelliteUsecase
}

func NewSatelliteHandler(uc *usecase.SatelliteUsecase) *SatelliteHandler {
	return &SatelliteHandler{uc: uc}
}

type seedObservationRequest struct {
	PlotID     string `json:"plot_id"`
	Source     string `json:"source"`
	ObservedAt string `json:"observed_at"` // RFC3339
	NDVIMean   string `json:"ndvi_mean"`
	NDVIMin    string `json:"ndvi_min"`
	NDVIMax    string `json:"ndvi_max"`
}

type satelliteObservationResponse struct {
	ID         string `json:"id"`
	PlotID     string `json:"plot_id"`
	Source     string `json:"source"`
	ObservedAt string `json:"observed_at"`
	NDVIMean   string `json:"ndvi_mean"`
	NDVIMin    string `json:"ndvi_min"`
	NDVIMax    string `json:"ndvi_max"`
	CreatedAt  string `json:"created_at"`
}

// POST /api/v1/satellite/observations
// Seeds a mock NDVI observation for a registered plot. Used in staging/testing
// to simulate Sentinel-2 ingestion before the real satellite pipeline is live.
func (h *SatelliteHandler) Seed(c echo.Context) error {
	var req seedObservationRequest
	if err := c.Bind(&req); err != nil {
		return httpErr(http.StatusBadRequest, "INVALID_REQUEST", err.Error())
	}

	plotID, err := uuid.Parse(req.PlotID)
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_PLOT_ID", "plot_id must be a valid UUID")
	}

	ndviMean, err := decimal.NewFromString(req.NDVIMean)
	if err != nil {
		return httpErr(http.StatusBadRequest, "INVALID_NDVI", "ndvi_mean must be a decimal string (e.g. \"0.65\")")
	}
	ndviMin, _ := decimal.NewFromString(req.NDVIMin)
	ndviMax, _ := decimal.NewFromString(req.NDVIMax)

	observedAt := time.Now().UTC()
	if req.ObservedAt != "" {
		observedAt, err = time.Parse(time.RFC3339, req.ObservedAt)
		if err != nil {
			return httpErr(http.StatusBadRequest, "INVALID_OBSERVED_AT", "observed_at must be RFC3339 format")
		}
	}

	source := req.Source
	if source == "" {
		source = "SENTINEL-2"
	}

	obs, err := h.uc.SeedObservation(c.Request().Context(), usecase.SeedObservationRequest{
		PlotID:     plotID,
		Source:     source,
		ObservedAt: observedAt,
		NDVIMean:   ndviMean,
		NDVIMin:    ndviMin,
		NDVIMax:    ndviMax,
	})
	if err != nil {
		return domainHTTPErr(err)
	}

	return c.JSON(http.StatusCreated, satelliteObservationResponse{
		ID:         obs.ID.String(),
		PlotID:     obs.PlotID.String(),
		Source:     obs.Source,
		ObservedAt: obs.ObservedAt.Format(time.RFC3339),
		NDVIMean:   obs.NDVIMean.String(),
		NDVIMin:    obs.NDVIMin.String(),
		NDVIMax:    obs.NDVIMax.String(),
		CreatedAt:  obs.CreatedAt.Format(time.RFC3339),
	})
}

// GET /api/v1/land-plots/:id/satellite
func (h *SatelliteHandler) GetLatest(c echo.Context) error {
	plotID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_ID", "id must be a valid UUID")
	}

	obs, err := h.uc.GetLatestForPlot(c.Request().Context(), plotID)
	if err != nil {
		return domainHTTPErr(err)
	}
	if obs == nil {
		return httpErr(http.StatusNotFound, "NO_SATELLITE_DATA",
			"no satellite observations found for this plot")
	}

	return c.JSON(http.StatusOK, satelliteObservationResponse{
		ID:         obs.ID.String(),
		PlotID:     obs.PlotID.String(),
		Source:     obs.Source,
		ObservedAt: obs.ObservedAt.Format(time.RFC3339),
		NDVIMean:   obs.NDVIMean.String(),
		NDVIMin:    obs.NDVIMin.String(),
		NDVIMax:    obs.NDVIMax.String(),
		CreatedAt:  obs.CreatedAt.Format(time.RFC3339),
	})
}
