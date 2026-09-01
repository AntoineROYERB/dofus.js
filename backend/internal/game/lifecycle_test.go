package game

import (
	"errors"
	"testing"

	"game-server/internal/types"
)

// ---------------------------------------------------------------------------
// Rematch
// ---------------------------------------------------------------------------

func TestRestartSetsUpARematchWithTheSameCharacters(t *testing.T) {
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
		t.Fatalf("status = %q, want the game to be over", g.Status())
	}

	if err := g.Restart(); err != nil {
		t.Fatalf("Restart: %v", err)
	}

	snap := g.Snapshot()
	if snap.GameStatus != types.StatusCreatingPlayer {
		t.Errorf("status = %q, want %q", snap.GameStatus, types.StatusCreatingPlayer)
	}
	if snap.TurnNumber != 0 || len(snap.TurnOrder) != 0 {
		t.Errorf("turn state = %d / %v, want a clean slate", snap.TurnNumber, snap.TurnOrder)
	}
	if winner, over := g.Winner(); over || winner != "" {
		t.Errorf("winner = %q (over=%v), want it cleared", winner, over)
	}
	if len(snap.Players) != 2 {
		t.Fatalf("%d players survived the restart, want 2", len(snap.Players))
	}
	for id, p := range snap.Players {
		c := p.Character
		if c.Name == "" {
			t.Errorf("player %s lost their character", id)
		}
		if !c.IsAlive || c.Health != StartingHealth ||
			c.ActionPoints != StartingActionPoints || c.MovementPoints != StartingMovementPoints {
			t.Errorf("player %s not restored: %+v", id, c)
		}
		if c.Position != nil || len(c.InitialPositions) != 0 {
			t.Errorf("player %s kept board placement: %+v", id, c)
		}
		if p.IsReady || p.HasPositioned || p.IsCurrentTurn || c.IsCurrentTurn {
			t.Errorf("player %s kept stale flags: %+v", id, p)
		}
	}
}

func TestRestartOnlyAfterTheGameIsOver(t *testing.T) {
	g := twoPlayerGame(t)
	if err := g.Restart(); !errors.Is(err, ErrWrongPhase) {
		t.Errorf("Restart mid-game = %v, want ErrWrongPhase", err)
	}
}

func TestRematchCanBePlayedThrough(t *testing.T) {
	g := twoPlayerGame(t)

	g.mu.Lock()
	p := g.players["b"]
	p.Character.Health = 10
	g.players["b"] = p
	g.mu.Unlock()

	if err := g.CastSpell("a", 1, types.Position{X: 0, Y: 3}); err != nil {
		t.Fatalf("CastSpell: %v", err)
	}
	if err := g.Restart(); err != nil {
		t.Fatalf("Restart: %v", err)
	}

	// The whole lobby flow has to work a second time.
	for _, id := range []string{"a", "b"} {
		if err := g.SetReady(id); err != nil {
			t.Fatalf("SetReady(%s) after restart: %v", id, err)
		}
	}
	if g.Status() != types.StatusPositionCharacters {
		t.Fatalf("status = %q, want the placement phase", g.Status())
	}
	for _, id := range []string{"a", "b"} {
		pos := g.Snapshot().Players[id].Character.InitialPositions[0]
		if err := g.ChooseInitialPosition(id, pos); err != nil {
			t.Fatalf("ChooseInitialPosition(%s): %v", id, err)
		}
	}
	if g.Status() != types.StatusPlaying {
		t.Errorf("status = %q, want the rematch to be under way", g.Status())
	}
}

// ---------------------------------------------------------------------------
// Leaving
// ---------------------------------------------------------------------------

func TestLeavingMidGameHandsTheWinToTheSurvivor(t *testing.T) {
	g := twoPlayerGame(t)

	g.RemovePlayer("b")

	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q, want the game to end on a forfeit", g.Status())
	}
	winner, over := g.Winner()
	if !over || winner != "User-a" {
		t.Errorf("winner = %q (over=%v), want \"User-a\"", winner, over)
	}
}

func TestLeavingPassesPlayToTheNextCharacter(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 3},
		"c": {X: 3, Y: 0},
	}, "a", "b", "c")

	// "a" is acting; removing them must not strand the game.
	g.RemovePlayer("a")

	if g.Status() != types.StatusPlaying {
		t.Fatalf("status = %q, want play to continue with two left", g.Status())
	}
	acting := currentPlayerID(g)
	if acting != "b" {
		t.Errorf("acting player = %q, want \"b\" to take over", acting)
	}
	if err := g.EndTurn("b"); err != nil {
		t.Errorf("the survivor cannot act: %v", err)
	}
}

func TestLeavingDuringPlacementReturnsEveryoneToTheLobby(t *testing.T) {
	g := NewLobbyReadyGame(t)
	if g.Status() != types.StatusPositionCharacters {
		t.Fatalf("status = %q, want the placement phase", g.Status())
	}

	g.RemovePlayer("b")

	if g.Status() != types.StatusCreatingPlayer {
		t.Errorf("status = %q, want a drop below two players to reopen the lobby", g.Status())
	}
	if p := g.Snapshot().Players["a"]; p.IsReady || len(p.Character.InitialPositions) != 0 {
		t.Errorf("the remaining player kept stale placement state: %+v", p)
	}
}

func TestRemovingAnUnknownPlayerIsANoOp(t *testing.T) {
	g := twoPlayerGame(t)
	g.RemovePlayer("nobody")
	if n := len(g.Snapshot().Players); n != 2 {
		t.Errorf("%d players left, want 2", n)
	}
	if g.Status() != types.StatusPlaying {
		t.Errorf("status = %q, want play to be unaffected", g.Status())
	}
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

func TestSetConnectedLeavesTheCharacterOnTheBoard(t *testing.T) {
	g := twoPlayerGame(t)

	g.SetConnected("b", false)

	p := g.Snapshot().Players["b"]
	if p.Connected {
		t.Error("player still marked connected")
	}
	if !p.Character.IsAlive || p.Character.Position == nil {
		t.Errorf("a dropped connection cost the character its place: %+v", p.Character)
	}
	if g.Status() != types.StatusPlaying {
		t.Errorf("status = %q, want the game to keep running", g.Status())
	}

	g.SetConnected("b", true)
	if !g.Snapshot().Players["b"].Connected {
		t.Error("player did not come back as connected")
	}
}

func TestNewPlayersStartConnected(t *testing.T) {
	g := New()
	if err := g.AddPlayer("a", "User-a", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if !g.Snapshot().Players["a"].Connected {
		t.Error("a freshly created player is not marked connected")
	}
}

// A solo room's last human leaving means the room is empty, however many
// computer opponents are still standing in it. Counting bots kept finished
// "vs Cpu" rooms in the lobby list forever.
func TestBotsDoNotKeepARoomAlive(t *testing.T) {
	g := New()
	if _, err := g.AddBot(); err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}

	if g.PlayerCount() != 2 || g.HumanCount() != 1 {
		t.Fatalf("counts = %d players / %d humans, want 2 and 1", g.PlayerCount(), g.HumanCount())
	}

	g.RemovePlayer("human")
	if g.HumanCount() != 0 {
		t.Errorf("HumanCount = %d after the only human left, want 0", g.HumanCount())
	}
	if g.PlayerCount() == 0 {
		t.Error("the bot was removed too; only the human should have left")
	}
}

// NewLobbyReadyGame builds a two-player game sitting in the placement phase.
func NewLobbyReadyGame(t *testing.T) *Game {
	t.Helper()
	g := New()
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
	return g
}
