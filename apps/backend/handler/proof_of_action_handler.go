package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/finagra/unity/usecase"
)

type ProofOfActionHandler struct {
	uc *usecase.ProofOfActionUsecase
}

func NewProofOfActionHandler(uc *usecase.ProofOfActionUsecase) *ProofOfActionHandler {
	return &ProofOfActionHandler{uc: uc}
}

type submitProofRequest struct {
	FarmerID  string  `json:"farmer_id"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	AccuracyM float64 `json:"accuracy_m"`
	PhotoHash string  `json:"photo_hash"` // SHA-256 hex of field photo
}

type proofOfActionResponse struct {
	ID                  string  `json:"id"`
	PlotID              string  `json:"plot_id"`
	FarmerID            string  `json:"farmer_id"`
	Verdict             string  `json:"verdict"`
	IsInside            bool    `json:"is_inside"`
	DistanceToBoundaryM float64 `json:"distance_to_boundary_m,omitempty"`
	SpoofReason         string  `json:"spoof_reason,omitempty"`
	AccuracyM           float64 `json:"accuracy_m"`
	SubmittedAt         string  `json:"submitted_at"`
}

// POST /api/v1/land-plots/:id/proof-of-action
func (h *ProofOfActionHandler) Submit(c echo.Context) error {
	plotID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_ID", "id must be a valid UUID")
	}

	var req submitProofRequest
	if err := c.Bind(&req); err != nil {
		return httpErr(http.StatusBadRequest, "INVALID_REQUEST", err.Error())
	}

	farmerID, err := uuid.Parse(req.FarmerID)
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_FARMER_ID", "farmer_id must be a valid UUID")
	}
	if req.PhotoHash == "" {
		return httpErr(http.StatusBadRequest, "MISSING_PHOTO_HASH", "photo_hash is required (SHA-256 hex of field photo)")
	}

	proof, err := h.uc.SubmitProof(c.Request().Context(), usecase.SubmitProofRequest{
		PlotID:    plotID,
		FarmerID:  farmerID,
		Longitude: req.Longitude,
		Latitude:  req.Latitude,
		AccuracyM: req.AccuracyM,
		PhotoHash: req.PhotoHash,
	})
	if err != nil {
		return domainHTTPErr(err)
	}

	status := http.StatusCreated
	if proof.Verdict != "VERIFIED" {
		status = http.StatusOK // REJECTED/SPOOFED are successful evaluations, not errors
	}

	return c.JSON(status, proofOfActionResponse{
		ID:                  proof.ID.String(),
		PlotID:              proof.PlotID.String(),
		FarmerID:            proof.FarmerID.String(),
		Verdict:             string(proof.Verdict),
		IsInside:            proof.Verdict == "VERIFIED",
		DistanceToBoundaryM: proof.DistanceToBoundaryM,
		SpoofReason:         proof.SpoofReason,
		AccuracyM:           proof.AccuracyM,
		SubmittedAt:         proof.SubmittedAt.Format("2006-01-02T15:04:05Z07:00"),
	})
}
