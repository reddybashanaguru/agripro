package middleware

import (
	"fmt"

	"github.com/labstack/echo/v4"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

var (
	httpRequestDuration metric.Float64Histogram
	httpRequestTotal    metric.Int64Counter
)

func init() {
	meter := otel.GetMeterProvider().Meter("finagra.unity.http")
	var err error
	httpRequestDuration, err = meter.Float64Histogram(
		"http.server.request.duration",
		metric.WithDescription("HTTP request duration in milliseconds"),
		metric.WithUnit("ms"),
	)
	if err != nil {
		panic("otel metric init: " + err.Error())
	}
	httpRequestTotal, err = meter.Int64Counter(
		"http.server.requests.total",
		metric.WithDescription("Total HTTP requests"),
	)
	if err != nil {
		panic("otel metric init: " + err.Error())
	}
}

// OTelMiddleware wraps each Echo request in an OTel span and records HTTP metrics.
// Span name follows OpenTelemetry HTTP semantic conventions: "METHOD /path"
func OTelMiddleware(serviceName string) echo.MiddlewareFunc {
	tracer := otel.Tracer(serviceName)

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			req := c.Request()
			ctx := req.Context()

			spanName := fmt.Sprintf("%s %s", req.Method, req.URL.Path)
			ctx, span := tracer.Start(ctx, spanName,
				trace.WithSpanKind(trace.SpanKindServer),
				trace.WithAttributes(
					semconv.HTTPRequestMethodKey.String(req.Method),
					semconv.URLPath(req.URL.Path),
					semconv.ServerAddress(req.Host),
					attribute.String("correlation_id", req.Header.Get("X-Correlation-ID")),
				),
			)
			defer span.End()

			c.SetRequest(req.WithContext(ctx))

			// Inject trace ID into response for client-side correlation
			span.SpanContext().TraceID()
			c.Response().Header().Set("X-Trace-ID", span.SpanContext().TraceID().String())

			err := next(c)

			status := c.Response().Status
			span.SetAttributes(
				semconv.HTTPResponseStatusCode(status),
			)

			attrs := attribute.NewSet(
				semconv.HTTPRequestMethodKey.String(req.Method),
				semconv.URLPath(req.URL.Path),
				semconv.HTTPResponseStatusCode(status),
			)
			httpRequestTotal.Add(ctx, 1, metric.WithAttributeSet(attrs))

			if err != nil {
				span.RecordError(err)
			}

			return err
		}
	}
}
