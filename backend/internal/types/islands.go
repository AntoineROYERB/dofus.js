package types

// The world the campaign is played across, in three layers: four fixed
// elements, a small library of terrains, and islands that combine them. An
// island is a recipe over the other two, so adding one is a change to
// config/islands.json and nothing else.

// ElementNeutral is the element of what belongs to no element: the Prairie,
// and the starter outfit it gives. It deals no spell damage of its own, so it
// is not one of the elements a spell may have.
const ElementNeutral = "Neutral"

// Terrain is one entry of the terrain library: a kind of cell with a rule of
// its own. The rule itself lives in the server; this is what a player is told
// about it and how the world draws it.
type Terrain struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Icon is the key the client draws the terrain's marker with.
	Icon string `json:"icon"`
	// Rule is the one sentence a player reads on tapping a cell of it.
	Rule string `json:"rule"`
	// Liquid terrains are drawn in the open world as still pools: lagoons,
	// ice, acid, lava.
	Liquid bool `json:"liquid"`
}

// Monster ranks. A boss rules an island; a legend is a boss above the others.
const (
	RankMonster = "monster"
	RankBoss    = "boss"
	RankLegend  = "legend"
)

// Monster is one sheet of the bestiary, by the name of its sprite.
type Monster struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Rank string `json:"rank"`
}

// Armour is what an island unlocks and what a player wears into a fight.
type Armour struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Element string `json:"element"`
}

// IslandPalette is the colours an island's ground is painted in, hex like
// every other colour the server hands the client. Its id is also the look of
// the scenery — an island reusing the "ice" palette gets frosted ground too.
type IslandPalette struct {
	Ground  []string `json:"ground"`
	Path    string   `json:"path"`
	Stone   []string `json:"stone"`
	Wood    []string `json:"wood"`
	Leaves  []string `json:"leaves"`
	Pine    []string `json:"pine"`
	Grass   string   `json:"grass"`
	Flowers []string `json:"flowers"`
	Shadow  string   `json:"shadow"`
	Earth   []string `json:"earth"`
	Outline string   `json:"outline"`
	Liquid  []string `json:"liquid"`
	// Accent is the island's own glow: magma, runes, crystals.
	Accent string `json:"accent"`
	// Glow keeps the liquid's colour at night: it gives its own light.
	Glow bool `json:"glow"`
}

// Island is one chapter of the campaign.
type Island struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Element string `json:"element"`
	// Terrains are ids from the terrain library, at most two.
	Terrains []string `json:"terrains"`
	Palette  string   `json:"palette"`
	// Lineage is who lives on the island: bestiary monsters, not bosses.
	Lineage []string `json:"lineage"`
	// Boss rules the island; empty for one with nobody to beat, like the
	// tutorial's.
	Boss string `json:"boss"`
	// Armour is what finishing the island unlocks.
	Armour string `json:"armour"`
	// Fights is how many fights the chapter has, the boss's included.
	Fights int `json:"fights"`
}
