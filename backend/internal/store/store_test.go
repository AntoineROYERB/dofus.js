package store

import (
	"testing"

	"game-server/internal/game"
)

func TestTurnsAndDuration(t *testing.T) {
	rec := game.Recording{
		Commands: []game.Command{
			{Seq: 1, At: 0, Kind: game.CmdJoin},
			{Seq: 2, At: 10, Kind: game.CmdPosition},
			{Seq: 3, At: 100, Kind: game.CmdEndTurn},
			{Seq: 4, At: 150, Kind: game.CmdCast},
			{Seq: 5, At: 200, Kind: game.CmdTimeout},
			{Seq: 6, At: 250, Kind: game.CmdEndTurn},
		},
	}

	turns, durationMS := TurnsAndDuration(rec)
	if turns != 3 {
		t.Errorf("turns = %d, want 3 (end_turn + timeout + end_turn)", turns)
	}
	if durationMS != 250 {
		t.Errorf("durationMS = %d, want 250 (the last command's At)", durationMS)
	}
}

func TestTurnsAndDurationEmpty(t *testing.T) {
	turns, durationMS := TurnsAndDuration(game.Recording{})
	if turns != 0 || durationMS != 0 {
		t.Errorf("got (%d, %d), want (0, 0) for a recording with no commands", turns, durationMS)
	}
}

func TestNewMatchIDIsUnique(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		id := NewMatchID()
		if id == "" {
			t.Fatal("NewMatchID returned an empty string")
		}
		if seen[id] {
			t.Fatalf("NewMatchID produced a duplicate: %s", id)
		}
		seen[id] = true
	}
}
