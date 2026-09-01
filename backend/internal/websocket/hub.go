package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"game-server/internal/config"
	"game-server/internal/game"
	"game-server/internal/types"

	"github.com/gorilla/websocket"
)

// botThinkDelay paces the computer opponent so a human can follow what it did.
const botThinkDelay = 700 * time.Millisecond

type Hub struct {
	Clients    map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Inbound    chan Inbound
	Forfeits   chan Forfeit
	// Ticks carries room ids whose turn timer fired: a bot to move, or a turn
	// that ran out of time.
	Ticks chan string

	cfg      config.Config
	lobby    *game.Lobby
	sessions *Sessions
	upgrader websocket.Upgrader
	// roomTimers is only ever touched on the Run goroutine.
	roomTimers map[string]*time.Timer

	// Guards Clients. Every other mutation happens on the Run goroutine, and
	// each game keeps its own lock.
	mutex sync.Mutex
}

func NewHub(cfg config.Config) *Hub {
	return &Hub{
		Inbound:    make(chan Inbound),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Forfeits:   make(chan Forfeit, 16),
		Ticks:      make(chan string, 64),
		Clients:    make(map[*Client]bool),
		cfg:        cfg,
		lobby:      game.NewLobby(cfg.TurnDuration),
		sessions:   NewSessions(),
		roomTimers: make(map[string]*time.Timer),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// The origin check used to be hardwired to true. It now follows
			// ALLOWED_ORIGINS, which matters the moment this is deployed.
			CheckOrigin: func(r *http.Request) bool {
				return cfg.OriginAllowed(r.Header.Get("Origin"))
			},
		},
	}
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

// broadcastToRoom sends to everyone in one room. The hub used to broadcast
// every message to every connection on the server, because there was only ever
// one game.
func (h *Hub) broadcastToRoom(roomID string, message []byte) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	for client := range h.Clients {
		if client.RoomID == roomID {
			client.TrySend(message)
		}
	}
}

// broadcastGameState pushes a room's snapshot to its members.
func (h *Hub) broadcastGameState(room *game.Room) {
	payload, err := json.Marshal(types.GameStateMessage{
		Type:  "game_state",
		State: room.Game.Snapshot(),
	})
	if err != nil {
		log.Printf("[Error] Failed to marshal game state: %v", err)
		return
	}
	h.broadcastToRoom(room.ID, payload)
	h.scheduleRoom(room)

	if winner, over := room.Game.Winner(); over {
		if payload, err := json.Marshal(types.GameOverMessage{Type: "game_over", Winner: winner}); err == nil {
			log.Printf("[Game Over] room %s, winner: %s", room.ID, winner)
			h.broadcastToRoom(room.ID, payload)
		}
	}
}

// broadcastLobby refreshes the room list for everyone who is not in a room.
func (h *Hub) broadcastLobby() {
	payload, err := json.Marshal(types.LobbyState{Type: "lobby_state", Rooms: h.lobby.List()})
	if err != nil {
		log.Printf("[Error] Failed to marshal lobby state: %v", err)
		return
	}
	h.broadcastToRoom("", payload)
}

func (h *Hub) sendLobby(c *Client) {
	if payload, err := json.Marshal(types.LobbyState{Type: "lobby_state", Rooms: h.lobby.List()}); err == nil {
		c.TrySend(payload)
	}
}

func (h *Hub) sendRoomJoined(c *Client, roomID, roomName string) {
	if payload, err := json.Marshal(types.RoomJoined{
		Type: "room_joined", RoomID: roomID, RoomName: roomName,
	}); err == nil {
		c.TrySend(payload)
	}
}

// reject tells a single client why its action was refused, so a rejected
// action does not vanish into the server log.
func (h *Hub) reject(c *Client, action, messageID string, reason error) {
	log.Printf("[Rejected] %s from %s: %v", action, c.ID, reason)
	if payload, err := json.Marshal(types.ActionRejected{
		Type:      "action_rejected",
		MessageID: messageID,
		Action:    action,
		Reason:    reason.Error(),
	}); err == nil {
		c.TrySend(payload)
	}
}

// ---------------------------------------------------------------------------
// Room membership
// ---------------------------------------------------------------------------

func (h *Hub) setRoom(c *Client, roomID string) {
	h.mutex.Lock()
	c.RoomID = roomID
	h.mutex.Unlock()
	c.Session.RoomID = roomID
}

// currentRoom resolves the room a client is in, if any.
func (h *Hub) currentRoom(c *Client) (*game.Room, bool) {
	if c.RoomID == "" {
		return nil, false
	}
	return h.lobby.Get(c.RoomID)
}

// closeRoomIfEmpty drops a room once nobody is left in it, so the lobby does
// not fill up with abandoned games. Bots do not count: a solo room whose human
// walked away has nobody in it, however many computer opponents remain.
func (h *Hub) closeRoomIfEmpty(room *game.Room) bool {
	if room.Game.HumanCount() > 0 {
		return false
	}
	h.lobby.Remove(room.ID)
	log.Printf("[Room] %s closed (empty)", room.ID)
	return true
}

// ---------------------------------------------------------------------------
// Turn clock
// ---------------------------------------------------------------------------

// scheduleRoom arms the next wake-up for a room: soon if a bot has to move,
// otherwise when the current turn runs out. A turn that never expired meant a
// player who walked away froze the game for everyone else.
func (h *Hub) scheduleRoom(room *game.Room) {
	if timer := h.roomTimers[room.ID]; timer != nil {
		timer.Stop()
		delete(h.roomTimers, room.ID)
	}
	if room.Game.Status() != types.StatusPlaying {
		return
	}

	var delay time.Duration
	if _, isBot := room.Game.CurrentBot(); isBot {
		delay = botThinkDelay
	} else {
		deadline := room.Game.TurnEndsAt()
		if deadline.IsZero() {
			return
		}
		if delay = time.Until(deadline); delay < 0 {
			delay = 0
		}
	}

	id := room.ID
	h.roomTimers[id] = time.AfterFunc(delay, func() {
		select {
		case h.Ticks <- id:
		default: // hub is busy or gone; the next broadcast reschedules
		}
	})
}

func (h *Hub) onTick(roomID string) {
	delete(h.roomTimers, roomID)

	room, ok := h.lobby.Get(roomID)
	if !ok {
		return
	}

	var changed bool
	if _, isBot := room.Game.CurrentBot(); isBot {
		changed = room.Game.PlayBotStep()
	} else if room.Game.ExpireTurnIfDue(time.Now()) {
		log.Printf("[Turn] room %s: turn expired", roomID)
		changed = true
	}

	if changed {
		h.broadcastGameState(room) // reschedules on its way out
		return
	}
	h.scheduleRoom(room)
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.onRegister(client)

		case client := <-h.Unregister:
			h.onUnregister(client)

		case forfeit := <-h.Forfeits:
			h.onForfeit(forfeit)

		case roomID := <-h.Ticks:
			h.onTick(roomID)

		case msg := <-h.Inbound:
			var base types.BaseMessage
			if err := json.Unmarshal(msg.Data, &base); err != nil {
				log.Printf("[Error] Failed to parse message from %s: %v", msg.Client.ID, err)
				continue
			}
			handler, exists := messageHandlers[base.Type]
			if !exists {
				log.Printf("[Warning] Unrecognized message type from %s: %s", msg.Client.ID, base.Type)
				continue
			}
			handler(h, msg.Client, msg.Data)
		}
	}
}

func (h *Hub) onRegister(client *Client) {
	h.mutex.Lock()
	h.Clients[client] = true
	total := len(h.Clients)
	h.mutex.Unlock()
	log.Printf("[Connection] %s joined. Total clients: %d", client.ID, total)

	// A resuming client goes straight back to the room it was in, character
	// and all. If it never got as far as creating one, the client simply asks
	// for it again on arrival.
	if room, ok := h.lobby.Get(client.Session.RoomID); ok {
		h.sessions.stopForfeit(client.Session)
		room.Game.SetConnected(client.ID, true)
		h.setRoom(client, room.ID)
		h.sendRoomJoined(client, room.ID, room.Name)
		h.broadcastGameState(room)
		log.Printf("[Resume] %s rejoined room %s", client.ID, room.ID)
		return
	}

	h.setRoom(client, "")
	h.sendLobby(client)
}

func (h *Hub) onUnregister(client *Client) {
	h.mutex.Lock()
	_, known := h.Clients[client]
	if known {
		delete(h.Clients, client)
		close(client.Send)
	}
	total := len(h.Clients)
	h.mutex.Unlock()
	if !known {
		return
	}
	log.Printf("[Disconnection] %s left. Total clients: %d", client.Session.Name, total)

	room, ok := h.lobby.Get(client.RoomID)
	if !ok {
		return
	}

	// The player keeps their seat for a while, whatever the phase: a reload or
	// a brief network drop should not cost them their character, and an empty
	// room is cleaned up when the grace period expires instead.
	room.Game.SetConnected(client.ID, false)
	h.sessions.startForfeit(client.Session, h.Forfeits)
	h.broadcastGameState(room)
	h.broadcastLobby()
}

func (h *Hub) onForfeit(f Forfeit) {
	sess, ok := h.sessions.Resume(f.Token)
	if !ok || sess.RoomID != f.RoomID {
		return // reconnected and moved on
	}
	room, ok := h.lobby.Get(f.RoomID)
	if !ok {
		return
	}
	// Still connected means someone came back on this session in the meantime.
	if h.isConnected(f.UserID) {
		return
	}

	log.Printf("[Forfeit] %s did not come back to room %s", f.UserID, f.RoomID)
	room.Game.RemovePlayer(f.UserID)
	sess.RoomID = ""
	h.sessions.Drop(f.Token)

	// closeRoomIfEmpty also sweeps up a room whose only visitor left before
	// ever creating a character.
	if !h.closeRoomIfEmpty(room) {
		h.broadcastGameState(room)
	}
	h.broadcastLobby()
}

func (h *Hub) isConnected(userID string) bool {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	for client := range h.Clients {
		if client.ID == userID {
			return true
		}
	}
	return false
}
