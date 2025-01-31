// internal/game/manager.go
package game

import (
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
			GameStatus: "waiting",
		},
	}
}

func (gm *GameManager) HandleAction(action GameAction) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	switch action.Type {
	case "MOVE":
		// Handle move action
		return nil
	case "ATTACK":
		// Handle attack action
		return nil
	case "END_TURN":
		// Handle end turn action
		return nil
	}
	return nil
}

func (gm *GameManager) GetState() *GameState {
	gm.mutex.RLock()
	defer gm.mutex.RUnlock()
	return gm.state
}
