package game

import (
	"testing"

	"game-server/internal/types"
)

// The basic attacks of the outfits beyond the champions' own: each element
// has three, and each of the three fights a different way.
const (
	spellLanternSwing  = 21
	spellHeartBurst    = 22
	spellLanceCharge   = 23
	spellSteelFeathers = 24
	spellTridentHook   = 25
	spellTideOrb       = 26
	spellFlailSweep    = 27
	spellStoneLob      = 28
)

func turnsLeftAt(g *Game, at types.Position) int {
	return g.terrain[at].TurnsLeft
}

func TestTheLanternSetsTheTargetsCellOnFire(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 1})
	cast(t, g, "a", spellLanternSwing, types.Position{Y: 1})
	if hp := hp(g, "b"); hp != StartingHealth-7 {
		t.Errorf("b's health = %d, want %d", hp, StartingHealth-7)
	}
	if kind := terrainAt(g, types.Position{Y: 1}); kind != types.TerrainFire {
		t.Errorf("b's cell is %q, want fire", kind)
	}
	if turns := turnsLeftAt(g, types.Position{Y: 1}); turns != 2 {
		t.Errorf("the fire lasts %d turns, want 2", turns)
	}
}

func TestTheHeartBurstBurnsACrossEvenWhereNobodyStands(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{X: 5, Y: 5})
	cast(t, g, "a", spellHeartBurst, types.Position{Y: 3})
	for _, at := range []types.Position{{Y: 3}, {Y: 2}, {Y: 4}, {X: 1, Y: 3}, {X: -1, Y: 3}} {
		if kind := terrainAt(g, at); kind != types.TerrainFire {
			t.Errorf("%+v is %q, want fire", at, kind)
		}
	}
	if turns := turnsLeftAt(g, types.Position{Y: 3}); turns != 1 {
		t.Errorf("the fire lasts %d turns, want 1", turns)
	}
}

func TestTheLanceRunsThroughThreeCellsAndThrowsBack(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	cast(t, g, "a", spellLanceCharge, types.Position{Y: 1})
	if hp := hp(g, "b"); hp != StartingHealth-6 {
		t.Errorf("b, on the third cell, has %d health, want %d", hp, StartingHealth-6)
	}
	if at := pos(g, "b"); at != (types.Position{Y: 4}) {
		t.Errorf("b was thrown to %+v, want (0,4)", at)
	}
}

func TestTheFeathersStrikeThreeTimes(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 6})
	cast(t, g, "a", spellSteelFeathers, types.Position{Y: 6})
	if hp := hp(g, "b"); hp != StartingHealth-3*2 {
		t.Errorf("b's health = %d, want %d: three feathers of 2", hp, StartingHealth-6)
	}
}

func TestTheTridentHooksTheTargetACellCloser(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 2})
	cast(t, g, "a", spellTridentHook, types.Position{Y: 2})
	if hp := hp(g, "b"); hp != StartingHealth-6 {
		t.Errorf("b's health = %d, want %d", hp, StartingHealth-6)
	}
	if at := pos(g, "b"); at != (types.Position{Y: 1}) {
		t.Errorf("b was dragged to %+v, want (0,1)", at)
	}
}

func TestTheTideOrbLeavesAPuddleForTwoTurns(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	cast(t, g, "a", spellTideOrb, types.Position{Y: 4})
	if hp := hp(g, "b"); hp != StartingHealth-4 {
		t.Errorf("b's health = %d, want %d", hp, StartingHealth-4)
	}
	if kind := terrainAt(g, types.Position{Y: 4}); kind != types.TerrainWater {
		t.Errorf("b's cell is %q, want water", kind)
	}
	if turns := turnsLeftAt(g, types.Position{Y: 4}); turns != 2 {
		t.Errorf("the puddle lasts %d turns, want 2", turns)
	}
}

func TestTheFlailSweepsAllRoundButSparesItsBearer(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{X: -1})
	cast(t, g, "a", spellFlailSweep, types.Position{})
	if hp := hp(g, "b"); hp != StartingHealth-6 {
		t.Errorf("b, beside a, has %d health, want %d", hp, StartingHealth-6)
	}
	if hp := hp(g, "a"); hp != StartingHealth {
		t.Errorf("a hit themselves: %d health, want %d", hp, StartingHealth)
	}
}

func TestTheStoneIsLobbedOverCover(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	g.obstacles[types.Position{Y: 2}] = true
	cast(t, g, "a", spellStoneLob, types.Position{Y: 4})
	if hp := hp(g, "b"); hp != StartingHealth-5 {
		t.Errorf("b, behind cover, has %d health, want %d", hp, StartingHealth-5)
	}
}
