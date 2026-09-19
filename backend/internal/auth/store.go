package auth

import (
	"context"
	"time"

	"game-server/internal/store"
)

// User is an account created by signing in with Google.
type User struct {
	ID          int64
	GoogleSub   string
	Email       string
	DisplayName string
	CreatedAt   time.Time
}

// UserStore is where accounts live and where claimed matches are read back
// from. It is a separate interface from store.MatchStore because it is
// account-specific, not match-specific: a match is still saved exactly as
// it is today, under its anonymous player id, and this store only ever adds
// a link on top, never rewrites match data.
type UserStore interface {
	// UpsertUser creates or updates the account for a Google subject,
	// keyed on googleSub (email and display name may change upstream and
	// are not identifiers).
	UpsertUser(ctx context.Context, googleSub, email, displayName string) (User, error)
	GetUser(ctx context.Context, id int64) (User, error)
	// ClaimMatches attaches every match played under anonymousID to
	// userID, additively and idempotently: calling it again for the same
	// pair claims nothing new.
	ClaimMatches(ctx context.Context, userID int64, anonymousID string) error
	// MatchesForUser returns the finished matches claimed by userID, in
	// the same paging shape store.MatchStore.ListMatches uses.
	MatchesForUser(ctx context.Context, userID int64, limit int, cursor string) (store.Page, error)
	Close() error
}
