// internal/websocket/hub.go
package websocket

import (
	"encoding/json"
	"game-server/internal/game"
	"game-server/internal/user"
	"log"
	"sync"
)

type baseMsg struct {
	MessageID string `json:"messageId"`
	Timestamp int64  `json:"timestamp"`
	Type      string `json:"type"`
	UserId    string `json:"userId"`
}
type Hub struct {
	Clients           map[*Client]bool
	Broadcast         chan []byte
	Register          chan *Client
	Unregister        chan *Client
	mutex             sync.Mutex
	gameManager       *game.GameManager
	processedMessages sync.Map
	userManager       *user.UserManager
}

func NewHub() *Hub {
	return &Hub{
		Broadcast:   make(chan []byte),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
		Clients:     make(map[*Client]bool),
		gameManager: game.NewGameManager(),
		userManager: user.NewUserManager(),
	}
}

func (h *Hub) isMessageProcessed(messageId string) bool {
	_, exists := h.processedMessages.Load(messageId)
	return exists
}

func (h *Hub) markMessageAsProcessed(messageId string) {
	h.processedMessages.Store(messageId, true)
}

func (h *Hub) broadcastMessage(message []byte, excludeClientID string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	for client := range h.Clients {
		if client.ID != excludeClientID {
			select {
			case client.Send <- message:
				log.Printf("[Debug] Sent message to client %s", client.ID)
			default:
				close(client.Send)
				delete(h.Clients, client)
				log.Printf("[Error] Failed to send to client %s", client.ID)
			}
		}
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
			}
			log.Printf("[Disconnection] User %s left. Total clients: %d", client.User.Name, len(h.Clients))
			h.mutex.Unlock()

		case message := <-h.Broadcast:
			log.Printf("[Debug] Received broadcast message: %s", string(message))

			// Parse message and attribute the value to baseMsg
			var baseMsg baseMsg
			if err := json.Unmarshal(message, &baseMsg); err != nil {
				log.Printf("[Error] Parsing message: %v", err)
				continue
			}

			// Skip if no messageId or already processed
			if baseMsg.MessageID == "" || h.isMessageProcessed(baseMsg.MessageID) {
				log.Printf("[Debug] Skipping message: %s", baseMsg.MessageID)
				continue
			}

			h.markMessageAsProcessed(baseMsg.MessageID)
			switch baseMsg.Type {
			case "chat":
				log.Printf("baseMsg: %s", baseMsg.Type)
				h.broadcastMessage(message, baseMsg.UserId)
			case "game_action":
				log.Printf("baseMsg: %s", baseMsg.Type)

				var action game.GameAction
				if err := json.Unmarshal(message, &action); err != nil {
					log.Printf("[Error] Parsing game action: %v", err)
					continue
				}

				if err := h.gameManager.HandleAction(action); err != nil {
					log.Printf("[Error] Handling game action: %v", err)
					continue
				}

				// Send updated game state to all clients
				newState := h.gameManager.GetState()
				stateMsg, err := json.Marshal(map[string]interface{}{
					"type":      "game_state",
					"messageId": baseMsg.MessageID + "-state",
					//"timestamp": action.Timestamp,
					"state": newState,
				})
				log.Printf("[Debug] Sending game state: %s", string(stateMsg))

				if err != nil {
				}
			}
		}
	}
}
