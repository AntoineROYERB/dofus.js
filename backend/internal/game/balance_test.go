package game

import (
	"sort"
	"testing"
	"time"

	"game-server/internal/config"
	"game-server/internal/content"
	"game-server/internal/types"
)

// Balance, measured. Every class is played against every class by the
// server's own bot, over enough seeded matches that one lucky critical does
// not decide the result, and the shipped numbers have to land inside the
// design's bands. Retuning a spell in spells.json is a change this test gets
// a say in, which is the difference between balance as a property and balance
// as an opinion.
const (
	// matchesPerPairing is per ordered pair of classes; initiative is rolled
	// from the seed, so each side starts about half of them.
	matchesPerPairing = 60
	// maxWinRate is the most any class may win against any other.
	maxWinRate = 0.65
	// The design is "five or six turns". Each class's own band is a little
	// wider than that, because the bot is a blunt instrument — it never
	// retreats and never heals on purpose, so a sustain class drags on — but a
	// three-turn median is the bug this exists to catch.
	minMedianTurns        = 4
	maxMedianTurns        = 8
	minOverallMedianTurns = 5
	maxOverallMedianTurns = 7
	// stepLimit is far beyond any real match; hitting it means a pairing that
	// never ends, two bots walking round each other forever.
	stepLimit = 5000
)

// shippedContent is the content the server loads at startup: the files on
// disk under the balance on disk, not the test defaults.
func shippedContent(t *testing.T) content.Catalogue {
	t.Helper()
	balance := config.LoadBalance("../../config/balance.json")
	cat, err := content.Load(content.Paths{
		Spells:  "../../config/spells.json",
		Classes: "../../config/classes.json",
		Islands: "../../config/islands.json",
	}, balance, ContentBounds())
	if err != nil {
		t.Fatalf("the shipped content does not load:\n%v", err)
	}
	return cat
}

type matchResult struct {
	winner string // class id, "" for a draw
	turns  int
}

// simulateMatch plays two bots of the given classes against each other.
func simulateMatch(t *testing.T, cat content.Catalogue, seed int64, a, b string) matchResult {
	t.Helper()
	g := NewWithOptions(Options{Seed: seed, TurnDuration: time.Hour, Content: &cat})
	ids := map[string]string{}
	for _, class := range []string{a, b} {
		id, err := g.AddBotOfClass(class, BotFights)
		if err != nil {
			t.Fatalf("AddBotOfClass(%s): %v", class, err)
		}
		ids[id] = class
	}
	if g.Status() != types.StatusPlaying {
		t.Fatalf("%s vs %s: status %q once both bots joined, want the fight to start on its own", a, b, g.Status())
	}

	for step := 0; g.Status() == types.StatusPlaying; step++ {
		if step >= stepLimit {
			t.Fatalf("%s vs %s (seed %d): still playing after %d steps, turn %d", a, b, seed, stepLimit, g.Snapshot().TurnNumber)
		}
		if !g.PlayBotStep() {
			// PlayBotStep ends a turn it cannot use; false means nobody holds one.
			if _, ok := g.CurrentBot(); !ok && g.Status() == types.StatusPlaying {
				t.Fatalf("%s vs %s (seed %d): the fight stalled with no bot to act", a, b, seed)
			}
		}
	}

	snap := g.Snapshot()
	result := matchResult{turns: snap.TurnNumber}
	for id, p := range snap.Players {
		if p.Character.IsAlive {
			result.winner = ids[id]
		}
	}
	return result
}

func TestClassBalanceUnderSimulation(t *testing.T) {
	cat := shippedContent(t)
	n := matchesPerPairing
	if testing.Short() {
		n = 10
	}

	wins := map[[2]string]int{}
	played := map[[2]string]int{}
	var lengths []int
	perClassLengths := map[string][]int{}

	for i, a := range cat.Classes {
		for j, b := range cat.Classes {
			for k := 0; k < n; k++ {
				seed := int64(1_000_000 + i*10_000 + j*1_000 + k)
				r := simulateMatch(t, cat, seed, a.ID, b.ID)
				lengths = append(lengths, r.turns)
				perClassLengths[a.ID] = append(perClassLengths[a.ID], r.turns)
				if a.ID == b.ID {
					continue // a mirror says nothing about who is stronger
				}
				played[[2]string{a.ID, b.ID}]++
				played[[2]string{b.ID, a.ID}]++
				if r.winner != "" {
					loser := a.ID
					if r.winner == a.ID {
						loser = b.ID
					}
					wins[[2]string{r.winner, loser}]++
				}
			}
		}
	}

	for _, a := range cat.Classes {
		for _, b := range cat.Classes {
			if a.ID == b.ID {
				continue
			}
			pair := [2]string{a.ID, b.ID}
			rate := float64(wins[pair]) / float64(played[pair])
			draws := played[pair] - wins[pair] - wins[[2]string{b.ID, a.ID}]
			t.Logf("%-12s beats %-12s %5.1f%%  (%d draws in %d)", a.ID, b.ID, rate*100, draws, played[pair])
			if rate > maxWinRate {
				t.Errorf("%s wins %.0f%% of its matches against %s, the ceiling is %.0f%%", a.ID, rate*100, b.ID, maxWinRate*100)
			}
		}
	}

	for _, class := range cat.Classes {
		median := medianOf(perClassLengths[class.ID])
		t.Logf("%-12s median fight %d turns", class.ID, median)
		if median < minMedianTurns || median > maxMedianTurns {
			t.Errorf("%s's fights last a median %d turns, want %d to %d", class.ID, median, minMedianTurns, maxMedianTurns)
		}
	}
	if median := medianOf(lengths); median < minOverallMedianTurns || median > maxOverallMedianTurns {
		t.Errorf("median fight is %d turns, want %d to %d", median, minOverallMedianTurns, maxOverallMedianTurns)
	} else {
		t.Logf("overall median fight %d turns over %d matches", median, len(lengths))
	}
}

func medianOf(values []int) int {
	if len(values) == 0 {
		panic("median of nothing")
	}
	sorted := append([]int(nil), values...)
	sort.Ints(sorted)
	return sorted[len(sorted)/2]
}
