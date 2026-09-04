package game

import (
	"errors"
	"math/rand"
	"testing"

	"game-server/internal/types"
)

// ---------------------------------------------------------------------------
// Pathfinding
// ---------------------------------------------------------------------------

func TestPathIsTheShortestWalkOnEmptyGround(t *testing.T) {
	clear := func(types.Position) bool { return false }
	from, to := types.Position{X: 0, Y: 0}, types.Position{X: 2, Y: 3}

	path := FindPath(from, to, clear)
	if len(path) != Distance(from, to) {
		t.Fatalf("path length = %d, want %d on open ground", len(path), Distance(from, to))
	}
	if path[len(path)-1] != to {
		t.Errorf("path ends at %+v, want %+v", path[len(path)-1], to)
	}
	// Every step is orthogonal and on the board.
	prev := from
	for _, step := range path {
		if Distance(prev, step) != 1 || !InGrid(step) {
			t.Fatalf("illegal step from %+v to %+v", prev, step)
		}
		prev = step
	}
}

func TestPathGoesAroundCover(t *testing.T) {
	// A wall across the direct route: the walk has to be longer than the
	// straight-line distance, which is exactly what movement used to charge.
	wall := map[types.Position]bool{
		{X: 1, Y: -1}: true, {X: 1, Y: 0}: true, {X: 1, Y: 1}: true,
	}
	blocked := func(p types.Position) bool { return wall[p] }
	from, to := types.Position{X: 0, Y: 0}, types.Position{X: 2, Y: 0}

	path := FindPath(from, to, blocked)
	if path == nil {
		t.Fatal("no path found around a wall that can be walked round")
	}
	if len(path) <= Distance(from, to) {
		t.Errorf("path costs %d, want more than the straight line (%d)", len(path), Distance(from, to))
	}
	for _, step := range path {
		if wall[step] {
			t.Errorf("path walks through cover at %+v", step)
		}
	}
}

func TestNoPathWhenTheTargetIsWalledOff(t *testing.T) {
	corner := types.Position{X: 7, Y: 0}
	wall := map[types.Position]bool{{X: 6, Y: 0}: true, {X: 6, Y: 1}: true, {X: 7, Y: -1}: true}
	// (7,0)'s only neighbours on the board are (6,0) and (7,-1); seal both.
	blocked := func(p types.Position) bool { return wall[p] }

	if path := FindPath(types.Position{X: 0, Y: 0}, corner, blocked); path != nil {
		t.Errorf("found a path of %d steps into a sealed corner", len(path))
	}
}

func TestReachableStopsAtTheMovementPoints(t *testing.T) {
	clear := func(types.Position) bool { return false }
	reached := Reachable(types.Position{X: 0, Y: 0}, 2, clear)

	for cell, cost := range reached {
		if cost > 2 {
			t.Errorf("cell %+v listed at cost %d, beyond the 2 points available", cell, cost)
		}
		if !InGrid(cell) {
			t.Errorf("cell %+v is off the board", cell)
		}
	}
	if _, ok := reached[types.Position{X: 0, Y: 0}]; ok {
		t.Error("the starting cell is listed as somewhere to move to")
	}
	if _, ok := reached[types.Position{X: 3, Y: 0}]; ok {
		t.Error("a cell three steps away is reachable with two points")
	}
}

func TestGeneratedObstaclesLeaveTheBoardWhole(t *testing.T) {
	rng := rand.New(rand.NewSource(5))
	reserved := []types.Position{{X: -4, Y: -1}, {X: 4, Y: 1}}

	obstacles := GenerateObstacles(reserved, rng)
	blocked := map[types.Position]bool{}
	for _, o := range obstacles {
		blocked[o] = true
	}

	for _, r := range reserved {
		if blocked[r] {
			t.Errorf("cover was dropped on the starting cell %+v", r)
		}
	}
	if !boardStaysConnected(blocked, reserved) {
		t.Error("the cover cut the board into pieces")
	}
	// Anywhere on the board is still walkable from a starting cell.
	free := 0
	for x := -GridRadius; x <= GridRadius; x++ {
		for y := -GridRadius; y <= GridRadius; y++ {
			if p := (types.Position{X: x, Y: y}); InGrid(p) && !blocked[p] {
				free++
			}
		}
	}
	if reach := Reachable(reserved[0], free, func(p types.Position) bool { return blocked[p] }); len(reach)+1 != free {
		t.Errorf("%d of %d free cells are reachable", len(reach)+1, free)
	}
}

// ---------------------------------------------------------------------------
// Movement with cover on the board
// ---------------------------------------------------------------------------

func TestMovementIsChargedForTheWalkNotTheDistance(t *testing.T) {
	g := twoPlayerGame(t)

	// Wall off the straight route from (0,0) to (2,0).
	g.mu.Lock()
	g.obstacles = map[types.Position]bool{{X: 1, Y: 0}: true}
	g.mu.Unlock()

	if err := g.Move("a", types.Position{X: 2, Y: 0}); err != nil {
		t.Fatalf("Move around cover: %v", err)
	}
	// Two cells apart in a straight line, but the walk round costs four.
	if mp := g.Snapshot().Players["a"].Character.MovementPoints; mp != 0 {
		t.Errorf("movement points left = %d, want 0 for a four-step detour", mp)
	}
}

func TestMoveOntoCoverIsRefused(t *testing.T) {
	g := twoPlayerGame(t)
	g.mu.Lock()
	g.obstacles = map[types.Position]bool{{X: 1, Y: 0}: true}
	g.mu.Unlock()

	if err := g.Move("a", types.Position{X: 1, Y: 0}); !errors.Is(err, ErrBlocked) {
		t.Errorf("Move onto cover = %v, want ErrBlocked", err)
	}
}

func TestMoveWithNoWayThroughIsRefused(t *testing.T) {
	g := twoPlayerGame(t)

	// Seal the far corner off entirely.
	g.mu.Lock()
	g.obstacles = map[types.Position]bool{
		{X: 6, Y: 0}: true, {X: 7, Y: -1}: true,
	}
	p := g.players["a"]
	p.Character.MovementPoints = 99
	g.players["a"] = p
	g.mu.Unlock()

	if err := g.Move("a", types.Position{X: 7, Y: 0}); !errors.Is(err, ErrNoRoute) {
		t.Errorf("Move into a sealed corner = %v, want ErrNoRoute", err)
	}
}

func TestCoverBlocksLineOfSight(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	g.obstacles = map[types.Position]bool{{X: 0, Y: 2}: true}
	g.mu.Unlock()

	if err := g.CastSpell("a", 2, types.Position{X: 0, Y: 3}); !errors.Is(err, ErrNoLineOfSight) {
		t.Errorf("CastSpell through cover = %v, want ErrNoLineOfSight", err)
	}
}

// ---------------------------------------------------------------------------
// Status effects
// ---------------------------------------------------------------------------

func TestPoisonBitesAtTheStartOfItsVictimsTurn(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	applyEffect(&p.Character, types.Effect{
		Kind: types.EffectPoison, Value: 7, TurnsLeft: 2, Source: "Test",
	})
	g.players["b"] = p
	g.mu.Unlock()

	// Nothing happens until it is "b"'s turn.
	if hp := g.Snapshot().Players["b"].Character.Health; hp != StartingHealth {
		t.Fatalf("poison bit early: %d health", hp)
	}

	mustEndTurn(t, g) // a -> b, the poison ticks
	if hp := g.Snapshot().Players["b"].Character.Health; hp != StartingHealth-7 {
		t.Errorf("health = %d, want %d after one tick", hp, StartingHealth-7)
	}
	if left := g.Snapshot().Players["b"].Character.Effects[0].TurnsLeft; left != 1 {
		t.Errorf("turns left = %d, want 1", left)
	}
}

func TestEffectsExpire(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	applyEffect(&p.Character, types.Effect{
		Kind: types.EffectPoison, Value: 3, TurnsLeft: 1, Source: "Test",
	})
	g.players["b"] = p
	g.mu.Unlock()

	mustEndTurn(t, g) // b's turn: ticks once, then expires
	if fx := g.Snapshot().Players["b"].Character.Effects; len(fx) != 0 {
		t.Errorf("effects still riding after expiry: %+v", fx)
	}

	before := g.Snapshot().Players["b"].Character.Health
	mustEndTurn(t, g)
	mustEndTurn(t, g)
	if hp := g.Snapshot().Players["b"].Character.Health; hp != before {
		t.Errorf("an expired poison kept biting: %d -> %d", before, hp)
	}
}

func TestPoisonCanFinishACharacterAndEndTheGame(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	p.Character.Health = 4
	applyEffect(&p.Character, types.Effect{
		Kind: types.EffectPoison, Value: 10, TurnsLeft: 3, Source: "Test",
	})
	g.players["b"] = p
	g.mu.Unlock()

	mustEndTurn(t, g) // b's turn opens and the poison finishes it

	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q, want the game over", g.Status())
	}
	if winner, over := g.Winner(); !over || winner != "Playera" {
		t.Errorf("winner = %q (over=%v), want \"Playera\"", winner, over)
	}
}

func TestShieldSoaksDamage(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	applyEffect(&p.Character, types.Effect{
		Kind: types.EffectShield, Value: 6, TurnsLeft: 3, Source: "Test",
	})
	g.players["b"] = p
	g.mu.Unlock()

	// Frost Nova deals 10; six of it is soaked. Force a normal hit.
	g.mu.Lock()
	spell := g.spells["5"]
	spell.CriticalChance = 0
	g.spells["5"] = spell
	g.mu.Unlock()

	if err := g.CastSpell("a", 5, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}
	if hp := g.Snapshot().Players["b"].Character.Health; hp != StartingHealth-4 {
		t.Errorf("health = %d, want %d with a shield of 6 against 10 damage", hp, StartingHealth-4)
	}
}

func TestShieldNeverHeals(t *testing.T) {
	c := types.Character{Effects: []types.Effect{{Kind: types.EffectShield, Value: 50}}}
	if got := absorb(c, 10); got != 0 {
		t.Errorf("absorb = %d, want 0 — a shield stops damage, it does not reverse it", got)
	}
}

func TestPointModifiersChangeWhatATurnRestores(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	applyEffect(&p.Character, types.Effect{Kind: types.EffectAP, Value: 2, TurnsLeft: 3, Source: "Boost"})
	applyEffect(&p.Character, types.Effect{Kind: types.EffectMP, Value: -2, TurnsLeft: 3, Source: "Slow"})
	g.players["b"] = p
	g.mu.Unlock()

	mustEndTurn(t, g) // b's turn begins

	c := g.Snapshot().Players["b"].Character
	if c.ActionPoints != StartingActionPoints+2 {
		t.Errorf("action points = %d, want %d", c.ActionPoints, StartingActionPoints+2)
	}
	if c.MovementPoints != StartingMovementPoints-2 {
		t.Errorf("movement points = %d, want %d", c.MovementPoints, StartingMovementPoints-2)
	}
}

func TestPointsNeverGoNegative(t *testing.T) {
	c := types.Character{Effects: []types.Effect{
		{Kind: types.EffectAP, Value: -99},
		{Kind: types.EffectMP, Value: -99},
	}}
	ap, mp := turnPoints(c)
	if ap != 0 || mp != 0 {
		t.Errorf("points = %d AP / %d MP, want 0 and 0", ap, mp)
	}
}

func TestSameEffectRefreshesRatherThanStacks(t *testing.T) {
	c := types.Character{}
	applyEffect(&c, types.Effect{Kind: types.EffectPoison, Value: 5, TurnsLeft: 2, Source: "Dart"})
	applyEffect(&c, types.Effect{Kind: types.EffectPoison, Value: 8, TurnsLeft: 1, Source: "Dart"})

	if len(c.Effects) != 1 {
		t.Fatalf("%d effects, want one refreshed copy: %+v", len(c.Effects), c.Effects)
	}
	if c.Effects[0].Value != 8 || c.Effects[0].TurnsLeft != 2 {
		t.Errorf("effect = %+v, want the stronger value and the longer duration", c.Effects[0])
	}

	// A different source is a different effect and rides alongside.
	applyEffect(&c, types.Effect{Kind: types.EffectPoison, Value: 3, TurnsLeft: 4, Source: "Cloud"})
	if len(c.Effects) != 2 {
		t.Errorf("%d effects, want two from different sources", len(c.Effects))
	}
}

func TestRegenIsCappedAtFullHealth(t *testing.T) {
	c := types.Character{
		Health: 95, MaxHealth: 100, IsAlive: true,
		Effects: []types.Effect{{Kind: types.EffectRegen, Value: 20, TurnsLeft: 2}},
	}
	_, healed := tickEffects(&c)
	if c.Health != 100 {
		t.Errorf("health = %d, want it capped at 100", c.Health)
	}
	if healed != 5 {
		t.Errorf("reported healing = %d, want the 5 that were actually restored", healed)
	}
}

func TestSpellsCanCarryAnEffect(t *testing.T) {
	g := twoPlayerGame(t)

	// Ember carries no effect of its own, so the one under test is the only one.
	g.mu.Lock()
	spell := g.spells["1"]
	spell.Effect = &types.SpellEffect{Kind: types.EffectPoison, Value: 4, Duration: 2}
	g.spells["1"] = spell
	g.mu.Unlock()

	if err := g.CastSpell("a", 1, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}

	fx := g.Snapshot().Players["b"].Character.Effects
	if len(fx) != 1 || fx[0].Kind != types.EffectPoison || fx[0].Value != 4 {
		t.Fatalf("effects on the target = %+v, want one poison of 4", fx)
	}
	if fx[0].Source != "Ember" {
		t.Errorf("source = %q, want the spell's name", fx[0].Source)
	}
}

func TestSelfTargetedEffectLandsOnTheCaster(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	spell := g.spells["1"]
	spell.Effect = &types.SpellEffect{
		Kind: types.EffectShield, Value: 5, Duration: 2, OnSelf: true,
	}
	g.spells["1"] = spell
	g.mu.Unlock()

	if err := g.CastSpell("a", 1, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}

	if fx := g.Snapshot().Players["a"].Character.Effects; len(fx) != 1 || fx[0].Kind != types.EffectShield {
		t.Errorf("caster's effects = %+v, want the shield", fx)
	}
	if fx := g.Snapshot().Players["b"].Character.Effects; len(fx) != 0 {
		t.Errorf("the target picked up a self-targeted effect: %+v", fx)
	}
}

func TestObstaclesTravelWithTheState(t *testing.T) {
	g := New()
	for _, id := range []string{"a", "b"} {
		if err := g.AddPlayer(id, "User-"+id, look("Player"+id)); err != nil {
			t.Fatalf("AddPlayer(%s): %v", id, err)
		}
	}

	snap := g.Snapshot()
	if len(snap.Obstacles) == 0 {
		t.Fatal("the placement phase opened with no cover on the board")
	}
	for _, o := range snap.Obstacles {
		if !InGrid(o) {
			t.Errorf("cover at %+v is off the board", o)
		}
		for _, p := range snap.Players {
			for _, start := range p.Character.InitialPositions {
				if start == o {
					t.Errorf("cover sits on the starting cell %+v", start)
				}
			}
		}
	}
}
