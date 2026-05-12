package usecase

import (
	"context"

	"github.com/rs/zerolog"
	"github.com/finagra/unity/domain"
	"github.com/finagra/unity/repository"
)

// MetricsUsecase exposes aggregate platform KPIs to the Investor Command Center.
type MetricsUsecase struct {
	metricsRepo repository.MetricsRepository
	log         zerolog.Logger
}

// NewMetricsUsecase constructs a MetricsUsecase with the required repository.
func NewMetricsUsecase(metricsRepo repository.MetricsRepository, log zerolog.Logger) *MetricsUsecase {
	return &MetricsUsecase{metricsRepo: metricsRepo, log: log}
}

// GetPlatformMetrics returns a consistent snapshot of all platform KPIs.
func (u *MetricsUsecase) GetPlatformMetrics(ctx context.Context) (*domain.PlatformMetrics, error) {
	metrics, err := u.metricsRepo.GetPlatformMetrics(ctx)
	if err != nil {
		u.log.Error().Err(err).Msg("failed to fetch platform metrics")
		return nil, err
	}
	return metrics, nil
}
