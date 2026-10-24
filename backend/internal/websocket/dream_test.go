package websocket

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"game-server/internal/config"
	"game-server/internal/dream"
	"game-server/internal/game"
	"game-server/internal/store/memory"
	"game-server/internal/types"

	"github.com/gorilla/websocket"
)

// testServer runs a hub over a real socket, the way the browser reaches it.
func testServer(t *testing.T, s *memory.Store) *httptest.Server {
	t.Helper()
	cfg := config.Config{AllowedOrigins: []string{"*"}, TurnDuration: time.Hour}
	hub := NewHub(cfg, s, s)
	go hub.Run()
	srv := httptest.NewServer(httpHandler(hub))
	t.Cleanup(srv.Close)
	return srv
}

type testClient struct {
	t    *testing.T
	conn *websocket.Conn
	id   string
}

func dial(t *testing.T, srv *httptest.Server) *testClient {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	c := &testClient{t: t, conn: conn}
	var init types.UserInitMessage
	c.await("user_init", &init)
	c.id = init.User.ID
	return c
}

func (c *testClient) send(msg map[string]any) {
	c.t.Helper()
	if err := c.conn.WriteJSON(msg); err != nil {
		c.t.Fatalf("send: %v", err)
	}
}

// await reads until a message of the given type arrives that satisfies keep,
// and decodes it into out.
func (c *testClient) await(kind string, out any, keep ...func(json.RawMessage) bool) {
	c.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		c.conn.SetReadDeadline(deadline)
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			c.t.Fatalf("waiting for %s: %v", kind, err)
		}
		var base struct {
			Type   string `json:"type"`
			Reason string `json:"reason"`
		}
		json.Unmarshal(data, &base)
		if base.Type != kind {
			continue
		}
		if len(keep) > 0 && !keep[0](data) {
			continue
		}
		if out != nil {
			if err := json.Unmarshal(data, out); err != nil {
				c.t.Fatalf("decoding %s: %v", kind, err)
			}
		}
		return
	}
	c.t.Fatalf("no %s within 5s", kind)
}

func (c *testClient) awaitDream(phase string) dream.View {
	c.t.Helper()
	var msg DreamStateMessage
	c.await("dream_state", &msg, func(data json.RawMessage) bool {
		var m DreamStateMessage
		json.Unmarshal(data, &m)
		return m.Run != nil && m.Run.Phase == phase
	})
	return *msg.Run
}

func character(name string) map[string]any {
	return map[string]any{"name": name, "color": "#336699"}
}

func TestAPartyClimbsIntoItsFirstRoom(t *testing.T) {
	s := memory.New()
	srv := testServer(t, s)
	ann, bea := dial(t, srv), dial(t, srv)

	ann.send(map[string]any{"type": "dream_create", "character": character("Ann")})
	party := ann.awaitDream(dream.PhaseGathering)
	if party.Key == "" || party.You != 0 || !party.Members[0].Leader {
		t.Fatalf("the leader's view: %+v", party)
	}

	bea.send(map[string]any{"type": "dream_join", "code": strings.ToLower(party.ID), "character": character("Bea")})
	joined := bea.awaitDream(dream.PhaseGathering)
	if len(joined.Members) != 2 || joined.You != 1 || joined.Key == party.Key {
		t.Fatalf("the second member's view: %+v", joined)
	}

	bea.send(map[string]any{"type": "dream_start"})
	var rejected types.ActionRejected
	bea.await("action_rejected", &rejected)
	if rejected.Reason != dream.ErrNotTheLeader.Error() {
		t.Fatalf("a member starting the run: %q", rejected.Reason)
	}

	ann.send(map[string]any{"type": "dream_start"})
	floor := bea.awaitDream(dream.PhaseRoom)
	if floor.Floor != 1 || floor.Offer == nil || len(floor.Offer.Rooms) != 3 || floor.Offer.Party != 2 {
		t.Fatalf("the first floor: %+v", floor)
	}

	bea.send(map[string]any{"type": "dream_point", "room": 2})
	pointed := ann.awaitDream(dream.PhaseRoom)
	for pointed.Members[1].Pointed != 2 {
		pointed = ann.awaitDream(dream.PhaseRoom)
	}

	ann.send(map[string]any{"type": "dream_enter", "room": 1})
	var joinedRoom types.RoomJoined
	bea.await("room_joined", &joinedRoom, func(data json.RawMessage) bool {
		var r types.RoomJoined
		json.Unmarshal(data, &r)
		return r.RoomID != ""
	})
	var state types.GameStateMessage
	bea.await("game_state", &state)
	room := floor.Offer.Rooms[1]
	seated, monsters := 0, 0
	for _, p := range state.State.Players {
		switch p.Team {
		case game.TeamParty:
			seated++
		case game.TeamDream:
			monsters++
		}
	}
	if seated != 2 || monsters != len(room.Monsters) {
		t.Fatalf("the fight seats %d of the party and %d monsters, want 2 and %d", seated, monsters, len(room.Monsters))
	}
	if state.State.GameStatus != types.StatusPositionCharacters {
		t.Fatalf("the fight is %q, want the party choosing where to stand", state.State.GameStatus)
	}

	// The fight's room is the party's alone.
	carl := dial(t, srv)
	carl.send(map[string]any{"type": "join_room", "roomId": joinedRoom.RoomID})
	carl.await("action_rejected", &rejected)
}

func TestAMemberComesBackWithTheirKey(t *testing.T) {
	s := memory.New()
	srv := testServer(t, s)
	ann := dial(t, srv)
	ann.send(map[string]any{"type": "dream_create", "character": character("Ann")})
	party := ann.awaitDream(dream.PhaseGathering)
	ann.send(map[string]any{"type": "dream_start"})
	ann.awaitDream(dream.PhaseRoom)
	time.Sleep(100 * time.Millisecond) // the run's save is written behind the hub

	// A server that slept knows nothing of the run but what it saved.
	again := testServer(t, s)
	back := dial(t, again)
	back.send(map[string]any{"type": "dream_resume", "runId": party.ID, "key": "not-the-key"})
	var rejected types.ActionRejected
	back.await("action_rejected", &rejected)

	back.send(map[string]any{"type": "dream_resume", "runId": party.ID, "key": party.Key})
	resumed := back.awaitDream(dream.PhaseRoom)
	if resumed.Floor != 1 || resumed.Members[0].UserID != back.id || resumed.Key != party.Key {
		t.Fatalf("resumed as %+v", resumed)
	}
}

func TestLeavingAPartyEndsItForTheLastOne(t *testing.T) {
	s := memory.New()
	srv := testServer(t, s)
	ann := dial(t, srv)
	ann.send(map[string]any{"type": "dream_create", "character": character("Ann")})
	ann.awaitDream(dream.PhaseGathering)
	ann.send(map[string]any{"type": "dream_leave"})
	var msg DreamStateMessage
	ann.await("dream_state", &msg, func(data json.RawMessage) bool {
		var m DreamStateMessage
		json.Unmarshal(data, &m)
		return m.Run == nil
	})
	ann.send(map[string]any{"type": "dream_create", "character": character("Ann")})
	ann.awaitDream(dream.PhaseGathering)
}

func httpHandler(h *Hub) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", h.HandleWebSocket)
	return mux
}
