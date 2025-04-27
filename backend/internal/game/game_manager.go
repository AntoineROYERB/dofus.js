// internal/game/manager.go
package game

import (
	"encoding/json"
	"errors"
	"game-server/internal/types"
	"log"
	"math/rand"
	"sync"
)

// Game status constants
const (
	GameStatusHasNotStarted      = "creating_player"
	GameStatusWaiting            = "waiting"
	GameStatusInProgress         = "in_progress"
	GameStatusGameOver           = "game_over"
	GameStatusPositionCharacters = "position_characters"
)

type GameManager struct {
	state          []*types.GameState
	messageHistory [][]byte // Add this field to store message history
	mutex          sync.RWMutex
}

func NewGameManager() *GameManager {
	return &GameManager{
		state: []*types.GameState{{
			MessageType: "game_state",
			Players:     make(map[string]types.Player),
			GameStatus:  GameStatusHasNotStarted,
			TurnNumber:  0,
		}},
		messageHistory: make([][]byte, 0), // Initialize message history

	}
}

// AddToHistory adds a message to the game history
func (gm *GameManager) AddToHistory(message []byte) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	// Create a copy of the message to prevent external modifications
	messageCopy := make([]byte, len(message))
	copy(messageCopy, message)

	gm.messageHistory = append(gm.messageHistory, messageCopy)
	return nil
}

// GetMessageHistory returns a copy of the message history
func (gm *GameManager) GetMessageHistory() [][]byte {
	gm.mutex.RLock()
	defer gm.mutex.RUnlock()

	// Create a deep copy of the message history
	historyCopy := make([][]byte, len(gm.messageHistory))
	for i, msg := range gm.messageHistory {
		historyCopy[i] = make([]byte, len(msg))
		copy(historyCopy[i], msg)
	}

	return historyCopy
}

// GetCurrentState returns the current game state
func (gm *GameManager) GetCurrentState() *types.GameState {
	gm.mutex.RLock()
	defer gm.mutex.RUnlock()
	return gm.state[len(gm.state)-1]
}

// GetStatus returns the current game status
func (gm *GameManager) GetStatus() string {
	return gm.GetCurrentState().GameStatus
}

// GetTurnNumber returns the current turn number
func (gm *GameManager) GetTurnNumber() int {
	return gm.GetCurrentState().TurnNumber
}

func (gm *GameManager) HandleAction(action types.GameActionMessage) error {
	log.Printf("[Game] Handling action: %+v", action)

	switch action.Type {
	case "create_character":
		if action.Character == nil {
			return errors.New("character data is required")
		}
		return gm.addPlayer(action)

	case "ready_to_start":
		readyMessage := types.IsReadyMessage{
			UserID:    action.UserID,
			MessageID: action.MessageID,
			Timestamp: action.Timestamp,
		}
		return gm.playerReadyToStart(readyMessage)
	case "start_game":
		players := gm.GetCurrentState().Players
		return gm.StartGame(players)

	case "end_turn":
		// return gm.EndTurn(action.PlayerID)

	case "move":
		if action.Position == nil {
			return errors.New("position is required for move action")
		}
		log.Printf("MOOOOOVEEEEE")
		return gm.MovePlayer(action.PlayerID, *action.Position)
	}

	return errors.New("unknown action type")
}

func (gm *GameManager) addPlayer(action types.GameActionMessage) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	// Create new player
	newPlayer := types.Player{
		UserID:        action.UserID,
		UserName:      action.UserName,
		Character:     action.Character,
		IsCurrentTurn: false,
	}

	// Create new state with the added player
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  GameStatusWaiting,
		TurnNumber:  currentState.TurnNumber,
	}

	// Copy existing players and add new player
	for k, v := range currentState.Players {
		newState.Players[k] = v
	}
	newState.Players[action.UserID] = newPlayer

	gm.state = append(gm.state, newState)
	return nil
}

func (gm *GameManager) playerReadyToStart(action types.IsReadyMessage) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	// Find player and set ready status
	_, exists := currentState.Players[action.UserID]
	if !exists {
		return errors.New("player not found")
	}

	// Create new state with updated player ready status
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  currentState.GameStatus,
		TurnNumber:  currentState.TurnNumber,
	}

	// Copy existing players and update the ready status for the specific player
	for k, v := range currentState.Players {
		if k == action.UserID {
			v.IsReady = true
		}
		newState.Players[k] = v
	}

	// Check if all players are ready
	allReady := true
	for _, p := range newState.Players {
		if !p.IsReady {
			allReady = false
			break
		}
	}

	// If all players are ready, update game status
	if allReady && len(newState.Players) >= 2 {
		newState.GameStatus = GameStatusWaiting
	}

	gm.state = append(gm.state, newState)
	return nil
}

// func to increment turn number
func (gm *GameManager) IncrementTurnNumber() {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.GetCurrentState()
	currentState.TurnNumber++
	gm.state = append(gm.state, currentState)
}

func (gm *GameManager) endTurn(playerID string) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	if currentState.GameStatus != GameStatusInProgress {
		return errors.New("game is not in progress")
	}

	// Create new state for next turn
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  GameStatusInProgress,
		TurnNumber:  currentState.TurnNumber + 1,
	}

	// Find next player in turn order
	players := make([]string, 0, len(currentState.Players))
	for k := range currentState.Players {
		players = append(players, k)
	}

	var currentPlayerIndex int
	for i, pid := range players {
		if currentState.Players[pid].IsCurrentTurn {
			currentPlayerIndex = i
			break
		}
	}

	// Calculate next player's index
	nextPlayerIndex := (currentPlayerIndex + 1) % len(players)
	nextPlayerId := players[nextPlayerIndex]

	// Copy players and update turns
	for k, v := range currentState.Players {
		player := v                                // Create a copy of the player
		player.IsCurrentTurn = (k == nextPlayerId) // Set IsCurrentTurn based on next player
		newState.Players[k] = player
	}

	gm.state = append(gm.state, newState)
	return nil
}

func (gm *GameManager) MovePlayer(playerID string, newPosition types.Position) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	player, exists := currentState.Players[playerID]
	if !exists {
		return errors.New("player not found")
	}

	if !player.Character.IsCurrentTurn {
		return errors.New("not character's turn")
	}

	// Create new state with updated position
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  currentState.GameStatus,
		TurnNumber:  currentState.TurnNumber,
	}

	//Copy players and update position
	for k, v := range currentState.Players {
		if k == playerID {
			v.Character.Position = &newPosition
		}
		newState.Players[k] = v
	}

	gm.state = append(gm.state, newState)
	return nil
}

func (gm *GameManager) StartGame(players map[string]types.Player) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	// Check if we have minimum number of players
	if len(players) < 2 {
		return errors.New("not enough players to start game")
	}

	// Check if all players are ready
	for _, player := range players {
		if !player.IsReady {
			return errors.New("not all players are ready")
		}
	}

	// For each character, create 3 random initial positions
	for id, player := range players {
		player.Character.InitialPositions = generateInitialPositions()
		players[id] = player
	}

	// Update the game state
	// Create new state with game started
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     players,
		GameStatus:  GameStatusPositionCharacters,
		TurnNumber:  0,
	}

	gm.state = append(gm.state, newState)
	log.Printf("[Game] Game started with %d players", len(newState.Players))
	return nil
}

// generateInitialPositions generates 3 random initial positions for a character
func generateInitialPositions() []*types.Position {
	// Create a hexagonal grid of positions in a circular pattern
	// This generates all positions where abs(x) + abs(y) <= 7 and neither x nor y is 0
	var allowedPositions []*types.Position

	// Define the radius of our hexagonal grid
	radius := 7

	// Generate positions within the radius
	for x := -radius; x <= radius; x++ {
		for y := -radius; y <= radius; y++ {
			// Skip positions where sum of absolute values exceeds radius
			if abs(x)+abs(y) > radius {
				continue
			}

			// Skip the center position (0,0) and any positions on the axes
			if x == 0 || y == 0 {
				continue
			}

			// Add position to our list
			allowedPositions = append(allowedPositions, &types.Position{X: x, Y: y})
		}
	}

	// Determine the number of positions to return (more flexible than hardcoded 3)
	numPositions := 3
	if len(allowedPositions) < numPositions {
		numPositions = len(allowedPositions)
	}

	// Shuffle the positions
	rand.Shuffle(len(allowedPositions), func(i, j int) {
		allowedPositions[i], allowedPositions[j] = allowedPositions[j], allowedPositions[i]
	})

	// Take the first numPositions elements
	positions := allowedPositions[:numPositions]

	// Log the generated positions
	jsonPositions, _ := json.Marshal(positions)
	log.Printf("[Game] Generated initial positions: %s", jsonPositions)

	return positions
}

// Simple absolute value function for integers
func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
