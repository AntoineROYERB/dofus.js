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
		Spells:      currentState.Spells,
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
		Spells:      currentState.Spells,
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
		Spells:      currentState.Spells,
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

func (gm *GameManager) ApplySpellDamages(spellID string, affectedPositions []types.Position) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	// Find the spell in the spell list
	spell, exists := currentState.Spells[spellID]
	if !exists {
		return errors.New("spell not found")
	}

	// Apply damage to all players in the affected positions
	for _, position := range affectedPositions {
		for _, v := range currentState.Players {
			if v.Character.Position != nil && v.Character.Position.X == position.X && v.Character.Position.Y == position.Y {
				v.Character.Health -= spell.Damage
				if v.Character.Health <= 0 {
					v.Character.IsAlive = false
				}
			}
		}
	}

	gm.state = append(gm.state, currentState)
	return nil
}

func (gm *GameManager) GetSpellCost(spellID string) (int, error) {
	// This function should return the cost of the spell based on its ID
	// For now, we will return a fixed cost for demonstration purposes
	switch spellID {
	case "1":
		return 4, nil
	case "2":
		return 3, nil
	case "3":
		return 2, nil
	case "4":
		return 5, nil
	default:
		return 0, errors.New("unknown spell ID")
	}
}

func (gm *GameManager) GetAffectedPositions(spellID string, targetPosition types.Position, casterPosition types.Position) ([]types.Position, error) {
	currentState := gm.GetCurrentState()
	spell, exists := currentState.Spells[spellID]
	if !exists {
		return nil, errors.New("spell not found")
	}

	var affectedPositions []types.Position
	pattern := []types.Position{}
	rotatePattern := false

	switch spell.AreaOfEffect {
	case "none":
		pattern = append(pattern, types.Position{X: 0, Y: 0})
	case "circle":
		pattern = append(pattern, []types.Position{
			{X: 2, Y: 0},
			{X: 1, Y: 1},
			{X: 0, Y: 2},
			{X: -1, Y: 1},
			{X: -2, Y: 0},
			{X: 1, Y: -1},
			{X: 0, Y: -2},
			{X: -1, Y: -1},
		}...
		)
	case "line":
		pattern = append(pattern, []types.Position{
			{X: 0, Y: 0},
			{X: 0, Y: 1},
			{X: 0, Y: 2},
		}...
		)
		rotatePattern = true
	case "cross":
		pattern = append(pattern, []types.Position{
			{X: 0, Y: 0},
			{X: 0, Y: 1},
			{X: 1, Y: 0},
			{X: -1, Y: 0},
			{X: 0, Y: -1},
		}...
		)
		rotatePattern = true
	}

	direction := ""
	if rotatePattern {
		direction = getDirection(casterPosition, targetPosition)
	}

	for _, offset := range pattern {
		transformed := offset
		if rotatePattern {
			transformed = rotate(offset, direction)
		}
		affectedPositions = append(affectedPositions, types.Position{
			X: targetPosition.X + transformed.X,
			Y: targetPosition.Y + transformed.Y,
		})
	}

	return affectedPositions, nil
}
func (gm *GameManager) UpdatePlayerAP(playerID string, newActionPoints int) error {
	gm.mutex.Lock()
	defer gm.mutex.Unlock()

	currentState := gm.state[len(gm.state)-1]

	// Create new state with updated action points
	newState := &types.GameState{
		MessageType: "game_state",
		Players:     make(map[string]types.Player),
		GameStatus:  currentState.GameStatus,
		TurnNumber:  currentState.TurnNumber,
		Spells:      currentState.Spells,
	}

	// Copy players and update action points
	for k, v := range currentState.Players {
		if k == playerID {
			v.Character.ActionPoints = v.Character.ActionPoints - newActionPoints
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
		Spells:      currentState.Spells,
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
		Spells:      initializeSpells(),
	}

	gm.state = append(gm.state, newState)
	log.Printf("[Game] Game started with %d players", len(newState.Players))
	return nil
}

func initializeSpells() map[string]types.Spell {
	spells := make(map[string]types.Spell)
	spells["1"] = types.Spell{ID: 1, Name: "Fireball", APCost: 4, Range: 6, Damage: 30, AreaOfEffect: "circle"}
	spells["2"] = types.Spell{ID: 2, Name: "Ice Spike", APCost: 3, Range: 5, Damage: 20, AreaOfEffect: "line"}
	spells["3"] = types.Spell{ID: 3, Name: "Poison Dart", APCost: 2, Range: 4, Damage: 10, AreaOfEffect: "none"}
	spells["4"] = types.Spell{ID: 4, Name: "Gwendo na Gwendo", APCost: 5, Range: 3, Damage: 25, AreaOfEffect: "cross"}
	return spells
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

func getDirection(from, to types.Position) string {
	if from.X == to.X {
		if from.Y > to.Y {
			return "down"
		}
		return "up"
	}
	if from.Y == to.Y {
		if from.X > to.X {
			return "left"
		}
		return "right"
	}
	return ""
}

func rotate(pos types.Position, direction string) types.Position {
	switch direction {
	case "up":
		return pos
	case "down":
		return types.Position{X: -pos.X, Y: -pos.Y}
	case "left":
		return types.Position{X: -pos.Y, Y: pos.X}
	case "right":
		return types.Position{X: pos.Y, Y: -pos.X}
	}
	return pos
}
