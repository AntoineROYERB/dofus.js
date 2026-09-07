//go:build integration

// Run with a real Postgres:
//
//	docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
//	TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable \
//	    go test -tags=integration ./internal/store/postgres/...
package postgres

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"game-server/internal/game"
	"game-server/internal/store"
	"game-server/internal/types"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	s, err := Open(ctx, dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	// Each test gets a clean slate rather than its own database, since the
	// migration runner is what is under test as much as the queries are.
	if _, err := s.db.ExecContext(ctx, `TRUNCATE matches, match_commands`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return s
}

// testRecording plays a real bot-vs-human match to completion through the
// game engine (the same shape as game.TestAHumanCanPlayAWholeMatchAgainstTheBot)
// and returns its recording. Hand-writing a valid command log means
// reproducing the engine's own rules about starting cells, turn order and
// phases; playing an actual match sidesteps all of that and is guaranteed
// replayable, which is exactly what these tests need.
func testRecording(t *testing.T) game.Recording {
	t.Helper()
	g := game.NewWithOptions(game.Options{Seed: 3, TurnDuration: time.Minute})

	botID, err := g.AddBot()
	if err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	if err := g.AddPlayer("u1", "Alice", types.CharacterAppearance{Name: "Alice"}); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	pos := g.Snapshot().Players["u1"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("u1", pos); err != nil {
		t.Fatalf("ChooseInitialPosition: %v", err)
	}

	for step := 0; step < 1200 && g.Status() == types.StatusPlaying; step++ {
		if id, isBot := g.CurrentBot(); isBot && id == botID {
			g.PlayBotStep()
			continue
		}
		action := game.DecideBotAction(g.Snapshot(), "u1")
		switch action.Kind {
		case game.BotCast:
			if g.CastSpell("u1", action.SpellID, action.Target) != nil {
				g.EndTurn("u1")
			}
		case game.BotMove:
			if g.Move("u1", action.Target) != nil {
				g.EndTurn("u1")
			}
		default:
			g.EndTurn("u1")
		}
	}
	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q after 1200 steps, want a finished match", g.Status())
	}

	return g.Recording()
}

// commandByUser finds the first command a given user issued of a given
// kind, which is more robust than indexing by position: exactly which seat
// (bot or human) joins first is an implementation detail of AddBot/AddPlayer
// order, not something these tests should hardcode.
func commandByUser(commands []game.Command, userID, kind string) (game.Command, bool) {
	for _, c := range commands {
		if c.UserID == userID && c.Kind == kind {
			return c, true
		}
	}
	return game.Command{}, false
}

func TestSaveAndGetRoundTrip(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	rec := testRecording(t)
	turns, durationMS := store.TurnsAndDuration(rec)
	replayed, err := game.Replay(rec)
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	winner, _ := replayed.Winner()

	m := store.Match{
		ID:         "m1",
		RoomID:     "room-1",
		RoomName:   "Arena",
		StartedAt:  time.UnixMilli(rec.StartedAt),
		EndedAt:    time.UnixMilli(rec.StartedAt + durationMS),
		Winner:     winner,
		Turns:      turns,
		DurationMS: durationMS,
		Players: []store.Player{
			{UserID: "u1", UserName: "Alice"},
		},
		Recording: rec,
	}
	if err := s.SaveMatch(ctx, m); err != nil {
		t.Fatalf("SaveMatch: %v", err)
	}

	summary, err := s.GetSummary(ctx, "m1")
	if err != nil {
		t.Fatalf("GetSummary: %v", err)
	}
	if summary.Winner != winner || summary.Turns != turns || len(summary.Players) != 1 {
		t.Errorf("summary = %+v, want winner %q turns %d", summary, winner, turns)
	}

	got, err := s.GetRecording(ctx, "m1")
	if err != nil {
		t.Fatalf("GetRecording: %v", err)
	}
	if got.Seed != rec.Seed || len(got.Commands) != len(rec.Commands) {
		t.Fatalf("recording = %+v, want seed %d with %d commands", got, rec.Seed, len(rec.Commands))
	}

	// JSONB round-trips through postgres with its own whitespace, so compare
	// decoded values rather than raw bytes.
	joinCmd, ok := commandByUser(got.Commands, "u1", game.CmdJoin)
	if !ok {
		t.Fatalf("no join command for u1 in the round-tripped recording")
	}
	var payload struct {
		UserName string `json:"userName"`
	}
	if err := json.Unmarshal(joinCmd.Payload, &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if payload.UserName != "Alice" {
		t.Errorf("payload.userName = %q, want Alice", payload.UserName)
	}
}

func TestGetMissing(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if _, err := s.GetSummary(ctx, "nope"); err != store.ErrNotFound {
		t.Errorf("GetSummary: got %v, want ErrNotFound", err)
	}
	if _, err := s.GetRecording(ctx, "nope"); err != store.ErrNotFound {
		t.Errorf("GetRecording: got %v, want ErrNotFound", err)
	}
}

func TestListMatchesPages(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	base := time.Now()

	for i, id := range []string{"m1", "m2", "m3"} {
		m := store.Match{
			ID: id, RoomID: "room-1", RoomName: "Arena",
			StartedAt: base, EndedAt: base.Add(time.Duration(i) * time.Minute),
			Winner: "Alice", Recording: testRecording(t),
		}
		if err := s.SaveMatch(ctx, m); err != nil {
			t.Fatalf("SaveMatch %s: %v", id, err)
		}
	}

	page, err := s.ListMatches(ctx, 2, "")
	if err != nil {
		t.Fatalf("ListMatches: %v", err)
	}
	if len(page.Matches) != 2 || page.Matches[0].ID != "m3" || page.Matches[1].ID != "m2" {
		t.Fatalf("page = %+v, want [m3 m2] (newest first)", page.Matches)
	}
	if page.NextCursor != "m2" {
		t.Errorf("NextCursor = %q, want m2", page.NextCursor)
	}

	next, err := s.ListMatches(ctx, 2, page.NextCursor)
	if err != nil {
		t.Fatalf("ListMatches page 2: %v", err)
	}
	if len(next.Matches) != 1 || next.Matches[0].ID != "m1" {
		t.Fatalf("page 2 = %+v, want [m1]", next.Matches)
	}
}

// TestReprojectReproducesTheSameProjection is the acceptance criterion
// verbatim: dropping match_results (here, zeroing the projection columns)
// and reprojecting from match_commands must reproduce it identically.
func TestReprojectReproducesTheSameProjection(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	rec := testRecording(t)
	turns, durationMS := store.TurnsAndDuration(rec)
	replayed, err := game.Replay(rec)
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	winner, _ := replayed.Winner()

	original := store.Match{
		ID: "m1", RoomID: "room-1", RoomName: "Arena",
		StartedAt: time.UnixMilli(rec.StartedAt), EndedAt: time.UnixMilli(rec.StartedAt + durationMS),
		Winner: winner, Turns: turns, DurationMS: durationMS,
		Players:   []store.Player{{UserID: "u1", UserName: "Alice"}},
		Recording: rec,
	}
	if err := s.SaveMatch(ctx, original); err != nil {
		t.Fatalf("SaveMatch: %v", err)
	}

	if _, err := s.db.ExecContext(ctx,
		`UPDATE matches SET winner = '', turns = 0, duration_ms = 0 WHERE id = 'm1'`); err != nil {
		t.Fatalf("zero out projection: %v", err)
	}

	if err := s.Reproject(ctx, "m1"); err != nil {
		t.Fatalf("Reproject: %v", err)
	}

	got, err := s.GetSummary(ctx, "m1")
	if err != nil {
		t.Fatalf("GetSummary: %v", err)
	}
	if got.Turns != original.Turns || got.DurationMS != original.DurationMS || got.Winner != original.Winner {
		t.Errorf("reprojected (winner=%q turns=%d durationMs=%d), want (winner=%q turns=%d durationMs=%d)",
			got.Winner, got.Turns, got.DurationMS, original.Winner, original.Turns, original.DurationMS)
	}
}

func TestMigrateIsIdempotent(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	// Opening twice re-runs migrate() against an already-migrated database.
	s1, err := Open(ctx, dsn)
	if err != nil {
		t.Fatalf("first Open: %v", err)
	}
	defer s1.Close()
	s2, err := Open(ctx, dsn)
	if err != nil {
		t.Fatalf("second Open: %v", err)
	}
	defer s2.Close()
}
