package websocket

import (
	"bytes"
	"encoding/json"
	"fmt"
	"game-server/internal/game"
	"game-server/internal/types"
	"log"
	"sync"
)

type Hub struct {
	// Client management
	Clients    map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan []byte

	// Game state
	playerManager *game.PlayerManager
	gameManager   *game.GameManager

	// Concurrency control
	mutex sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		// Initialize channels
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),

		// Initialize maps
		Clients: make(map[*Client]bool),

		playerManager: game.NewPlayerManager(),
		gameManager:   game.NewGameManager(),
	}
}

func (h *Hub) BroadcastGameState() error {

	state := types.GameState{
		MessageType: "game_state",
		Players:     h.playerManager.GetPlayers(),
		TurnNumber:  h.gameManager.GetTurnNumber(),
		GameStatus:  h.gameManager.GetStatus(),
	}

	stateMsg, err := json.Marshal(map[string]interface{}{
		"type":  "game_state",
		"state": state,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal game state: %w", err)
	}

	h.broadcastMessage(stateMsg)
	return nil
}

func (h *Hub) broadcastMessage(message []byte) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	var prettyJSON bytes.Buffer
	if err := json.Indent(&prettyJSON, message, "", "  "); err != nil {
		log.Printf("[Debug] Broadcasting message (raw): %s", string(message))
	} else {
		log.Printf("[Debug] Broadcasting message:\n%s", prettyJSON.String())
	}
	// Store message in game history through game manager
	if err := h.gameManager.AddToHistory(message); err != nil {
		log.Printf("[Error] Failed to add message to history: %v", err)
	}

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

			// 1. Désérialiser uniquement le type
			var baseMsg types.BaseMessage
			if err := json.Unmarshal(message, &baseMsg); err != nil {
				log.Printf("[Error] Failed to parse message type: %v", err)
				continue
			}

			// 2. Vérifier si un handler existe
			if handler, exists := messageHandlers[baseMsg.Type]; exists {
				handler(h, message) // Appeler dynamiquement la fonction
			} else {
				log.Printf("[Warning] Unrecognized message type: %s", baseMsg.Type)
			}

		}
	}
}
