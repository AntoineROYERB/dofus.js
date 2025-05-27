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

// func to increment turn number
func (gm *GameManager) IncrementTurnNumber() {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]
	currentState.TurnNumber = currentState.TurnNumber + 1
	gm.state = append(gm.state, currentState)
}

// Return the first character with HasPlayedThisTurn = false
func (gm *GameManager) GetNextCharacter() (*types.Character, error) {
	gm.mutex.RLock()
	defer gm.mutex.RUnlock()

	currentState := gm.state[len(gm.state)-1]

	for _, player := range currentState.Players {
		if !player.Character.HasPlayedThisTurn {
			return player.Character, nil
		}
	}

	return nil, errors.New("no characters available for next turn")
}

func (gm *GameManager) SetHasPlayedThisTurn(userID string, HasPlayedThisTurn bool) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	// Check if player exists
	player, exists := currentState.Players[userID]
	if !exists {
		return errors.New("player not found")
	}

	// Create new state with updated hasPlayedThisTurn
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  currentState.GameStatus,
		TurnNumber:  currentState.TurnNumber,
	}

	// Update hasPlayedThisTurn for the player
	player.Character.HasPlayedThisTurn = HasPlayedThisTurn

	// Copy players to new state
	for k, v := range currentState.Players {
		if k == userID {
			v = player // Update the specific player
		}
		newState.Players[k] = v
	}

	gm.state = append(gm.state, newState)
	return nil
}

// Given a character name, set it's IsCurrentTurn field
func (gm *GameManager) SetCharacterCurrentTurn(CharacterName string, isCurrent bool) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]
	// Create new state with updated isCurrentTurn
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  currentState.GameStatus,
		TurnNumber:  currentState.TurnNumber,
	}
	// Copy players to new state, updating isCurrentTurn for the specified character
	for k, v := range currentState.Players {
		if v.Character.Name == CharacterName {
			v.Character.IsCurrentTurn = isCurrent
		}
		newState.Players[k] = v
	}
	gm.state = append(gm.state, newState)
	return nil
}

func (gm *GameManager) SetGameStatus(status string) {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]
	currentState.GameStatus = status
	gm.state = append(gm.state, currentState)
}

func (gm *GameManager) UpdatePlayerPosition(playerID string, newPosition types.Position) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

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

func (gm *GameManager) UpdatePlayerPM(playerID string, newPosition types.Position) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	originalPos := currentState.Players[playerID].Character.Position

	// Create new state with updated position points
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  currentState.GameStatus,
		TurnNumber:  currentState.TurnNumber,
	}

	// Calculate distance moved
	distance := func(p1, p2 *types.Position) int {
		dx := p2.X - p1.X
		dy := p2.Y - p1.Y
		return abs(dx) + abs(dy)
	}
	log.Printf("[Game] Distance moved by player %s: %d", playerID, distance(originalPos, &newPosition))

	// Copy players and update movement points directly on v before assigning to newState.Players[k]
	for k, v := range currentState.Players {
		if k == playerID {
			v.Character.MovementPoints -= distance(originalPos, &newPosition)

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
