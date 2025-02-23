package game

import (
	"game-server/internal/types"
	"sync"
)

type PlayerManager struct {
	players map[string]types.Player
	mutex   sync.Mutex
}

func NewPlayerManager() *PlayerManager {
	return &PlayerManager{
		players: make(map[string]types.Player),
	}
}

// AddPlayer safely adds a new player to the hub
func (pm *PlayerManager) UpdatePlayer(userID string, player types.Player) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()
	pm.players[userID] = player
}

// RemovePlayer safely removes a player from the hub
func (pm *PlayerManager) RemovePlayer(userID string) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()
	delete(pm.players, userID)
}

// GetPlayers safely returns a copy of the current players map
func (pm *PlayerManager) GetPlayers() map[string]types.Player {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	players := make(map[string]types.Player, len(pm.players))
	for k, v := range pm.players {
		players[k] = v
	}
	return players
}

func (pm *PlayerManager) PlayerReadyToStart(readyMessage types.IsReadyMessage) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	if player, ok := pm.players[readyMessage.UserID]; ok {
		player.IsReady = true
		pm.players[readyMessage.UserID] = player
	}
}

func (pm *PlayerManager) SetFirstCharacter() {
	players := pm.GetPlayers()

	// First player in the map
	var firstPlayerID string
	for k := range players {
		firstPlayerID = k
		break
	}

	// Define the first Player character as the current turn
	firstPlayer := players[firstPlayerID]
	firstPlayer.Character.IsCurrentTurn = true
	firstPlayer.IsCurrentTurn = true

	pm.UpdatePlayer(firstPlayerID, firstPlayer)
}
