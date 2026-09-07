// Package memory is the MatchStore used when no DATABASE_URL is set. The
// game must run with no database, so this is the default, not a fallback
// bolted on afterwards.
package memory

import (
	"context"
	"sync"

	"game-server/internal/game"
	"game-server/internal/store"
)

// Store keeps every finished match in memory. Nothing here survives a
// restart, which is the same trade the rest of the server already makes for
// rooms.
type Store struct {
	mu      sync.RWMutex
	matches map[string]store.Match
	order   []string // insertion order, most recent last
}

func New() *Store {
	return &Store{matches: make(map[string]store.Match)}
}

func (s *Store) SaveMatch(_ context.Context, m store.Match) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.matches[m.ID]; !exists {
		s.order = append(s.order, m.ID)
	}
	s.matches[m.ID] = m
	return nil
}

// ListMatches returns the most recently finished matches first. The cursor
// is the ID to resume after, matching the postgres implementation's
// keyset-style paging.
func (s *Store) ListMatches(_ context.Context, limit int, cursor string) (store.Page, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Newest first.
	ids := make([]string, len(s.order))
	for i, id := range s.order {
		ids[len(s.order)-1-i] = id
	}

	start := 0
	if cursor != "" {
		for i, id := range ids {
			if id == cursor {
				start = i + 1
				break
			}
		}
	}
	if limit <= 0 {
		limit = 20
	}

	end := start + limit
	if end > len(ids) {
		end = len(ids)
	}

	// A non-nil empty slice, not nil: this becomes JSON, and "matches": []
	// is what a list response should say when there is nothing to list —
	// "matches": null reads as an error to every client that isn't Go.
	page := store.Page{Matches: []store.Summary{}}
	for _, id := range ids[start:end] {
		page.Matches = append(page.Matches, s.matches[id].Summary())
	}
	if end < len(ids) {
		page.NextCursor = ids[end-1]
	}
	return page, nil
}

func (s *Store) GetSummary(_ context.Context, id string) (store.Summary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.matches[id]
	if !ok {
		return store.Summary{}, store.ErrNotFound
	}
	return m.Summary(), nil
}

func (s *Store) GetRecording(_ context.Context, id string) (game.Recording, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.matches[id]
	if !ok {
		return game.Recording{}, store.ErrNotFound
	}
	return m.Recording, nil
}

// Reproject is a no-op: the in-memory store keeps the projection and the
// recording in the same struct, so they can never drift apart. Postgres is
// where a real rebuild is needed.
func (s *Store) Reproject(_ context.Context, id string) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.matches[id]; !ok {
		return store.ErrNotFound
	}
	return nil
}

func (s *Store) Close() error { return nil }

var _ store.MatchStore = (*Store)(nil)
