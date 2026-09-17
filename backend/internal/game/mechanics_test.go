package game

import (
	"errors"
	"strconv"
	"testing"

	"game-server/internal/types"
)

// Spell ids, by the name the tests think of them by.
const (
	spellKindle       = 1
	spellScorched     = 2
	spellCombustion   = 3
	spellSmokescreen  = 4
	spellMeteor       = 5
	spellUpdraft      = 6
	spellLightning    = 7
	spellGale         = 8
	spellTailwind     = 9
	spellTempest      = 10
	spellHydroCannon  = 11
	spellBubbleTrap   = 12
	spellDownpour     = 13
	spellFrozenGround = 14
	spellMaelstrom    = 15
	spellEarthleap    = 16
	spellHammer       = 17
	spellGrapple      = 18
	spellPillar       = 19
	spellEarthquake   = 20
)

// boardGame is playingGame on a board with no cover, and no criticals, so a
// test about terrain is only about the terrain it lays itself.
func boardGame(t *testing.T, placement map[string]types.Position, order ...string) *Game {
	t.Helper()
	g := playingGame(t, placement, order...)
	g.mu.Lock()
	defer g.mu.Unlock()
	g.obstacles = map[types.Position]bool{}
	for key, spell := range g.spells {
		spell.CriticalChance = 0
		g.spells[key] = spell
	}
	return g
}

func duel(t *testing.T, a, b types.Position) *Game {
	t.Helper()
	return boardGame(t, map[string]types.Position{"a": a, "b": b}, "a", "b")
}

func cast(t *testing.T, g *Game, id string, spell int, target types.Position) {
	t.Helper()
	if err := g.CastSpell(id, spell, target); err != nil {
		t.Fatalf("CastSpell(%s, %d, %+v): %v", id, spell, target, err)
	}
}

func move(t *testing.T, g *Game, id string, to types.Position) {
	t.Helper()
	if err := g.Move(id, to); err != nil {
		t.Fatalf("Move(%s, %+v): %v", id, to, err)
	}
}

// damageOf is a spell's catalogue damage, so a retune does not break a test
// about what the spell does.
func damageOf(g *Game, spell int) int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.spells[strconv.Itoa(spell)].Damage
}

// withBonus is damage raised by the Stonewarden's melee bonus.
func withBonus(damage int) int {
	class, _ := Content().Class("stonewarden")
	return damage * (100 + class.MeleeBonus) / 100
}

func character(g *Game, id string) types.Character {
	return g.Snapshot().Players[id].Character
}

func pos(g *Game, id string) types.Position {
	return *character(g, id).Position
}

func terrainAt(g *Game, at types.Position) string {
	for _, cell := range g.Snapshot().Terrain {
		if cell.Position == at {
			return cell.Kind
		}
	}
	return ""
}

func burnOf(c types.Character) (stacks, turns int) {
	for _, e := range c.Effects {
		if e.Kind == types.EffectBurn {
			return e.Value, e.TurnsLeft
		}
	}
	return 0, 0
}

func withAP(g *Game, id string, ap int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p := g.players[id]
	p.Character.ActionPoints = ap
	g.players[id] = p
}

func asClass(g *Game, id, class string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p := g.players[id]
	p.Character.Class = class
	g.players[id] = p
}

func onTurn(g *Game, turn int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.turnNumber = turn
}

func lay(g *Game, at types.Position, kind, owner string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.terrain == nil {
		g.terrain = map[types.Position]types.TerrainCell{}
	}
	g.terrain[at] = types.TerrainCell{Position: at, Kind: kind, Owner: owner}
}

// ---------------------------------------------------------------------------
// Fire
// ---------------------------------------------------------------------------

func TestBurnsStackAndBiteAtTheStartOfTheVictimsTurn(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	cast(t, g, "a", spellKindle, types.Position{Y: 3})
	cast(t, g, "a", spellKindle, types.Position{Y: 3})

	if stacks, turns := burnOf(character(g, "b")); stacks != 2 || turns != BurnDuration {
		t.Fatalf("burn = %d stacks for %d turns, want 2 for %d", stacks, turns, BurnDuration)
	}
	mustEndTurn(t, g)
	want := StartingHealth - 2*damageOf(g, spellKindle) - 2*BurnDamagePerStack
	if hp := health(t, g, "b"); hp != want {
		t.Errorf("health after the burn ticked = %d, want %d", hp, want)
	}
}

func TestBurnsNeverStackPastTheCap(t *testing.T) {
	c := types.Character{}
	for i := 0; i < 5; i++ {
		applyEffect(&c, types.Effect{Kind: types.EffectBurn, Value: 1, TurnsLeft: 1, Source: "x"})
	}
	if stacks, _ := burnOf(c); stacks != MaxBurnStacks || len(c.Effects) != 1 {
		t.Errorf("effects = %+v, want one burn of %d stacks", c.Effects, MaxBurnStacks)
	}
}

func TestCombustionCashesInTheBurns(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	g.mu.Lock()
	b := g.players["b"]
	addBurn(&b.Character, 2)
	g.players["b"] = b
	g.mu.Unlock()

	cast(t, g, "a", spellCombustion, types.Position{Y: 3})

	want := StartingHealth - (damageOf(g, spellCombustion) + 2*BurnDuration*BurnDamagePerStack)
	if hp := health(t, g, "b"); hp != want {
		t.Errorf("health = %d, want %d: the base damage plus every burn left", hp, want)
	}
	if stacks, _ := burnOf(character(g, "b")); stacks != 0 {
		t.Errorf("the burn is still there with %d stacks after going off", stacks)
	}
}

func TestScorchedEarthStaysAndBurnsWhoeverWalksIn(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	cast(t, g, "a", spellScorched, types.Position{Y: 3})
	for _, cell := range []types.Position{{X: -2, Y: 3}, {X: -1, Y: 3}, {Y: 3}, {X: 1, Y: 3}, {X: 2, Y: 3}} {
		if kind := terrainAt(g, cell); kind != types.TerrainFire {
			t.Errorf("terrain at %+v = %q, want a wall of fire", cell, kind)
		}
	}

	mustEndTurn(t, g) // b starts its turn on fire
	if stacks, _ := burnOf(character(g, "b")); stacks != 1 {
		t.Errorf("b started its turn in fire with %d burns, want 1", stacks)
	}
	move(t, g, "b", types.Position{Y: 4})
	move(t, g, "b", types.Position{X: 1, Y: 4})
	move(t, g, "b", types.Position{X: 1, Y: 3})
	if stacks, _ := burnOf(character(g, "b")); stacks != 2 {
		t.Errorf("b walked back into the fire and has %d burns, want 2", stacks)
	}

	// Many turns later, the fire is still there.
	for i := 0; i < 8; i++ {
		mustEndTurn(t, g)
	}
	if kind := terrainAt(g, types.Position{X: 2, Y: 3}); kind != types.TerrainFire {
		t.Errorf("fire did not stay: terrain = %q", kind)
	}
}

func TestWaterPutsFireOutAndFireDoesNotTakeOnWater(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 5})
	withAP(g, "a", 99)
	cast(t, g, "a", spellScorched, types.Position{Y: 2})
	cast(t, g, "a", spellDownpour, types.Position{X: 2, Y: 3})
	if kind := terrainAt(g, types.Position{Y: 3}); kind != types.TerrainWater {
		t.Errorf("terrain under the downpour = %q, want the fire put out", kind)
	}

	mustEndTurn(t, g)
	mustEndTurn(t, g) // the cooldown is spent
	withAP(g, "a", 99)
	cast(t, g, "a", spellScorched, types.Position{Y: 2})
	if kind := terrainAt(g, types.Position{Y: 3}); kind != types.TerrainWater {
		t.Errorf("fire took on water: terrain = %q", kind)
	}
}

func TestSmokeBlocksSightButNotFeet(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	cast(t, g, "a", spellSmokescreen, types.Position{Y: 2})

	if err := g.CastSpell("a", spellKindle, types.Position{Y: 4}); !errors.Is(err, ErrNoLineOfSight) {
		t.Errorf("Kindle through smoke = %v, want ErrNoLineOfSight", err)
	}
	move(t, g, "a", types.Position{Y: 2})
}

func TestMeteorDigsACraterAndSetsTheGroundAlight(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})

	before := g.CommandCount()
	if err := g.CastSpell("a", spellMeteor, types.Position{Y: 4}); !errors.Is(err, ErrUltimateNotReady) {
		t.Fatalf("Meteor on turn 1 = %v, want ErrUltimateNotReady", err)
	}
	if g.CommandCount() != before {
		t.Error("a refused ultimate was recorded")
	}

	onTurn(g, UltimateFromTurn)
	cast(t, g, "a", spellMeteor, types.Position{Y: 4})

	if kind := terrainAt(g, types.Position{Y: 4}); kind != types.TerrainCrater {
		t.Errorf("terrain at the impact = %q, want a crater", kind)
	}
	if at := pos(g, "b"); at == (types.Position{Y: 4}) {
		t.Error("the target is still standing in the crater")
	}
	if kind := terrainAt(g, types.Position{X: 1, Y: 5}); kind != types.TerrainFire {
		t.Errorf("terrain beside the crater = %q, want fire", kind)
	}
	if stacks, _ := burnOf(character(g, "b")); stacks < 2 {
		t.Errorf("the target has %d burns, want at least the meteor's 2", stacks)
	}
	if err := g.Move("a", types.Position{Y: 4}); !errors.Is(err, ErrBlocked) {
		t.Errorf("walking into the crater = %v, want ErrBlocked", err)
	}
	if !g.Snapshot().Players["a"].Spells["5"].Spent {
		t.Error("the ultimate is not marked spent")
	}

	mustEndTurn(t, g)
	mustEndTurn(t, g)
	if err := g.CastSpell("a", spellMeteor, pos(g, "b")); !errors.Is(err, ErrUltimateSpent) {
		t.Errorf("second Meteor = %v, want ErrUltimateSpent", err)
	}
}

// ---------------------------------------------------------------------------
// Air
// ---------------------------------------------------------------------------

func TestARelayCarriesAirSpellsOutOfReach(t *testing.T) {
	g := duel(t, types.Position{X: -4}, types.Position{X: 5})

	if err := g.CastSpell("a", spellLightning, types.Position{X: 5}); !errors.Is(err, ErrOutOfRange) {
		t.Fatalf("Lightning at 9 cells = %v, want ErrOutOfRange", err)
	}
	cast(t, g, "a", spellUpdraft, types.Position{X: 1})
	if kind := terrainAt(g, types.Position{X: 1}); kind != types.TerrainRelay {
		t.Fatalf("terrain = %q, want a relay", kind)
	}
	cast(t, g, "a", spellLightning, types.Position{X: 5})

	log := g.Snapshot().Log
	var last types.LogEntry
	for _, e := range log {
		if e.Kind == types.LogCast {
			last = e
		}
	}
	if last.Via == nil || *last.Via != (types.Position{X: 1}) {
		t.Errorf("cast log via = %v, want the relay", last.Via)
	}
	if want := StartingHealth - damageOf(g, spellLightning)*(100+RelayBonus)/100; health(t, g, "b") != want {
		t.Errorf("health = %d, want %d: the relay's bonus included", health(t, g, "b"), want)
	}

	// A new relay replaces the old one.
	mustEndTurn(t, g)
	mustEndTurn(t, g)
	cast(t, g, "a", spellUpdraft, types.Position{X: -4, Y: 3})
	relays := 0
	for _, cell := range g.Snapshot().Terrain {
		if cell.Kind == types.TerrainRelay {
			relays++
		}
	}
	if relays != 1 {
		t.Errorf("%d relays on the board, want 1", relays)
	}
}

func TestARelayInReachIsAlwaysUsed(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	cast(t, g, "a", spellUpdraft, types.Position{X: 2, Y: 3})
	cast(t, g, "a", spellLightning, types.Position{Y: 3})
	if want := StartingHealth - damageOf(g, spellLightning)*(100+RelayBonus)/100; health(t, g, "b") != want {
		t.Errorf("health = %d, want %d: in reach of both, the spell goes through the relay", health(t, g, "b"), want)
	}
}

func TestPillarIsMarkedAsBuilt(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	cast(t, g, "a", spellPillar, types.Position{X: 2})
	if kind := terrainAt(g, types.Position{X: 2}); kind != types.TerrainPillar {
		t.Errorf("terrain under the pillar = %q, want it marked as a pillar", kind)
	}
}

func TestSpellsThatAreNotRelayedStillNeedTheirOwnReach(t *testing.T) {
	g := duel(t, types.Position{X: -4}, types.Position{X: 3})
	cast(t, g, "a", spellUpdraft, types.Position{X: 1})
	if err := g.CastSpell("a", spellKindle, types.Position{X: 3, Y: 4}); !errors.Is(err, ErrOutOfRange) {
		t.Errorf("Kindle from a relay = %v, want ErrOutOfRange", err)
	}
}

func TestUpdraftNeedsAFreeCell(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	if err := g.CastSpell("a", spellUpdraft, types.Position{Y: 3}); !errors.Is(err, ErrCellNotFree) {
		t.Errorf("relay on a character = %v, want ErrCellNotFree", err)
	}
}

func TestGaleThrowsAndCollisionsHurt(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 2})
	cast(t, g, "a", spellGale, types.Position{Y: 2})
	if at := pos(g, "b"); at != (types.Position{Y: 5}) {
		t.Errorf("b was thrown to %+v, want (0,5)", at)
	}
	gale := damageOf(g, spellGale)
	if hp := health(t, g, "b"); hp != StartingHealth-gale {
		t.Errorf("health = %d, want %d: no collision on open ground", hp, StartingHealth-gale)
	}

	g = duel(t, types.Position{}, types.Position{Y: 2})
	g.mu.Lock()
	g.obstacles[types.Position{Y: 4}] = true
	g.mu.Unlock()
	cast(t, g, "a", spellGale, types.Position{Y: 2})
	if at := pos(g, "b"); at != (types.Position{Y: 3}) {
		t.Errorf("b was thrown to %+v, want to stop at (0,3) against the cover", at)
	}
	if hp := health(t, g, "b"); hp != StartingHealth-gale-CollisionDamage {
		t.Errorf("health = %d, want %d with the collision", hp, StartingHealth-gale-CollisionDamage)
	}
}

func TestStonewardenIsHardToThrow(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 2})
	asClass(g, "b", "stonewarden")
	cast(t, g, "a", spellGale, types.Position{Y: 2})
	class, _ := Content().Class("stonewarden")
	if want := (types.Position{Y: 2 + 3 - class.PushResist}); pos(g, "b") != want {
		t.Errorf("b was thrown to %+v, want %+v", pos(g, "b"), want)
	}
}

func TestTailwindGivesMovementRightAway(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	cast(t, g, "a", spellTailwind, types.Position{X: 5, Y: 0}) // the cell clicked does not matter
	if mp := character(g, "a").MovementPoints; mp != StartingMovementPoints+3 {
		t.Errorf("movement points = %d, want %d", mp, StartingMovementPoints+3)
	}
}

func TestTempestStrikesEnemiesInsideForThreeTurns(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	onTurn(g, UltimateFromTurn)
	cast(t, g, "a", spellTempest, types.Position{Y: 4})
	afterCast := health(t, g, "b")
	if want := StartingHealth - damageOf(g, spellTempest); afterCast != want {
		t.Fatalf("health after the cast = %d, want %d", afterCast, want)
	}

	strikes := 0
	last := afterCast
	for round := 0; round < 5; round++ {
		mustEndTurn(t, g) // b's turn starts inside the storm
		if hp := health(t, g, "b"); hp < last {
			strikes++
			last = hp
		}
		mustEndTurn(t, g)
	}
	if strikes != 3 {
		t.Errorf("the storm struck %d times, want 3", strikes)
	}
	if n := len(g.Snapshot().Zones); n != 0 {
		t.Errorf("%d zones left after the storm ran out, want none", n)
	}
}

func TestLightningConductsThroughWater(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	lay(g, types.Position{Y: 3}, types.TerrainWater, "a")
	cast(t, g, "a", spellLightning, types.Position{Y: 3})
	if want := StartingHealth - damageOf(g, spellLightning)*(100+ConductBonus)/100; health(t, g, "b") != want {
		t.Errorf("health = %d, want %d", health(t, g, "b"), want)
	}
}

func TestADebuffLastingOneTurnDoesCostThatTurn(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	// Lightning takes 1 MP off the target's next turn, and only that one.
	cast(t, g, "a", spellLightning, types.Position{Y: 3})
	mustEndTurn(t, g)
	if mp := character(g, "b").MovementPoints; mp != StartingMovementPoints-1 {
		t.Errorf("b's movement points = %d, want %d", mp, StartingMovementPoints-1)
	}
	mustEndTurn(t, g)
	mustEndTurn(t, g)
	if mp := character(g, "b").MovementPoints; mp != StartingMovementPoints {
		t.Errorf("b's movement points the turn after = %d, want them back to %d", mp, StartingMovementPoints)
	}
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

func TestHydroCannonThrowsAndLeavesWater(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 2})
	cast(t, g, "a", spellHydroCannon, types.Position{Y: 2})
	if at := pos(g, "b"); at != (types.Position{Y: 5}) {
		t.Errorf("b was thrown to %+v, want (0,5)", at)
	}
	if kind := terrainAt(g, types.Position{Y: 2}); kind != types.TerrainWater {
		t.Errorf("terrain where b stood = %q, want water", kind)
	}
}

func TestWaterSlowsEnemiesAndHealsItsOwner(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	lay(g, types.Position{Y: 3}, types.TerrainWater, "a")
	lay(g, types.Position{}, types.TerrainWater, "a")
	g.mu.Lock()
	p := g.players["a"]
	p.Character.Health = 50
	g.players["a"] = p
	g.mu.Unlock()

	mustEndTurn(t, g)
	if mp := character(g, "b").MovementPoints; mp != StartingMovementPoints-WaterSlow {
		t.Errorf("b's movement points in a's water = %d, want %d", mp, StartingMovementPoints-WaterSlow)
	}
	mustEndTurn(t, g)
	if hp := health(t, g, "a"); hp != 50+WaterHealing {
		t.Errorf("a's health in its own water = %d, want %d", hp, 50+WaterHealing)
	}
	if mp := character(g, "a").MovementPoints; mp != StartingMovementPoints {
		t.Errorf("a's own water slowed it to %d", mp)
	}
}

func TestWaterPutsBurnsOut(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	lay(g, types.Position{Y: 3}, types.TerrainWater, "a")
	cast(t, g, "a", spellKindle, types.Position{Y: 3})
	mustEndTurn(t, g)
	if stacks, _ := burnOf(character(g, "b")); stacks != 0 {
		t.Errorf("b started its turn in water still burning with %d stacks", stacks)
	}
	if want := StartingHealth - damageOf(g, spellKindle); health(t, g, "b") != want {
		t.Errorf("health = %d, want only Kindle's hit: the burn went out before it bit", health(t, g, "b"))
	}
}

func TestBubbleTrapHoldsTheFirstEnemyToStepOnIt(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	cast(t, g, "a", spellBubbleTrap, types.Position{Y: 3})
	if kind := terrainAt(g, types.Position{Y: 3}); kind != "" {
		t.Errorf("a trap was set under the enemy: %q", kind)
	}
	if kind := terrainAt(g, types.Position{X: 1, Y: 3}); kind != types.TerrainTrap {
		t.Fatalf("terrain beside the enemy = %q, want a trap", kind)
	}

	mustEndTurn(t, g)
	move(t, g, "b", types.Position{X: 2, Y: 3}) // walks through (1,3)
	if at := pos(g, "b"); at != (types.Position{X: 1, Y: 3}) {
		t.Errorf("b walked on to %+v, want to be held at the trap", at)
	}
	c := character(g, "b")
	if c.Health != StartingHealth-TrapDamage {
		t.Errorf("health = %d, want %d", c.Health, StartingHealth-TrapDamage)
	}
	if c.MovementPoints != 0 {
		t.Errorf("movement points after the trap = %d, want 0", c.MovementPoints)
	}
	if kind := terrainAt(g, types.Position{X: 1, Y: 3}); kind != "" {
		t.Errorf("the sprung trap is still there: %q", kind)
	}

	// Held for the turn, not beyond it.
	mustEndTurn(t, g)
	mustEndTurn(t, g)
	if mp := character(g, "b").MovementPoints; mp != StartingMovementPoints {
		t.Errorf("b's next turn has %d movement points, want them all back", mp)
	}
}

func TestIceCarriesItsVictimIntoATrap(t *testing.T) {
	g := duel(t, types.Position{X: 2, Y: -4}, types.Position{})
	lay(g, types.Position{X: 3}, types.TerrainTrap, "a")
	withAP(g, "a", 99)
	cast(t, g, "a", spellFrozenGround, types.Position{X: 2})
	if kind := terrainAt(g, types.Position{X: 3}); kind != types.TerrainTrap {
		t.Fatalf("terrain under the trap = %q, want the trap left in place", kind)
	}

	mustEndTurn(t, g)
	move(t, g, "b", types.Position{X: 1})
	if at := pos(g, "b"); at != (types.Position{X: 3}) {
		t.Errorf("b ended at %+v, want to slide on into the trap at (3,0)", at)
	}
	if mp := character(g, "b").MovementPoints; mp != 0 {
		t.Errorf("b has %d movement points after sliding into the trap, want 0", mp)
	}
}

func TestATrapNeverCatchesItsOwner(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 5})
	lay(g, types.Position{X: 1}, types.TerrainTrap, "a")
	move(t, g, "a", types.Position{X: 2})
	if at := pos(g, "a"); at != (types.Position{X: 2}) {
		t.Errorf("a stopped at %+v on its own trap", at)
	}
}

func TestIceCarriesWhoeverStepsOnIt(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{X: -5})
	for _, x := range []int{1, 2, 3} {
		lay(g, types.Position{X: x}, types.TerrainIce, "b")
	}
	move(t, g, "a", types.Position{X: 1})
	if at := pos(g, "a"); at != (types.Position{X: 4}) {
		t.Errorf("a ended at %+v, want to slide to (4,0)", at)
	}
	if mp := character(g, "a").MovementPoints; mp != StartingMovementPoints-1 {
		t.Errorf("movement points = %d, want only the step walked paid for", mp)
	}
}

func TestMaelstromStripsBuffsAndDragsTheEnemyBack(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	g.mu.Lock()
	b := g.players["b"]
	applyEffect(&b.Character, types.Effect{Kind: types.EffectShield, Value: 5, TurnsLeft: 3, Source: "x"})
	applyEffect(&b.Character, types.Effect{Kind: types.EffectPoison, Value: 1, TurnsLeft: 3, Source: "y"})
	g.players["b"] = b
	g.mu.Unlock()

	onTurn(g, UltimateFromTurn)
	cast(t, g, "a", spellMaelstrom, types.Position{Y: 4})
	for _, e := range character(g, "b").Effects {
		if e.Kind == types.EffectShield {
			t.Error("the shield survived the maelstrom")
		}
	}
	if want := StartingHealth - damageOf(g, spellMaelstrom); health(t, g, "b") != want {
		t.Errorf("health = %d, want %d: the shield goes before the hit lands", health(t, g, "b"), want)
	}

	mustEndTurn(t, g)
	if mp := character(g, "b").MovementPoints; mp != 0 {
		t.Errorf("b's movement points the turn after the cast = %d, want 0", mp)
	}

	// Moved out of its centre by hand, the maelstrom drags b back.
	g.mu.Lock()
	g.setPositionLocked("b", types.Position{X: 1, Y: 4})
	g.mu.Unlock()
	mustEndTurn(t, g)
	mustEndTurn(t, g)
	if at := pos(g, "b"); at != (types.Position{Y: 4}) {
		t.Errorf("b is at %+v, want dragged back to the centre", at)
	}
}

// ---------------------------------------------------------------------------
// Earth
// ---------------------------------------------------------------------------

func TestEarthleapLandsAndShakesTheNeighbours(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	asClass(g, "a", "stonewarden")

	if err := g.CastSpell("a", spellEarthleap, types.Position{Y: 4}); !errors.Is(err, ErrCellNotFree) {
		t.Errorf("leap onto the enemy = %v, want ErrCellNotFree", err)
	}
	cast(t, g, "a", spellEarthleap, types.Position{Y: 3})
	if at := pos(g, "a"); at != (types.Position{Y: 3}) {
		t.Errorf("a landed at %+v, want (0,3)", at)
	}
	if want := StartingHealth - withBonus(damageOf(g, spellEarthleap)); health(t, g, "b") != want {
		t.Errorf("health = %d, want %d: the landing, with the melee bonus", health(t, g, "b"), want)
	}
	if hp := health(t, g, "a"); hp != StartingHealth {
		t.Errorf("the leaper hurt itself: %d", hp)
	}
}

func TestStonewardenHitsHarderUpClose(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 1})
	cast(t, g, "a", spellHammer, types.Position{Y: 1})
	plain := StartingHealth - health(t, g, "b")

	g = duel(t, types.Position{}, types.Position{Y: 1})
	asClass(g, "a", "stonewarden")
	cast(t, g, "a", spellHammer, types.Position{Y: 1})
	bonus := StartingHealth - health(t, g, "b")

	hammer := damageOf(g, spellHammer)
	if plain != hammer || bonus != withBonus(hammer) || bonus <= plain {
		t.Errorf("hammer did %d without the class and %d with it, want %d and %d", plain, bonus, hammer, withBonus(hammer))
	}
}

func TestGrappleDragsTheTargetIn(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 5})
	cast(t, g, "a", spellGrapple, types.Position{Y: 5})
	if at := pos(g, "b"); at != (types.Position{Y: 3}) {
		t.Errorf("b was dragged to %+v, want (0,3)", at)
	}

	g = duel(t, types.Position{}, types.Position{Y: 2})
	cast(t, g, "a", spellGrapple, types.Position{Y: 2})
	if at := pos(g, "b"); at != (types.Position{Y: 1}) {
		t.Errorf("b was dragged to %+v, want to stop next to the caster", at)
	}
}

func TestPillarRaisesCoverButNeverWallsTheBoardOff(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	cast(t, g, "a", spellPillar, types.Position{Y: 2})
	found := false
	for _, o := range g.Snapshot().Obstacles {
		if o == (types.Position{Y: 2}) {
			found = true
		}
	}
	if !found {
		t.Fatal("no pillar in the obstacles")
	}
	if err := g.CastSpell("a", spellKindle, types.Position{Y: 4}); !errors.Is(err, ErrNoLineOfSight) {
		t.Errorf("Kindle past the pillar = %v, want ErrNoLineOfSight", err)
	}

	// A corner cell with one way out: a pillar on that way out is refused.
	g = duel(t, types.Position{X: 7}, types.Position{X: -3})
	g.mu.Lock()
	g.obstacles[types.Position{X: 6, Y: 1}] = true
	g.obstacles[types.Position{X: 6, Y: -1}] = true
	g.mu.Unlock()
	withAP(g, "a", 99)
	if err := g.CastSpell("a", spellPillar, types.Position{X: 5}); !errors.Is(err, ErrWouldWallIn) {
		t.Errorf("pillar sealing a pocket = %v, want ErrWouldWallIn", err)
	}
}

func TestEarthquakeOpensFissuresAroundItsCaster(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{X: 1})
	asClass(g, "a", "stonewarden")
	onTurn(g, UltimateFromTurn)
	cast(t, g, "a", spellEarthquake, types.Position{X: 1})

	if hp := health(t, g, "a"); hp != StartingHealth {
		t.Errorf("the caster took %d from its own quake", StartingHealth-hp)
	}
	if want := StartingHealth - withBonus(damageOf(g, spellEarthquake)); health(t, g, "b") != want {
		t.Errorf("health = %d, want %d with the melee bonus", health(t, g, "b"), want)
	}
	for _, off := range quakeFissures {
		if kind := terrainAt(g, off); kind != types.TerrainFissure {
			t.Errorf("terrain at %+v = %q, want a fissure", off, kind)
		}
	}
	mustEndTurn(t, g)
	if mp := character(g, "b").MovementPoints; mp != StartingMovementPoints-2 {
		t.Errorf("b's movement points = %d, want %d", mp, StartingMovementPoints-2)
	}
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

func TestARematchWipesTheBoardAndTheUltimates(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 2})
	onTurn(g, UltimateFromTurn)
	withAP(g, "a", 99)
	cast(t, g, "a", spellTempest, types.Position{Y: 5})
	cast(t, g, "a", spellScorched, types.Position{X: 3})

	g.mu.Lock()
	b := g.players["b"]
	b.Character.Health = 1
	g.players["b"] = b
	g.mu.Unlock()
	cast(t, g, "a", spellKindle, types.Position{Y: 2})
	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q, want the fight over", g.Status())
	}
	if err := g.Restart("a"); err != nil {
		t.Fatalf("Restart: %v", err)
	}
	snap := g.Snapshot()
	if len(snap.Terrain) != 0 || len(snap.Zones) != 0 {
		t.Errorf("rematch kept %d terrain cells and %d zones", len(snap.Terrain), len(snap.Zones))
	}
	if snap.Players["a"].Spells["10"].Spent {
		t.Error("rematch kept the ultimate spent")
	}
}

func TestSnapshotsAlwaysCarryTerrainAndZonesAsArrays(t *testing.T) {
	snap := New().Snapshot()
	if snap.Terrain == nil || snap.Zones == nil {
		t.Errorf("terrain = %v, zones = %v, want empty arrays rather than null", snap.Terrain, snap.Zones)
	}
}

func TestADeathOnATrapEndsTheFight(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 5})
	lay(g, types.Position{X: 1}, types.TerrainTrap, "b")
	g.mu.Lock()
	a := g.players["a"]
	a.Character.Health = 3
	g.players["a"] = a
	g.mu.Unlock()

	move(t, g, "a", types.Position{X: 1})
	if g.Status() != types.StatusGameOver {
		t.Errorf("status = %q after walking to death, want the fight over", g.Status())
	}
}

// ---------------------------------------------------------------------------
// The bot
// ---------------------------------------------------------------------------

func TestBotLeapsIntoReach(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 5})
	setBar(g, "a", "16", "17")
	asClass(g, "a", "stonewarden")

	action := DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotCast || action.SpellID != spellEarthleap {
		t.Fatalf("action = %+v, want a leap", action)
	}
	if Distance(action.Target, types.Position{Y: 5}) != 1 {
		t.Errorf("leaps to %+v, want a cell next to the enemy", action.Target)
	}
}

func TestBotSetsARelayToReachAFarEnemy(t *testing.T) {
	g := duel(t, types.Position{X: -4}, types.Position{X: 5})
	setBar(g, "a", "6", "7")
	g.mu.Lock()
	p := g.players["a"]
	p.Character.MovementPoints = 0
	g.players["a"] = p
	g.mu.Unlock()

	action := DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotCast || action.SpellID != spellUpdraft {
		t.Fatalf("action = %+v, want a relay", action)
	}
	cast(t, g, "a", action.SpellID, action.Target)

	action = DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotCast || action.SpellID != spellLightning {
		t.Errorf("action after the relay = %+v, want Lightning through it", action)
	}
}

func TestBotHoldsItsUltimateUntilItUnlocks(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	setBar(g, "a", "5")
	if action := DecideBotAction(g.Snapshot(), "a"); action.Kind == BotCast {
		t.Errorf("the bot cast %d on turn 1", action.SpellID)
	}
	onTurn(g, UltimateFromTurn)
	if action := DecideBotAction(g.Snapshot(), "a"); action.Kind != BotCast || action.SpellID != spellMeteor {
		t.Errorf("action on turn 2 = %+v, want the Meteor", action)
	}
}
