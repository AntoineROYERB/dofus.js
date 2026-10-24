package game

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"game-server/internal/types"
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
	island      string
	description string
	// exercises is what the island's ground has to be seen doing somewhere
	// in the match: a line of the log, or "grass" for someone standing in
	// tall grass. Matches are played by the bot, so a change to the bot
	// changes them, and a regenerated seed can stop doing what it was chosen
	// for without anything else noticing.
	exercises string
}{
	{"duel.json", 3, false, "", "two humans, played to a winner and then a rematch", ""},
	{"duel-long.json", 9, false, "", "two humans, a longer fight with turns left to expire", ""},
	{"bot-match.json", 4, true, "", "a lone human against the server's own opponent", ""},
	{"bot-match-rematch.json", 6, true, "", "a bot match, restarted and played again", ""},
	// One fight per island that between them deal every terrain of the
	// library, so each terrain's rule is frozen too. The seeds are ones where
	// the rule actually comes into play: someone hides in the grass, slides,
	// is carried by the wind, eaten by acid, scorched by lava.
	{"island-prairie.json", 31, true, "prairie", "a bot match in the Prairie's tall grass", "grass"},
	{"island-ice.json", 35, false, "ice", "a duel on the Ice island: ice and shallow water", "slides on the ice"},
	{"island-air.json", 32, true, "air", "a bot match on the Air island: air currents and rock", "is carried by the wind"},
	{"island-acid.json", 34, false, "acid", "a duel on the Acid island's pools", "is eaten by the acid"},
	{"island-fire.json", 2, true, "fire", "a bot match on the Fire island, round its lava", "is scorched by the lava"},
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

// Each island's recording has to show its ground at work, or freezing it
// freezes nothing about the ground.
func TestEachIslandRecordingShowsItsGroundAtWork(t *testing.T) {
	for _, match := range goldenMatches {
		if match.exercises == "" {
			continue
		}
		t.Run(match.file, func(t *testing.T) {
			raw, err := os.ReadFile(filepath.Join(goldenDir, match.file))
			if err != nil {
				t.Fatal(err)
			}
			var fixture replayFixture
			if err := json.Unmarshal(raw, &fixture); err != nil {
				t.Fatal(err)
			}
			snapshots, err := ReplaySnapshots(fixture.Recording)
			if err != nil {
				t.Fatal(err)
			}
			if !showsAtWork(snapshots, match.exercises) {
				t.Errorf("%s never shows %q: pick a seed where it does", match.file, match.exercises)
			}
		})
	}
}

func showsAtWork(snapshots []types.GameState, what string) bool {
	for _, snap := range snapshots {
		if what == "grass" {
			grass := map[types.Position]bool{}
			for _, cell := range snap.Ground {
				if cell.Kind == GroundTallGrass {
					grass[cell.Position] = true
				}
			}
			for _, p := range snap.Players {
				if p.Character.IsAlive && p.Character.Position != nil && grass[*p.Character.Position] {
					return true
				}
			}
			continue
		}
		for _, entry := range snap.Log {
			if strings.Contains(entry.Text, what) {
				return true
			}
		}
	}
	return false
}

func writeGoldenMatches(t *testing.T) {
	t.Helper()

	if err := os.MkdirAll(goldenDir, 0o755); err != nil {
		t.Fatalf("creating %s: %v", goldenDir, err)
	}
	for _, match := range goldenMatches {
		g, _ := playRandomMatchOn(t, match.seed, match.withBot, match.island)
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
