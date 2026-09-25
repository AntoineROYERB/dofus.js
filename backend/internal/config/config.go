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
	// SpellsFile, ClassesFile and IslandsFile hold the game's content: every
	// spell, every class with its stats, spell bar and solo opponent, and the
	// islands of the campaign with what they are made of. Unlike the
	// balance file there is no fallback — a missing or invalid file stops the
	// server at startup (see internal/content).
	SpellsFile  string
	ClassesFile string
	IslandsFile string
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
		SpellsFile:     envString("SPELLS_FILE", "config/spells.json"),
		ClassesFile:    envString("CLASSES_FILE", "config/classes.json"),
		IslandsFile:    envString("ISLANDS_FILE", "config/islands.json"),
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
// An entry that names a scheme ("https://example.com", "capacitor://localhost")
// matches that origin and nothing else. An entry that is a bare hostname
// ("example.com") matches the host whatever the scheme, because hosting
// platforms hand out one shape or the other depending on how the value is
// wired up, and rejecting the wrong shape would only produce a WebSocket that
// refuses to connect for no visible reason.
//
// The scheme has to count, now that the mobile shells are on this list: they
// are served from the app bundle as capacitor://localhost on iOS and
// https://localhost on Android. Comparing hosts alone would let either entry
// admit http://localhost, which is the origin of any page an attacker gets
// the victim to open from their own machine.
//
// None of this authenticates anyone. The check exists so a browser cannot be
// used to open a socket from a page the player did not visit; a client that
// is not a browser sends whatever Origin it likes, or none at all. The
// session token is what identifies a player.
func (c Config) OriginAllowed(origin string) bool {
	if origin == "" || c.AllowsAnyOrigin() {
		return true
	}

	host := originHost(origin)
	for _, allowed := range c.AllowedOrigins {
		if strings.EqualFold(allowed, origin) {
			return true
		}
		if hasScheme(allowed) {
			continue
		}
		if host != "" && strings.EqualFold(originHost(allowed), host) {
			return true
		}
	}
	return false
}

// hasScheme reports whether an allow list entry spells out a scheme, and so
// asks to be matched exactly rather than by host.
func hasScheme(value string) bool {
	return strings.Contains(value, "://")
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
