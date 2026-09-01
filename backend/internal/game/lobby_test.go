package game

import (
	"errors"
	"testing"

	"game-server/internal/types"
)

func TestLobbyCreateValidatesTheName(t *testing.T) {
	l := NewLobby(DefaultTurnDuration)
	for _, name := range []string{"", "ab", "a name that is very much too long", "bad<name>"} {
		if _, err := l.Create(name); !errors.Is(err, ErrInvalidRoom) {
			t.Errorf("Create(%q) = %v, want ErrInvalidRoom", name, err)
		}
	}
	if _, err := l.Create("Arena One"); err != nil {
		t.Errorf("Create with a valid name: %v", err)
	}
}

func TestLobbyRoomsAreIndependent(t *testing.T) {
	// The server used to hold a single global game, so two visitors arriving
	// separately landed in the same match.
	l := NewLobby(DefaultTurnDuration)
	a, err := l.Create("First Arena")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	b, err := l.Create("Second Arena")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if a.ID == b.ID {
		t.Fatal("two rooms share an id")
	}

	if err := a.Game.AddPlayer("p1", "User-1", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if a.Game.PlayerCount() != 1 || b.Game.PlayerCount() != 0 {
		t.Errorf("player counts = %d and %d, want 1 and 0", a.Game.PlayerCount(), b.Game.PlayerCount())
	}
	if b.Game.HasPlayer("p1") {
		t.Error("a player joined one room and appeared in the other")
	}
}

func TestLobbyListIsSortedAndDescribesRooms(t *testing.T) {
	l := NewLobby(DefaultTurnDuration)
	if _, err := l.Create("Zulu Arena"); err != nil {
		t.Fatalf("Create: %v", err)
	}
	alpha, err := l.Create("Alpha Arena")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := alpha.Game.AddPlayer("p1", "User-1", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}

	list := l.List()
	if len(list) != 2 {
		t.Fatalf("List returned %d rooms, want 2", len(list))
	}
	if list[0].Name != "Alpha Arena" {
		t.Errorf("list is not sorted by name: %+v", list)
	}
	if list[0].Players != 1 || list[0].MaxPlayers != MaxPlayersPerRoom {
		t.Errorf("summary = %+v, want 1/%d players", list[0], MaxPlayersPerRoom)
	}
	if list[0].Status != types.StatusCreatingPlayer {
		t.Errorf("status = %q, want %q", list[0].Status, types.StatusCreatingPlayer)
	}
}

func TestLobbyRemove(t *testing.T) {
	l := NewLobby(DefaultTurnDuration)
	room, err := l.Create("Arena One")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	l.Remove(room.ID)
	if _, ok := l.Get(room.ID); ok {
		t.Error("room survived Remove")
	}
	if len(l.List()) != 0 {
		t.Error("removed room still listed")
	}
}

func TestRoomRefusesLatecomersAndOverflow(t *testing.T) {
	l := NewLobby(DefaultTurnDuration)
	room, err := l.Create("Arena One")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := room.CanJoin(); err != nil {
		t.Errorf("CanJoin on a fresh room = %v, want nil", err)
	}

	for i := 0; i < MaxPlayersPerRoom; i++ {
		id := string(rune('a' + i))
		if err := room.Game.AddPlayer(id, "User-"+id, look("Player"+id)); err != nil {
			t.Fatalf("AddPlayer(%s): %v", id, err)
		}
	}
	if err := room.CanJoin(); !errors.Is(err, ErrRoomFull) {
		t.Errorf("CanJoin on a full room = %v, want ErrRoomFull", err)
	}

	other := &Room{ID: "x", Name: "Started", Game: twoPlayerGameForRoom(t)}
	if err := other.CanJoin(); !errors.Is(err, ErrRoomStarted) {
		t.Errorf("CanJoin on a running game = %v, want ErrRoomStarted", err)
	}
}

func twoPlayerGameForRoom(t *testing.T) *Game {
	t.Helper()
	return twoPlayerGame(t)
}
