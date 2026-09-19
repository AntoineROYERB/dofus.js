package auth

import (
	"context"
	"sync"
	"time"

	"game-server/internal/store"
)

// maxMemoryMatches bounds how many matches memoryUserStore.MatchesForUser
// scans to find the ones claimed by a user. The in-memory match store only
// exists for local development and tests, so this ceiling is generous
// rather than exact.
const maxMemoryMatches = 10_000

// memoryUserStore is the UserStore used when DATABASE_URL is unset. It
// keeps accounts and claims as plain maps and filters the existing
// store.MatchStore's results at read time rather than mirroring Postgres'
// join, since everything here already lives in one process.
type memoryUserStore struct {
	mu      sync.Mutex
	matches store.MatchStore
	byID    map[int64]User
	bySub   map[string]int64
	nextID  int64
	// claimed[userID] is the set of anonymous ids that user has linked.
	claimed map[int64]map[string]bool
}

// NewMemoryUserStore builds the no-database UserStore. matches is the same
// store.MatchStore the server is already using, so claiming reads its
// results rather than duplicating match data.
func NewMemoryUserStore(matches store.MatchStore) UserStore {
	return &memoryUserStore{
		matches: matches,
		byID:    make(map[int64]User),
		bySub:   make(map[string]int64),
		claimed: make(map[int64]map[string]bool),
	}
}

func (m *memoryUserStore) UpsertUser(_ context.Context, googleSub, email, displayName string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if id, ok := m.bySub[googleSub]; ok {
		u := m.byID[id]
		u.Email = email
		u.DisplayName = displayName
		m.byID[id] = u
		return u, nil
	}

	m.nextID++
	u := User{
		ID:          m.nextID,
		GoogleSub:   googleSub,
		Email:       email,
		DisplayName: displayName,
		CreatedAt:   time.Now(),
	}
	m.byID[u.ID] = u
	m.bySub[googleSub] = u.ID
	return u, nil
}

func (m *memoryUserStore) GetUser(_ context.Context, id int64) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.byID[id]
	if !ok {
		return User{}, store.ErrNotFound
	}
	return u, nil
}

func (m *memoryUserStore) ClaimMatches(_ context.Context, userID int64, anonymousID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.claimed[userID] == nil {
		m.claimed[userID] = make(map[string]bool)
	}
	m.claimed[userID][anonymousID] = true
	return nil
}

func (m *memoryUserStore) MatchesForUser(ctx context.Context, userID int64, limit int, cursor string) (store.Page, error) {
	if limit <= 0 {
		limit = 20
	}

	m.mu.Lock()
	claimedIDs := m.claimed[userID]
	m.mu.Unlock()

	page := store.Page{Matches: []store.Summary{}}
	if len(claimedIDs) == 0 {
		return page, nil
	}

	all, err := m.matches.ListMatches(ctx, maxMemoryMatches, "")
	if err != nil {
		return store.Page{}, err
	}

	var filtered []store.Summary
	for _, summary := range all.Matches {
		for _, p := range summary.Players {
			if claimedIDs[p.UserID] {
				filtered = append(filtered, summary)
				break
			}
		}
	}

	start := 0
	if cursor != "" {
		for i, s := range filtered {
			if s.ID == cursor {
				start = i + 1
				break
			}
		}
	}
	end := start + limit
	if end > len(filtered) {
		end = len(filtered)
	}
	if start < len(filtered) {
		page.Matches = append(page.Matches, filtered[start:end]...)
	}
	if end < len(filtered) {
		page.NextCursor = filtered[end-1].ID
	}
	return page, nil
}

func (m *memoryUserStore) Close() error { return nil }

var _ UserStore = (*memoryUserStore)(nil)
