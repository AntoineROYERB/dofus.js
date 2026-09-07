package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"game-server/internal/api"
	"game-server/internal/config"
	"game-server/internal/game"
	"game-server/internal/store"
	"game-server/internal/store/memory"
	"game-server/internal/store/postgres"
	"game-server/internal/websocket"
)

func main() {
	reproject := flag.Bool("reproject", false, "rebuild every match's projection from its command log, then exit")
	flag.Parse()

	cfg := config.Load()
	game.ApplyBalance(cfg.Balance)

	matches, err := openStore(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[Store] %v", err)
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
	if cfg.StaticDir != "" {
		mux.Handle("/", spaHandler(cfg.StaticDir))
		log.Printf("[Server] serving %s", cfg.StaticDir)
	}
	// Container orchestrators need something cheap to poll that does not open
	// a WebSocket.
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

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
		log.Printf("[Server] listening on %s (turn %s)", cfg.Addr, cfg.TurnDuration)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[Server] %v", err)
		}
	}()

	<-shutdown
	log.Printf("[Server] shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[Server] forced close: %v", err)
	}
}

// openStore picks the match store to run with. Postgres switches on via
// DATABASE_URL; an empty value keeps the server running as it always has,
// with nothing to persist beyond process lifetime. This is a deliberate
// constraint, not a fallback for a broken config: docker compose up
// --build and go run ./cmd/server have to keep working with no database at
// all.
func openStore(databaseURL string) (store.MatchStore, error) {
	if databaseURL == "" {
		log.Printf("[Store] DATABASE_URL not set, matches are kept in memory only")
		return memory.New(), nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pg, err := postgres.Open(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	log.Printf("[Store] connected to postgres, migrations applied")
	return pg, nil
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
			log.Fatalf("[Reproject] list matches: %v", err)
		}
		for _, m := range page.Matches {
			if err := matches.Reproject(ctx, m.ID); err != nil {
				log.Printf("[Reproject] %s: %v", m.ID, err)
				continue
			}
			total++
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	log.Printf("[Reproject] rebuilt %d match(es)", total)
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
func cors(cfg config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
