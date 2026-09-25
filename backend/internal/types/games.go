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
	Name   string `json:"name"`
	Color  string `json:"color"`
	Symbol string `json:"symbol"`
	// Class is the id of the class this character was built from, which is
	// what decides its starting stats and its spell bar. Empty only for a
	// character a test seats by hand.
	Class          string    `json:"class"`
	Position       *Position `json:"position"`
	ActionPoints   int       `json:"actionPoints"`
	MovementPoints int       `json:"movementPoints"`
	// What this character's action and movement points refill to at the
	// start of its own next turn, once its active ap/mp effects have had
	// their say. Meaningless mid-turn for whoever is currently playing —
	// ActionPoints/MovementPoints already show their live, spendable count —
	// but it's what a hovering opponent should be shown instead of the
	// leftover 0 a fighter sits on between spending its last point and its
	// next turn starting.
	MaxActionPoints   int        `json:"maxActionPoints"`
	MaxMovementPoints int        `json:"maxMovementPoints"`
	IsCurrentTurn     bool       `json:"isCurrentTurn"`
	InitialPositions  []Position `json:"initialPositions"`
	Health            int        `json:"health"`
	MaxHealth         int        `json:"maxHealth"`
	IsAlive           bool       `json:"isAlive"`
	// Effects currently riding on this character, ticked at the start of its
	// own turn.
	Effects []Effect `json:"effects"`
	// Concealed says the character is somewhere the viewer cannot see — deep
	// in tall grass — and its Position has been withheld from them.
	Concealed bool `json:"concealed,omitempty"`
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
	// EffectBurn stacks: its value is how many burns are riding on the
	// character, and each one burns at the start of the victim's turn.
	EffectBurn = "burn"
	// EffectRoot takes every movement point a turn would restore.
	EffectRoot = "root"
)

type Player struct {
	UserID        string    `json:"userId"`
	UserName      string    `json:"userName"`
	Character     Character `json:"character"`
	IsCurrentTurn bool      `json:"isCurrentTurn"`
	HasPositioned bool      `json:"hasPositioned"`
	// Connected goes false while a player is away; their character stays on
	// the board so a refresh or a network blip can resume it.
	Connected bool `json:"connected"`
	// IsBot marks an opponent the server plays itself, so a lone visitor can
	// still play a whole match.
	IsBot bool `json:"isBot"`
	// IsDummy marks a bot that will not fight back: it takes hits, never
	// moves, never casts, and passes its turn. The tutorial opens with one so
	// a player learning which button is which is not being shot at meanwhile.
	// Left out of the wire when false, so an ordinary match says exactly what
	// it always said — the recorded fights in testdata still replay byte for
	// byte, which they should: none of them changed.
	IsDummy bool `json:"isDummy,omitempty"`
	// Spells tracks per-spell usage, keyed the same way as the catalogue, so
	// the client can grey out what cannot be cast right now. A spell missing
	// from it is not on this player's bar, and casting it is refused.
	Spells map[string]SpellState `json:"spells"`
	// SpellBar is the order this player's spells sit in on the bar, which is
	// the order the number keys select them in. Always an array.
	SpellBar []string `json:"spellBar"`
}

// SpellState is one spell's availability for one player.
type SpellState struct {
	// CastsThisTurn counts against the spell's MaxCastsPerTurn.
	CastsThisTurn int `json:"castsThisTurn"`
	// CooldownLeft is the number of that player's turns still to wait.
	CooldownLeft int `json:"cooldownLeft"`
	// Spent marks an ultimate that has already been cast this fight.
	Spent bool `json:"spent"`
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
	// A Stonewarden's pillars are obstacles too, once raised.
	Obstacles []Position `json:"obstacles"`
	// Terrain is what spells have left on the board. It stays for the rest of
	// the fight unless something replaces it. Always an array.
	Terrain []TerrainCell `json:"terrain"`
	// Zones are the weather an ultimate leaves over an area for a few turns.
	// Always an array.
	Zones []Zone `json:"zones"`
	// Island is the island this fight is played on, empty for a plain arena.
	Island string `json:"island,omitempty"`
	// Ground is the island's terrain, laid when the board is dealt and fixed
	// for the fight: at most two kinds, from the library in islands.json.
	// Unlike Terrain nothing a spell does changes it. Always an array.
	Ground []GroundCell `json:"ground"`
}

// GroundCell is one cell of an island's terrain.
type GroundCell struct {
	Position Position `json:"position"`
	// Kind is a terrain id from the library: tall_grass, rock, ...
	Kind string `json:"kind"`
	// Wind is the one-cell step an air current pushes along. Absent on every
	// other kind.
	Wind *Position `json:"wind,omitempty"`
}

// TerrainCell is one cell a spell has changed.
type TerrainCell struct {
	Position Position `json:"position"`
	Kind     string   `json:"kind"`
	// Owner is the user id of whoever made it. Water heals its owner and slows
	// everyone else, a trap never catches the one who set it, and a relay only
	// carries its owner's spells.
	Owner string `json:"owner"`
}

// Terrain kinds.
const (
	TerrainFire    = "fire"    // burns whoever walks in or starts a turn on it
	TerrainSmoke   = "smoke"   // blocks line of sight, not movement
	TerrainWater   = "water"   // slows enemies, heals its owner; puts out fire
	TerrainIce     = "ice"     // whoever steps on it slides to the far side
	TerrainTrap    = "trap"    // springs on the first enemy to step on it
	TerrainRelay   = "relay"   // its owner's air spells can be cast from here
	TerrainCrater  = "crater"  // nobody can walk through it
	TerrainFissure = "fissure" // nobody can walk through it
	// TerrainPillar marks a raised pillar. The pillar itself is an obstacle;
	// this only tells the client it was built rather than dealt with the map.
	TerrainPillar = "pillar"
)

// Zone is an area an ultimate keeps acting on, turn after turn.
type Zone struct {
	Kind   string     `json:"kind"`
	Owner  string     `json:"owner"`
	Center Position   `json:"center"`
	Cells  []Position `json:"cells"`
	// TurnsLeft counts down at the start of each of its owner's turns.
	TurnsLeft int `json:"turnsLeft"`
}

// Zone kinds.
const (
	ZoneStorm     = "storm"     // strikes every enemy inside at the start of their turn
	ZoneMaelstrom = "maelstrom" // drags enemies back to its centre and strips their buffs
)

// LogEntry is one line of the combat log. The client renders these; without
// them a spell that missed because of line of sight, or one that landed as a
// critical, looked exactly like a spell that did nothing.
type LogEntry struct {
	// Seq is a per-game counter that never repeats. The log is a bounded tail
	// resent whole with every state, so without it a client cannot tell an
	// entry it has already seen from one that just happened — which is what
	// the spell effects key off to fire exactly once.
	Seq    int64  `json:"seq"`
	Turn   int    `json:"turn"`
	Actor  string `json:"actor"`
	Kind   string `json:"kind"`
	Text   string `json:"text"`
	Damage int    `json:"damage,omitempty"`
	Crit   bool   `json:"crit,omitempty"`
	// APChange/MPChange are the point delta a cast's own effect leaves behind
	// (positive on a self-buff, negative on an enemy debuff), so the client
	// can colour it the same way it colours the AP/MP the effect changes.
	APChange     int `json:"apChange,omitempty"`
	MPChange     int `json:"mpChange,omitempty"`
	ShieldChange int `json:"shieldChange,omitempty"`
	// What a cast was, for the client to draw. The line alone said that a
	// spell had been cast but not which one, nor from where to where, so every
	// spell could only ever be drawn the same way.
	SpellID int       `json:"spellId,omitempty"`
	Origin  *Position `json:"origin,omitempty"`
	Target  *Position `json:"target,omitempty"`
	// Via is the relay an air spell was cast from, when it was.
	Via *Position `json:"via,omitempty"`
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

	// Role is the one word the bar shows under the spell: what it is for.
	Role string `json:"role"`
	// Ultimate spells can be cast once a fight, and not on the first turn.
	Ultimate bool `json:"ultimate"`
	// Targeting says which cells a spell may be aimed at: any cell in range
	// (TargetAny, the default), the caster's own (TargetSelf), or a cell with
	// nothing on it (TargetEmpty).
	Targeting string `json:"targeting"`
	// Push moves every character hit that many cells away from where the
	// spell came from. Negative pulls them towards the caster instead.
	Push int `json:"push"`
	// Terrain is left on the cells the spell covers, for the rest of the fight.
	Terrain string `json:"terrain"`
	// Zone, when set, keeps acting on the covered cells for a few turns.
	Zone *SpellZone `json:"zone"`
	// GrantMP is movement points the caster gains on the spot.
	GrantMP int `json:"grantMP"`
	// Special names a behaviour no field above describes; see the Special*
	// constants.
	Special string `json:"special"`
	// Relayed spells may be cast from their caster's relay as well as from
	// where the caster stands.
	Relayed bool `json:"relayed"`
	// Conducts doubles the damage on a target standing in water.
	Conducts bool `json:"conducts"`
}

// Spell targeting.
const (
	TargetAny   = "any"
	TargetSelf  = "self"
	TargetEmpty = "empty"
)

// Spell specials.
const (
	SpecialDetonate = "detonate" // cashes in the target's burns at once
	SpecialLeap     = "leap"     // the caster lands on the target cell and shakes its neighbours
	SpecialRelay    = "relay"    // sets the caster's relay on the target cell
	SpecialPillar   = "pillar"   // raises a permanent obstacle on the target cell
	SpecialCrater   = "crater"   // digs a crater where the spell lands
	SpecialQuake    = "quake"    // opens fissures around the caster
)

// SpellZone is the weather a spell leaves behind.
type SpellZone struct {
	Kind     string `json:"kind"`
	Duration int    `json:"duration"`
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

// Class is one playable archetype: the numbers a character starts with, the
// spells on its bar, and the opponent that stands for it in solo play. Classes
// are content, loaded from config/classes.json, not code.
type Class struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Element string `json:"element"`
	// Symbol is a short glyph shown beside the class name in the picker.
	Symbol  string       `json:"symbol"`
	Palette ClassPalette `json:"palette"`
	Lore    string       `json:"lore"`

	Health         int `json:"health"`
	ActionPoints   int `json:"actionPoints"`
	MovementPoints int `json:"movementPoints"`

	// Passive is the class's standing rule, as the picker shows it.
	Passive string `json:"passive"`
	// MeleeBonus is the extra damage, in percent, the class deals to a target
	// standing right next to it.
	MeleeBonus int `json:"meleeBonus"`
	// PushResist is how many cells shorter every push against the class is.
	PushResist int `json:"pushResist"`

	// Spells are catalogue ids, in bar order.
	Spells   []string      `json:"spells"`
	Opponent ClassOpponent `json:"opponent"`
	// UnlockedBy names the class whose opponent has to be beaten in solo play
	// before this one's can be challenged. Empty means open from the start.
	UnlockedBy string `json:"unlockedBy"`
}

// ClassPalette is hex, never CSS class names, for the same reason as a
// spell's colour: the client's Tailwind build would purge names it only
// learns about at runtime. Primary also dyes the class's computer opponent,
// so like a player's colour it should stay clear of the board's vermilion.
type ClassPalette struct {
	Primary   string `json:"primary"`
	Secondary string `json:"secondary"`
}

// ClassOpponent is the named computer player a class is embodied by in solo
// mode: one line when the challenge is offered, one when it is beaten.
type ClassOpponent struct {
	Name  string   `json:"name"`
	Lines []string `json:"lines"`
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
	// AoEWall is five cells in a straight line across the cast, centred on
	// the target.
	AoEWall = "wall"
)
