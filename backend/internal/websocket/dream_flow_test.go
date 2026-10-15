package websocket

import (
	"encoding/json"
	"testing"
	"time"

	"game-server/internal/config"
	"game-server/internal/dream"
	"game-server/internal/store/memory"
	"game-server/internal/types"
)

// A hub driven by hand, on the test's own goroutine: what Run would do, one
// step at a time, with nothing racing it.
func handHub(t *testing.T) *Hub {
	t.Helper()
	s := memory.New()
	return NewHub(config.Config{AllowedOrigins: []string{"*"}, TurnDuration: time.Hour}, s, s)
}

func handClient(h *Hub, id string) *Client {
	c := &Client{ID: id, Send: make(chan []byte, 512), Hub: h, Session: &Session{UserID: id, Token: "t-" + id}}
	h.onRegister(c)
	return c
}

func call(h *Hub, c *Client, handler MessageHandler, msg map[string]any) {
	data, _ := json.Marshal(msg)
	handler(h, c, data)
}

// lastDream is the latest view of the run a client has been sent.
func lastDream(t *testing.T, c *Client) *dream.View {
	t.Helper()
	var last *dream.View
	for {
		select {
		case data := <-c.Send:
			var m DreamStateMessage
			var base struct{ Type string }
			json.Unmarshal(data, &base)
			if base.Type == "dream_state" && json.Unmarshal(data, &m) == nil {
				last = m.Run
			}
		default:
			return last
		}
	}
}

func TestAWonFloorOffersBoonsThenTheNext(t *testing.T) {
	h := handHub(t)
	ann := handClient(h, "ann")
	call(h, ann, handleDreamCreate, map[string]any{"character": character("Ann")})
	call(h, ann, handleDreamStart, map[string]any{})
	call(h, ann, handleDreamEnter, map[string]any{"room": 0})
	room, ok := h.lobby.Get(ann.RoomID)
	if !ok {
		t.Fatal("entering a room put Ann in no fight")
	}

	cell := room.Game.Snapshot().Players["ann"].Character.InitialPositions[0]
	call(h, ann, handleCharacterPositioned, map[string]any{"position": cell})
	if room.Game.Status() != types.StatusPlaying {
		t.Fatalf("the fight is %q once Ann has placed", room.Game.Status())
	}
	// Every monster gone: the party has won the floor.
	for id, p := range room.Game.Snapshot().Players {
		if p.IsBot {
			room.Game.RemovePlayer(id)
		}
	}
	h.broadcastGameState(room)
	view := lastDream(t, ann)
	if view == nil || view.Phase != dream.PhaseBoons || view.Cleared != 1 || len(view.BoonOffer) != 3 || len(view.MatchIDs) != 1 {
		t.Fatalf("after the win: %+v", view)
	}

	h.onRunTick(runTick{run: view.ID, leaveRoom: room.ID})
	if ann.RoomID != "" {
		t.Fatal("the party was left in the finished fight")
	}
	if _, ok := h.lobby.Get(room.ID); ok {
		t.Fatal("the finished fight's room was left open")
	}

	call(h, ann, handleDreamBoon, map[string]any{"boon": view.BoonOffer[0]})
	view = lastDream(t, ann)
	if view.Phase != dream.PhaseRoom || view.Floor != 2 || len(view.Members[0].Boons) != 1 {
		t.Fatalf("after the boon: %+v", view)
	}
}

func TestWalkingOutOfAFightLosesTheRun(t *testing.T) {
	h := handHub(t)
	ann := handClient(h, "ann")
	call(h, ann, handleDreamCreate, map[string]any{"character": character("Ann")})
	call(h, ann, handleDreamStart, map[string]any{})
	call(h, ann, handleDreamEnter, map[string]any{"room": 2})
	roomID := ann.RoomID

	call(h, ann, handleLeaveRoom, map[string]any{})
	view := lastDream(t, ann)
	if view == nil || view.Phase != dream.PhaseOver {
		t.Fatalf("after walking out of the only fight: %+v", view)
	}
	if _, ok := h.lobby.Get(roomID); ok {
		t.Fatal("the abandoned fight's room is still open")
	}
}
