package websocket

import (
	"encoding/json"
	"game-server/internal/types"
	"log"
	"strconv"
)

type MessageHandler func(*Hub, []byte)

var messageHandlers = map[string]MessageHandler{
	"chat":                 handleChatMessage,
	"create_character":     handleCreateCharacterMessage,
	"disconnect":           handleDisconnectMessage,
	"ready_to_start":       handleReadyToStartMessage,
	"move":                 handleMoveMessage,
	"character_positioned": handleCharacterPositionedMessage,
	"end_turn":             handleEndTurnMessage,
	"cast_spell":           handleCastSpellMessage,
}

// Final turn handler for the end turn message.
// 1. Update the character's hasPlayedThisTurn to true
// 2. Update the player's isCurrentTurn to false
// 3. Find the next character in the turn that has not played this turn
// 4. Set the next character's isCurrentTurn to true
// 5. Set isCurrentTurn to true of the next players with the next character as current turn
// 6. Broadcast the updated state
func handleEndTurnMessage(h *Hub, message []byte) {
	var endTurnMessage types.EndTurnMessage
	if err := json.Unmarshal(message, &endTurnMessage); err != nil {
		log.Printf("[Error] Invalid end turn message: %v", err)
		return
	}

	// Update character hasPlayedThisTurn to true
	if err := h.gameManager.SetHasPlayedThisTurn(endTurnMessage.UserID, true); err != nil {
		log.Printf("[Error] Failed to update player hasPlayedThisTurn: %v", err)
		return
	}

	// Update player's isCurrentTurn to false
	if err := h.playerManager.SetPlayerCurrentTurn(endTurnMessage.UserID, false); err != nil {
		log.Printf("[Error] Failed to update player's game state: %v", err)
		return
	}
	// Check if all players have played this turn
	players := h.playerManager.GetPlayers()
	allPlayed := true
	for _, player := range players {
		if !player.Character.HasPlayedThisTurn {
			allPlayed = false
			break
		}
	}

	if allPlayed {
		for userID := range players {
			// Reset character's HasPlayedThisTurn
			if err := h.gameManager.SetHasPlayedThisTurn(userID, false); err != nil {
				log.Printf("[Error] Failed to reset player hasPlayedThisTurn: %v", err)
				return
			}
			// Reset the player's MP
			if err := h.playerManager.ResetMPs(userID); err != nil {
				log.Printf("[Error] Failed to reset player MP: %v", err)
				return
			}

		}
		h.gameManager.IncrementTurnNumber()
		h.playerManager.SetFirstCharacter()
	} else {
		// Find the next character in the turn that has not played this turn
		nextCharacter, err := h.gameManager.GetNextCharacter()
		if err != nil {
			log.Printf("[Error] Failed to get next character: %v", err)
			return
		}

		// Set the next character's isCurrentTurn to True
		if err := h.gameManager.SetCharacterCurrentTurn(nextCharacter.Name, true); err != nil {
			log.Printf("[Error] Failed to set next player as current turn: %v", err)
			return
		}

		// Get the user ID given a character name
		nextUserID := h.playerManager.GetUserIDWithCharacterName(nextCharacter.Name)
		if nextUserID == "" {
			log.Printf("[Error] No player has the current turn character")
			return
		}

		// Update the player whose turn it is now
		if err := h.playerManager.SetPlayerCurrentTurn(nextUserID, true); err != nil {
			log.Printf("[Error] Failed to update player's game state: %v", err)
			return
		}
	}
	// Broadcast the updated state
	if err := h.BroadcastGameState(); err != nil {
		log.Printf("[Error] Failed to broadcast game state: %v", err)
	}
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

	// Set initial health and alive status on the backend
	createCharacterMessage.Character.Health = 100
	createCharacterMessage.Character.IsAlive = true

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

/*
1. Unmarshal the message into a CastSpellMessage struct.
2. Retrieve the AP cost from the total AP of the player.
3. Apply damage or effects of the spell to target positions.
4. Broadcast the updated game state to all players.
*/
func handleCastSpellMessage(h *Hub, message []byte) {
	var castSpellMessage types.CastSpellMessage
	if err := json.Unmarshal(message, &castSpellMessage); err != nil {
		log.Printf("[Error] Invalid cast spell message: %v", err)
		return
	}

	spellIDStr := strconv.Itoa(castSpellMessage.SpellID)

	// Get the casting player's current AP
	currentPlayer, exists := h.playerManager.GetPlayer(castSpellMessage.UserID)
	if !exists || currentPlayer.Character == nil {
		log.Printf("[Error] Caster player or character not found for UserID: %s", castSpellMessage.UserID)
		return
	}
	currentAP := currentPlayer.Character.ActionPoints

	// Compute the spell cost
	spellCost, err := h.gameManager.GetSpellCost(spellIDStr)
	if err != nil {
		log.Printf("[Error] Failed to get spell cost: %v", err)
		return
	}

	// Check if player has enough AP
	if currentAP < spellCost {
		log.Printf("[Error] Player %s does not have enough AP to cast spell %s. Current AP: %d, Required AP: %d", castSpellMessage.UserID, spellIDStr, currentAP, spellCost)
		return
	}

	// Retrieve AP cost from the total AP of the player
	if err := h.gameManager.UpdatePlayerAP(castSpellMessage.UserID, spellCost); err != nil {
		log.Printf("[Error] Failed to update player AP: %v", err)
		return
	}

	// Get caster's position
	casterPlayer, exists := h.playerManager.GetPlayer(castSpellMessage.UserID)
	if !exists {
		log.Printf("[Error] Failed to get caster's player data")
		return
	}
	casterPosition := casterPlayer.Character.Position

	// Get affected positions
	affectedPositions, err := h.gameManager.GetAffectedPositions(spellIDStr, castSpellMessage.TargetPosition, *casterPosition)
	if err != nil {
		log.Printf("[Error] Failed to get affected positions: %v", err)
		return
	}

	// Apply damage or effects of the spell to target positions
	if err := h.gameManager.ApplySpellDamages(spellIDStr, affectedPositions); err != nil {
		log.Printf("[Error] Failed to apply spell damages: %v", err)
		return
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
