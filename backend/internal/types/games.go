package types

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Character struct {
	Name              string      `json:"name"`
	Color             string      `json:"color"`
	Symbol            string      `json:"symbol"`
	Position          *Position   `json:"position"`
	ActionPoints      int         `json:"actionPoints"`
	MovementPoints    int         `json:"movementPoints"`
	IsCurrentTurn     bool        `json:"isCurrentTurn"`
	InitialPositions  []*Position `json:"initialPositions"`
	HasPlayedThisTurn bool        `json:"hasPlayedThisTurn"`
	Health            int         `json:"health"`
	IsAlive           bool        `json:"isAlive"`
}

type Player struct {
	UserID        string     `json:"userId"`
	UserName      string     `json:"userName"`
	Character     *Character `json:"character"`
	Status        string     `json:"status"`
	IsCurrentTurn bool       `json:"isCurrentTurn"`
	IsReady       bool       `json:"isReady"`
}

type GameState struct {
	MessageType string            `json:"type"`
	Players     map[string]Player `json:"players"`
	TurnNumber  int               `json:"turnNumber"`
	GameStatus  string            `json:"status"`
	Spells      map[string]Spell  `json:"spells"`
}

type Spell struct {
	ID               int    `json:"id"`
	Name             string `json:"name"`
	BgColor          string `json:"bgColor"`
	BorderColor      string `json:"borderColor"`
	Icon             string `json:"icon"`
	APCost           int    `json:"APCost"`
	Range            int    `json:"range"`
	NeedsLineOfSight bool   `json:"needsLineOfSight"`
	MaxCastsPerTurn  int    `json:"maxCastsPerTurn"`
	Damage           int    `json:"damage"`
	AreaOfEffect     string `json:"areaOfEffect"`
	Type             string `json:"type"`
	Description      string `json:"description,omitempty"`
	CriticalChance   int    `json:"criticalChance,omitempty"`
	CriticalDamage   int    `json:"criticalDamage,omitempty"`
	CastInLineOnly   bool   `json:"castInLineOnly,omitempty"`
	CastOnEmptyCell  bool   `json:"castOnEmptyCell,omitempty"`
	Cooldown         int    `json:"cooldown,omitempty"`
	IsWeapon         bool   `json:"isWeapon,omitempty"`
}

type GameHistory struct {
	GameHistory map[string]GameState `json:"gameHistory"`
}

const (
	GameStatusHasNotStarted = "not_started"
	GameStatusWaiting       = "waiting"
	GameStatusPlaying       = "playing"
	GameStatusFinished      = "finished"
)