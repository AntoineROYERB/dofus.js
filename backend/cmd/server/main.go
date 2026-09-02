package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"game-server/internal/config"
	"game-server/internal/websocket"
)

func main() {
	cfg := config.Load()

	hub := websocket.NewHub(cfg)
	go hub.Run()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", hub.HandleWebSocket)
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
