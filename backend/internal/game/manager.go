// internal/game/manager.go
package game

import (
	"errors"
	"game-server/internal/types"
	"log"
	"sync"
)

type GameManager struct {
	state []*types.GameState // History of states
	mutex sync.RWMutex
}

func NewGameManager() *GameManager {
	return &GameManager{
		state: []*types.GameState{{
			Players:    make(map[string]types.Player),
			GameStatus: types.GameStatusHasNotStarted,
			TurnNumber: 0,
		}},
	}
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
		// return gm.StartGame()

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

	newState := &types.GameState{
		Players:    currentState.Players,
		GameStatus: types.GameStatusWaiting,
		TurnNumber: currentState.TurnNumber,
	}

	gm.state = append(gm.state, newState)
	return nil
}
