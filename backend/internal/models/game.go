type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Player struct {
	ID             string   `json:"id"`
	Position       Position `json:"position"`
	Health         int      `json:"health"`
	ActionPoints   int      `json:"actionPoints"`
	MovementPoints int      `json:"movementPoints"`
	IsCurrentTurn  bool     `json:"isCurrentTurn"`
}

type GameState struct {
	Players     map[string]*Player `json:"players"`
	CurrentTurn string             `json:"currentTurn"`
	TurnOrder   []string           `json:"turnOrder"`
	TurnNumber  int                `json:"turnNumber"`
	GameStatus  string             `json:"gameStatus"`
}