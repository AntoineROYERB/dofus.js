package auth

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// rateLimiter is a fixed-window counter per client address. It exists to
// blunt hammering of the endpoints that talk to Google or mint sessions, not
// to be a precise or distributed limiter — the whole server is a single
// process today, and this matches that.
//
// It trusts r.RemoteAddr as-is rather than X-Forwarded-For: Render
// terminates TLS in front of this process, so every request may share one
// effective address behind that proxy. That is an acceptable first cut for
// low-volume endpoints like login/callback; revisit if it proves too coarse
// in practice.
type rateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	counters map[string]*window
}

type window struct {
	count     int
	expiresAt time.Time
}

func newRateLimiter(limit int, per time.Duration) *rateLimiter {
	return &rateLimiter{limit: limit, window: per, counters: make(map[string]*window)}
}

// Allow reports whether the given key may make one more request in the
// current window, and books it if so.
func (l *rateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	w, ok := l.counters[key]
	if !ok || now.After(w.expiresAt) {
		w = &window{expiresAt: now.Add(l.window)}
		l.counters[key] = w
	}
	if w.count >= l.limit {
		return false
	}
	w.count++
	return true
}

func clientKey(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// rateLimited wraps a handler so it answers 429 once its caller's key has
// used up its allowance for the current window.
func rateLimited(limiter *rateLimiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow(clientKey(r)) {
			w.Header().Set("Retry-After", "60")
			writeError(w, http.StatusTooManyRequests, errTooManyRequests)
			return
		}
		next(w, r)
	}
}
