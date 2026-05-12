package handler

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/usecase"
)

type SyncHandler struct {
	uc *usecase.SyncUsecase
}

func NewSyncHandler(uc *usecase.SyncUsecase) *SyncHandler {
	return &SyncHandler{uc: uc}
}

// GET /api/v1/sync/pull?since=<unix_ms>
// WatermelonDB pullChanges calls this. since=0 means full sync.
func (h *SyncHandler) Pull(c echo.Context) error {
	sinceStr := c.QueryParam("since")
	var since domain.SyncTimestamp

	if sinceStr != "" {
		ms, err := strconv.ParseInt(sinceStr, 10, 64)
		if err != nil {
			return httpErr(http.StatusBadRequest, "INVALID_SINCE", "since must be a unix millisecond timestamp")
		}
		since = domain.SyncTimestamp(ms)
	}

	resp, err := h.uc.Pull(c.Request().Context(), since)
	if err != nil {
		return domainHTTPErr(err)
	}

	return c.JSON(http.StatusOK, resp)
}

// POST /api/v1/sync/push
// WatermelonDB pushChanges calls this with offline mutations.
func (h *SyncHandler) Push(c echo.Context) error {
	var req domain.PushRequest
	if err := c.Bind(&req); err != nil {
		return httpErr(http.StatusBadRequest, "INVALID_REQUEST", err.Error())
	}

	resp, stats, err := h.uc.Push(c.Request().Context(), &req)
	if err != nil {
		return domainHTTPErr(err)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"server_ids": resp.ServerIDs,
		"stats":      stats,
	})
}
