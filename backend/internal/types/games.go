package types

// Game statuses. These strings are part of the wire format: the client
// switches on them to decide what to render.
const (
	StatusCreatingPlayer     = "creating_player"
	StatusPositionCharacters = "position_characters"
	StatusPlaying            = "playing"
	StatusGameOver           = "game_over"
)

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Character is owned by exactly one Player, by value. It used to be a pointer
// shared between two separate state maps, which is what let the old
// PlayerManager and GameManager stay accidentally in sync.
type Character struct {
	Name             string     `json:"name"`
	Color            string     `json:"color"`
	Symbol           string     `json:"symbol"`
	Position         *Position  `json:"position"`
	ActionPoints     int        `json:"actionPoints"`
	MovementPoints   int        `json:"movementPoints"`
	IsCurrentTurn    bool       `json:"isCurrentTurn"`
	InitialPositions []Position `json:"initialPositions"`
	Health           int        `json:"health"`
	MaxHealth        int        `json:"maxHealth"`
	IsAlive          bool       `json:"isAlive"`
}

type Player struct {
	UserID        string    `json:"userId"`
	UserName      string    `json:"userName"`
	Character     Character `json:"character"`
	IsCurrentTurn bool      `json:"isCurrentTurn"`
	IsReady       bool      `json:"isReady"`
	HasPositioned bool      `json:"hasPositioned"`
	// Connected goes false while a player is away; their character stays on
	// the board so a refresh or a network blip can resume it.
	Connected bool `json:"connected"`
	// IsBot marks an opponent the server plays itself, so a lone visitor can
	// still play a whole match.
	IsBot bool `json:"isBot"`
}

// GameState is the snapshot broadcast to every client after each accepted
// action. It is the only thing clients are allowed to believe.
type GameState struct {
	MessageType string            `json:"type"`
	Players     map[string]Player `json:"players"`
	TurnNumber  int               `json:"turnNumber"`
	GameStatus  string            `json:"status"`
	Spells      map[string]Spell  `json:"spells"`
	TurnOrder   []string          `json:"turnOrder"`
	// TurnEndsAt is a Unix time in milliseconds, or 0 outside a running turn.
	// A turn that never expires meant a player who walked away froze the game.
	TurnEndsAt int64 `json:"turnEndsAt"`
}

// Spell is the single source of truth for the spell catalogue: the client no
// longer ships its own copy. Color is a hex value rather than a CSS class so
// the server stays unaware of the client's styling framework.
type Spell struct {
	ID               int    `json:"id"`
	Name             string `json:"name"`
	Color            string `json:"color"`
	Icon             string `json:"icon"`
	APCost           int    `json:"APCost"`
	Range            int    `json:"range"`
	Damage           int    `json:"damage"`
	AreaOfEffect     string `json:"areaOfEffect"`
	Element          string `json:"element"`
	Description      string `json:"description"`
	NeedsLineOfSight bool   `json:"needsLineOfSight"`
	MaxCastsPerTurn  int    `json:"maxCastsPerTurn"`
	Cooldown         int    `json:"cooldown"`
}

// RoomSummary is one line in the lobby list.
type RoomSummary struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Players    int    `json:"players"`
	MaxPlayers int    `json:"maxPlayers"`
	Status     string `json:"status"`
}

// Areas of effect. The client mirrors these patterns for its hover preview;
// the server's copy is the one that decides who takes damage.
const (
	AoENone   = "none"
	AoECircle = "circle"
	AoELine   = "line"
	AoECross  = "cross"
)
