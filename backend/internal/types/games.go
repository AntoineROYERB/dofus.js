package types

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Character struct {
	Name           string    `json:"name"`
	Color          string    `json:"color"`
	Symbol         string    `json:"symbol"`
	Position       *Position `json:"position"`
	ActionPoints   int       `json:"actionPoints"`
	MovementPoints int       `json:"movementPoints"`
	IsCurrentTurn  bool      `json:"isCurrentTurn"`
}

type Player struct {
	UserID        string     `json:"userId"`
	UserName      string     `json:"userName"`
	Character     *Character `json:"character"`
	Status        string     `json:"status"`
	IsCurrentTurn bool       `json:"isCurrentTurn"`
}

type GameState struct {
	MessageType string            `json:"type"`
	Players     map[string]Player `json:"players"`
	TurnNumber  int               `json:"turnNumber"`
	GameStatus  string            `json:"status"`
}

const (
	GameStatusHasNotStarted = "not_started"
	GameStatusWaiting       = "waiting"
	GameStatusPlaying       = "playing"
	GameStatusFinished      = "finished"
)
