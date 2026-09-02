package game

import (
	"errors"
	"math/rand"
	"testing"
	"time"

	"game-server/internal/types"
)

// ---------------------------------------------------------------------------
// Line of sight
// ---------------------------------------------------------------------------

func TestLineOfSightIsClearAcrossEmptyGround(t *testing.T) {
	none := func(types.Position) bool { return false }
	cases := [][2]types.Position{
		{{X: 0, Y: 0}, {X: 0, Y: 5}},
		{{X: -3, Y: -3}, {X: 3, Y: 3}},
		{{X: 2, Y: -1}, {X: -2, Y: 4}},
		{{X: 1, Y: 1}, {X: 1, Y: 1}},
	}
	for _, c := range cases {
		if !HasLineOfSight(c[0], c[1], none) {
			t.Errorf("HasLineOfSight(%+v, %+v) = false on empty ground", c[0], c[1])
		}
	}
}

func TestLineOfSightIsBrokenByACharacterInTheWay(t *testing.T) {
	wall := types.Position{X: 0, Y: 3}
	blocked := func(p types.Position) bool { return p == wall }

	if HasLineOfSight(types.Position{X: 0, Y: 0}, types.Position{X: 0, Y: 6}, blocked) {
		t.Error("a character standing directly between two cells did not block sight")
	}
	// Off the line, it blocks nothing.
	if !HasLineOfSight(types.Position{X: 0, Y: 0}, types.Position{X: 6, Y: 0}, blocked) {
		t.Error("a character to the side blocked sight")
	}
}

func TestEndpointsNeverBlockTheirOwnLine(t *testing.T) {
	// The caster's own cell and the target's cell are always occupied; if they
	// counted, no line-of-sight spell could ever be cast at anyone.
	from := types.Position{X: 0, Y: 0}
	to := types.Position{X: 0, Y: 4}
	blocked := func(p types.Position) bool { return p == from || p == to }

	if !HasLineOfSight(from, to, blocked) {
		t.Error("the endpoints blocked their own line")
	}
}

// ---------------------------------------------------------------------------
// Casting rules
// ---------------------------------------------------------------------------

func TestCastRefusedWithoutLineOfSight(t *testing.T) {
	// "b" stands between "a" and "c", on the straight line joining them.
	g := playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 2},
		"c": {X: 0, Y: 4},
	}, "a", "b", "c")

	// Fireball needs line of sight; the shot at "c" is screened by "b".
	if err := g.CastSpell("a", 1, types.Position{X: 0, Y: 4}); !errors.Is(err, ErrNoLineOfSight) {
		t.Fatalf("CastSpell through a character = %v, want ErrNoLineOfSight", err)
	}
	if hp := g.Snapshot().Players["c"].Character.Health; hp != StartingHealth {
		t.Errorf("the screened target lost %d health", StartingHealth-hp)
	}
	if ap := g.Snapshot().Players["a"].Character.ActionPoints; ap != StartingActionPoints {
		t.Errorf("a refused cast still charged action points (%d)", ap)
	}
}

func TestSpellWithoutLineOfSightRequirementIgnoresScreens(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 1},
		"c": {X: 0, Y: 2},
	}, "a", "b", "c")

	// Gwendo na Gwendo (id 4) has needsLineOfSight false.
	if err := g.CastSpell("a", 4, types.Position{X: 0, Y: 2}); err != nil {
		t.Fatalf("CastSpell that ignores sight: %v", err)
	}
}

func TestSpellRespectsItsCastsPerTurn(t *testing.T) {
	g := twoPlayerGame(t)
	target := types.Position{X: 0, Y: 3}

	// Ice Spike: three casts a turn and no cooldown, so the per-turn limit is
	// the only thing that can stop it. Action points are lifted out of the way
	// so the limit is what is actually under test.
	g.mu.Lock()
	p := g.players["a"]
	p.Character.ActionPoints = 99
	g.players["a"] = p
	g.mu.Unlock()

	for i := 1; i <= 3; i++ {
		if err := g.CastSpell("a", 2, target); err != nil {
			t.Fatalf("cast %d: %v", i, err)
		}
	}
	if err := g.CastSpell("a", 2, target); !errors.Is(err, ErrTooManyCasts) {
		t.Errorf("fourth cast = %v, want ErrTooManyCasts", err)
	}
}

// Fireball carries MaxCastsPerTurn 2 alongside a one-turn cooldown, and costs
// 4 of a player's 6 action points. Both of those already make a second cast
// impossible, so the limit is unreachable — inherited from data that nothing
// used to enforce. Recorded here rather than silently "fixed": the numbers are
// a design call.
func TestFireballsPerTurnLimitIsUnreachable(t *testing.T) {
	g := twoPlayerGame(t)
	target := types.Position{X: 0, Y: 3}

	g.mu.Lock()
	p := g.players["a"]
	p.Character.ActionPoints = 99 // remove the AP constraint
	g.players["a"] = p
	g.mu.Unlock()

	if err := g.CastSpell("a", 1, target); err != nil {
		t.Fatalf("first cast: %v", err)
	}
	if err := g.CastSpell("a", 1, target); !errors.Is(err, ErrSpellOnCooldown) {
		t.Errorf("second cast = %v, want the cooldown to stop it first", err)
	}
}

func TestCooldownBlocksTheNextTurnAndThenClears(t *testing.T) {
	g := twoPlayerGame(t)
	target := types.Position{X: 0, Y: 3}

	// Fireball has a one-turn cooldown.
	if err := g.CastSpell("a", 1, target); err != nil {
		t.Fatalf("first cast: %v", err)
	}
	if got := g.Snapshot().Players["a"].Spells["1"].CooldownLeft; got != 1 {
		t.Fatalf("cooldown after casting = %d, want 1", got)
	}

	mustEndTurn(t, g) // a -> b
	mustEndTurn(t, g) // b -> a, one tick off the cooldown

	if got := g.Snapshot().Players["a"].Spells["1"].CooldownLeft; got != 0 {
		t.Fatalf("cooldown after a full round = %d, want 0", got)
	}
	if err := g.CastSpell("a", 1, target); err != nil {
		t.Errorf("cast once the cooldown expired: %v", err)
	}
}

func TestCastsPerTurnResetAtTheStartOfATurn(t *testing.T) {
	g := twoPlayerGame(t)
	target := types.Position{X: 0, Y: 3}

	// Poison Dart: 2 AP, four casts a turn, no cooldown.
	for i := 0; i < 3; i++ {
		if err := g.CastSpell("a", 3, target); err != nil {
			t.Fatalf("cast %d: %v", i, err)
		}
	}
	if got := g.Snapshot().Players["a"].Spells["3"].CastsThisTurn; got != 3 {
		t.Fatalf("casts this turn = %d, want 3", got)
	}

	mustEndTurn(t, g)
	mustEndTurn(t, g)

	if got := g.Snapshot().Players["a"].Spells["3"].CastsThisTurn; got != 0 {
		t.Errorf("casts this turn = %d after the turn came round, want 0", got)
	}
}

// ---------------------------------------------------------------------------
// Critical hits
// ---------------------------------------------------------------------------

func TestCriticalHitsReplaceTheDamage(t *testing.T) {
	// Poison Dart: 10 damage, 15 on a critical, 20% chance. Over many casts
	// both outcomes have to show up, and only those two.
	seen := map[int]int{}
	for seed := 0; seed < 60; seed++ {
		g := playingGame(t, map[string]types.Position{
			"a": {X: 0, Y: 0},
			"b": {X: 0, Y: 3},
		}, "a", "b")
		g.mu.Lock()
		g.rng = rand.New(rand.NewSource(int64(seed)))
		g.mu.Unlock()

		if err := g.CastSpell("a", 3, types.Position{X: 0, Y: 3}); err != nil {
			t.Fatalf("CastSpell: %v", err)
		}
		seen[StartingHealth-g.Snapshot().Players["b"].Character.Health]++
	}

	for dmg := range seen {
		if dmg != 10 && dmg != 15 {
			t.Errorf("saw %d damage, want only 10 (normal) or 15 (critical)", dmg)
		}
	}
	if seen[10] == 0 || seen[15] == 0 {
		t.Errorf("over 60 casts the outcomes were %v, want both a normal and a critical", seen)
	}
}

func TestCriticalIsRecordedInTheLog(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 3},
	}, "a", "b")

	// A spell that always crits, so the assertion does not depend on a roll.
	g.mu.Lock()
	spell := g.spells["3"]
	spell.CriticalChance = 100
	g.spells["3"] = spell
	g.mu.Unlock()

	if err := g.CastSpell("a", 3, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}

	log := g.Snapshot().Log
	last := log[len(log)-1]
	if last.Kind != types.LogCast || !last.Crit {
		t.Fatalf("last log entry = %+v, want a critical cast", last)
	}
	if last.Damage != 15 {
		t.Errorf("logged damage = %d, want 15", last.Damage)
	}
}

// ---------------------------------------------------------------------------
// Combat log
// ---------------------------------------------------------------------------

func TestLogRecordsTurnsCastsAndDeaths(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	p.Character.Health = 5
	g.players["b"] = p
	g.mu.Unlock()

	if err := g.CastSpell("a", 3, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}

	kinds := map[string]bool{}
	for _, e := range g.Snapshot().Log {
		kinds[e.Kind] = true
	}
	for _, want := range []string{types.LogTurn, types.LogCast, types.LogDeath, types.LogEnd} {
		if !kinds[want] {
			t.Errorf("the log has no %q entry: %+v", want, g.Snapshot().Log)
		}
	}
}

func TestLogIsBounded(t *testing.T) {
	g := twoPlayerGame(t)
	for i := 0; i < MaxLogEntries*2; i++ {
		mustEndTurn(t, g)
	}
	if n := len(g.Snapshot().Log); n > MaxLogEntries {
		t.Errorf("log holds %d entries, want at most %d", n, MaxLogEntries)
	}
}

func TestRestartClearsTheLogAndSpellState(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	p.Character.Health = 5
	g.players["b"] = p
	g.mu.Unlock()

	if err := g.CastSpell("a", 1, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}
	if err := g.Restart(); err != nil {
		t.Fatalf("Restart: %v", err)
	}

	snap := g.Snapshot()
	if len(snap.Log) != 0 {
		t.Errorf("the log survived a rematch: %+v", snap.Log)
	}
	for id, p := range snap.Players {
		for key, st := range p.Spells {
			if st.CastsThisTurn != 0 || st.CooldownLeft != 0 {
				t.Errorf("player %s kept spell %s state %+v across the rematch", id, key, st)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// The bot plays by the same rules
// ---------------------------------------------------------------------------

func TestBotWillNotPickASpellItCannotCast(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 3},
	}, "a", "b")

	// Everything on cooldown: the bot has to fall back on moving or passing.
	g.mu.Lock()
	p := g.players["a"]
	for key := range g.spells {
		p.Spells[key] = types.SpellState{CooldownLeft: 3}
	}
	g.players["a"] = p
	g.mu.Unlock()

	if action := DecideBotAction(g.Snapshot(), "a"); action.Kind == BotCast {
		t.Errorf("the bot chose to cast %d while every spell was recharging", action.SpellID)
	}
}

func TestBotStillFinishesAMatchUnderTheNewRules(t *testing.T) {
	g := NewWithOptions(rand.New(rand.NewSource(11)), time.Minute)
	if _, err := g.AddBot(); err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if err := g.SetReady("human"); err != nil {
		t.Fatalf("SetReady: %v", err)
	}
	pos := g.Snapshot().Players["human"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("human", pos); err != nil {
		t.Fatalf("ChooseInitialPosition: %v", err)
	}

	for step := 0; step < 600 && g.Status() == types.StatusPlaying; step++ {
		if _, isBot := g.CurrentBot(); isBot {
			g.PlayBotStep()
			continue
		}
		action := DecideBotAction(g.Snapshot(), "human")
		switch action.Kind {
		case BotCast:
			if g.CastSpell("human", action.SpellID, action.Target) != nil {
				g.EndTurn("human")
			}
		case BotMove:
			if g.Move("human", action.Target) != nil {
				g.EndTurn("human")
			}
		default:
			g.EndTurn("human")
		}
	}

	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q after 600 steps, want a finished match", g.Status())
	}
}
