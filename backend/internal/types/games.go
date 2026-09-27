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
	// Loadout is what this character wears and carries: it decides its
	// element, its starting stats, its spell bar and its rune. Empty only for
	// a character a test seats by hand.
	Loadout        Loadout   `json:"loadout"`
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
	// Health is what a relay or a Stonewarden's pillar has left before it
	// breaks. Absent on every other kind.
	Health int `json:"health,omitempty"`
	// TurnsLeft counts down at the start of each of its owner's turns, and
	// the cell clears when it runs out. Absent on terrain left for good.
	TurnsLeft int `json:"turnsLeft,omitempty"`
}

// Terrain kinds.
const (
	TerrainFire    = "fire"    // burns whoever walks in or starts a turn on it
	TerrainSmoke   = "smoke"   // blocks line of sight, not movement
	TerrainWater   = "water"   // slows enemies, heals its owner; puts out fire
	TerrainIce     = "ice"     // whoever steps on it slides to the far side
	TerrainTrap    = "trap"    // springs on the first enemy to step on it
	TerrainRelay   = "relay"   // a pylon: its owner's air spells go out from it; solid, hides what is behind it, breaks
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
	// Element is the one it was cast in, for zones that act differently in
	// each.
	Element string `json:"element,omitempty"`
	// Follows is the character a zone moves with, when it does.
	Follows string `json:"follows,omitempty"`
	// SpellID is the spell that left it, for the client to draw what it does.
	SpellID int `json:"spellId,omitempty"`
}

// Zone kinds.
const (
	ZoneStorm     = "storm"     // strikes every enemy inside at the start of their turn
	ZoneMaelstrom = "maelstrom" // drags enemies back to its centre and strips their buffs
	// ZoneDrums strikes its cells again at the start of each of its owner's
	// turns, harder on the last beat. What else each beat does depends on the
	// element it was cast in.
	ZoneDrums = "drums"
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
	// Infusion is the element a spell was infused with, when it was.
	Infusion string `json:"infusion,omitempty"`
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
	// Hits is how many times the spell strikes, each with its own roll for a
	// critical; after the first, it strikes whoever it hit, wherever they
	// have been thrown. 0 means once.
	Hits int `json:"hits,omitempty"`
	// TerrainTurns is how many of its caster's turns the terrain it leaves
	// lasts; 0 is for good.
	TerrainTurns int `json:"terrainTurns,omitempty"`
	// Legend names the legendary who appears on the board to cast it.
	Legend string `json:"legend,omitempty"`
	// Infusions change the spell with the element its caster wears. A
	// legendary's ultimate keeps its shape and its damage in every hand; what
	// the element adds is written here, one entry per element.
	Infusions map[string]Infusion `json:"infusions,omitempty"`
}

// Infusion is what an element adds to a spell. Every field set replaces the
// spell's own; a field left empty keeps it.
type Infusion struct {
	Description    string       `json:"description"`
	Damage         int          `json:"damage,omitempty"`
	CriticalDamage int          `json:"criticalDamage,omitempty"`
	AreaOfEffect   string       `json:"areaOfEffect,omitempty"`
	Effect         *SpellEffect `json:"effect,omitempty"`
	Push           int          `json:"push,omitempty"`
	Terrain        string       `json:"terrain,omitempty"`
	TerrainTurns   int          `json:"terrainTurns,omitempty"`
	Special        string       `json:"special,omitempty"`
	Conducts       bool         `json:"conducts,omitempty"`
}

// Infused is the spell as it is cast by someone wearing an element: itself,
// with that element's infusion laid over it. A spell with no infusion for
// the element is returned as it is.
func (s Spell) Infused(element string) Spell {
	in, ok := s.Infusions[element]
	if !ok {
		return s
	}
	out := s
	out.Element = element
	if in.Description != "" {
		out.Description = in.Description
	}
	if in.Damage != 0 {
		out.Damage = in.Damage
	}
	if in.CriticalDamage != 0 {
		out.CriticalDamage = in.CriticalDamage
	}
	if in.AreaOfEffect != "" {
		out.AreaOfEffect = in.AreaOfEffect
	}
	if in.Effect != nil {
		effect := *in.Effect
		out.Effect = &effect
	}
	if in.Push != 0 {
		out.Push = in.Push
	}
	if in.Terrain != "" {
		out.Terrain = in.Terrain
	}
	if in.TerrainTurns != 0 {
		out.TerrainTurns = in.TerrainTurns
	}
	if in.Special != "" {
		out.Special = in.Special
	}
	if in.Conducts {
		out.Conducts = true
	}
	return out
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
	SpecialSwap     = "swap"     // aimed at the caster's relay: the two change places
	SpecialFlank    = "flank"    // raises a menhir on each side of the target, across the cast
	SpecialCage     = "cage"     // walls the target in with rocks for a while, open towards the caster
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
