// internal/websocket/hub.go
package websocket

import (
	"encoding/json"
	"game-server/internal/game"
	"log"
	"sync"
)

type Hub struct {
	Clients     map[*Client]bool
	Broadcast   chan []byte
	Register    chan *Client
	Unregister  chan *Client
	mutex       sync.Mutex
	gameManager *game.GameManager
}

func NewHub() *Hub {
	return &Hub{
		Broadcast:   make(chan []byte),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
		Clients:     make(map[*Client]bool),
		gameManager: game.NewGameManager(),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mutex.Lock()
			h.Clients[client] = true
			log.Printf("[New Connection] User-%s joined. Total clients: %d", client.ID, len(h.Clients))
			h.mutex.Unlock()

		case client := <-h.Unregister:
			h.mutex.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
				log.Printf("[Disconnection] User-%s left. Total clients: %d", client.ID, len(h.Clients))
			}
			h.mutex.Unlock()

		case message := <-h.Broadcast:
			var msg struct {
				Type    string          `json:"type"`
				Payload json.RawMessage `json:"payload"`
			}

			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("Error parsing message: %v", err)
				continue
			}

			switch msg.Type {
			case "game_action":
				var action game.GameAction
				if err := json.Unmarshal(msg.Payload, &action); err != nil {
					log.Printf("Error parsing game action: %v", err)
					continue
				}

				if err := h.gameManager.HandleAction(action); err != nil {
					log.Printf("Error handling game action: %v", err)
					continue
				}

				// Broadcast updated state
				newState := h.gameManager.GetState()
				stateMsg, _ := json.Marshal(map[string]interface{}{
					"type":    "game_state_update",
					"payload": newState,
				})

				h.mutex.Lock()
				for client := range h.Clients {
					select {
					case client.Send <- stateMsg:
					default:
						close(client.Send)
						delete(h.Clients, client)
					}
				}
				h.mutex.Unlock()
			}
		}
	}
}
