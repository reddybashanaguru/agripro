package handler

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/usecase"
)

type LandPlotHandler struct {
	uc *usecase.LandPlotUsecase
}

func NewLandPlotHandler(uc *usecase.LandPlotUsecase) *LandPlotHandler {
	return &LandPlotHandler{uc: uc}
}

// ── Request/Response types ────────────────────────────────────────────

type createPlotRequest struct {
	FarmerID     string                 `json:"farmer_id"`
	PlotName     string                 `json:"plot_name"`
	Geometry     domain.GeoJSONPolygon  `json:"geometry"`
	SurveyNumber string                 `json:"survey_number"`
	District     string                 `json:"district"`
	State        string                 `json:"state"`
	SoilType     string                 `json:"soil_type"`
}

type plotResponse struct {
	ID           string                 `json:"id"`
	FarmerID     string                 `json:"farmer_id"`
	PlotName     string                 `json:"plot_name"`
	Geometry     domain.GeoJSONPolygon  `json:"geometry"`
	AreaSqM      float64                `json:"area_sqm"`
	AreaAcres    float64                `json:"area_acres"`
	SurveyNumber string                 `json:"survey_number"`
	District     string                 `json:"district"`
	State        string                 `json:"state"`
	SoilType     string                 `json:"soil_type"`
	CreatedAt    string                 `json:"created_at"`
}

type verifyGPSRequest struct {
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
}

type verifyGPSResponse struct {
	PlotID     string  `json:"plot_id"`
	Longitude  float64 `json:"longitude"`
	Latitude   float64 `json:"latitude"`
	IsInside   bool    `json:"is_inside"`
	DistanceM  float64 `json:"distance_to_boundary_m,omitempty"`
	Verdict    string  `json:"verdict"`
}

// ── Handlers ─────────────────────────────────────────────────────────

// POST /api/v1/land-plots
func (h *LandPlotHandler) Create(c echo.Context) error {
	var req createPlotRequest
	if err := c.Bind(&req); err != nil {
		return httpErr(http.StatusBadRequest, "INVALID_REQUEST", err.Error())
	}

	farmerID, err := uuid.Parse(req.FarmerID)
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_FARMER_ID", "farmer_id must be a valid UUID")
	}

	plot, err := h.uc.RegisterPlot(c.Request().Context(), usecase.CreatePlotRequest{
		FarmerID:     farmerID,
		PlotName:     req.PlotName,
		Geometry:     req.Geometry,
		SurveyNumber: req.SurveyNumber,
		District:     req.District,
		State:        req.State,
		SoilType:     req.SoilType,
	})
	if err != nil {
		return domainHTTPErr(err)
	}

	return c.JSON(http.StatusCreated, toPlotResponse(plot))
}

// GET /api/v1/land-plots/:id
func (h *LandPlotHandler) GetByID(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_ID", "id must be a valid UUID")
	}

	plot, err := h.uc.GetPlot(c.Request().Context(), id)
	if err != nil {
		return domainHTTPErr(err)
	}

	return c.JSON(http.StatusOK, toPlotResponse(plot))
}

// GET /api/v1/land-plots?farmer_id=xxx
func (h *LandPlotHandler) ListByFarmer(c echo.Context) error {
	farmerID, err := uuid.Parse(c.QueryParam("farmer_id"))
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_FARMER_ID", "farmer_id query param must be a valid UUID")
	}

	plots, err := h.uc.GetFarmerPlots(c.Request().Context(), farmerID)
	if err != nil {
		return domainHTTPErr(err)
	}

	resp := make([]plotResponse, len(plots))
	for i, p := range plots {
		resp[i] = toPlotResponse(p)
	}
	return c.JSON(http.StatusOK, map[string]any{"plots": resp, "count": len(resp)})
}

// GET /api/v1/land-plots/bbox?min_lon=&min_lat=&max_lon=&max_lat=
func (h *LandPlotHandler) SearchBBox(c echo.Context) error {
	minLon, err1 := strconv.ParseFloat(c.QueryParam("min_lon"), 64)
	minLat, err2 := strconv.ParseFloat(c.QueryParam("min_lat"), 64)
	maxLon, err3 := strconv.ParseFloat(c.QueryParam("max_lon"), 64)
	maxLat, err4 := strconv.ParseFloat(c.QueryParam("max_lat"), 64)
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return httpErr(http.StatusBadRequest, "INVALID_BBOX", "min_lon, min_lat, max_lon, max_lat are required float64 params")
	}

	plots, err := h.uc.SearchByBBox(c.Request().Context(), minLon, minLat, maxLon, maxLat)
	if err != nil {
		return domainHTTPErr(err)
	}

	resp := make([]plotResponse, len(plots))
	for i, p := range plots {
		resp[i] = toPlotResponse(p)
	}
	return c.JSON(http.StatusOK, map[string]any{"plots": resp, "count": len(resp)})
}

// POST /api/v1/land-plots/:id/verify-gps  (Step 6 preview)
func (h *LandPlotHandler) VerifyGPS(c echo.Context) error {
	plotID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_ID", "id must be a valid UUID")
	}

	var req verifyGPSRequest
	if err := c.Bind(&req); err != nil {
		return httpErr(http.StatusBadRequest, "INVALID_REQUEST", err.Error())
	}

	result, err := h.uc.VerifyGPS(c.Request().Context(), usecase.VerifyGPSRequest{
		PlotID:    plotID,
		Longitude: req.Longitude,
		Latitude:  req.Latitude,
	})
	if err != nil {
		return domainHTTPErr(err)
	}

	verdict := "VERIFIED — GPS is inside plot boundary"
	if !result.IsInside {
		verdict = "REJECTED — GPS is outside plot boundary"
	}

	return c.JSON(http.StatusOK, verifyGPSResponse{
		PlotID:    plotID.String(),
		Longitude: result.Longitude,
		Latitude:  result.Latitude,
		IsInside:  result.IsInside,
		DistanceM: result.DistanceM,
		Verdict:   verdict,
	})
}

// ── helpers ──────────────────────────────────────────────────────────

func toPlotResponse(p *domain.LandPlot) plotResponse {
	return plotResponse{
		ID:           p.ID.String(),
		FarmerID:     p.FarmerID.String(),
		PlotName:     p.PlotName,
		Geometry:     p.Geometry,
		AreaSqM:      p.AreaSqM,
		AreaAcres:    p.AreaAcres,
		SurveyNumber: p.SurveyNumber,
		District:     p.District,
		State:        p.State,
		SoilType:     p.SoilType,
		CreatedAt:    p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func httpErr(status int, code, msg string) error {
	return echo.NewHTTPError(status, map[string]string{"code": code, "message": msg})
}

func domainHTTPErr(err error) error {
	if de, ok := domain.AsDomainError(err); ok {
		return httpErr(de.HTTPStatus(), string(de.Code), de.Message)
	}
	return httpErr(http.StatusInternalServerError, "INTERNAL_ERROR", "unexpected error")
}
