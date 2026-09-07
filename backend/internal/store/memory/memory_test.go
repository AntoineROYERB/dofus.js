package memory

import (
	"context"
	"testing"
	"time"

	"game-server/internal/game"
	"game-server/internal/store"
)

func testMatch(id string, endedAt time.Time) store.Match {
	return store.Match{
		ID:        id,
		RoomID:    "room-1",
		RoomName:  "Arena",
		StartedAt: endedAt.Add(-time.Minute),
		EndedAt:   endedAt,
		Winner:    "Alice",
		Turns:     4,
		Players: []store.Player{
			{UserID: "u1", UserName: "Alice"},
			{UserID: "u2", UserName: "Bob"},
		},
		Recording: game.Recording{
			Version: game.RecordingVersion,
			Seed:    42,
			Commands: []game.Command{
				{Seq: 1, Kind: game.CmdJoin, UserID: "u1"},
			},
		},
	}
}

func TestSaveAndGet(t *testing.T) {
	s := New()
	ctx := context.Background()
	m := testMatch("m1", time.Now())

	if err := s.SaveMatch(ctx, m); err != nil {
		t.Fatalf("SaveMatch: %v", err)
	}

	summary, err := s.GetSummary(ctx, "m1")
	if err != nil {
		t.Fatalf("GetSummary: %v", err)
	}
	if summary.Winner != "Alice" || summary.RoomName != "Arena" || len(summary.Players) != 2 {
		t.Errorf("summary = %+v, want winner Alice, room Arena, 2 players", summary)
	}

	rec, err := s.GetRecording(ctx, "m1")
	if err != nil {
		t.Fatalf("GetRecording: %v", err)
	}
	if rec.Seed != 42 || len(rec.Commands) != 1 {
		t.Errorf("recording = %+v, want seed 42 with 1 command", rec)
	}
}

func TestGetMissing(t *testing.T) {
	s := New()
	ctx := context.Background()

	if _, err := s.GetSummary(ctx, "nope"); err != store.ErrNotFound {
		t.Errorf("GetSummary on missing id: got %v, want ErrNotFound", err)
	}
	if _, err := s.GetRecording(ctx, "nope"); err != store.ErrNotFound {
		t.Errorf("GetRecording on missing id: got %v, want ErrNotFound", err)
	}
	if err := s.Reproject(ctx, "nope"); err != store.ErrNotFound {
		t.Errorf("Reproject on missing id: got %v, want ErrNotFound", err)
	}
}

func TestListMatchesNewestFirstAndPaged(t *testing.T) {
	s := New()
	ctx := context.Background()
	base := time.Now()
	for i, id := range []string{"m1", "m2", "m3"} {
		if err := s.SaveMatch(ctx, testMatch(id, base.Add(time.Duration(i)*time.Minute))); err != nil {
			t.Fatalf("SaveMatch %s: %v", id, err)
		}
	}

	page, err := s.ListMatches(ctx, 2, "")
	if err != nil {
		t.Fatalf("ListMatches: %v", err)
	}
	if len(page.Matches) != 2 || page.Matches[0].ID != "m3" || page.Matches[1].ID != "m2" {
		t.Fatalf("first page = %+v, want [m3 m2]", page.Matches)
	}
	if page.NextCursor != "m2" {
		t.Errorf("NextCursor = %q, want m2", page.NextCursor)
	}

	next, err := s.ListMatches(ctx, 2, page.NextCursor)
	if err != nil {
		t.Fatalf("ListMatches page 2: %v", err)
	}
	if len(next.Matches) != 1 || next.Matches[0].ID != "m1" {
		t.Fatalf("second page = %+v, want [m1]", next.Matches)
	}
	if next.NextCursor != "" {
		t.Errorf("NextCursor on last page = %q, want empty", next.NextCursor)
	}
}

func TestSaveMatchOverwritesSameID(t *testing.T) {
	s := New()
	ctx := context.Background()
	m := testMatch("m1", time.Now())
	if err := s.SaveMatch(ctx, m); err != nil {
		t.Fatalf("SaveMatch: %v", err)
	}
	m.Winner = "Bob"
	if err := s.SaveMatch(ctx, m); err != nil {
		t.Fatalf("SaveMatch (update): %v", err)
	}

	page, err := s.ListMatches(ctx, 10, "")
	if err != nil {
		t.Fatalf("ListMatches: %v", err)
	}
	if len(page.Matches) != 1 {
		t.Fatalf("expected re-saving the same ID not to duplicate it, got %d matches", len(page.Matches))
	}
	if page.Matches[0].Winner != "Bob" {
		t.Errorf("Winner = %q, want Bob (the update)", page.Matches[0].Winner)
	}
}
