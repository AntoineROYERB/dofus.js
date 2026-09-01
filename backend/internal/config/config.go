// Package config reads the server's settings from the environment. Nothing
// here used to be configurable: the port, the CORS policy and the turn length
// were all written into the code, which is workable on a laptop and not much
// use anywhere else.
package config

import (
	"log"
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
}

func Load() Config {
	cfg := Config{
		Addr:           ":" + envString("PORT", "8080"),
		AllowedOrigins: splitOrigins(envString("ALLOWED_ORIGINS", "*")),
		TurnDuration:   time.Duration(envInt("TURN_SECONDS", 45)) * time.Second,
		StaticDir:      envString("STATIC_DIR", ""),
	}

	if cfg.AllowsAnyOrigin() {
		log.Printf("[Config] ALLOWED_ORIGINS is *, every origin may connect")
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
func (c Config) OriginAllowed(origin string) bool {
	if origin == "" || c.AllowsAnyOrigin() {
		return true
	}
	for _, allowed := range c.AllowedOrigins {
		if strings.EqualFold(allowed, origin) {
			return true
		}
	}
	return false
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
		log.Printf("[Config] %s=%q is not a positive integer, using %d", key, raw, fallback)
		return fallback
	}
	return v
}
