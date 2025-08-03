package game

import (
	"fmt"
	"game-server/internal/types"
	"log"
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

func (pm *PlayerManager) GetUserIDWithCharacterName(characterName string) string {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	for userID, player := range pm.players {
		if player.Character.Name == characterName {
			return userID
		}
	}
	return ""
}

func (pm *PlayerManager) GetPlayer(userID string) (types.Player, bool) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	player, ok := pm.players[userID]
	return player, ok
}

func (pm *PlayerManager) PlayerReadyToStart(readyMessage types.IsReadyMessage) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	if player, ok := pm.players[readyMessage.UserID]; ok {
		player.IsReady = true
		pm.players[readyMessage.UserID] = player
	}
}

func (pm *PlayerManager) ResetMPs(UserID string) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	player, ok := pm.players[UserID]
	if !ok {
		return fmt.Errorf("player with ID %s not found", UserID)
	}
	player.Character.MovementPoints = 4 // Reset the character's movement points to the default value
	pm.players[UserID] = player
	log.Printf("[Debug] Reset MP for player %s to %d", UserID, player.Character.MovementPoints)
	return nil
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

func (pm *PlayerManager) SetPlayerCurrentTurn(userID string, isCurrentTurn bool) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	log.Printf("[Debug] Setting player %s current turn to %t", userID, isCurrentTurn)
	player, ok := pm.players[userID]
	if !ok {
		return fmt.Errorf("player with ID %s not found", userID)
	}

	player.IsCurrentTurn = isCurrentTurn
	pm.players[userID] = player
	return nil
}

func (pm *PlayerManager) SetPlayerHasPositioned(userID string, hasPositioned bool) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	player, ok := pm.players[userID]
	if !ok {
		return fmt.Errorf("player with ID %s not found", userID)
	}

	player.HasPositioned = hasPositioned
	pm.players[userID] = player
	return nil
}
