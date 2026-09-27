package types

// A fighter is no longer a class. The player has one character, and in a
// fight that character wears an outfit and carries a grimoire, a rune and a
// talisman (docs/adr/0002-outfit-grimoire-rune-talisman.md). Each of the four
// does one thing:
//
//	outfit    the element, the look, and the basic attack of the weapon drawn in it
//	grimoire  three spells and the kit's passive, of the outfit's element
//	rune      one global improvement, never elemental
//	talisman  the ultimate
//
// All four are content, loaded from their own files in config/.

// Loadout is the four item ids a character fights with.
type Loadout struct {
	Outfit   string `json:"outfit"`
	Grimoire string `json:"grimoire"`
	Rune     string `json:"rune"`
	Talisman string `json:"talisman"`
}

// IsZero reports whether no item was named at all, which picks the first
// champion's set.
func (l Loadout) IsZero() bool { return l == Loadout{} }

// Palette is hex, never CSS class names, for the same reason as a spell's
// colour: the client's Tailwind build would purge names it only learns about
// at runtime. Primary also dyes a computer opponent, so like a player's colour
// it should stay clear of the board's vermilion.
type Palette struct {
	Primary   string `json:"primary"`
	Secondary string `json:"secondary"`
}

// Outfit is a full sprite sheet, weapon included, drawn in one element. It
// gives the element and the basic attack of that weapon; everything else about
// it is looks, so outfits carry no numbers of their own.
type Outfit struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Element string `json:"element"`
	// BasicAttack is a spell id of the outfit's element: what the weapon
	// drawn in it does.
	BasicAttack string  `json:"basicAttack"`
	Palette     Palette `json:"palette"`
	// Sprite names the sheets under animation/outfits/ the client draws it with.
	Sprite string `json:"sprite"`
	// Weapon is the weapon drawn in the outfit, as the wardrobe names it.
	Weapon string `json:"weapon"`
}

// Grimoire is the kit: three spells, the passive that only makes sense with
// them, and the stats the kit is played at.
type Grimoire struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Element string `json:"element"`
	// Symbol is a short glyph shown beside the grimoire's name.
	Symbol string `json:"symbol"`
	Lore   string `json:"lore"`
	// Spells are catalogue ids, in bar order after the basic attack.
	Spells []string `json:"spells"`
	// Passive is the kit's standing rule, one sentence.
	Passive string `json:"passive"`
	// Glyph is the circle drawn on the ground under whoever carries it, the
	// way the opponent reads the grimoire: an "element/sheet" key of the
	// client's animation/fx/manifest.json.
	Glyph string `json:"glyph"`
	// MeleeBonus is the extra damage, in percent, dealt to a target standing
	// right next to whoever carries the grimoire.
	MeleeBonus int `json:"meleeBonus"`

	Health         int `json:"health"`
	ActionPoints   int `json:"actionPoints"`
	MovementPoints int `json:"movementPoints"`
}

// Rune effect kinds: the whole vocabulary a rune may speak. It only touches
// what every fighter has, never an element, a status or a spell.
const (
	// RuneFinisher deals Value percent more damage to a target whose health
	// is below Threshold percent of its maximum.
	RuneFinisher = "finisher"
	// RuneOpeningMP adds Value movement points to the fighter's first turn.
	RuneOpeningMP = "openingMP"
	// RuneOpeningShield raises a shield of Value for Duration turns when the
	// fight starts.
	RuneOpeningShield = "openingShield"
	// RunePushResist makes every push against the fighter Value cells shorter.
	RunePushResist = "pushResist"
)

// RuneEffect is a rune's one rule.
type RuneEffect struct {
	Kind      string `json:"kind"`
	Value     int    `json:"value"`
	Threshold int    `json:"threshold,omitempty"`
	Duration  int    `json:"duration,omitempty"`
}

// Rune is one sentence that improves the character whatever its element.
type Rune struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Description is the sentence a player reads, and sees in full the first
	// time the rune fires in a fight.
	Description string     `json:"description"`
	Effect      RuneEffect `json:"effect"`
}

// Talisman carries the ultimate. It orbits the character, casts the ultimate,
// and shows when it is ready.
type Talisman struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Ultimate is a spell id, and that spell is an ultimate.
	Ultimate string `json:"ultimate"`
	// Sprite names the orbiting object the client draws.
	Sprite string `json:"sprite"`
}

// Champion is a named computer opponent with a full set, beaten in solo play
// to win that set: one line when the challenge is offered, one when it is
// beaten.
type Champion struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Lines []string `json:"lines"`
	Set   Loadout  `json:"set"`
	// UnlockedBy names the champion who has to be beaten first. Empty means
	// open from the start.
	UnlockedBy string `json:"unlockedBy"`
}

// Cosmetic kinds. A cosmetic never touches a fight.
const (
	CosmeticPet   = "pet"
	CosmeticAura  = "aura"
	CosmeticWings = "wings"
	CosmeticTitle = "title"
)

// Cosmetic is a look and nothing else: there is deliberately no field a
// fight could read.
type Cosmetic struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	Sprite string `json:"sprite"`
}

// Kit is a loadout resolved against the catalogue: everything a fight needs
// to know about a fighter, worked out once when it takes its seat.
type Kit struct {
	Loadout  Loadout  `json:"loadout"`
	Element  string   `json:"element"`
	Outfit   Outfit   `json:"outfit"`
	Grimoire Grimoire `json:"grimoire"`
	Rune     Rune     `json:"rune"`
	Talisman Talisman `json:"talisman"`
	// Bar is the spell bar: the basic attack, the grimoire's three spells,
	// then the ultimate.
	Bar []string `json:"bar"`
}
