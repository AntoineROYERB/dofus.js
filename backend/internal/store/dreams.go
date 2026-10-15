package store

import (
	"context"
	"encoding/json"
	"sort"
	"time"
)

// Endless Dreams keeps two things beyond a fight: the runs under way, so a
// party can pick its climb back up after the server sleeps, and the
// leaderboard of the highest floors reached.

// DreamEntry is one finished climb on the leaderboard. It is written by the
// server alone, from fights it refereed itself: a client never sends a score.
type DreamEntry struct {
	RunID string `json:"runId"`
	// Size is how many set out: Solo, Duo and Trio are three boards.
	Size int `json:"size"`
	// Floor is the highest floor the party cleared.
	Floor int `json:"floor"`
	// Turns is every turn it fought, the tie-breaker: fewer is better.
	Turns int `json:"turns"`
	// Names and Grimoires are the party's, in seat order.
	Names     []string `json:"names"`
	Grimoires []string `json:"grimoires"`
	// MatchIDs are its fights, in order, each replayable.
	MatchIDs []string  `json:"matchIds"`
	EndedAt  time.Time `json:"endedAt"`
}

// DreamStore keeps runs and the leaderboard.
type DreamStore interface {
	// SaveRun replaces a run's saved state.
	SaveRun(ctx context.Context, id string, state json.RawMessage) error
	// GetRun returns a run's saved state, or ErrNotFound.
	GetRun(ctx context.Context, id string) (json.RawMessage, error)
	SaveDreamEntry(ctx context.Context, e DreamEntry) error
	// Leaderboard is the best climbs of a party size, best first.
	Leaderboard(ctx context.Context, size, limit int) ([]DreamEntry, error)
}

// Store is everything the server keeps.
type Store interface {
	MatchStore
	DreamStore
}

// RankDreamEntries sorts entries best first: higher floor, then fewer turns,
// then whoever got there first.
func RankDreamEntries(entries []DreamEntry) {
	sort.SliceStable(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if a.Floor != b.Floor {
			return a.Floor > b.Floor
		}
		if a.Turns != b.Turns {
			return a.Turns < b.Turns
		}
		return a.EndedAt.Before(b.EndedAt)
	})
}
