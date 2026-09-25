package game

import (
	"errors"
	"math/rand"
	"reflect"
	"testing"

	"game-server/internal/types"
)

// groundOn lays island ground on cells of a seated game, for a test about
// that ground alone.
func groundOn(g *Game, kind string, wind *types.Position, cells ...types.Position) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.ground == nil {
		g.ground = map[types.Position]types.GroundCell{}
	}
	for _, at := range cells {
		g.ground[at] = types.GroundCell{Position: at, Kind: kind, Wind: wind}
	}
}

func place(g *Game, id string, at types.Position) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.setPositionLocked(id, at)
}

func hp(g *Game, id string) int { return character(g, id).Health }

func endTurn(t *testing.T, g *Game, id string) {
	t.Helper()
	if err := g.EndTurn(id); err != nil {
		t.Fatalf("EndTurn(%s): %v", id, err)
	}
}

// ---------------------------------------------------------------------------
// The library and the catalogue name the same terrains.
// ---------------------------------------------------------------------------

func TestEveryTerrainOfTheCatalogueHasARule(t *testing.T) {
	inCatalogue := map[string]bool{}
	for _, terrain := range Content().Terrains {
		inCatalogue[terrain.ID] = true
		if _, ok := GroundRuleFor(terrain.ID); !ok {
			t.Errorf("islands.json lists %s, which has no rule in ground.go", terrain.ID)
		}
	}
	for _, id := range GroundRuleIDs() {
		if !inCatalogue[id] {
			t.Errorf("ground.go has a rule for %s, which islands.json does not list", id)
		}
	}
}

// ---------------------------------------------------------------------------
// One test per terrain.
// ---------------------------------------------------------------------------

func TestTallGrassHidesFromMoreThanTwoCellsAway(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 4, Y: 0})
	groundOn(g, GroundTallGrass, nil, types.Position{X: 0, Y: 0})

	seen := g.SnapshotFor("b").Players["a"].Character
	if seen.Position != nil || !seen.Concealed {
		t.Fatalf("from 4 cells, a in tall grass is shown at %+v (concealed %v), want hidden", seen.Position, seen.Concealed)
	}
	if own := g.SnapshotFor("a").Players["a"].Character; own.Position == nil || own.Concealed {
		t.Error("a is hidden from itself")
	}
	if g.Snapshot().Players["a"].Character.Position == nil {
		t.Error("the full snapshot, which recordings and replays use, hides a")
	}

	place(g, "b", types.Position{X: 2, Y: 0})
	if seen := g.SnapshotFor("b").Players["a"].Character; seen.Position == nil || seen.Concealed {
		t.Error("from 2 cells, a in tall grass is still hidden")
	}
}

func TestTheBotCannotSeeIntoTallGrass(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 5, Y: 0})
	groundOn(g, GroundTallGrass, nil, types.Position{X: 5, Y: 0})
	// b is in the grass; a, the one deciding, is five cells off.
	if action := DecideBotAction(g.SnapshotFor("a"), "a"); action.Kind != BotEnd {
		t.Errorf("a bot with nobody in sight chose %+v, want it to end its turn", action)
	}
}

func TestRockBlocksFeetAndSight(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 3, Y: 0})
	groundOn(g, GroundRock, nil, types.Position{X: 1, Y: 0})

	if err := g.Move("a", types.Position{X: 1, Y: 0}); !errors.Is(err, ErrBlocked) {
		t.Errorf("walking onto rock: %v, want ErrBlocked", err)
	}
	if err := g.CastSpell("a", spellKindle, types.Position{X: 3, Y: 0}); !errors.Is(err, ErrNoLineOfSight) {
		t.Errorf("casting through rock: %v, want ErrNoLineOfSight", err)
	}
}

func TestShallowWaterCostsTwoMovementPoints(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 5, Y: 0})
	groundOn(g, GroundShallowWater, nil, types.Position{X: 1, Y: 0})

	mp := character(g, "a").MovementPoints
	move(t, g, "a", types.Position{X: 1, Y: 0})
	if got := character(g, "a").MovementPoints; got != mp-ShallowWaterCost {
		t.Errorf("MP after one step into water = %d, want %d", got, mp-ShallowWaterCost)
	}
}

func TestAWalkIsChargedWhatItsGroundCosts(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 5, Y: 5})
	// A pool on the straight line: through it costs 2+1, round it 1+1+1+1, so
	// the walk goes through and is charged 3.
	groundOn(g, GroundShallowWater, nil, types.Position{X: 1, Y: 0})
	g.mu.Lock()
	path := FindPath(types.Position{X: 0, Y: 0}, types.Position{X: 2, Y: 0}, g.blocksMovementLocked, g.enterCostLocked)
	cost := pathCost(path, g.enterCostLocked)
	g.mu.Unlock()
	if cost != 3 {
		t.Errorf("cheapest walk costs %d (%v), want 3 straight through the pool", cost, path)
	}

	g.mu.Lock()
	p := g.players["a"]
	p.Character.MovementPoints = 1
	g.players["a"] = p
	g.mu.Unlock()
	if err := g.Move("a", types.Position{X: 1, Y: 0}); !errors.Is(err, ErrNotEnoughMP) {
		t.Errorf("stepping into water with 1 MP: %v, want ErrNotEnoughMP", err)
	}
}

func TestShallowWaterMakesWaterHitHarder(t *testing.T) {
	hit := func(spell int, wet bool) int {
		g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 3, Y: 0})
		if wet {
			groundOn(g, GroundShallowWater, nil, types.Position{X: 3, Y: 0})
		}
		before := hp(g, "b")
		cast(t, g, "a", spell, types.Position{X: 3, Y: 0})
		return before - hp(g, "b")
	}

	dry, wet := hit(spellHydroCannon, false), hit(spellHydroCannon, true)
	if want := dry * (100 + ShallowWaterBonus) / 100; wet != want {
		t.Errorf("Hydro Cannon on someone in shallow water takes %d, want %d (%d dry)", wet, want, dry)
	}
	if dry, wet := hit(spellKindle, false), hit(spellKindle, true); dry != wet {
		t.Errorf("Kindle, a fire spell, takes %d in water and %d out of it; water only helps water", wet, dry)
	}
}

func TestIceCarriesYouOneCellFurther(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 6, Y: 0})
	groundOn(g, GroundIce, nil, types.Position{X: 1, Y: 0}, types.Position{X: 2, Y: 0})

	mp := character(g, "a").MovementPoints
	move(t, g, "a", types.Position{X: 1, Y: 0})
	if got := pos(g, "a"); got != (types.Position{X: 2, Y: 0}) {
		t.Errorf("stepped onto ice at (1,0) and ended at %+v, want one cell further, not a rink", got)
	}
	if got := character(g, "a").MovementPoints; got != mp-1 {
		t.Errorf("MP = %d, want %d: the slide is free", got, mp-1)
	}
}

func TestIceStopsAtWhateverIsInTheWay(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 2, Y: 0})
	groundOn(g, GroundIce, nil, types.Position{X: 1, Y: 0})
	move(t, g, "a", types.Position{X: 1, Y: 0})
	if got := pos(g, "a"); got != (types.Position{X: 1, Y: 0}) {
		t.Errorf("slid into b: ended at %+v, want (1,0)", got)
	}
}

func TestAcidEatsAtWhoeverEndsATurnInIt(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 5, Y: 0})
	groundOn(g, GroundAcidPool, nil, types.Position{X: 0, Y: 0})

	before, max := hp(g, "a"), character(g, "a").MaxHealth
	endTurn(t, g, "a")
	if got, want := before-hp(g, "a"), max*AcidPercent/100; got != want {
		t.Errorf("a turn ended in acid cost %d health, want %d", got, want)
	}
	// Walking through is safe: only where the turn ends counts.
	before = hp(g, "b")
	endTurn(t, g, "b")
	if hp(g, "b") != before {
		t.Error("b, nowhere near the acid, lost health")
	}
}

func TestAcidCanEndTheFight(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 5, Y: 0})
	groundOn(g, GroundAcidPool, nil, types.Position{X: 0, Y: 0})
	g.mu.Lock()
	p := g.players["a"]
	p.Character.Health = 1
	g.players["a"] = p
	g.mu.Unlock()

	endTurn(t, g, "a")
	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %s, want game over", g.Status())
	}
	if winner, _ := g.Winner(); winner != character(g, "b").Name {
		t.Errorf("winner = %q, want b", winner)
	}
}

func TestLavaIsImpassableAndBurnsWhoeverStartsBesideIt(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 3, Y: 0})
	groundOn(g, GroundLava, nil, types.Position{X: 3, Y: 1}, types.Position{X: 4, Y: 0})

	if err := g.Move("a", types.Position{X: 3, Y: 1}); !errors.Is(err, ErrBlocked) {
		t.Errorf("walking onto lava: %v, want ErrBlocked", err)
	}
	before, max := hp(g, "b"), character(g, "b").MaxHealth
	endTurn(t, g, "a")
	// Two lava cells beside b, but lava burns once.
	if got, want := before-hp(g, "b"), max*LavaBurnPercent/100; got != want {
		t.Errorf("b started its turn beside lava and lost %d, want %d", got, want)
	}
}

func TestAirCurrentCarriesWhoeverStartsATurnOnIt(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 3, Y: 0})
	wind := types.Position{X: 0, Y: 1}
	groundOn(g, GroundAirCurrent, &wind, types.Position{X: 3, Y: 0})

	endTurn(t, g, "a")
	if got := pos(g, "b"); got != (types.Position{X: 3, Y: 1}) {
		t.Errorf("b started its turn on a current blowing +y and is at %+v, want (3,1)", got)
	}
}

func TestAirCurrentDoesNotBlowIntoWalls(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 3, Y: 0})
	wind := types.Position{X: 0, Y: 1}
	groundOn(g, GroundAirCurrent, &wind, types.Position{X: 3, Y: 0})
	groundOn(g, GroundRock, nil, types.Position{X: 3, Y: 1})

	before := hp(g, "b")
	endTurn(t, g, "a")
	if got := pos(g, "b"); got != (types.Position{X: 3, Y: 0}) {
		t.Errorf("b was blown into rock: at %+v", got)
	}
	if hp(g, "b") != before {
		t.Error("a current that goes nowhere hurt b")
	}
}

// ---------------------------------------------------------------------------
// Laying the ground.
// ---------------------------------------------------------------------------

func TestGroundIsLaidFromTheSeedAndKeepsTheBoardOpen(t *testing.T) {
	for _, island := range Content().Islands {
		for seed := int64(1); seed <= 20; seed++ {
			g := NewWithOptions(Options{Seed: seed, Island: island.ID})
			if _, err := g.AddBot(); err != nil {
				t.Fatal(err)
			}
			if _, err := g.AddBot(); err != nil {
				t.Fatal(err)
			}
			state := g.Snapshot()
			if state.Island != island.ID {
				t.Fatalf("snapshot island = %q, want %q", state.Island, island.ID)
			}

			kinds := map[string]bool{}
			starting := map[types.Position]bool{}
			for _, p := range state.Players {
				for _, c := range p.Character.InitialPositions {
					starting[c] = true
				}
			}
			for _, cell := range state.Ground {
				kinds[cell.Kind] = true
				if starting[cell.Position] {
					t.Errorf("%s seed %d: %s laid on a starting cell %+v", island.ID, seed, cell.Kind, cell.Position)
				}
				if (cell.Kind == GroundAirCurrent) != (cell.Wind != nil) {
					t.Errorf("%s seed %d: %s at %+v has wind %v", island.ID, seed, cell.Kind, cell.Position, cell.Wind)
				}
			}
			for kind := range kinds {
				if !containsString(island.Terrains, kind) {
					t.Errorf("%s seed %d: dealt %s, which the island does not have", island.ID, seed, kind)
				}
			}
			if len(kinds) > 2 {
				t.Errorf("%s seed %d: %d kinds of ground, at most 2", island.ID, seed, len(kinds))
			}

			g.mu.Lock()
			if !g.staysConnectedLocked() {
				t.Errorf("%s seed %d: the ground cuts the board in two", island.ID, seed)
			}
			g.mu.Unlock()

			again := NewWithOptions(Options{Seed: seed, Island: island.ID})
			again.AddBot()
			again.AddBot()
			if !reflect.DeepEqual(again.Snapshot().Ground, state.Ground) {
				t.Fatalf("%s seed %d: the same seed laid different ground", island.ID, seed)
			}
		}
	}
}

// An arena with no island has to deal exactly the board it always did, or
// every match recorded before islands would stop replaying.
func TestAPlainArenaDrawsNothingMoreFromTheSeed(t *testing.T) {
	for seed := int64(1); seed <= 10; seed++ {
		plain := NewWithOptions(Options{Seed: seed})
		isle := NewWithOptions(Options{Seed: seed, Island: "earth"})
		for _, g := range []*Game{plain, isle} {
			g.AddBot()
			g.AddBot()
		}
		a, b := plain.Snapshot(), isle.Snapshot()
		if !reflect.DeepEqual(a.Obstacles, b.Obstacles) {
			t.Errorf("seed %d: an island changed the cover it was dealt", seed)
		}
		if len(a.Ground) != 0 {
			t.Errorf("seed %d: a plain arena was dealt ground", seed)
		}
	}
}

func TestSolidGroundStaysClearOfTheStartingCells(t *testing.T) {
	reserved := []types.Position{{X: 3, Y: 3}, {X: -3, Y: -3}}
	for seed := int64(0); seed < 50; seed++ {
		cells := GenerateGround([]string{GroundLava, GroundRock}, reserved, map[types.Position]bool{}, rand.New(rand.NewSource(seed)))
		for _, cell := range cells {
			for _, r := range reserved {
				if Distance(cell.Position, r) <= 1 {
					t.Fatalf("seed %d: solid %s at %+v, next to the starting cell %+v", seed, cell.Kind, cell.Position, r)
				}
			}
		}
	}
}

func TestAnUnknownIslandIsAPlainArena(t *testing.T) {
	g := NewWithOptions(Options{Seed: 1, Island: "atlantis"})
	g.AddBot()
	g.AddBot()
	if s := g.Snapshot(); s.Island != "" || len(s.Ground) != 0 {
		t.Errorf("an unknown island dealt island %q and %d ground cells", s.Island, len(s.Ground))
	}
}

func containsString(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
