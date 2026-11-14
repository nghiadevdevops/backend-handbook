package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"
)

var version = "dev" // overridden via -ldflags "-X main.version=..."

func newMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"status": "ok", "version": version, "go": runtime.Version(), "uid": os.Getuid(),
		})
	})
	// /slow?ms=3000 simulates an in-flight request, used by the graceful shutdown lab.
	mux.HandleFunc("GET /slow", func(w http.ResponseWriter, r *http.Request) {
		d, err := time.ParseDuration(r.URL.Query().Get("ms") + "ms")
		if err != nil {
			d = time.Second
		}
		select {
		case <-time.After(d):
			fmt.Fprintf(w, "done after %s\n", d)
		case <-r.Context().Done():
		}
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"hello": "bookcheck-deploy", "version": version})
	})
	return mux
}

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe /healthz and exit 0 or 1 (no curl in distroless)")
	flag.Parse()
	addr := ":8080"
	if *healthcheck {
		c := http.Client{Timeout: 2 * time.Second}
		resp, err := c.Get("http://127.0.0.1:8080/healthz")
		if err != nil || resp.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}

	srv := &http.Server{Addr: addr, Handler: newMux(), ReadHeaderTimeout: 5 * time.Second}
	// Cancel ctx when SIGTERM (docker stop, Kubernetes) or SIGINT arrives.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	go func() {
		slog.Info("listening", "addr", addr, "version", version)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("SIGTERM received, draining")
	sctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil { // stops accepting, waits for in-flight requests
		slog.Error("shutdown timed out", "err", err)
		os.Exit(1)
	}
	slog.Info("shutdown complete")
}
