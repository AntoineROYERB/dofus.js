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
			// Check for duplicate connections
			for existingClient := range h.Clients {
				if existingClient.ID == client.ID {
					delete(h.Clients, existingClient)
					close(existingClient.Send)
				}
			}
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
			log.Printf("[Debug] Broadcasting message: %s", string(message))

			var chatMsg struct {
				Type    string `json:"type"`
				Sender  string `json:"sender"`
				Content string `json:"content"`
			}

			if err := json.Unmarshal(message, &chatMsg); err != nil {
				log.Printf("[Error] Parsing message: %v", err)
				continue
			}

			if chatMsg.Type == "chat" {
				h.mutex.Lock()
				for client := range h.Clients {
					if client.ID != chatMsg.Sender {
						select {
						case client.Send <- message:
							log.Printf("[Debug] Message sent to client %s", client.ID)
						default:
							close(client.Send)
							delete(h.Clients, client)
							log.Printf("[Error] Failed to send to client %s", client.ID)
						}
					}
				}
				h.mutex.Unlock()
			}
		}
	}
}
