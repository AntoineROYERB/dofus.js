package memory

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"game-server/internal/store"
)

func TestARunIsKeptAndHandedBack(t *testing.T) {
	s := New()
	ctx := context.Background()
	if _, err := s.GetRun(ctx, "r1"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("an unknown run: %v, want ErrNotFound", err)
	}
	if err := s.SaveRun(ctx, "r1", json.RawMessage(`{"floor":3}`)); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveRun(ctx, "r1", json.RawMessage(`{"floor":4}`)); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetRun(ctx, "r1")
	if err != nil || string(got) != `{"floor":4}` {
		t.Fatalf("GetRun = %s, %v; want the last state saved", got, err)
	}
}

func TestTheLeaderboardRanksHighestFloorThenFewestTurns(t *testing.T) {
	s := New()
	ctx := context.Background()
	at := time.Unix(1_000, 0)
	for _, e := range []store.DreamEntry{
		{RunID: "slow", Size: 1, Floor: 8, Turns: 50, EndedAt: at},
		{RunID: "high", Size: 1, Floor: 9, Turns: 60, EndedAt: at},
		{RunID: "fast", Size: 1, Floor: 8, Turns: 40, EndedAt: at},
		{RunID: "duo", Size: 2, Floor: 20, Turns: 10, EndedAt: at},
	} {
		if err := s.SaveDreamEntry(ctx, e); err != nil {
			t.Fatal(err)
		}
	}
	board, err := s.Leaderboard(ctx, 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, e := range board {
		ids = append(ids, e.RunID)
	}
	if len(ids) != 3 || ids[0] != "high" || ids[1] != "fast" || ids[2] != "slow" {
		t.Fatalf("solo board %v, want high, fast, slow", ids)
	}
	if board, _ := s.Leaderboard(ctx, 1, 1); len(board) != 1 {
		t.Fatalf("a limit of 1 gave %d lines", len(board))
	}
}
