package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	_ "net/http/pprof" // pprof on a separate listener (:6060), see chapter 10
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func envFloat(k string, d float64) float64 {
	if v, err := strconv.ParseFloat(os.Getenv(k), 64); err == nil {
		return v
	}
	return d
}

// traceHandler wraps slog's JSON handler and adds trace_id/span_id from the context.
type traceHandler struct{ slog.Handler }

func (h traceHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(slog.String("trace_id", sc.TraceID().String()), slog.String("span_id", sc.SpanID().String()))
	}
	return h.Handler.Handle(ctx, r)
}

func (h traceHandler) WithAttrs(a []slog.Attr) slog.Handler {
	return traceHandler{h.Handler.WithAttrs(a)}
}
func (h traceHandler) WithGroup(n string) slog.Handler { return traceHandler{h.Handler.WithGroup(n)} }

// setupOTel configures the SDK from the OTEL_* environment variables (endpoint, service name).
func setupOTel(ctx context.Context) (func(context.Context) error, error) {
	res, err := resource.New(ctx, resource.WithFromEnv(), resource.WithTelemetrySDK())
	if err != nil {
		return nil, err
	}
	te, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, err
	}
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(te), sdktrace.WithResource(res))
	me, err := otlpmetrichttp.New(ctx)
	if err != nil {
		return nil, err
	}
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(me, sdkmetric.WithInterval(5*time.Second))),
		sdkmetric.WithResource(res))
	otel.SetTracerProvider(tp)
	otel.SetMeterProvider(mp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	if err := runtime.Start(); err != nil { // Go runtime metrics: goroutines, heap, GC
		return nil, err
	}
	return func(ctx context.Context) error {
		return errors.Join(tp.Shutdown(ctx), mp.Shutdown(ctx))
	}, nil
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	svc := envOr("OTEL_SERVICE_NAME", "unknown")
	logger := slog.New(traceHandler{slog.NewJSONHandler(os.Stdout, nil)}).With("service", svc)
	slog.SetDefault(logger)

	shutdown, err := setupOTel(ctx)
	if err != nil {
		logger.Error("otel setup failed", "err", err)
		os.Exit(1)
	}

	role := envOr("ROLE", "orders")
	mux := http.NewServeMux()
	switch role {
	case "inventory":
		mux.HandleFunc("GET /reserve", inventoryHandler(envFloat("ERROR_RATE", 0.05), envFloat("SLOW_RATE", 0.05)))
	default:
		mux.HandleFunc("GET /order", ordersHandler(envOr("INVENTORY_URL", "http://inventory:8080")))
	}
	handler := otelhttp.NewHandler(mux, "server", otelhttp.WithSpanNameFormatter(
		func(_ string, r *http.Request) string { return r.Method + " " + r.URL.Path }))

	go func() { _ = http.ListenAndServe(":6060", nil) }() // DefaultServeMux holds pprof only
	srv := &http.Server{Addr: ":8080", Handler: handler}
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
	}()
	logger.Info("listening", "role", role)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		logger.Error("server failed", "err", err)
	}
	sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = shutdown(sctx) // flush spans and metrics before exit
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func ordersHandler(inventory string) http.HandlerFunc {
	meter := otel.Meter("bookcheck.obs.lab")
	processed, _ := meter.Int64Counter("orders.processed", metric.WithUnit("{order}"),
		metric.WithDescription("Number of processed orders"))
	client := &http.Client{Timeout: 3 * time.Second, Transport: otelhttp.NewTransport(http.DefaultTransport)}
	skus := []string{"sku-1", "sku-2", "sku-3"}
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		sku := skus[rand.IntN(len(skus))]
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, inventory+"/reserve?sku="+sku, nil)
		resp, err := client.Do(req) // otelhttp transport: CLIENT span + traceparent header
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if resp.StatusCode >= 500 {
				err = fmt.Errorf("inventory failed (%d)", resp.StatusCode)
			}
		}
		if err != nil {
			slog.ErrorContext(ctx, err.Error())
			processed.Add(ctx, 1, metric.WithAttributes(attribute.String("outcome", "rejected"), attribute.String("sku", sku)))
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		processed.Add(ctx, 1, metric.WithAttributes(attribute.String("outcome", "accepted"), attribute.String("sku", sku)))
		slog.InfoContext(ctx, "order accepted", "sku", sku)
		writeJSON(w, http.StatusOK, map[string]string{"order": "accepted", "sku": sku})
	}
}

func inventoryHandler(errRate, slowRate float64) http.HandlerFunc {
	tracer := otel.Tracer("bookcheck.obs.lab")
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		sku := r.URL.Query().Get("sku")
		// Internal span that simulates a DB query.
		_, db := tracer.Start(ctx, "SELECT stock", trace.WithSpanKind(trace.SpanKindClient),
			trace.WithAttributes(attribute.String("db.system.name", "postgresql"), attribute.String("db.operation.name", "SELECT")))
		time.Sleep(time.Duration(10+rand.IntN(31)) * time.Millisecond)
		if rand.Float64() < slowRate {
			time.Sleep(400 * time.Millisecond)
		}
		db.End()

		if rand.Float64() < errRate {
			err := errors.New("stock backend unavailable")
			trace.SpanFromContext(ctx).RecordError(err)
			trace.SpanFromContext(ctx).SetStatus(codes.Error, err.Error())
			slog.ErrorContext(ctx, err.Error())
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		slog.InfoContext(ctx, "stock reserved", "sku", sku)
		writeJSON(w, http.StatusOK, map[string]string{"reserved": sku})
	}
}
