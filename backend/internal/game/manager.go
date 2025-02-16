// internal/game/manager.go
package game

import (
	"errors"
	"game-server/internal/types"
	"log"
	"sync"
)

// Game status constants
const (
	GameStatusHasNotStarted = "creating_player"
	GameStatusWaiting       = "waiting"
	GameStatusInProgress    = "in_progress"
	GameStatusGameOver      = "game_over"
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

	case "start_game":
		return gm.startGame()

	case "end_turn":
		// return gm.EndTurn(action.PlayerID)

	case "move":
		if action.Position == nil {
			return errors.New("position is required for move action")
		}
		// return gm.MovePlayer(action.PlayerID, *action.Position)
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

func (gm *GameManager) startGame() error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	if len(currentState.Players) < 2 {
		return errors.New("not enough players to start game")
	}

	// Create new state with game started
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  GameStatusInProgress,
		TurnNumber:  1,
	}

	// Copy players and set first player's turn
	firstPlayer := true
	for k, v := range currentState.Players {
		v.IsCurrentTurn = firstPlayer
		newState.Players[k] = v
		firstPlayer = false
	}

	gm.state = append(gm.state, newState)
	return nil
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

func (gm *GameManager) movePlayer(playerID string, newPosition types.Position) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	player, exists := currentState.Players[playerID]
	if !exists {
		return errors.New("player not found")
	}

	if !player.IsCurrentTurn {
		return errors.New("not player's turn")
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
			v.Character.Position = newPosition
		}
		newState.Players[k] = v
	}

	gm.state = append(gm.state, newState)
	return nil
}
