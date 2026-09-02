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
	// Effects currently riding on this character, ticked at the start of its
	// own turn.
	Effects []Effect `json:"effects"`
}

// Effect is one status effect on a character: poison ticking away at it, a
// shield soaking damage, points added or taken for a few turns.
type Effect struct {
	Kind      string `json:"kind"`
	Value     int    `json:"value"`
	TurnsLeft int    `json:"turnsLeft"`
	Source    string `json:"source"`
}

// Effect kinds.
const (
	EffectPoison = "poison" // damage at the start of the victim's turn
	EffectRegen  = "regen"  // healing at the start of its turn
	EffectAP     = "ap"     // action points added (or removed, when negative)
	EffectMP     = "mp"     // movement points added or removed
	EffectShield = "shield" // flat damage soaked from each hit
)

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
	// Spells tracks per-spell usage, keyed the same way as the catalogue, so
	// the client can grey out what cannot be cast right now.
	Spells map[string]SpellState `json:"spells"`
}

// SpellState is one spell's availability for one player.
type SpellState struct {
	// CastsThisTurn counts against the spell's MaxCastsPerTurn.
	CastsThisTurn int `json:"castsThisTurn"`
	// CooldownLeft is the number of that player's turns still to wait.
	CooldownLeft int `json:"cooldownLeft"`
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
	// Log is the recent combat history, oldest first and bounded.
	Log []LogEntry `json:"log"`
	// Obstacles are cells nobody can stand on and nothing can be seen through.
	Obstacles []Position `json:"obstacles"`
}

// LogEntry is one line of the combat log. The client renders these; without
// them a spell that missed because of line of sight, or one that landed as a
// critical, looked exactly like a spell that did nothing.
type LogEntry struct {
	Turn   int    `json:"turn"`
	Actor  string `json:"actor"`
	Kind   string `json:"kind"`
	Text   string `json:"text"`
	Damage int    `json:"damage,omitempty"`
	Crit   bool   `json:"crit,omitempty"`
}

// Log entry kinds.
const (
	LogCast   = "cast"
	LogDeath  = "death"
	LogTurn   = "turn"
	LogEnd    = "end"
	LogEffect = "effect"
)

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
	// CriticalChance is a percentage; CriticalDamage replaces Damage on a hit.
	CriticalChance int `json:"criticalChance"`
	CriticalDamage int `json:"criticalDamage"`
	// Effect, when set, is applied on top of the damage. Always serialised, so
	// the client sees an explicit null rather than a missing field.
	Effect *SpellEffect `json:"effect"`
}

// SpellEffect describes the status effect a spell leaves behind.
type SpellEffect struct {
	Kind     string `json:"kind"`
	Value    int    `json:"value"`
	Duration int    `json:"duration"`
	// OnSelf applies the effect to the caster instead of to what it hit, which
	// is how a spell buffs or shields its own caster.
	OnSelf bool `json:"onSelf"`
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
