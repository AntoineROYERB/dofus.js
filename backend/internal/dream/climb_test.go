package dream

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"game-server/internal/content"
	"game-server/internal/game"
	"game-server/internal/types"
)

// The climb, played by the server's own bot on both sides, is how a dream's
// numbers are tuned: how hard a floor is is measured, not argued, the way
// the duel's balance is (internal/game/balance_test.go). A party of bots
// climbs from the first floor, always into the middle room, takes the first
// boon offered, and keeps going until it falls. What the test holds is the
// shape of the climb:
//
//   - floors 1 to 4 are won more than 80% of the time;
//   - around floor 10, about half the time (between 30% and 70%);
//   - from floor 20, less than 20% of the time.

const (
	climbsPerParty = 24
	// climbFloors is where a simulated climb stops whatever happens: far
	// enough past the last band to measure it.
	climbFloors = 24
	// fightSteps is far beyond any real fight between teams.
	fightSteps = 20_000
)

// partyOf is who climbs, by party size: champions of different elements, the
// way three friends would pick.
var partyOf = map[int][]string{
	1: {"ashka"},
	2: {"ashka", "mother-brine"},
	3: {"ashka", "sef", "old-grund"},
}

type floorResult struct {
	floor int
	won   bool
	turns int
}

// climb plays one run to its end and reports every floor it fought.
func climb(t *testing.T, cat content.Catalogue, seed int64, champions []string) []floorResult {
	t.Helper()
	boons := make([][]string, len(champions))
	kits := make([]types.Kit, len(champions))
	for i, id := range champions {
		c, _ := cat.Champion(id)
		kits[i], _ = cat.Kit(c.Set)
	}

	var out []floorResult
	for floor := 1; floor <= climbFloors; floor++ {
		offer := FloorOffer(cat, seed, floor, len(champions))
		room := offer.Rooms[len(offer.Rooms)/2]
		opts := FightOptions(cat, room, len(champions), seed*1_000+int64(floor), time.Hour)
		opts.Content = &cat
		g := game.NewWithOptions(opts)
		for i, id := range champions {
			spec := game.BotSpec{Champion: id, Mode: game.BotFights, Level: game.BotNormal, Team: game.TeamParty, Boons: boons[i]}
			if _, err := g.AddBotOf(spec); err != nil {
				t.Fatalf("seed %d floor %d: seating %s: %v", seed, floor, id, err)
			}
		}
		if err := SeatMonsters(g, room); err != nil {
			t.Fatalf("seed %d floor %d: seating the room: %v", seed, floor, err)
		}
		for step := 0; g.Status() == types.StatusPlaying; step++ {
			if step >= fightSteps {
				t.Fatalf("seed %d floor %d: still fighting after %d steps", seed, floor, fightSteps)
			}
			g.PlayBotStep()
		}
		won := g.WinnerTeam() == game.TeamParty
		out = append(out, floorResult{floor: floor, won: won, turns: g.Snapshot().TurnNumber})
		if !won {
			return out
		}
		for i := range champions {
			offer := BoonOffer(cat, seed, floor, i, room.Rarities, boons[i], kits[i], len(champions))
			if len(offer) > 0 {
				boons[i] = append(boons[i], offer[0])
			}
		}
	}
	return out
}

// band is a range of floors and how often they have to be won.
type band struct {
	from, to int
	min, max float64
}

var climbBands = []band{
	{1, 4, 0.80, 1.00},
	{8, 12, 0.30, 0.70},
	{20, climbFloors, 0.00, 0.20},
}

func TestTheClimbGetsHarder(t *testing.T) {
	if testing.Short() {
		t.Skip("plays whole climbs")
	}
	cat := shipped(t)

	var mu sync.Mutex
	all := map[int][]floorResult{}
	t.Run("parties", func(t *testing.T) {
		for size := 1; size <= content.MaxDreamParty; size++ {
			for k := 0; k < climbsPerParty; k++ {
				t.Run(fmt.Sprintf("%d-%d", size, k), func(t *testing.T) {
					t.Parallel()
					results := climb(t, cat, int64(10_000*size+k), partyOf[size])
					mu.Lock()
					all[size] = append(all[size], results...)
					mu.Unlock()
				})
			}
		}
	})
	if t.Failed() {
		return
	}

	var report strings.Builder
	for size := 1; size <= content.MaxDreamParty; size++ {
		fought, won := map[int]int{}, map[int]int{}
		var turns []int
		for _, r := range all[size] {
			fought[r.floor]++
			if r.won {
				won[r.floor]++
			}
			turns = append(turns, r.turns)
		}
		sort.Ints(turns)
		fmt.Fprintf(&report, "party of %d (median fight %d turns):", size, turns[len(turns)/2])
		for floor := 1; floor <= climbFloors; floor++ {
			if fought[floor] > 0 {
				fmt.Fprintf(&report, " %d:%d/%d", floor, won[floor], fought[floor])
			}
		}
		report.WriteString("\n")

		for _, b := range climbBands {
			f, w := 0, 0
			for floor := b.from; floor <= b.to; floor++ {
				f += fought[floor]
				w += won[floor]
			}
			if f < 5 {
				// Too few climbs got that far, or too many did: the band
				// below or above says which.
				continue
			}
			rate := float64(w) / float64(f)
			if rate < b.min || rate > b.max {
				t.Errorf("party of %d wins floors %d-%d %.0f%% of the time (%d of %d), want %.0f%%-%.0f%%",
					size, b.from, b.to, 100*rate, w, f, 100*b.min, 100*b.max)
			}
		}
	}
	t.Logf("floor: won/fought\n%s", report.String())
}
