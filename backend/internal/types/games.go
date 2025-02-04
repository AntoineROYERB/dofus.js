package types

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Character struct {
	Name   string `json:"name"`
	Color  string `json:"color"`
	Symbol string `json:"symbol"`
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

const (
	GameStatusWaiting  = "waiting"
	GameStatusPlaying  = "playing"
	GameStatusFinished = "finished"
)
