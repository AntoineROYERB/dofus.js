package game

import (
	"errors"
	"math/rand"
	"testing"

	"game-server/internal/types"
)

func look(name string) types.CharacterAppearance {
	return types.CharacterAppearance{Name: name, Color: "#ff0000", Symbol: name[:1]}
}

// playingGame builds a game that has reached the playing phase with each
// character standing exactly where the test wants it and a fixed initiative,
// so assertions do not depend on the shuffle.
func playingGame(t *testing.T, placement map[string]types.Position, order ...string) *Game {
	t.Helper()

	g := NewWithRand(rand.New(rand.NewSource(1)))
	for _, id := range order {
		if err := g.AddPlayer(id, "User-"+id, look("Player"+id)); err != nil {
			t.Fatalf("AddPlayer(%s): %v", id, err)
		}
	}
	for _, id := range order {
		if err := g.SetReady(id); err != nil {
			t.Fatalf("SetReady(%s): %v", id, err)
		}
	}
	if g.Status() != types.StatusPositionCharacters {
		t.Fatalf("status = %q, want %q", g.Status(), types.StatusPositionCharacters)
	}

	// Replace the dealt cells with the ones the test asked for.
	g.mu.Lock()
	for id, pos := range placement {
		p := g.players[id]
		p.Character.InitialPositions = []types.Position{pos}
		g.players[id] = p
	}
	g.mu.Unlock()

	for _, id := range order {
		if err := g.ChooseInitialPosition(id, placement[id]); err != nil {
			t.Fatalf("ChooseInitialPosition(%s): %v", id, err)
		}
	}
	if g.Status() != types.StatusPlaying {
		t.Fatalf("status = %q, want %q", g.Status(), types.StatusPlaying)
	}

	g.mu.Lock()
	g.turnOrder = append([]string(nil), order...)
	g.turnIdx = 0
	g.applyTurnFlagsLocked()
	g.mu.Unlock()
	return g
}

func twoPlayerGame(t *testing.T) *Game {
	t.Helper()
	return playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 3},
	}, "a", "b")
}

func health(t *testing.T, g *Game, id string) int {
	t.Helper()
	return g.Snapshot().Players[id].Character.Health
}

// ---------------------------------------------------------------------------
// Identity and turn ownership
// ---------------------------------------------------------------------------

func TestOnlyTheCurrentPlayerCanAct(t *testing.T) {
	g := twoPlayerGame(t)

	// "b" is a real player with a living character, but it is not their turn.
	if err := g.Move("b", types.Position{X: 1, Y: 3}); !errors.Is(err, ErrNotYourTurn) {
		t.Errorf("Move out of turn = %v, want ErrNotYourTurn", err)
	}
	if err := g.CastSpell("b", 3, types.Position{X: 0, Y: 0}); !errors.Is(err, ErrNotYourTurn) {
		t.Errorf("CastSpell out of turn = %v, want ErrNotYourTurn", err)
	}
	if err := g.EndTurn("b"); !errors.Is(err, ErrNotYourTurn) {
		t.Errorf("EndTurn out of turn = %v, want ErrNotYourTurn", err)
	}
}

func TestUnknownPlayerCannotAct(t *testing.T) {
	g := twoPlayerGame(t)
	if err := g.Move("intruder", types.Position{X: 1, Y: 0}); !errors.Is(err, ErrNoCharacter) {
		t.Errorf("Move by unknown connection = %v, want ErrNoCharacter", err)
	}
}

func TestExactlyOneCharacterHoldsTheTurnFlag(t *testing.T) {
	g := twoPlayerGame(t)

	// The old code set the incoming player's flag but never cleared the
	// outgoing one, so the flags piled up round after round.
	for round := 0; round < 4; round++ {
		snap := g.Snapshot()
		current := 0
		for _, p := range snap.Players {
			if p.IsCurrentTurn != p.Character.IsCurrentTurn {
				t.Fatalf("player and character turn flags disagree: %+v", p)
			}
			if p.IsCurrentTurn {
				current++
			}
		}
		if current != 1 {
			t.Fatalf("round %d: %d characters hold the turn, want exactly 1", round, current)
		}
		if err := g.EndTurn(currentPlayerID(g)); err != nil {
			t.Fatalf("EndTurn: %v", err)
		}
	}
}

// ---------------------------------------------------------------------------
// Turn order
// ---------------------------------------------------------------------------

func TestInitiativeIsStableAcrossRounds(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 3},
		"c": {X: 3, Y: 0},
	}, "a", "b", "c")

	// Initiative used to be re-derived from Go map iteration order on every
	// turn, which reshuffled it each round.
	var seen []string
	for i := 0; i < 6; i++ {
		id := currentPlayerID(g)
		seen = append(seen, id)
		if err := g.EndTurn(id); err != nil {
			t.Fatalf("EndTurn(%s): %v", id, err)
		}
	}

	want := []string{"a", "b", "c", "a", "b", "c"}
	for i := range want {
		if seen[i] != want[i] {
			t.Fatalf("turn sequence = %v, want %v", seen, want)
		}
	}
}

func TestTurnNumberAdvancesOncePerRound(t *testing.T) {
	g := twoPlayerGame(t)
	if n := g.Snapshot().TurnNumber; n != 1 {
		t.Fatalf("turn number at start = %d, want 1", n)
	}

	mustEndTurn(t, g) // a -> b, still round 1
	if n := g.Snapshot().TurnNumber; n != 1 {
		t.Errorf("turn number mid-round = %d, want 1", n)
	}

	mustEndTurn(t, g) // b -> a, round 2
	if n := g.Snapshot().TurnNumber; n != 2 {
		t.Errorf("turn number after a full round = %d, want 2", n)
	}
}

func TestDeadPlayersAreSkipped(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 3},
		"c": {X: 3, Y: 0},
	}, "a", "b", "c")

	g.mu.Lock()
	p := g.players["b"]
	p.Character.IsAlive = false
	p.Character.Health = 0
	g.players["b"] = p
	g.mu.Unlock()

	mustEndTurn(t, g)
	if id := currentPlayerID(g); id != "c" {
		t.Errorf("after a's turn the acting player is %q, want \"c\" (b is dead)", id)
	}
}

func TestTurnStartRestoresActionAndMovementPoints(t *testing.T) {
	g := twoPlayerGame(t)

	if err := g.Move("a", types.Position{X: 2, Y: 0}); err != nil {
		t.Fatalf("Move: %v", err)
	}
	if mp := g.Snapshot().Players["a"].Character.MovementPoints; mp != StartingMovementPoints-2 {
		t.Fatalf("MP after moving 2 cells = %d, want %d", mp, StartingMovementPoints-2)
	}

	mustEndTurn(t, g) // a -> b
	mustEndTurn(t, g) // b -> a

	c := g.Snapshot().Players["a"].Character
	if c.MovementPoints != StartingMovementPoints || c.ActionPoints != StartingActionPoints {
		t.Errorf("new turn stats = %d MP / %d AP, want %d / %d",
			c.MovementPoints, c.ActionPoints, StartingMovementPoints, StartingActionPoints)
	}
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

func TestMoveChargesMovementPoints(t *testing.T) {
	g := twoPlayerGame(t)

	if err := g.Move("a", types.Position{X: 1, Y: 1}); err != nil {
		t.Fatalf("Move: %v", err)
	}
	c := g.Snapshot().Players["a"].Character
	if *c.Position != (types.Position{X: 1, Y: 1}) {
		t.Errorf("position = %+v, want {1 1}", *c.Position)
	}
	if c.MovementPoints != StartingMovementPoints-2 {
		t.Errorf("MP = %d, want %d", c.MovementPoints, StartingMovementPoints-2)
	}
}

func TestMoveIsRejectedWhenItBreaksTheRules(t *testing.T) {
	cases := []struct {
		name string
		to   types.Position
		want error
	}{
		{"beyond movement points", types.Position{X: 5, Y: 0}, ErrNotEnoughMP},
		{"off the board", types.Position{X: 40, Y: 0}, ErrOffGrid},
		{"onto another character", types.Position{X: 0, Y: 3}, ErrOccupied},
		{"onto its own cell", types.Position{X: 0, Y: 0}, ErrSameCell},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := twoPlayerGame(t)
			if err := g.Move("a", tc.to); !errors.Is(err, tc.want) {
				t.Errorf("Move to %+v = %v, want %v", tc.to, err, tc.want)
			}
			if mp := g.Snapshot().Players["a"].Character.MovementPoints; mp != StartingMovementPoints {
				t.Errorf("a rejected move still charged movement points (%d)", mp)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

// Fireball is a circle, and the circle used to have a hole where the target
// stood: aiming straight at an enemy dealt no damage at all.
func TestFireballDamagesTheTargetedCharacter(t *testing.T) {
	g := twoPlayerGame(t)

	if err := g.CastSpell("a", 1, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}
	if hp := health(t, g, "b"); hp != StartingHealth-30 {
		t.Errorf("target health = %d, want %d", hp, StartingHealth-30)
	}
	if ap := g.Snapshot().Players["a"].Character.ActionPoints; ap != StartingActionPoints-4 {
		t.Errorf("caster AP = %d, want %d", ap, StartingActionPoints-4)
	}
}

func TestCastIsRejectedWhenItBreaksTheRules(t *testing.T) {
	cases := []struct {
		name    string
		spellID int
		target  types.Position
		want    error
	}{
		{"unknown spell", 99, types.Position{X: 0, Y: 1}, ErrUnknownSpell},
		{"beyond range", 4, types.Position{X: 0, Y: 6}, ErrOutOfRange}, // range 3
		{"off the board", 1, types.Position{X: 40, Y: 0}, ErrOffGrid},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := twoPlayerGame(t)
			if err := g.CastSpell("a", tc.spellID, tc.target); !errors.Is(err, tc.want) {
				t.Errorf("CastSpell = %v, want %v", err, tc.want)
			}
			if hp := health(t, g, "b"); hp != StartingHealth {
				t.Errorf("a rejected cast still dealt damage (target at %d hp)", hp)
			}
			if ap := g.Snapshot().Players["a"].Character.ActionPoints; ap != StartingActionPoints {
				t.Errorf("a rejected cast still charged action points (%d)", ap)
			}
		})
	}
}

func TestCastIsRejectedWithoutEnoughActionPoints(t *testing.T) {
	g := twoPlayerGame(t)

	// Poison Dart costs 2 AP; three casts leave no room for a fourth.
	for i := 0; i < 3; i++ {
		if err := g.CastSpell("a", 3, types.Position{X: 0, Y: 3}); err != nil {
			t.Fatalf("cast %d: %v", i, err)
		}
	}
	if err := g.CastSpell("a", 3, types.Position{X: 0, Y: 3}); !errors.Is(err, ErrNotEnoughAP) {
		t.Errorf("fourth cast = %v, want ErrNotEnoughAP", err)
	}
	if hp := health(t, g, "b"); hp != StartingHealth-30 {
		t.Errorf("target health = %d, want %d after exactly three darts", hp, StartingHealth-30)
	}
}

// ---------------------------------------------------------------------------
// End of game
// ---------------------------------------------------------------------------

func TestGameEndsWhenOneCharacterRemains(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	p.Character.Health = 10
	g.players["b"] = p
	g.mu.Unlock()

	if err := g.CastSpell("a", 1, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}

	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q, want %q", g.Status(), types.StatusGameOver)
	}
	winner, over := g.Winner()
	if !over || winner != "User-a" {
		t.Errorf("winner = %q (over=%v), want \"User-a\"", winner, over)
	}
	if hp := health(t, g, "b"); hp != 0 {
		t.Errorf("dead character health = %d, want 0 rather than a negative value", hp)
	}
	if err := g.EndTurn("a"); !errors.Is(err, ErrWrongPhase) {
		t.Errorf("EndTurn after game over = %v, want ErrWrongPhase", err)
	}
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

func TestAddPlayerValidatesTheName(t *testing.T) {
	g := New()
	for _, name := range []string{"", "ab", "this name is far too long to accept", "bad<name>"} {
		if err := g.AddPlayer("a", "User-a", types.CharacterAppearance{Name: name}); !errors.Is(err, ErrInvalidName) {
			t.Errorf("AddPlayer(%q) = %v, want ErrInvalidName", name, err)
		}
	}
	if err := g.AddPlayer("a", "User-a", look("Valid Name")); err != nil {
		t.Errorf("AddPlayer with a valid name: %v", err)
	}
}

func TestServerOwnsCharacterStats(t *testing.T) {
	g := New()
	if err := g.AddPlayer("a", "User-a", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	c := g.Snapshot().Players["a"].Character
	if c.Health != StartingHealth || c.ActionPoints != StartingActionPoints ||
		c.MovementPoints != StartingMovementPoints || !c.IsAlive {
		t.Errorf("stats = %+v, want the server defaults", c)
	}
}

func TestNoActionsBeforeTheGameStarts(t *testing.T) {
	g := New()
	if err := g.AddPlayer("a", "User-a", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if err := g.Move("a", types.Position{X: 1, Y: 0}); !errors.Is(err, ErrWrongPhase) {
		t.Errorf("Move before start = %v, want ErrWrongPhase", err)
	}
	// A lone ready player must not start a game by themselves, and must not be
	// declared the winner of one.
	if err := g.SetReady("a"); err != nil {
		t.Fatalf("SetReady: %v", err)
	}
	if g.Status() != types.StatusCreatingPlayer {
		t.Errorf("status with one player = %q, want %q", g.Status(), types.StatusCreatingPlayer)
	}
}

func TestLateJoinerIsTurnedAway(t *testing.T) {
	g := twoPlayerGame(t)
	if err := g.AddPlayer("c", "User-c", look("Carol")); !errors.Is(err, ErrGameInProgress) {
		t.Errorf("AddPlayer mid-game = %v, want ErrGameInProgress", err)
	}
}

func TestStartingCellMustBeOneThatWasOffered(t *testing.T) {
	g := NewWithRand(rand.New(rand.NewSource(1)))
	for _, id := range []string{"a", "b"} {
		if err := g.AddPlayer(id, "User-"+id, look("Player"+id)); err != nil {
			t.Fatalf("AddPlayer(%s): %v", id, err)
		}
	}
	for _, id := range []string{"a", "b"} {
		if err := g.SetReady(id); err != nil {
			t.Fatalf("SetReady(%s): %v", id, err)
		}
	}

	offered := g.Snapshot().Players["a"].Character.InitialPositions
	elsewhere := types.Position{X: 1, Y: 1}
	for containsPosition(offered, elsewhere) {
		elsewhere.X++
	}
	if err := g.ChooseInitialPosition("a", elsewhere); !errors.Is(err, ErrNotAStartingCell) {
		t.Errorf("ChooseInitialPosition off-offer = %v, want ErrNotAStartingCell", err)
	}
	if err := g.ChooseInitialPosition("a", offered[0]); err != nil {
		t.Fatalf("ChooseInitialPosition on offer: %v", err)
	}
	if err := g.ChooseInitialPosition("a", offered[1]); !errors.Is(err, ErrAlreadyPositioned) {
		t.Errorf("second placement = %v, want ErrAlreadyPositioned", err)
	}
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

func TestSnapshotCarriesTheSpellCatalogue(t *testing.T) {
	// The old broadcast rebuilt the state by hand and always sent a null spell
	// list, which is why the client had to ship its own copy.
	snap := New().Snapshot()
	if len(snap.Spells) != len(Catalogue()) {
		t.Fatalf("snapshot carries %d spells, want %d", len(snap.Spells), len(Catalogue()))
	}
	if snap.Spells["1"].Damage == 0 {
		t.Error("snapshot spells are missing their stats")
	}
}

func TestSnapshotDoesNotShareStateWithTheGame(t *testing.T) {
	g := twoPlayerGame(t)
	snap := g.Snapshot()

	snap.Players["a"].Character.Position.X = 99
	snap.Spells["1"] = types.Spell{}

	if x := g.Snapshot().Players["a"].Character.Position.X; x != 0 {
		t.Errorf("mutating a snapshot changed the game state (x = %d)", x)
	}
	if g.Snapshot().Spells["1"].Damage == 0 {
		t.Error("mutating a snapshot changed the spell catalogue")
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func currentPlayerID(g *Game) string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	if g.turnIdx >= len(g.turnOrder) {
		return ""
	}
	return g.turnOrder[g.turnIdx]
}

func mustEndTurn(t *testing.T, g *Game) {
	t.Helper()
	id := currentPlayerID(g)
	if err := g.EndTurn(id); err != nil {
		t.Fatalf("EndTurn(%s): %v", id, err)
	}
}
