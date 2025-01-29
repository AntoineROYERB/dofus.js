// internal/websocket/hub.go
package websocket

import (
	"encoding/json"
	"log"
	"sync"
)

type Hub struct {
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	mutex      sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Clients:    make(map[*Client]bool),
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
			// Parse the message only once
			var msg struct {
				Sender  string `json:"sender"`
				Content string `json:"content"`
				Type    string `json:"type"`
			}
			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("[Error] Parsing message: %v", err)
				continue
			}

			// Log when we receive a message to broadcast
			log.Printf("[Broadcast] Message from %s: %s", msg.Sender, msg.Content)

			// Single lock for the entire broadcast operation
			h.mutex.Lock()
			// Use a map to track which clients we've sent to
			processedClients := make(map[string]bool)

			for client := range h.Clients {
				// Skip if we've already sent to this client or if it's the sender
				if processedClients[client.ID] || client.ID == msg.Sender {
					continue
				}

				select {
				case client.Send <- message:
					processedClients[client.ID] = true
					log.Printf("[Sent] Message to %s", client.ID)
				default:
					close(client.Send)
					delete(h.Clients, client)
					log.Printf("[Error] Failed to send to %s, removing client", client.ID)
				}
			}
			h.mutex.Unlock()
		}
	}
}
