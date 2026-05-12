package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/finagra/unity/usecase"
)

// MetricsHandler serves the Investor Command Center platform-wide KPI snapshot.
type MetricsHandler struct {
	uc *usecase.MetricsUsecase
}

// NewMetricsHandler constructs a MetricsHandler.
func NewMetricsHandler(uc *usecase.MetricsUsecase) *MetricsHandler {
	return &MetricsHandler{uc: uc}
}

type platformMetricsResponse struct {
	FarmerCount       int    `json:"farmer_count"`
	PlotCount         int    `json:"plot_count"`
	TransactionCount  int    `json:"transaction_count"`
	TotalDisbursed    string `json:"total_disbursed"`
	TotalNDVIAlerts   int    `json:"total_ndvi_alerts"`
	TotalProofRecords int    `json:"total_proof_records"`
}

// GET /api/v1/metrics-platform
func (h *MetricsHandler) Get(c echo.Context) error {
	metrics, err := h.uc.GetPlatformMetrics(c.Request().Context())
	if err != nil {
		return domainHTTPErr(err)
	}

	return c.JSON(http.StatusOK, platformMetricsResponse{
		FarmerCount:       metrics.FarmerCount,
		PlotCount:         metrics.PlotCount,
		TransactionCount:  metrics.TransactionCount,
		TotalDisbursed:    metrics.TotalDisbursed.String(),
		TotalNDVIAlerts:   metrics.TotalNDVIAlerts,
		TotalProofRecords: metrics.TotalProofRecords,
	})
}
