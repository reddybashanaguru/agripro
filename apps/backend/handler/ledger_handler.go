package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/finagra/unity/usecase"
)

type LedgerHandler struct {
	uc *usecase.LedgerUsecase
}

func NewLedgerHandler(uc *usecase.LedgerUsecase) *LedgerHandler {
	return &LedgerHandler{uc: uc}
}

type ledgerBalanceResponse struct {
	TotalDebit   string `json:"total_debit"`
	TotalCredit  string `json:"total_credit"`
	IsBalanced   bool   `json:"is_balanced"`
	EntryCount   int    `json:"entry_count"`
	TxnCount     int    `json:"transaction_count"`
}

type journalEntryResponse struct {
	ID          string `json:"id"`
	TxnID       string `json:"txn_id"`
	AccountID   string `json:"account_id"`
	EntryType   string `json:"entry_type"`
	Amount      string `json:"amount"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
}

// GET /api/v1/ledger/balance
func (h *LedgerHandler) GlobalBalance(c echo.Context) error {
	balance, err := h.uc.GlobalBalance(c.Request().Context())
	if err != nil {
		return domainHTTPErr(err)
	}

	return c.JSON(http.StatusOK, ledgerBalanceResponse{
		TotalDebit:  balance.TotalDebit.String(),
		TotalCredit: balance.TotalCredit.String(),
		IsBalanced:  balance.IsBalanced,
		EntryCount:  balance.EntryCount,
		TxnCount:    balance.TxnCount,
	})
}

// GET /api/v1/payouts/:id/entries
func (h *LedgerHandler) EntriesForTransaction(c echo.Context) error {
	txnID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httpErr(http.StatusUnprocessableEntity, "INVALID_ID", "id must be a valid UUID")
	}

	entries, err := h.uc.EntriesForTransaction(c.Request().Context(), txnID)
	if err != nil {
		return domainHTTPErr(err)
	}

	resp := make([]journalEntryResponse, len(entries))
	for i, e := range entries {
		resp[i] = journalEntryResponse{
			ID:          e.ID.String(),
			TxnID:       e.TxnID.String(),
			AccountID:   e.AccountID.String(),
			EntryType:   string(e.EntryType),
			Amount:      e.Amount.String(),
			Description: e.Description,
			CreatedAt:   e.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"txn_id":  txnID.String(),
		"entries": resp,
		"count":   len(resp),
	})
}
