package game

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"
)

// Golden recordings. These are real matches — every command in them went
// through the same methods a player's actions go through — frozen on disk and
// replayed on every `go test ./...`. They are the regression test the rules
// never had: change what a spell does by one point and the recorded fight no
// longer reproduces, which is exactly the news you want.
//
// Regenerate with:
//
//	go test ./internal/game -run TestRecordedMatchesStillReplay -update
//
// Do that only when the change to the rules was deliberate, and say so in the
// commit: a regenerated golden file is a claim that the old fight was wrong.

var updateGolden = flag.Bool("update", false, "rewrite the recorded matches in testdata/replays")

const goldenDir = "testdata/replays"

// replayFixture is one recorded match and the state it ended in.
type replayFixture struct {
	Description string    `json:"description"`
	Recording   Recording `json:"recording"`
	// FinalSnapshot is what Snapshot() returned when the match ended. It is
	// the whole snapshot rather than a hash of it so a failure shows which
	// field moved.
	FinalSnapshot json.RawMessage `json:"finalSnapshot"`
}

// goldenMatches names the matches that get frozen. Two seeds against the bot
// and two duels, each played through a rematch, which between them cover every
// command kind the game can record.
var goldenMatches = []struct {
	file        string
	seed        int64
	withBot     bool
	description string
}{
	{"duel.json", 3, false, "two humans, played to a winner and then a rematch"},
	{"duel-long.json", 9, false, "two humans, a longer fight with turns left to expire"},
	{"bot-match.json", 4, true, "a lone human against the server's own opponent"},
	{"bot-match-rematch.json", 6, true, "a bot match, restarted and played again"},
}

func TestRecordedMatchesStillReplay(t *testing.T) {
	if *updateGolden {
		writeGoldenMatches(t)
		return
	}

	for _, match := range goldenMatches {
		t.Run(match.file, func(t *testing.T) {
			path := filepath.Join(goldenDir, match.file)
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("reading %s: %v (regenerate with -update)", path, err)
			}

			var fixture replayFixture
			if err := json.Unmarshal(raw, &fixture); err != nil {
				t.Fatalf("parsing %s: %v", path, err)
			}

			replayed, err := Replay(fixture.Recording)
			if err != nil {
				t.Fatalf("%s no longer replays: %v", match.file, err)
			}
			if want, got := compact(t, fixture.FinalSnapshot), snapshotJSON(t, replayed); want != got {
				t.Errorf("%s replays to a different fight\n recorded: %s\nreplayed: %s", match.file, want, got)
			}
		})
	}
}

func writeGoldenMatches(t *testing.T) {
	t.Helper()

	if err := os.MkdirAll(goldenDir, 0o755); err != nil {
		t.Fatalf("creating %s: %v", goldenDir, err)
	}
	for _, match := range goldenMatches {
		g, _ := playRandomMatch(t, match.seed, match.withBot)
		snapshot, err := json.Marshal(g.Snapshot())
		if err != nil {
			t.Fatalf("marshalling the final snapshot: %v", err)
		}

		encoded, err := json.MarshalIndent(replayFixture{
			Description:   match.description,
			Recording:     g.Recording(),
			FinalSnapshot: snapshot,
		}, "", "  ")
		if err != nil {
			t.Fatalf("marshalling %s: %v", match.file, err)
		}

		path := filepath.Join(goldenDir, match.file)
		if err := os.WriteFile(path, append(encoded, '\n'), 0o644); err != nil {
			t.Fatalf("writing %s: %v", path, err)
		}
		t.Logf("wrote %s (%d commands)", path, len(g.Recording().Commands))
	}
}

func compact(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		t.Fatalf("compacting a recorded snapshot: %v", err)
	}
	return buf.String()
}
