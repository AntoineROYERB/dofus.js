package game

import (
	"testing"

	"game-server/internal/types"
)

// The legendaries' ultimates: the same shape and damage in every hand, and
// something more that depends on the element their caster wears.
const (
	spellCleaver = 29
	spellRay     = 30
	spellDrums   = 31
	spellMaw     = 32
)

// legendDuel puts a, wearing a champion's set, against b three cells up, on
// the turn ultimates unlock.
func legendDuel(t *testing.T, champion string) *Game {
	t.Helper()
	g := duel(t, types.Position{}, types.Position{Y: 3})
	asChampion(g, "a", champion)
	onTurn(g, UltimateFromTurn)
	return g
}

func burnStacks(g *Game, id string) int {
	stacks, _ := burnOf(character(g, id))
	return stacks
}

func rockAt(g *Game, at types.Position) bool {
	for _, o := range g.Snapshot().Obstacles {
		if o == at {
			return true
		}
	}
	return false
}

func TestTheCleaverBurnsInFire(t *testing.T) {
	g := legendDuel(t, "ashka")
	cast(t, g, "a", spellCleaver, types.Position{Y: 3})
	if hp := hp(g, "b"); hp != StartingHealth-16 {
		t.Errorf("b's health = %d, want %d", hp, StartingHealth-16)
	}
	if stacks := burnStacks(g, "b"); stacks != 2 {
		t.Errorf("b carries %d burns, want 2", stacks)
	}
	if kind := terrainAt(g, types.Position{Y: 5}); kind != types.TerrainFire {
		t.Errorf("the end of the line is %q, want fire", kind)
	}
}

func TestTheCleaverPlantsAPylonInTheAir(t *testing.T) {
	g := legendDuel(t, "sef")
	cast(t, g, "a", spellCleaver, types.Position{Y: 3})
	if at := pos(g, "b"); at != (types.Position{Y: 5}) {
		t.Errorf("b was thrown to %+v, want (0,5)", at)
	}
	if kind := terrainAt(g, types.Position{Y: 3}); kind != types.TerrainRelay {
		t.Errorf("where the blade fell is %q, want a's pylon", kind)
	}
}

func TestTheCleaverRaisesMenhirsInEarth(t *testing.T) {
	g := legendDuel(t, "old-grund")
	cast(t, g, "a", spellCleaver, types.Position{Y: 3})
	for _, at := range []types.Position{{X: 1, Y: 3}, {X: -1, Y: 3}} {
		if !rockAt(g, at) {
			t.Errorf("no menhir at %+v", at)
		}
	}
}

func TestTheRayStrikesThreeTimesAndThrowsInTheAir(t *testing.T) {
	g := legendDuel(t, "sef")
	cast(t, g, "a", spellRay, types.Position{Y: 3})
	if hp := hp(g, "b"); hp != StartingHealth-3*6 {
		t.Errorf("b's health = %d, want %d: three rays of 6", hp, StartingHealth-18)
	}
	if at := pos(g, "b"); at != (types.Position{Y: 6}) {
		t.Errorf("b was thrown to %+v, want (0,6): a cell for each ray", at)
	}
}

func TestTheRayCagesInEarthForTwoTurns(t *testing.T) {
	g := legendDuel(t, "old-grund")
	cast(t, g, "a", spellRay, types.Position{Y: 3})
	for _, at := range []types.Position{{X: 1, Y: 3}, {X: -1, Y: 3}, {Y: 4}} {
		if !rockAt(g, at) {
			t.Errorf("no rock at %+v", at)
		}
	}
	if rockAt(g, types.Position{Y: 2}) {
		t.Errorf("the side facing the caster is walled too")
	}
	mustEndTurn(t, g) // b
	mustEndTurn(t, g) // a: one turn off
	if !rockAt(g, types.Position{Y: 4}) {
		t.Fatalf("the cage fell after one turn")
	}
	mustEndTurn(t, g) // b
	mustEndTurn(t, g) // a: gone
	if rockAt(g, types.Position{Y: 4}) {
		t.Errorf("the cage is still standing after two of a's turns")
	}
}

func TestTheDrumsBeatTwiceMoreAndSplitTheGroundInEarth(t *testing.T) {
	g := legendDuel(t, "old-grund")
	cast(t, g, "a", spellDrums, types.Position{Y: 3})
	for range 4 {
		mustEndTurn(t, g)
	}
	if want := StartingHealth - 8 - DrumBeat - DrumFinale; hp(g, "b") != want {
		t.Errorf("b's health = %d, want %d: the cast, a beat and the finale", hp(g, "b"), want)
	}
	if kind := terrainAt(g, types.Position{Y: 5}); kind != types.TerrainFissure {
		t.Errorf("terrain = %q, want the finale to split the ground", kind)
	}
	if zones := g.Snapshot().Zones; len(zones) != 0 {
		t.Errorf("%d zones left after the finale", len(zones))
	}
}

func TestTheDrumsFollowTheirTargetInTheAir(t *testing.T) {
	g := legendDuel(t, "sef")
	cast(t, g, "a", spellDrums, types.Position{Y: 3})
	mustEndTurn(t, g)
	move(t, g, "b", types.Position{X: 2, Y: 3})
	mustEndTurn(t, g)
	if want := StartingHealth - 6 - 6; hp(g, "b") != want {
		t.Errorf("b's health = %d, want %d: the beat found b where it went", hp(g, "b"), want)
	}
}

func TestTheMawThrowsAwayFromWhereYouComeOut(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	asChampion(g, "a", "ashka")
	onTurn(g, UltimateFromTurn)
	cast(t, g, "a", spellMaw, types.Position{Y: 3})
	if at := pos(g, "a"); at != (types.Position{Y: 3}) {
		t.Fatalf("a came out at %+v, want (0,3)", at)
	}
	if at := pos(g, "b"); at != (types.Position{Y: 6}) {
		t.Errorf("b was thrown to %+v, want (0,6), away from where a came out", at)
	}
	if hp := hp(g, "b"); hp != StartingHealth-14 {
		t.Errorf("b's health = %d, want %d", hp, StartingHealth-14)
	}
	if stacks := burnStacks(g, "b"); stacks != 1 {
		t.Errorf("b carries %d burns, want 1 in fire", stacks)
	}
}

func TestTheMawShieldsInEarth(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	asChampion(g, "a", "old-grund")
	onTurn(g, UltimateFromTurn)
	cast(t, g, "a", spellMaw, types.Position{Y: 3})
	shielded := false
	for _, e := range character(g, "a").Effects {
		if e.Kind == types.EffectShield && e.Value == 10 {
			shielded = true
		}
	}
	if !shielded {
		t.Errorf("a's effects = %+v, want a shield of 10", character(g, "a").Effects)
	}
}

func TestAnInfusedCastSaysWhichElement(t *testing.T) {
	g := legendDuel(t, "mother-brine")
	cast(t, g, "a", spellRay, types.Position{Y: 3})
	var last types.LogEntry
	for _, e := range g.Snapshot().Log {
		if e.Kind == types.LogCast {
			last = e
		}
	}
	if last.Infusion != "Water" {
		t.Errorf("cast log infusion = %q, want Water", last.Infusion)
	}
	if kind := terrainAt(g, types.Position{X: 1, Y: 3}); kind != types.TerrainIce {
		t.Errorf("terrain = %q, want a cross of ice", kind)
	}
}
