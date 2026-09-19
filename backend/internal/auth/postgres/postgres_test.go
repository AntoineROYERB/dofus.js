//go:build integration

// Run with a real Postgres:
//
//	docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
//	TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable \
//	    go test -tags=integration ./internal/auth/postgres/...
package postgres

import (
	"context"
	"os"
	"testing"
	"time"

	"game-server/internal/store"
	matchpostgres "game-server/internal/store/postgres"
)

// openTestStore migrates through the real store/postgres package (0001 and
// 0002 both apply) and wraps the same pool, exactly as main.go does.
func openTestStore(t *testing.T) (*Store, *matchpostgres.Store) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	matches, err := matchpostgres.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { matches.Close() })

	if _, err := matches.DB().ExecContext(ctx, `TRUNCATE matches, match_commands, users, match_claims`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return New(matches.DB()), matches
}

func TestUpsertUserIsIdempotentOnGoogleSub(t *testing.T) {
	users, _ := openTestStore(t)
	ctx := t.Context()

	first, err := users.UpsertUser(ctx, "sub-1", "a@example.com", "Alice")
	if err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	second, err := users.UpsertUser(ctx, "sub-1", "a-new@example.com", "Alice B")
	if err != nil {
		t.Fatalf("UpsertUser (again): %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("upserting the same google_sub produced different ids: %d vs %d", first.ID, second.ID)
	}
	if second.Email != "a-new@example.com" || second.DisplayName != "Alice B" {
		t.Fatalf("second UpsertUser did not update email/display name: %+v", second)
	}

	got, err := users.GetUser(ctx, first.ID)
	if err != nil {
		t.Fatalf("GetUser: %v", err)
	}
	if got != second {
		t.Fatalf("GetUser = %+v, want %+v", got, second)
	}
}

func TestClaimMatchesAndMatchesForUser(t *testing.T) {
	users, matches := openTestStore(t)
	ctx := t.Context()

	seedMatch(t, matches, "match-a", "anon-1")
	seedMatch(t, matches, "match-b", "anon-2")

	user, err := users.UpsertUser(ctx, "sub-2", "b@example.com", "Bob")
	if err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}

	if err := users.ClaimMatches(ctx, user.ID, "anon-1"); err != nil {
		t.Fatalf("ClaimMatches: %v", err)
	}
	// Claiming again must not error and must not duplicate the claim.
	if err := users.ClaimMatches(ctx, user.ID, "anon-1"); err != nil {
		t.Fatalf("ClaimMatches (again): %v", err)
	}

	page, err := users.MatchesForUser(ctx, user.ID, 20, "")
	if err != nil {
		t.Fatalf("MatchesForUser: %v", err)
	}
	if len(page.Matches) != 1 || page.Matches[0].ID != "match-a" {
		t.Fatalf("MatchesForUser = %+v, want exactly [match-a]", page.Matches)
	}

	// The public projection is untouched by claiming.
	publicPage, err := matches.ListMatches(ctx, 20, "")
	if err != nil {
		t.Fatalf("ListMatches: %v", err)
	}
	if len(publicPage.Matches) != 2 {
		t.Fatalf("public ListMatches = %+v, want both matches still listed", publicPage.Matches)
	}
}

func seedMatch(t *testing.T, matches *matchpostgres.Store, id, anonymousID string) {
	t.Helper()
	m := store.Match{
		ID:        id,
		RoomID:    "room-1",
		RoomName:  "Arena",
		StartedAt: time.Now().Add(-time.Minute),
		EndedAt:   time.Now(),
		Winner:    anonymousID,
		Turns:     3,
		Players:   []store.Player{{UserID: anonymousID, UserName: "Player"}},
	}
	if err := matches.SaveMatch(t.Context(), m); err != nil {
		t.Fatalf("seed SaveMatch: %v", err)
	}
}
