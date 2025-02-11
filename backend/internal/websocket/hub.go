package websocket

import (
	"encoding/json"
	"game-server/internal/game"
	"game-server/internal/types"
	"log"
	"sync"
)

type MessageHandler func(*Hub, []byte)

var messageHandlers = map[string]MessageHandler{
	"chat":             handleChatMessage,
	"create_character": handleCreateCharacterMessage,
	// "ready_to_start":   handleReadyToStartMessage,
	// "start_game":       handleGameActionMessage,
	// "end_turn":         handleGameActionMessage,
	// "move":             handleGameActionMessage,
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

	// Store player in Hub
	h.mutex.Lock()
	h.Players[createCharacterMessage.UserID] = newPlayer
	h.mutex.Unlock()

	//

	newState := types.GameState{
		MessageType: "game_state",
		Players:     h.Players,
		TurnNumber:  0,
		GameStatus:  "starting",
	}
	// Broadcast updated state
	stateMsg, _ := json.Marshal(map[string]interface{}{
		"type":  "game_state",
		"state": newState,
	})
	h.broadcastMessage(stateMsg)
}

type Hub struct {
	Clients     map[*Client]bool
	Broadcast   chan []byte
	Register    chan *Client
	Unregister  chan *Client
	mutex       sync.Mutex
	gameManager *game.GameManager
	Players     map[string]types.Player // Add this to store players

	// userManager *user.UserManager
}

func NewHub() *Hub {
	return &Hub{
		Broadcast:   make(chan []byte),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
		Clients:     make(map[*Client]bool),
		Players:     make(map[string]types.Player), // Initialize players map
		gameManager: game.NewGameManager(),
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
