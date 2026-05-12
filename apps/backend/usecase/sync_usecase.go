package usecase

import (
	"context"

	"github.com/rs/zerolog"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/repository"
)

type SyncUsecase struct {
	syncRepo repository.SyncRepository
	log      zerolog.Logger
}

func NewSyncUsecase(syncRepo repository.SyncRepository, log zerolog.Logger) *SyncUsecase {
	return &SyncUsecase{syncRepo: syncRepo, log: log}
}

// Pull returns all changes since the given timestamp and captures the server
// timestamp BEFORE querying — prevents gaps when records are written during the pull.
func (u *SyncUsecase) Pull(ctx context.Context, since domain.SyncTimestamp) (*domain.PullResponse, error) {
	// Capture server timestamp before query to avoid race-condition gaps
	serverNow := domain.NowSyncTimestamp()

	changes, err := u.syncRepo.Pull(ctx, since)
	if err != nil {
		return nil, err
	}

	totalRecords := len(changes.Farmers.Created) + len(changes.Farmers.Updated) + len(changes.Farmers.Deleted) +
		len(changes.LandPlots.Created) + len(changes.LandPlots.Updated) + len(changes.LandPlots.Deleted) +
		len(changes.Transactions.Created)

	u.log.Info().
		Int64("since_ms", int64(since)).
		Int64("server_ts_ms", int64(serverNow)).
		Int("total_records", totalRecords).
		Msg("sync pull")

	return &domain.PullResponse{
		Timestamp: serverNow,
		Changes:   *changes,
	}, nil
}

// Push applies offline mutations atomically. Returns server IDs for new records
// so the mobile client can reconcile its local WatermelonDB IDs.
func (u *SyncUsecase) Push(ctx context.Context, req *domain.PushRequest) (*domain.PushResponse, *domain.SyncStats, error) {
	resp, stats, err := u.syncRepo.Push(ctx, req)
	if err != nil {
		return nil, nil, err
	}

	u.log.Info().
		Int("farmers_created", stats.FarmersCreated).
		Int("plots_created", stats.PlotsCreated).
		Int("conflicts_server_wins", stats.ConflictsResolved).
		Msg("sync push committed")

	return resp, stats, nil
}
