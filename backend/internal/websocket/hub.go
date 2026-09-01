package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"game-server/internal/game"
	"game-server/internal/types"
)

type Hub struct {
	// Client management
	Clients    map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Inbound    chan Inbound

	// The single authoritative game state.
	game *game.Game

	// Guards Clients only. Game state has its own lock inside game.Game.
	mutex sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		Inbound:    make(chan Inbound),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Clients:    make(map[*Client]bool),
		game:       game.New(),
	}
}

// BroadcastGameState sends the authoritative snapshot to everyone. The
// snapshot is built by the game itself, so the spell catalogue and turn order
// travel with it; the old version reassembled a partial state by hand and
// always sent a null spell list.
func (h *Hub) BroadcastGameState() error {
	payload, err := json.Marshal(types.GameStateMessage{
		Type:  "game_state",
		State: h.game.Snapshot(),
	})
	if err != nil {
		return fmt.Errorf("failed to marshal game state: %w", err)
	}
	h.broadcastMessage(payload)
	return nil
}

// BroadcastGameOver announces the winner once the game has ended.
func (h *Hub) BroadcastGameOver() {
	winner, over := h.game.Winner()
	if !over {
		return
	}
	payload, err := json.Marshal(types.GameOverMessage{Type: "game_over", Winner: winner})
	if err != nil {
		log.Printf("[Error] Failed to marshal game over message: %v", err)
		return
	}
	log.Printf("[Game Over] Winner: %s", winner)
	h.broadcastMessage(payload)
}

func (h *Hub) broadcastMessage(message []byte) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	for client := range h.Clients {
		select {
		case client.Send <- message:
		default:
			close(client.Send)
			delete(h.Clients, client)
			log.Printf("[Error] Dropped client %s: send buffer full", client.ID)
		}
	}
}

// reject tells a single client why its action was refused. Without this a
// rejected action just vanished into the server log and the client waited
// forever for a state update that was never coming.
func (h *Hub) reject(c *Client, action, messageID string, reason error) {
	log.Printf("[Rejected] %s from %s: %v", action, c.ID, reason)
	payload, err := json.Marshal(types.ActionRejected{
		Type:      "action_rejected",
		MessageID: messageID,
		Action:    action,
		Reason:    reason.Error(),
	})
	if err != nil {
		return
	}
	c.TrySend(payload)
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mutex.Lock()
			h.Clients[client] = true
			total := len(h.Clients)
			h.mutex.Unlock()
			log.Printf("[New Connection] %s joined. Total clients: %d", client.ID, total)

			// Bring the newcomer up to date with whatever is already going on.
			if payload, err := json.Marshal(types.GameStateMessage{
				Type:  "game_state",
				State: h.game.Snapshot(),
			}); err == nil {
				client.TrySend(payload)
			}

		case client := <-h.Unregister:
			h.mutex.Lock()
			_, known := h.Clients[client]
			if known {
				delete(h.Clients, client)
				close(client.Send)
			}
			total := len(h.Clients)
			h.mutex.Unlock()
			if known {
				log.Printf("[Disconnection] %s left. Total clients: %d", client.User.Name, total)
			}

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
