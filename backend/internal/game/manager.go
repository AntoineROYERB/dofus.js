// internal/game/manager.go
package game

import (
	"errors"
	"log"
	"sync"
)

type GameManager struct {
	state *GameState
	mutex sync.RWMutex
}

func NewGameManager() *GameManager {
	return &GameManager{
		state: &GameState{
			Players:    make(map[string]*Player),
			Status:     "waiting",
			TurnNumber: 0,
		},
	}
}

func (gm *GameManager) HandleAction(action GameAction) error {
	log.Printf("[Game] Handling action: %+v", action)

	switch action.Type {
	case "create_character":
		if action.Character == nil {
			return errors.New("character data is required")
		}
		return gm.addPlayer(action.PlayerId, *action.Character)

	case "start_game":
		return gm.StartGame()

	case "end_turn":
		return gm.EndTurn(action.PlayerId)

	case "move":
		if action.Position == nil {
			return errors.New("position is required for move action")
		}
		return gm.MovePlayer(action.PlayerId, *action.Position)
	}

	return errors.New("unknown action type")
}

func (gm *GameManager) addPlayer(playerId string, character Character) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	log.Printf("[Game] Adding player %s with character %+v", playerId, character)

	// Create new player
	gm.state.Players[playerId] = &Player{
		ID:             playerId,
		Character:      character,
		IsCurrentTurn:  false,
		ActionPoints:   6,
		MovementPoints: 3,
		Position:       nil, // Start without a position
	}

	log.Printf("[Game] Player added. Total players: %d", len(gm.state.Players))
	log.Printf("[Game] Current state: %+v", gm.state)

	return nil
}

func (gm *GameManager) StartGame() error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	if len(gm.state.Players) < 1 {
		return errors.New("not enough players to start game")
	}

	if gm.state.Status != "waiting" {
		return errors.New("game already started")
	}

	// Choose first player (for now, just take the first one in the map)
	var firstPlayerId string
	for id := range gm.state.Players {
		firstPlayerId = id
		break
	}

	gm.state.Status = "playing"
	gm.state.CurrentTurn = firstPlayerId
	gm.state.TurnNumber = 1
	gm.state.Players[firstPlayerId].IsCurrentTurn = true

	log.Printf("[Game] Game started. First player: %s", firstPlayerId)
	return nil
}

func (gm *GameManager) EndTurn(playerId string) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	if gm.state.Status != "playing" {
		return errors.New("game not in progress")
	}

	if gm.state.CurrentTurn != playerId {
		return errors.New("not your turn")
	}

	// Reset current player's points
	currentPlayer := gm.state.Players[playerId]
	currentPlayer.IsCurrentTurn = false
	currentPlayer.ActionPoints = 6
	currentPlayer.MovementPoints = 3

	// Find next player
	var nextPlayerId string
	found := false
	for id := range gm.state.Players {
		if found {
			nextPlayerId = id
			break
		}
		if id == playerId {
			found = true
		}
	}

	// If we haven't found the next player, take the first one
	if nextPlayerId == "" {
		for id := range gm.state.Players {
			nextPlayerId = id
			break
		}
	}

	gm.state.CurrentTurn = nextPlayerId
	gm.state.Players[nextPlayerId].IsCurrentTurn = true
	gm.state.TurnNumber++

	log.Printf("[Game] Turn ended. Next player: %s", nextPlayerId)
	return nil
}

func (gm *GameManager) MovePlayer(playerId string, newPos Position) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	player, exists := gm.state.Players[playerId]
	if !exists {
		return errors.New("player not found")
	}

	if gm.state.CurrentTurn != playerId {
		return errors.New("not your turn")
	}

	if player.MovementPoints <= 0 {
		return errors.New("no movement points left")
	}

	// For now, just allow any movement and deduct 1 point
	player.Position = &newPos
	player.MovementPoints--

	log.Printf("[Game] Player %s moved to position (%d, %d)", playerId, newPos.X, newPos.Y)
	return nil
}

func (gm *GameManager) GetState() *GameState {
	gm.mutex.RLock()
	defer gm.mutex.RUnlock()
	return gm.state
}
