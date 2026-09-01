package websocket

import (
	"encoding/json"
	"log"
	"sync"

	"game-server/internal/game"
	"game-server/internal/types"
)

type Hub struct {
	Clients    map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Inbound    chan Inbound
	Forfeits   chan Forfeit

	lobby    *game.Lobby
	sessions *Sessions

	// Guards Clients. Every other mutation happens on the Run goroutine, and
	// each game keeps its own lock.
	mutex sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		Inbound:    make(chan Inbound),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Forfeits:   make(chan Forfeit, 16),
		Clients:    make(map[*Client]bool),
		lobby:      game.NewLobby(),
		sessions:   NewSessions(),
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
// not fill up with abandoned games.
func (h *Hub) closeRoomIfEmpty(room *game.Room) bool {
	if room.Game.PlayerCount() > 0 {
		return false
	}
	h.lobby.Remove(room.ID)
	log.Printf("[Room] %s closed (empty)", room.ID)
	return true
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
