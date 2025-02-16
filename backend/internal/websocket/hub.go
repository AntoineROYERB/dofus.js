package websocket

import (
	"encoding/json"
	"fmt"
	"game-server/internal/game"
	"game-server/internal/types"
	"log"
	"sync"
)

type MessageHandler func(*Hub, []byte)

var messageHandlers = map[string]MessageHandler{
	"chat":             handleChatMessage,
	"create_character": handleCreateCharacterMessage,
	"disconnect":       handleDisconnectMessage,
	// "ready_to_start":   handleReadyToStartMessage,
	// "start_game":       handleGameActionMessage,
	// "end_turn":         handleGameActionMessage,
	// "move":             handleGameActionMessage,
}

func handleDisconnectMessage(h *Hub, message []byte) {
	var disconnectMessage types.DisconnectMessage
	if err := json.Unmarshal(message, &disconnectMessage); err != nil {
		log.Printf("[Error] Invalid disconnect message: %v", err)
		return

	}

	log.Printf("[Disconnect] User %s left the game", disconnectMessage.UserName)

	// Use the safe method to remove player
	h.RemovePlayer(disconnectMessage.UserID)

	// Broadcast the updated state
	if err := h.BroadcastGameState(); err != nil {
		log.Printf("[Error] Failed to broadcast game state: %v", err)
	}
}

func handleChatMessage(h *Hub, message []byte) {
	var chatMessage types.ChatMessage
	if err := json.Unmarshal(message, &chatMessage); err != nil {
		log.Printf("[Error] Invalid chat message: %v", err)
		return
	}
	log.Printf("[Chat] Message received from UserID: %s, Content: %s", chatMessage.UserID, chatMessage.Content)
	h.broadcastMessage(message)
}

func handleCreateCharacterMessage(h *Hub, message []byte) {
	var createCharacterMessage types.CreateCharacter
	if err := json.Unmarshal(message, &createCharacterMessage); err != nil {
		log.Printf("[Error] Invalid create character message: %v", err)
		return
	}

	newPlayer := types.Player{
		Character:     createCharacterMessage.Character,
		IsCurrentTurn: false,
		UserName:      createCharacterMessage.UserName,
		UserID:        createCharacterMessage.UserID,
		Status:        "waiting-room",
	}

	// Use the safe method to add player
	h.AddPlayer(createCharacterMessage.UserID, newPlayer)

	// Broadcast the updated state
	if err := h.BroadcastGameState(); err != nil {
		log.Printf("[Error] Failed to broadcast game state: %v", err)
	}
}

type Hub struct {
	// Client management
	Clients    map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan []byte

	// Game state
	Players     map[string]types.Player
	gameManager *game.GameManager

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
		Players: make(map[string]types.Player),

		// Initialize game manager
		gameManager: game.NewGameManager(),
	}
}

// AddPlayer safely adds a new player to the hub
func (h *Hub) AddPlayer(userID string, player types.Player) {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	h.Players[userID] = player
}

// RemovePlayer safely removes a player from the hub
func (h *Hub) RemovePlayer(userID string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	delete(h.Players, userID)
}

// GetPlayers safely returns a copy of the current players map
func (h *Hub) GetPlayers() map[string]types.Player {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	players := make(map[string]types.Player, len(h.Players))
	for k, v := range h.Players {
		players[k] = v
	}
	return players
}

func (h *Hub) BroadcastGameState() error {
	state := types.GameState{
		MessageType: "game_state",
		Players:     h.GetPlayers(),
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
