// internal/websocket/hub.go
package websocket

import (
	"encoding/json"
	"game-server/internal/game"
	"game-server/internal/types"
	"game-server/internal/user"
	"log"
	"sync"
)

type Hub struct {
	Clients           map[*Client]bool
	Broadcast         chan []byte
	Register          chan *Client
	Unregister        chan *Client
	mutex             sync.Mutex
	processedMessages sync.Map
	gameManager       *game.GameManager
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

func (h *Hub) broadcastMessage(message []byte) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	for client := range h.Clients {
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

			var msgObj types.BaseMessage

			if err := json.Unmarshal(message, &msgObj); err != nil {
				log.Printf("[Error] Failed to parse message: %v", err)
				return
			}

			log.Printf("[Debug] Message map: %v", msgObj)

			// Handle the message based on its type
			switch msgObj.GetType() {
			case "chat":

				var chatMessage types.ChatMessage
				if err := json.Unmarshal(message, &chatMessage); err != nil {
					log.Printf("[Error] Invalid message type for 'chat': %v", err)
					continue
				}

				log.Printf("[Chat] Message received from UserID: %s, Content: %s", chatMessage.UserID, chatMessage.Content)
				// h.broadcastMessage(message, chatMessage.UserID)
				h.broadcastMessage(message)

			case "create_character":
				log.Printf("[Character] Creating character for UserID: %s", msgObj.UserID)
				var characterMessage types.CreateCharacter
				if err := json.Unmarshal(message, &characterMessage); err != nil {
					log.Printf("[Error] Invalid message type for 'chat': %v", err)
					continue
				}

				h.broadcastMessage(message)

			case "game_action":
				log.Printf("[Game] Processing game action from UserID: %s", msgObj.UserID)

				var action game.GameAction
				if err := json.Unmarshal(message, &action); err != nil {
					log.Printf("[Error] Parsing game action: %v", err)
					continue
				}

				if err := h.gameManager.HandleAction(action); err != nil {
					log.Printf("[Error] Handling game action: %v", err)
					continue
				}

				// Récupération de l'état mis à jour du jeu
				newState := h.gameManager.GetState()
				stateMsg, err := json.Marshal(map[string]interface{}{
					"type":      "game_state",
					"messageId": msgObj.MessageID + "-state",
					"state":     newState,
				})
				if err != nil {
					log.Printf("[Error] Failed to marshal game state: %v", err)
					continue
				}

				log.Printf("[Debug] Sending updated game state: %s", string(stateMsg))

			default:
				log.Printf("[Warning] Unrecognized message type: %s", msgObj.Type)
			}

		}
	}
}
