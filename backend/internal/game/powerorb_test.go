package game

import (
	"testing"

	"game-server/internal/types"
)

// playRounds ends turns until the round counter reaches the given one.
func playRounds(t *testing.T, g *Game, until int) {
	t.Helper()
	for g.Snapshot().TurnNumber < until {
		g.mu.RLock()
		actor := g.turnOrder[g.turnIdx]
		g.mu.RUnlock()
		if err := g.EndTurn(actor); err != nil {
			t.Fatalf("EndTurn(%s): %v", actor, err)
		}
	}
}

// placeOrb puts the orb on a chosen cell, bypassing the spawn roll.
func placeOrb(g *Game, at types.Position) {
	g.mu.Lock()
	g.powerOrb = &at
	g.mu.Unlock()
}

func TestPowerOrbAppearsWhenTheThirdRoundOpens(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: -4, Y: 1},
		"b": {X: 4, Y: -1},
	}, "a", "b")

	playRounds(t, g, PowerOrbTurn-1)
	if orb := g.Snapshot().PowerOrb; orb != nil {
		t.Fatalf("orb at %+v during round %d, want none before round %d", *orb, PowerOrbTurn-1, PowerOrbTurn)
	}

	playRounds(t, g, PowerOrbTurn)
	state := g.Snapshot()
	if state.PowerOrb == nil {
		t.Fatal("no orb once the third round opened")
	}
	orb := *state.PowerOrb

	g.mu.RLock()
	blocked := g.blocksMovementLocked(orb)
	g.mu.RUnlock()
	if !InGrid(orb) || blocked {
		t.Errorf("orb spawned on %+v, which is off the board or blocked", orb)
	}
	for _, id := range []string{"a", "b"} {
		if d := Distance(*state.Players[id].Character.Position, orb); d < powerOrbMinDistance {
			t.Errorf("orb spawned %d cell(s) from %s", d, id)
		}
	}

	logged := false
	for _, e := range state.Log {
		logged = logged || (e.Kind == types.LogOrb && e.Target != nil && *e.Target == orb)
	}
	if !logged {
		t.Error("the orb appeared without a log line saying where")
	}
}

func TestPowerOrbSpawnIsFairAndReproducible(t *testing.T) {
	spawn := func() types.Position {
		g := playingGame(t, map[string]types.Position{
			"a": {X: -3, Y: -3},
			"b": {X: 3, Y: 3},
		}, "a", "b")
		playRounds(t, g, PowerOrbTurn)
		orb := g.Snapshot().PowerOrb
		if orb == nil {
			t.Fatal("no orb")
		}
		return *orb
	}

	first := spawn()
	if again := spawn(); again != first {
		t.Errorf("same seed, orb at %+v then %+v", first, again)
	}

	// Walked distances, not straight lines, but on a board this open the two
	// should come out close; a wide gap means the pick ignored fairness.
	da := Distance(types.Position{X: -3, Y: -3}, first)
	db := Distance(types.Position{X: 3, Y: 3}, first)
	if diff := da - db; diff > 2 || diff < -2 {
		t.Errorf("orb at %+v is %d away from a and %d from b", first, da, db)
	}
}

func TestSteppingOnThePowerOrbClaimsIt(t *testing.T) {
	g := twoPlayerGame(t)
	orb := types.Position{X: 1, Y: 0}
	placeOrb(g, orb)

	g.mu.Lock()
	a := g.players["a"]
	a.Character.Health = StartingHealth - 50
	g.players["a"] = a
	g.mu.Unlock()

	if err := g.Move("a", orb); err != nil {
		t.Fatalf("Move onto the orb: %v", err)
	}

	state := g.Snapshot()
	if state.PowerOrb != nil {
		t.Error("the orb is still on the board after being claimed")
	}
	c := state.Players["a"].Character
	if want := StartingHealth - 50 + PowerOrbHeal; c.Health != want {
		t.Errorf("health = %d, want %d", c.Health, want)
	}
	if want := StartingActionPoints + PowerOrbAP; c.ActionPoints != want {
		t.Errorf("AP = %d, want %d right away", c.ActionPoints, want)
	}
	if want := StartingMovementPoints - 1 + PowerOrbMP; c.MovementPoints != want {
		t.Errorf("MP = %d, want %d right away", c.MovementPoints, want)
	}
	for kind, want := range map[string]int{
		types.EffectAP: PowerOrbAP, types.EffectMP: PowerOrbMP,
		types.EffectShield: PowerOrbShield, types.EffectPower: PowerOrbPower,
	} {
		if got := effectTotal(c, kind); got != want {
			t.Errorf("%s effect = %d, want %d", kind, got, want)
		}
	}
	if last := state.Log[len(state.Log)-1]; last.Kind != types.LogOrb || last.Actor != c.Name {
		t.Errorf("last log entry = %+v, want the claim", last)
	}
}

func TestPowerOrbHealNeverOverfills(t *testing.T) {
	g := twoPlayerGame(t)
	placeOrb(g, types.Position{X: 1, Y: 0})
	if err := g.Move("a", types.Position{X: 1, Y: 0}); err != nil {
		t.Fatal(err)
	}
	if hp := health(t, g, "a"); hp != StartingHealth {
		t.Errorf("health = %d, want capped at %d", hp, StartingHealth)
	}
}

func TestWalkingPastThePowerOrbLeavesIt(t *testing.T) {
	g := twoPlayerGame(t)
	orb := types.Position{X: 1, Y: 0}
	placeOrb(g, orb)
	if err := g.Move("a", types.Position{X: -1, Y: 0}); err != nil {
		t.Fatal(err)
	}
	if got := g.Snapshot().PowerOrb; got == nil || *got != orb {
		t.Errorf("orb = %v, want it still at %+v", got, orb)
	}
}

func TestPowerMakesEveryHitHarder(t *testing.T) {
	g := twoPlayerGame(t)
	g.mu.Lock()
	ember := g.spells["1"]
	ember.CriticalChance = 0
	g.spells["1"] = ember
	g.mu.Unlock()

	placeOrb(g, types.Position{X: 1, Y: 0})
	if err := g.Move("a", types.Position{X: 1, Y: 0}); err != nil {
		t.Fatal(err)
	}
	if err := g.Move("a", types.Position{X: 0, Y: 0}); err != nil {
		t.Fatal(err)
	}
	if err := g.CastSpell("a", 1, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}
	if want := StartingHealth - ember.Damage - PowerOrbPower; health(t, g, "b") != want {
		t.Errorf("target health = %d, want %d", health(t, g, "b"), want)
	}
}

func TestPowerOrbBuffWearsOff(t *testing.T) {
	g := twoPlayerGame(t)
	placeOrb(g, types.Position{X: 1, Y: 0})
	if err := g.Move("a", types.Position{X: 1, Y: 0}); err != nil {
		t.Fatal(err)
	}

	// The pickup turn counts; the buff then carries through the holder's next
	// PowerOrbDuration-1 turns and is gone on the one after.
	for turn := 1; turn <= PowerOrbDuration; turn++ {
		if err := g.EndTurn("a"); err != nil {
			t.Fatal(err)
		}
		if err := g.EndTurn("b"); err != nil {
			t.Fatal(err)
		}
		c := g.Snapshot().Players["a"].Character
		active := effectTotal(c, types.EffectPower) > 0
		if want := turn < PowerOrbDuration; active != want {
			t.Errorf("holder's turn %d after pickup: buff active = %v, want %v", turn, active, want)
		}
		if want := StartingActionPoints; !active && c.ActionPoints != want {
			t.Errorf("AP = %d once the buff wore off, want %d", c.ActionPoints, want)
		}
	}
}

func TestRematchClearsThePowerOrb(t *testing.T) {
	g := twoPlayerGame(t)
	placeOrb(g, types.Position{X: 1, Y: 0})

	g.mu.Lock()
	g.status = types.StatusGameOver
	g.mu.Unlock()
	if err := g.Restart("a"); err != nil {
		t.Fatal(err)
	}
	if orb := g.Snapshot().PowerOrb; orb != nil {
		t.Errorf("orb at %+v carried into the rematch", *orb)
	}
}

func TestBotGoesForAReachablePowerOrb(t *testing.T) {
	g := twoPlayerGame(t)
	orb := types.Position{X: -1, Y: 1}
	placeOrb(g, orb)

	// "b" is in Fireball range, so without the orb the bot would cast.
	action := DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotMove || action.Target != orb {
		t.Errorf("action = %+v, want a move onto the orb at %+v", action, orb)
	}
}

func TestBotIgnoresAnOrbOutOfReach(t *testing.T) {
	g := twoPlayerGame(t)
	placeOrb(g, types.Position{X: -7, Y: 0})

	if action := DecideBotAction(g.Snapshot(), "a"); action.Kind != BotCast {
		t.Errorf("action = %+v, want the usual cast", action)
	}
}
