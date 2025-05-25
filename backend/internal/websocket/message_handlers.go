package websocket

import (
	"encoding/json"
	"game-server/internal/types"
	"log"
)

type MessageHandler func(*Hub, []byte)

var messageHandlers = map[string]MessageHandler{
	"chat":                 handleChatMessage,
	"create_character":     handleCreateCharacterMessage,
	"disconnect":           handleDisconnectMessage,
	"ready_to_start":       handleReadyToStartMessage,
	"move":                 handleMoveMessage,
	"character_positioned": handleCharacterPositionedMessage,
}

func handleDisconnectMessage(h *Hub, message []byte) {
	var disconnectMessage types.DisconnectMessage
	if err := json.Unmarshal(message, &disconnectMessage); err != nil {
		log.Printf("[Error] Invalid disconnect message: %v", err)
		return

	}

	log.Printf("[Disconnect] User %s left the game", disconnectMessage.UserName)

	// Use the safe method to remove player
	h.playerManager.RemovePlayer(disconnectMessage.UserID)

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
	h.playerManager.UpdatePlayer(createCharacterMessage.UserID, newPlayer)

	// Broadcast the updated state
	if err := h.BroadcastGameState(); err != nil {
		log.Printf("[Error] Failed to broadcast game state: %v", err)
	}
}

func handleReadyToStartMessage(h *Hub, message []byte) {
	var readyMessage types.IsReadyMessage
	if err := json.Unmarshal(message, &readyMessage); err != nil {
		log.Printf("[Error] Invalid ready to start message: %v", err)
		return
	}

	// Update player status
	h.playerManager.PlayerReadyToStart(readyMessage)

	// Check if all players are ready and there are at least 2 players
	players := h.playerManager.GetPlayers()
	if len(players) >= 2 {
		allReady := true
		for _, player := range players {
			if !player.IsReady {
				allReady = false
				break
			}
		}

		// If all players are ready, start the game
		if allReady {
			if err := h.gameManager.StartGame(players); err != nil {
				log.Printf("[Error] Failed to start game: %v", err)
				return
			}
			h.playerManager.SetFirstCharacter()
		}
	}

	// Broadcast the updated state
	if err := h.BroadcastGameState(); err != nil {
		log.Printf("[Error] Failed to broadcast game state: %v", err)
	}
}

func handleMoveMessage(h *Hub, message []byte) {
	var moveMessage types.MoveMessage
	if err := json.Unmarshal(message, &moveMessage); err != nil {
		log.Printf("[Error] Invalid move message: %v", err)
		return
	}

	// Update player postion points
	if err := h.gameManager.UpdatePlayerPM(moveMessage.UserID, moveMessage.Position); err != nil {
		log.Printf("[Error] Failed to update player position points: %v", err)
		return
	}
	// Update player position
	if err := h.gameManager.UpdatePlayerPosition(moveMessage.UserID, moveMessage.Position); err != nil {
		log.Printf("[Error] Failed to start game: %v", err)
		return
	}

	// Broadcast the updated state
	if err := h.BroadcastGameState(); err != nil {
		log.Printf("[Error] Failed to broadcast game state: %v", err)
	}
}

// handleCharacterPositionedMessage handles the "character_positioned" message.
// It is called when a player has placed their character during the setup phase.
// Once all players have placed their characters, the game status is set to "in_progress".
func handleCharacterPositionedMessage(h *Hub, message []byte) {
	var positionedMessage types.CharacterPositionedMessage
	if err := json.Unmarshal(message, &positionedMessage); err != nil {
		log.Printf("[Error] Invalid character positioned message: %v", err)
		return
	}
	// Update player position
	if err := h.gameManager.UpdatePlayerPosition(positionedMessage.UserID, positionedMessage.Position); err != nil {
		log.Printf("[Error] Failed to position character: %v", err)
		return
	}

	// CHeck if all players have positioned their characters
	players := h.playerManager.GetPlayers()
	allPositioned := true
	for _, player := range players {
		if player.Character.Position == nil {
			allPositioned = false
			break
		}
	}
	log.Printf("[Debug] All players positioned: %v", allPositioned)
	if allPositioned {

		// If all players have positioned their characters, update the game status to "in_progress"
		h.gameManager.SetGameStatus(types.GameStatusPlaying)
		// Set the turn number to 1
		h.gameManager.IncrementTurnNumber()
	}
	// Broadcast the updated state
	if err := h.BroadcastGameState(); err != nil {
		log.Printf("[Error] Failed to broadcast game state: %v", err)
	}
}
