package types

// Endless Dreams is a climb: a party of one to three players picks one of
// three rooms on each floor, fights the monsters in it, and takes one boon
// each before the next floor (docs/plans/endless-dream.md). Everything a
// dream is built from is content, in config/dreams.json: the monsters, the
// twists a room can carry, the boons, and how the floors grow harder.

// DreamMonster is a sheet of the bestiary given what a fight needs: the set
// it fights in, the spells it actually uses, its stats and how much of a
// room's threat it is worth.
type DreamMonster struct {
	// ID is a bestiary id: its name and its sheet come from there.
	ID string `json:"id"`
	// Loadout is the set it fights in: its element, its look and the
	// passives its grimoire and rune give.
	Loadout Loadout `json:"loadout"`
	// Bar is the few spells it casts, every one of them on its set's bar. A
	// monster is a smaller thing than a champion: one to three spells.
	Bar            []string `json:"bar"`
	Health         int      `json:"health"`
	ActionPoints   int      `json:"actionPoints"`
	MovementPoints int      `json:"movementPoints"`
	// Threat is what it costs out of a room's budget: 1 for the weakest.
	Threat int `json:"threat"`
	// Color is the hex its accents are dyed with on the board.
	Color string `json:"color"`
}

// Twist kinds: the whole vocabulary a twist may speak. Each changes an input
// of the fight, never a rule in the middle of one.
const (
	// TwistTerrain lays Value cells of Terrain at the start, in a Pattern.
	TwistTerrain = "terrain"
	// TwistMonsterHealth gives the room's monsters Value percent more health.
	TwistMonsterHealth = "monsterHealth"
	// TwistPoints adds AP and MP (either may be negative) to every fighter.
	TwistPoints = "points"
	// TwistTurnSeconds shortens every turn to Value seconds.
	TwistTurnSeconds = "turnSeconds"
	// TwistNoCover deals the board no cover at all.
	TwistNoCover = "noCover"
	// TwistExtraMonster adds Value of the room's weakest monster, free.
	TwistExtraMonster = "extraMonster"
)

// Patterns a terrain twist lays its cells in.
const (
	PatternScatter = "scatter" // anywhere free, away from the starting blocks
	PatternBand    = "band"    // a band across the middle of the board
	PatternEdge    = "edge"    // along the rim of the board
)

// DreamTwist is one way a room bends the fight it holds.
type DreamTwist struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Description is the one sentence a player reads on the room's card.
	Description string `json:"description"`
	Kind        string `json:"kind"`
	Value       int    `json:"value,omitempty"`
	// Terrain and Pattern are a terrain twist's: a terrain spells leave
	// (fire, smoke, ice, water), and where it goes.
	Terrain string `json:"terrain,omitempty"`
	Pattern string `json:"pattern,omitempty"`
	// AP and MP are a points twist's.
	AP int `json:"ap,omitempty"`
	MP int `json:"mp,omitempty"`
}

// Boon rarities, in the order a harder room offers them.
const (
	RarityCommon    = "common"
	RarityRare      = "rare"
	RarityLegendary = "legendary"
)

// Boon effect kinds: the whole vocabulary a boon may speak.
const (
	BoonHealth        = "health"        // Value more max health
	BoonAP            = "ap"            // Value more AP every turn
	BoonMP            = "mp"            // Value more MP every turn
	BoonGuard         = "guard"         // Value less damage from every hit
	BoonDamage        = "damage"        // Value percent more damage from every spell that deals any
	BoonRange         = "range"         // Value more range on every spell that reaches 2 cells or more
	BoonBasicDiscount = "basicDiscount" // the basic attack costs Value AP less, never below 1
	BoonBasicTwice    = "basicTwice"    // the basic attack can be cast Value more times a turn
	BoonOpeningMP     = "openingMP"     // Value more MP on the first turn of every fight
	BoonGrantSpell    = "grantSpell"    // Spell joins the bar
	BoonSharedAP      = "sharedAP"      // allies within Range cells start their turns with Value more AP
	BoonSpellMod      = "spellMod"      // Spell gets APCost/Range/EffectValue changes
	BoonPushResist    = "pushResist"    // pushes carry its bearer Value cells less
	BoonSecondWind    = "secondWind"    // once a run, a fall leaves its bearer at 1 health instead
	BoonEarlyUltimate = "earlyUltimate" // the ultimate can be cast from the first turn
	BoonPartyShield   = "partyShield"   // the whole party starts a fight shielded: Value off every hit for Duration turns
	BoonOverflow      = "overflow"      // up to Value AP left unspent carries over to the next turn
)

// BoonEffect is a boon's one rule.
type BoonEffect struct {
	Kind  string `json:"kind"`
	Value int    `json:"value,omitempty"`
	// Spell is a catalogue spell id, for the kinds that name one.
	Spell string `json:"spell,omitempty"`
	// Range is how near an ally has to be, for an aura.
	Range int `json:"range,omitempty"`
	// Duration is in the bearer's turns, for a shield.
	Duration int `json:"duration,omitempty"`
	// APCost, SpellRange and EffectValue are a spell mod's changes, added to
	// the spell's own.
	APCost      int `json:"apCost,omitempty"`
	SpellRange  int `json:"spellRange,omitempty"`
	EffectValue int `json:"effectValue,omitempty"`
}

// DreamBoon is one boon a player can take after a fight, for the rest of the
// run.
type DreamBoon struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Rarity      string     `json:"rarity"`
	Icon        string     `json:"icon"`
	Effect      BoonEffect `json:"effect"`
	// Grimoire limits the boon to whoever carries that grimoire. Empty is
	// anyone.
	Grimoire string `json:"grimoire,omitempty"`
	// Stacks says the boon may be taken again once held. A boon that does
	// not stack is never offered twice.
	Stacks bool `json:"stacks,omitempty"`
}

// DreamFloors is how the floors grow harder, every number of it in one
// place so that tuning a dream is a change to one block of one file.
type DreamFloors struct {
	// BossEvery is how many floors there are from one boss to the next.
	BossEvery int `json:"bossEvery"`
	// BaseThreat and ThreatPerFloor are a room's threat budget for one
	// player on a calm room: base plus so much per floor, in tenths.
	BaseThreat     int `json:"baseThreat"`
	ThreatPerFloor int `json:"threatPerFloor"`
	// PartyThreat is the budget, in percent, for a party of 1, 2 and 3.
	PartyThreat []int `json:"partyThreat"`
	// MaxMonsters is the most monsters a room holds.
	MaxMonsters int `json:"maxMonsters"`
	// HealthPerFloor is the percent more health monsters get every floor
	// past the first: what keeps the climb climbing once rooms are full.
	HealthPerFloor int `json:"healthPerFloor"`
	// Difficulties are the three kinds of room a floor offers, calmest
	// first.
	Difficulties []DreamDifficulty `json:"difficulties"`
	// Levels is the opponent level from a floor on, lowest floor first.
	Levels []DreamLevel `json:"levels"`
	// BossHealth is, in percent, a boss's health against a party of 1, 2
	// and 3.
	BossHealth []int `json:"bossHealth"`
	// EscortFrom is the first floor a boss brings monsters of its island.
	EscortFrom int `json:"escortFrom"`
	// SecondTwistFrom is the floor from which a room may carry a second
	// twist.
	SecondTwistFrom int `json:"secondTwistFrom"`
	// MonsterBoons are boons every monster and ruler carries from a floor
	// on: what keeps them a match for a party that has been taking boons of
	// its own all the way up.
	MonsterBoons []DreamFloorBoon `json:"monsterBoons"`
	// BossBoons are boons the rulers alone carry from a floor on.
	BossBoons []DreamFloorBoon `json:"bossBoons"`
}

// DreamFloorBoon is a boon the dream's side carries from a floor on.
type DreamFloorBoon struct {
	From int    `json:"from"`
	Boon string `json:"boon"`
}

// DreamDifficulty is one kind of room: how much more threat it carries, how
// many twists, and the rarest boon it offers.
type DreamDifficulty struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Threat int    `json:"threat"` // percent of the calm budget
	Twists int    `json:"twists"`
	// Rarities are the rarities of the three boons it offers.
	Rarities []string `json:"rarities"`
}

// DreamLevel is the opponent level from a floor on.
type DreamLevel struct {
	From  int    `json:"from"`
	Level string `json:"level"`
}

// Dream is everything config/dreams.json holds.
type Dream struct {
	Monsters []DreamMonster `json:"monsters"`
	Twists   []DreamTwist   `json:"twists"`
	Boons    []DreamBoon    `json:"boons"`
	Floors   DreamFloors    `json:"floors"`
	// Islands are the islands a dream's rooms are fought on, by id: each
	// brings its ground, its palette and its lineage of monsters.
	Islands []string `json:"islands"`
	// Bosses are the rulers a dream's boss floors are fought against, by
	// bestiary id, each on its own island.
	Bosses []string `json:"bosses"`
}

// FighterStats are a fighter's numbers, when they come from somewhere else
// than its grimoire: a monster's own, or a boss grown for a party.
type FighterStats struct {
	Health         int `json:"health"`
	ActionPoints   int `json:"actionPoints"`
	MovementPoints int `json:"movementPoints"`
}

// Blessings are a fighter's boons resolved into the numbers the rules read.
// They stay on the server: the boons themselves are what a player is shown.
type Blessings struct {
	Health, AP, MP int
	Guard          int
	OpeningMP      int
	PushResist     int
	SharedAP       int
	SharedRange    int
	SecondWind     bool
	EarlyUltimate  bool
	PartyShield    int
	ShieldTurns    int
	Overflow       int
}
