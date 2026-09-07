// Package config reads the server's settings from the environment. Nothing
// here used to be configurable: the port, the CORS policy and the turn length
// were all written into the code, which is workable on a laptop and not much
// use anywhere else.
package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// Addr is the listen address, e.g. ":8080".
	Addr string
	// AllowedOrigins restricts who may open a WebSocket. A single "*" allows
	// everyone, which is fine for local development and not for a public
	// deployment.
	AllowedOrigins []string
	// TurnDuration is how long a player has before their turn is passed on.
	TurnDuration time.Duration
	// StaticDir, when set, makes this binary serve the built frontend as well,
	// so a deployment is one container instead of two.
	StaticDir string
	// BalanceFile points at the JSON file holding gameplay constants (health,
	// action points, movement points). A missing file just means defaults.
	BalanceFile string
	// Balance is what BalanceFile resolved to — loaded once, here, rather
	// than wherever a room happens to be created.
	Balance Balance
	// DatabaseURL, when set, switches match persistence from the in-memory
	// store to Postgres. Empty means no database: the game must run
	// without one, so this is a deliberate default, not a missing
	// feature.
	DatabaseURL string
	// LogFormat selects the slog handler: "json" (default, for production
	// log aggregation) or "text" (easier to read while developing).
	LogFormat string
	// LogLevel is the minimum slog level: debug, info, warn or error.
	LogLevel string
	// MetricsAddr is the listen address for the /metrics endpoint, served on
	// its own http.Server rather than the public one. It defaults to
	// loopback-only so a deployment that forwards its whole public port
	// (unlike the docker-compose/nginx setup, which never proxies /metrics
	// at all) does not expose it by accident. Empty disables metrics.
	MetricsAddr string
}

func Load() Config {
	cfg := Config{
		Addr:           ":" + envString("PORT", "8080"),
		AllowedOrigins: splitOrigins(envString("ALLOWED_ORIGINS", "*")),
		TurnDuration:   time.Duration(envInt("TURN_SECONDS", 45)) * time.Second,
		StaticDir:      envString("STATIC_DIR", ""),
		BalanceFile:    envString("BALANCE_FILE", "config/balance.json"),
		DatabaseURL:    envString("DATABASE_URL", ""),
		LogFormat:      envString("LOG_FORMAT", "json"),
		LogLevel:       envString("LOG_LEVEL", "info"),
		MetricsAddr:    envString("METRICS_ADDR", "127.0.0.1:9090"),
	}
	cfg.Balance = LoadBalance(cfg.BalanceFile)

	if cfg.AllowsAnyOrigin() {
		slog.Warn("every origin may connect", "component", "config", "allowed_origins", "*")
	}
	return cfg
}

// AllowsAnyOrigin reports whether the origin check is effectively disabled.
func (c Config) AllowsAnyOrigin() bool {
	for _, o := range c.AllowedOrigins {
		if o == "*" {
			return true
		}
	}
	return false
}

// OriginAllowed matches an Origin header against the allow list. A request
// without an Origin is not a browser request and is let through.
//
// Entries may be full origins ("https://example.com") or bare hostnames
// ("example.com"): hosting platforms hand out one or the other depending on
// how the value is wired up, and rejecting the wrong shape would only produce
// a WebSocket that refuses to connect for no visible reason.
func (c Config) OriginAllowed(origin string) bool {
	if origin == "" || c.AllowsAnyOrigin() {
		return true
	}

	host := originHost(origin)
	for _, allowed := range c.AllowedOrigins {
		if strings.EqualFold(allowed, origin) {
			return true
		}
		if host != "" && strings.EqualFold(originHost(allowed), host) {
			return true
		}
	}
	return false
}

// originHost reduces an origin or a bare hostname to its host, dropping any
// scheme and path.
func originHost(value string) string {
	host := value
	if i := strings.Index(host, "://"); i >= 0 {
		host = host[i+3:]
	}
	if i := strings.IndexAny(host, "/?#"); i >= 0 {
		host = host[:i]
	}
	return strings.TrimSpace(host)
}

func splitOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}
	if len(origins) == 0 {
		return []string{"*"}
	}
	return origins
}

func envString(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		slog.Warn("not a positive integer, using fallback", "component", "config", "key", key, "value", raw, "fallback", fallback)
		return fallback
	}
	return v
}
