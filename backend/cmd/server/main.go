package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"game-server/internal/api"
	"game-server/internal/auth"
	authpostgres "game-server/internal/auth/postgres"
	"game-server/internal/config"
	"game-server/internal/game"
	"game-server/internal/metrics"
	"game-server/internal/store"
	"game-server/internal/store/memory"
	"game-server/internal/store/postgres"
	"game-server/internal/websocket"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	reproject := flag.Bool("reproject", false, "rebuild every match's projection from its command log, then exit")
	flag.Parse()

	cfg := config.Load()
	logger := cfg.NewLogger()
	slog.SetDefault(logger)
	game.ApplyBalance(cfg.Balance)

	matches, err := openStore(cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to open store", "component", "store", "error", err)
		os.Exit(1)
	}
	defer matches.Close()

	if *reproject {
		runReproject(matches)
		return
	}

	hub := websocket.NewHub(cfg, store.NewAsync(matches, 32))
	go hub.Run()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", hub.HandleWebSocket)
	api.RegisterMatchRoutes(mux, matches)
	if cfg.GoogleOAuthConfigured() {
		authSvc := auth.New(auth.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.GoogleRedirectURL,
			CookieSecret: cfg.SessionCookieSecret,
			FrontendURL:  cfg.FrontendURL,
			// ALLOWED_ORIGINS="*" only happens in local/dev setups (it also
			// logs its own warning in config.Load), which is also exactly
			// when the cookie needs to work over plain HTTP; any real
			// deployment sets an explicit origin and gets Secure, which
			// SameSite=None requires anyway.
			CookieSecure: !cfg.AllowsAnyOrigin(),
		}, hub.Sessions(), openUserStore(matches))
		auth.RegisterRoutes(mux, authSvc, cfg.OriginAllowed)
		slog.Info("google sign-in enabled", "component", "auth")
	} else {
		slog.Info("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set, google sign-in is disabled", "component", "auth")
	}
	if cfg.StaticDir != "" {
		mux.Handle("/", spaHandler(cfg.StaticDir))
		slog.Info("serving static frontend", "component", "server", "dir", cfg.StaticDir)
	}
	// Container orchestrators need something cheap to poll that does not open
	// a WebSocket.
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	metricsServer := startMetricsServer(cfg.MetricsAddr)

	server := &http.Server{
		Addr:    cfg.Addr,
		Handler: cors(cfg, mux),
		// No timeouts at all used to be the setting, which leaves a slow or
		// stuck peer holding a connection indefinitely. WriteTimeout stays off:
		// a WebSocket is a long-lived connection, and the write deadlines that
		// matter are set per message in the client's write pump.
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Shut down on SIGINT/SIGTERM rather than being killed mid-write.
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("listening", "component", "server", "addr", cfg.Addr, "turn_duration", cfg.TurnDuration.String())
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("listen failed", "component", "server", "error", err)
			os.Exit(1)
		}
	}()

	<-shutdown
	slog.Info("shutting down", "component", "server")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		slog.Error("forced close", "component", "server", "error", err)
	}
	if metricsServer != nil {
		if err := metricsServer.Shutdown(ctx); err != nil {
			slog.Error("forced close", "component", "metrics", "error", err)
		}
	}
}

// startMetricsServer serves /metrics on its own listener, separate from the
// public one, so a deployment that forwards its whole public port (unlike the
// docker-compose/nginx setup here, which never proxies /metrics at all) does
// not expose it to the internet by accident. An empty addr disables it.
func startMetricsServer(addr string) *http.Server {
	if addr == "" {
		slog.Warn("METRICS_ADDR is empty, /metrics is disabled", "component", "metrics")
		return nil
	}

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(metrics.Registry, promhttp.HandlerOpts{}))
	server := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}

	go func() {
		slog.Info("listening", "component", "metrics", "addr", addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("listen failed", "component", "metrics", "error", err)
		}
	}()
	return server
}

// openStore picks the match store to run with. Postgres switches on via
// DATABASE_URL; an empty value keeps the server running as it always has,
// with nothing to persist beyond process lifetime. This is a deliberate
// constraint, not a fallback for a broken config: docker compose up
// --build and go run ./cmd/server have to keep working with no database at
// all.
func openStore(databaseURL string) (store.MatchStore, error) {
	if databaseURL == "" {
		slog.Info("DATABASE_URL not set, matches are kept in memory only", "component", "store")
		return memory.New(), nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pg, err := postgres.Open(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	slog.Info("connected to postgres, migrations applied", "component", "store")
	return pg, nil
}

// openUserStore picks the account store to run google sign-in against,
// sharing the postgres connection pool matches already opened rather than
// opening a second one. Only called when Google OAuth is configured, so the
// memory fallback here only ever backs a memory match store too.
func openUserStore(matches store.MatchStore) auth.UserStore {
	if pg, ok := matches.(*postgres.Store); ok {
		return authpostgres.New(pg.DB())
	}
	return auth.NewMemoryUserStore(matches)
}

// runReproject rebuilds every match's projection from its command log,
// which is the whole point of keeping the log: match_results (in this
// store, the projection columns on matches) can always be dropped and
// recomputed.
func runReproject(matches store.MatchStore) {
	ctx := context.Background()
	cursor := ""
	total := 0
	for {
		page, err := matches.ListMatches(ctx, 100, cursor)
		if err != nil {
			slog.Error("list matches failed", "component", "reproject", "error", err)
			os.Exit(1)
		}
		for _, m := range page.Matches {
			if err := matches.Reproject(ctx, m.ID); err != nil {
				slog.Error("reproject failed", "component", "reproject", "match_id", m.ID, "error", err)
				continue
			}
			total++
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	slog.Info("rebuilt matches", "component", "reproject", "count", total)
}

// spaHandler serves the built frontend, falling back to index.html so client
// side routes like /lobby survive a reload.
func spaHandler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	index := filepath.Join(dir, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := filepath.Clean(r.URL.Path)
		if _, err := os.Stat(filepath.Join(dir, clean)); err == nil && clean != "/" {
			if strings.HasPrefix(clean, "/assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			files.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, index)
	})
}

// cors answers preflight requests and echoes the configured origin. The old
// middleware always sent Access-Control-Allow-Origin: *, whatever the request.
//
// /auth/* is left untouched: those endpoints read and set the session
// cookie, so they need Access-Control-Allow-Credentials and never a "*"
// origin, which this middleware isn't set up for. auth.RegisterRoutes wraps
// them in its own CORS handling, including answering their own preflight.
func cors(cfg config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/auth/") {
			next.ServeHTTP(w, r)
			return
		}

		origin := r.Header.Get("Origin")
		if cfg.OriginAllowed(origin) {
			if cfg.AllowsAnyOrigin() {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
