package observability

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// Provider holds the OTel SDK providers. Call Shutdown on graceful exit.
type Provider struct {
	TracerProvider *sdktrace.TracerProvider
	MeterProvider  *metric.MeterProvider
}

// Tracer returns a named tracer for a given component.
func Tracer(name string) trace.Tracer {
	return otel.Tracer(name)
}

// Init sets up the global OTel TracerProvider and MeterProvider.
// Traces are exported via OTLP/gRPC to the OTel Collector.
// Metrics are exported via the Prometheus pull endpoint (no push needed).
func Init(ctx context.Context, serviceName, serviceVersion, otlpEndpoint string) (*Provider, error) {
	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(serviceVersion),
			semconv.DeploymentEnvironment("production"),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("build otel resource: %w", err)
	}

	// ── Trace exporter: OTLP/gRPC → OTel Collector ───────────────
	traceExporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(otlpEndpoint),
		otlptracegrpc.WithInsecure(), // TLS terminated at collector in prod
	)
	if err != nil {
		return nil, fmt.Errorf("create otlp trace exporter: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter,
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithMaxExportBatchSize(512),
		),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(1.0))),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	// ── Metrics exporter: Prometheus pull (/metrics endpoint) ─────
	promExporter, err := prometheus.New()
	if err != nil {
		return nil, fmt.Errorf("create prometheus exporter: %w", err)
	}
	mp := metric.NewMeterProvider(
		metric.WithReader(promExporter),
		metric.WithResource(res),
	)
	otel.SetMeterProvider(mp)

	return &Provider{TracerProvider: tp, MeterProvider: mp}, nil
}

// Shutdown flushes and stops all OTel exporters. Call on SIGTERM.
func (p *Provider) Shutdown(ctx context.Context) error {
	if err := p.TracerProvider.Shutdown(ctx); err != nil {
		return fmt.Errorf("tracer provider shutdown: %w", err)
	}
	if err := p.MeterProvider.Shutdown(ctx); err != nil {
		return fmt.Errorf("meter provider shutdown: %w", err)
	}
	return nil
}
