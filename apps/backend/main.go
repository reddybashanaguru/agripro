package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/finagra/unity/config"
	"github.com/finagra/unity/handler"
	"github.com/finagra/unity/middleware"
	"github.com/finagra/unity/observability"
	"github.com/finagra/unity/repository"
	"github.com/finagra/unity/usecase"
)

func main() {
	// ── Structured logging ──────────────────────────────────────
	zerolog.TimeFieldFormat = time.RFC3339
	logger := log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339})
	if os.Getenv("APP_ENV") == "production" {
		logger = zerolog.New(os.Stdout).With().Timestamp().Logger()
	}

	// ── Config ──────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to load config")
	}

	// ── OpenTelemetry (AI-Native Observability) ──────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	otlpEndpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if otlpEndpoint == "" {
		otlpEndpoint = "localhost:4317"
	}
	otelProvider, err := observability.Init(ctx, "finagra-unity", "0.1.0", otlpEndpoint)
	if err != nil {
		// OTel failure is non-fatal — degrade gracefully, log and continue
		logger.Warn().Err(err).Msg("OpenTelemetry init failed — continuing without tracing")
	} else {
		logger.Info().Str("otlp_endpoint", otlpEndpoint).Msg("OpenTelemetry initialized")
	}

	// ── Database ─────────────────────────────────────────────────
	dbCtx, dbCancel := context.WithTimeout(ctx, 10*time.Second)
	defer dbCancel()

	db, err := pgxpool.New(dbCtx, cfg.Database.URL)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to connect to postgres")
	}
	defer db.Close()

	if err := db.Ping(dbCtx); err != nil {
		logger.Fatal().Err(err).Msg("postgres ping failed")
	}
	logger.Info().Str("db", maskConnString(cfg.Database.URL)).Msg("postgres connected")

	// ── Redis ────────────────────────────────────────────────────
	redisOpts, err := redis.ParseURL(cfg.Redis.URL)
	if err != nil {
		logger.Fatal().Err(err).Msg("invalid redis URL")
	}
	rdb := redis.NewClient(redisOpts)
	if err := rdb.Ping(dbCtx).Err(); err != nil {
		logger.Fatal().Err(err).Msg("redis ping failed")
	}
	logger.Info().Msg("redis connected")

	// ── Dependency wiring ─────────────────────────────────────────
	txnRepo := repository.NewPostgresTransactionRepo(db)
	farmerRepo := repository.NewPostgresFarmerRepo(db)
	payoutUC := usecase.NewPayoutUsecase(txnRepo, farmerRepo, logger)
	accounts := handler.AccountConfig{} // populated from DB seed at startup
	payoutHandler := handler.NewPayoutHandler(payoutUC, accounts)
	healthHandler := handler.NewHealthHandler(db, rdb)

	// ── Echo server ───────────────────────────────────────────────
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true

	// Global middleware (order matters)
	e.Use(middleware.CorrelationMiddleware())
	e.Use(middleware.OTelMiddleware("finagra-unity")) // traces every request
	e.Use(echomw.Recover())
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch},
	}))
	e.Use(middleware.AuditMiddleware(logger))
	e.Use(middleware.IdempotencyMiddleware(rdb))

	// Routes
	e.GET("/health/live", healthHandler.Liveness)
	e.GET("/health/ready", healthHandler.Readiness)
	e.GET("/metrics", echo.WrapHandler(promhttp.Handler())) // Prometheus pull endpoint

	v1 := e.Group("/api/v1")
	v1.POST("/payouts", payoutHandler.InitiatePayout)

	// ── Graceful shutdown ─────────────────────────────────────────
	addr := fmt.Sprintf(":%s", cfg.Server.Port)
	logger.Info().Str("addr", addr).Str("env", cfg.Server.Environment).Msg("Finagra Unity API starting")

	go func() {
		if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()

	logger.Info().Msg("graceful shutdown initiated")

	if otelProvider != nil {
		if err := otelProvider.Shutdown(shutdownCtx); err != nil {
			logger.Error().Err(err).Msg("otel shutdown error")
		}
	}
	if err := e.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("http server shutdown error")
	}
}

func maskConnString(url string) string {
	if len(url) < 20 {
		return "***"
	}
	return url[:15] + "***"
}
