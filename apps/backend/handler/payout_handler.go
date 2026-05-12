package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/shopspring/decimal"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/usecase"
)

type PayoutHandler struct {
	payoutUC *usecase.PayoutUsecase
	// Account IDs loaded from config at startup
	farmerAccountID   uuid.UUID
	platformAccountID uuid.UUID
	agentAccountID    uuid.UUID
	reserveAccountID  uuid.UUID
}

func NewPayoutHandler(uc *usecase.PayoutUsecase, accounts AccountConfig) *PayoutHandler {
	return &PayoutHandler{
		payoutUC:          uc,
		farmerAccountID:   accounts.FarmerAccountID,
		platformAccountID: accounts.PlatformAccountID,
		agentAccountID:    accounts.AgentAccountID,
		reserveAccountID:  accounts.ReserveAccountID,
	}
}

type AccountConfig struct {
	FarmerAccountID   uuid.UUID
	PlatformAccountID uuid.UUID
	AgentAccountID    uuid.UUID
	ReserveAccountID  uuid.UUID
}

type initiatePayoutRequest struct {
	FarmerID    string `json:"farmer_id"    validate:"required,uuid"`
	// PlotID is optional. When provided, triggers Step 7 Satellite Sentinel NDVI check.
	PlotID      string `json:"plot_id"`
	GrossAmount string `json:"gross_amount" validate:"required"`
	Currency    string `json:"currency"     validate:"required,len=3"`
	Description string `json:"description"`
}

type payoutResponse struct {
	ID             string `json:"id"`
	Status         string `json:"status"`
	GrossAmount    string `json:"gross_amount"`
	Currency       string `json:"currency"`
	IdempotencyKey string `json:"idempotency_key"`
	CreatedAt      string `json:"created_at"`
}

// POST /api/v1/payouts
func (h *PayoutHandler) InitiatePayout(c echo.Context) error {
	var req initiatePayoutRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, map[string]string{
			"code": "INVALID_REQUEST", "message": err.Error(),
		})
	}

	farmerID, err := uuid.Parse(req.FarmerID)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, map[string]string{
			"code": "INVALID_FARMER_ID", "message": "farmer_id must be a valid UUID",
		})
	}

	grossAmount, err := decimal.NewFromString(req.GrossAmount)
	if err != nil || grossAmount.IsNegative() || grossAmount.IsZero() {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, map[string]string{
			"code": "INVALID_AMOUNT", "message": "gross_amount must be a positive decimal string",
		})
	}

	idempotencyKey := c.Request().Header.Get("X-Idempotency-Key")
	actorID, _ := c.Get("user_id").(string)
	initiatedBy, _ := uuid.Parse(actorID)

	var plotIDPtr *uuid.UUID
	if req.PlotID != "" {
		pid, err := uuid.Parse(req.PlotID)
		if err != nil {
			return echo.NewHTTPError(http.StatusUnprocessableEntity, map[string]string{
				"code": "INVALID_PLOT_ID", "message": "plot_id must be a valid UUID",
			})
		}
		plotIDPtr = &pid
	}

	txn, err := h.payoutUC.ExecutePayout(c.Request().Context(), usecase.PayoutRequest{
		IdempotencyKey:    idempotencyKey,
		FarmerID:          farmerID,
		PlotID:            plotIDPtr,
		GrossAmount:       grossAmount,
		Currency:          req.Currency,
		Description:       req.Description,
		InitiatedBy:       initiatedBy,
		FarmerAccountID:   h.farmerAccountID,
		PlatformAccountID: h.platformAccountID,
		AgentAccountID:    h.agentAccountID,
		ReserveAccountID:  h.reserveAccountID,
	})
	if err != nil {
		if de, ok := domain.AsDomainError(err); ok {
			return echo.NewHTTPError(de.HTTPStatus(), map[string]string{
				"code": string(de.Code), "message": de.Message,
			})
		}
		return echo.NewHTTPError(http.StatusInternalServerError, map[string]string{
			"code": "INTERNAL_ERROR", "message": "unexpected error",
		})
	}

	status := http.StatusCreated
	if c.Response().Header().Get("X-Idempotency-Replay") == "true" {
		status = http.StatusOK
	}

	return c.JSON(status, payoutResponse{
		ID:             txn.ID.String(),
		Status:         string(txn.Status),
		GrossAmount:    txn.GrossAmount.String(),
		Currency:       txn.Currency,
		IdempotencyKey: txn.IdempotencyKey,
		CreatedAt:      txn.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	})
}
