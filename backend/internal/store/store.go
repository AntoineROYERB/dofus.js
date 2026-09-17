// Package store persists finished matches. A match is, per
// game.Recording, a seed and the ordered list of commands the game
// accepted — the log is the source of truth, and everything else (winner,
// turn count, duration) is a projection over it that a store implementation
// may cache but must be able to rebuild.
package store

import (
	"context"
	cryptorand "crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"game-server/internal/game"
)

// ErrNotFound is returned by GetSummary and GetRecording when no match has
// that ID.
var ErrNotFound = errors.New("match not found")

// NewMatchID mints an ID for a newly finished match, the same way lobby
// room IDs are minted: random bytes, not a counter, so two servers saving
// concurrently never collide.
func NewMatchID() string {
	var buf [12]byte
	if _, err := cryptorand.Read(buf[:]); err != nil {
		return fmt.Sprintf("m%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf[:])
}

// Player is who was in a finished match, independent of the room's current
// (possibly empty) membership.
type Player struct {
	UserID   string `json:"userId"`
	UserName string `json:"userName"`
	IsBot    bool   `json:"isBot"`
}

// Match is a finished match as saved: the projection fields a list view or
// result page needs, plus the recording a replay needs. Callers that only
// want the projection use Summary; SaveMatch takes the whole thing so a
// store never has to choose between them.
type Match struct {
	ID         string
	RoomID     string
	RoomName   string
	StartedAt  time.Time
	EndedAt    time.Time
	Winner     string
	Turns      int
	DurationMS int64
	Players    []Player
	Recording  game.Recording
}

// Summary returns the projection half of a Match, what ListMatches and
// GetSummary hand back.
func (m Match) Summary() Summary {
	return Summary{
		ID:         m.ID,
		RoomID:     m.RoomID,
		RoomName:   m.RoomName,
		StartedAt:  m.StartedAt,
		EndedAt:    m.EndedAt,
		Winner:     m.Winner,
		Turns:      m.Turns,
		DurationMS: m.DurationMS,
		Players:    m.Players,
	}
}

// Summary is a finished match's result, without the recording. It is what
// match_results projects the command log into.
type Summary struct {
	ID         string    `json:"id"`
	RoomID     string    `json:"roomId"`
	RoomName   string    `json:"roomName"`
	StartedAt  time.Time `json:"startedAt"`
	EndedAt    time.Time `json:"endedAt"`
	Winner     string    `json:"winner"`
	Turns      int       `json:"turns"`
	DurationMS int64     `json:"durationMs"`
	Players    []Player  `json:"players"`
}

// Page is one page of ListMatches. NextCursor is empty once there is
// nothing more to fetch.
type Page struct {
	Matches    []Summary `json:"matches"`
	NextCursor string    `json:"nextCursor"`
}

// TurnsAndDuration derives the turn count and match duration from a
// recording's command log. SaveMatch's caller and Reproject both use this,
// so a rebuilt projection always agrees with the one computed live.
func TurnsAndDuration(rec game.Recording) (turns int, durationMS int64) {
	for _, cmd := range rec.Commands {
		if cmd.Kind == game.CmdEndTurn || cmd.Kind == game.CmdTimeout {
			turns++
		}
	}
	if n := len(rec.Commands); n > 0 {
		durationMS = rec.Commands[n-1].At
	}
	return turns, durationMS
}

// MatchStore is how a finished match gets saved, and how the read side (an
// HTTP API today, replay tomorrow) gets it back.
//
// SaveMatch must be safe to call from the hub's single goroutine without
// stalling it: an implementation that talks to a network service should
// not do so on the caller's goroutine. See Async, which wraps any
// MatchStore to make that true regardless of the implementation.
type MatchStore interface {
	SaveMatch(ctx context.Context, m Match) error
	ListMatches(ctx context.Context, limit int, cursor string) (Page, error)
	GetSummary(ctx context.Context, id string) (Summary, error)
	GetRecording(ctx context.Context, id string) (game.Recording, error)

	// Reproject rebuilds the stored projection (winner, turn count,
	// duration) for one match by replaying its command log. Dropping
	// match_results and reprojecting every match must reproduce it
	// identically, because that is what makes the log the source of
	// truth rather than the projection.
	Reproject(ctx context.Context, id string) error

	Close() error
}
