package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

// stateTTL is how long a login attempt has to complete the round trip to
// Google and back before its state is forgotten. A login that takes longer
// than this (or a server restart mid-flow) simply fails and can be retried,
// the same trade-off in-memory match rooms already make.
const stateTTL = 10 * time.Minute

// stateEntry is what a single in-flight login attempt needs to remember
// between the redirect to Google and the callback.
type stateEntry struct {
	Verifier       string
	AnonymousToken string
	ExpiresAt      time.Time
}

// stateStore is the CSRF state / PKCE verifier bookkeeping for logins in
// progress. It mirrors websocket.Sessions' style: an in-memory map guarded
// by one mutex, no external dependency.
type stateStore struct {
	mu      sync.Mutex
	entries map[string]stateEntry
}

func newStateStore() *stateStore {
	return &stateStore{entries: make(map[string]stateEntry)}
}

// Create mints a new state value for an in-flight login and remembers the
// PKCE verifier and the anonymous resume token (if any) it was started
// with.
func (s *stateStore) Create(anonymousToken string) (state, verifier string, err error) {
	state, err = randomHex(16)
	if err != nil {
		return "", "", err
	}
	verifier = oauth2.GenerateVerifier()

	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[state] = stateEntry{
		Verifier:       verifier,
		AnonymousToken: anonymousToken,
		ExpiresAt:      time.Now().Add(stateTTL),
	}
	return state, verifier, nil
}

// Consume looks up and removes a state value. A state can only ever be
// consumed once, whether or not it was found or had already expired.
func (s *stateStore) Consume(state string) (stateEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[state]
	delete(s.entries, state)
	if !ok || time.Now().After(entry.ExpiresAt) {
		return stateEntry{}, false
	}
	return entry, true
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
