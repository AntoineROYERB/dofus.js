// internal/game/types.go
package game

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Player struct {
	ID             string    `json:"id"`
	Position       *Position `json:"position"`
	Character      Character `json:"character"`
	ActionPoints   int       `json:"actionPoints"`
	MovementPoints int       `json:"movementPoints"`
	IsCurrentTurn  bool      `json:"isCurrentTurn"`
}

type GameState struct {
	Players     map[string]*Player `json:"players"`
	CurrentTurn string             `json:"currentTurn"`
	TurnNumber  int                `json:"turnNumber"`
	Status      string             `json:"status"`
}

type GameAction struct {
	Type      string     `json:"type"`
	PlayerId  string     `json:"playerId"`
	Position  *Position  `json:"position,omitempty"`
	Character *Character `json:"character,omitempty"` // Added this field
}

type Character struct {
	Color  string `json:"color"`
	Name   string `json:"name"`
	Symbol string `json:"symbol"`
}
