// Package content loads the game's spells, islands and loadout items from
// JSON and refuses anything it would be wrong to serve.
//
// The spell list used to be a Go map literal, which made adding a spell a code
// change. It is data now, and data someone edits by hand gets a typo in it
// sooner or later — so everything here is checked once, at startup, and a bad
// file stops the server with a message naming the file, the field and the
// problem, rather than shipping a fight that breaks on the first cast.
package content

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"

	shipped "game-server/config"
	"game-server/internal/config"
	"game-server/internal/types"
)

// BarSlots is how many spells fit on the client's bar, bound to keys 1 to 8.
const BarSlots = 8

// Bounds are the facts about the board that content is checked against. They
// belong to the rules package, which imports this one, so they are handed in
// rather than looked up.
type Bounds struct {
	// MaxRange is the longest distance between two cells on the board. A spell
	// reaching further than that is a typo, not a long-range spell.
	MaxRange int
}

// Catalogue is every spell, every loadout item and the world, validated and
// resolved: a grimoire's stats are filled in from the balance where the file
// leaves them out, and a spell's colour comes from its element. Treat it as
// read-only once loaded.
type Catalogue struct {
	// Spells is keyed by id, as it goes over the wire.
	Spells map[string]types.Spell

	// What a character wears and carries, each in file order.
	Outfits   []types.Outfit
	Grimoires []types.Grimoire
	Runes     []types.Rune
	Talismans []types.Talisman
	// Champions are in file order, which is challenge order and unlock order.
	Champions []types.Champion
	Cosmetics []types.Cosmetic

	// The world, from islands.json. Islands are in file order, which is
	// campaign order: the first is the Prairie in the middle, where the walk
	// begins, and the rest ring it.
	Terrains []types.Terrain
	Bestiary []types.Monster
	Armours  []types.Armour
	Palettes map[string]types.IslandPalette
	Islands  []types.Island
}

// find returns the first item whose id matches.
func find[T any](items []T, id string, idOf func(T) string) (T, bool) {
	for _, item := range items {
		if idOf(item) == id {
			return item, true
		}
	}
	var zero T
	return zero, false
}

// Outfit looks an outfit up by id.
func (c Catalogue) Outfit(id string) (types.Outfit, bool) {
	return find(c.Outfits, id, func(o types.Outfit) string { return o.ID })
}

// Grimoire looks a grimoire up by id.
func (c Catalogue) Grimoire(id string) (types.Grimoire, bool) {
	return find(c.Grimoires, id, func(g types.Grimoire) string { return g.ID })
}

// Rune looks a rune up by id.
func (c Catalogue) Rune(id string) (types.Rune, bool) {
	return find(c.Runes, id, func(r types.Rune) string { return r.ID })
}

// Talisman looks a talisman up by id.
func (c Catalogue) Talisman(id string) (types.Talisman, bool) {
	return find(c.Talismans, id, func(t types.Talisman) string { return t.ID })
}

// Champion looks a champion up by id.
func (c Catalogue) Champion(id string) (types.Champion, bool) {
	return find(c.Champions, id, func(ch types.Champion) string { return ch.ID })
}

// Island looks an island up by id.
func (c Catalogue) Island(id string) (types.Island, bool) {
	return find(c.Islands, id, func(is types.Island) string { return is.ID })
}

// DefaultChampion is who stands in when nobody picked: the first champion in
// the file. Validation guarantees there is one.
func (c Catalogue) DefaultChampion() types.Champion {
	return c.Champions[0]
}

// Loadout problems, as a seat is refused for them.
var (
	ErrUnknownItem      = errors.New("the loadout names an item that does not exist")
	ErrIncompleteSet    = errors.New("a loadout names all four items or none")
	ErrElementsMismatch = errors.New("the grimoire is not of the outfit's element")
)

// Kit resolves a loadout into everything a fight needs to know about the
// fighter carrying it. An empty loadout is the first champion's set.
func (c Catalogue) Kit(l types.Loadout) (types.Kit, error) {
	if l.IsZero() {
		l = c.DefaultChampion().Set
	}
	if l.Outfit == "" || l.Grimoire == "" || l.Rune == "" || l.Talisman == "" {
		return types.Kit{}, ErrIncompleteSet
	}
	outfit, ok1 := c.Outfit(l.Outfit)
	grimoire, ok2 := c.Grimoire(l.Grimoire)
	rune, ok3 := c.Rune(l.Rune)
	talisman, ok4 := c.Talisman(l.Talisman)
	if !ok1 || !ok2 || !ok3 || !ok4 {
		return types.Kit{}, ErrUnknownItem
	}
	if outfit.Element != grimoire.Element {
		return types.Kit{}, ErrElementsMismatch
	}
	bar := make([]string, 0, len(grimoire.Spells)+2)
	bar = append(bar, outfit.BasicAttack)
	bar = append(bar, grimoire.Spells...)
	bar = append(bar, talisman.Ultimate)
	return types.Kit{
		Loadout:  l,
		Element:  outfit.Element,
		Outfit:   outfit,
		Grimoire: grimoire,
		Rune:     rune,
		Talisman: talisman,
		Bar:      bar,
	}, nil
}

// Problem is one thing wrong with a content file.
type Problem struct {
	File    string
	Field   string
	Problem string
}

func (p *Problem) Error() string {
	return fmt.Sprintf("%s: %s: %s", p.File, p.Field, p.Problem)
}

// Paths are where the content files are on disk.
type Paths struct {
	Spells    string
	Islands   string
	Outfits   string
	Grimoires string
	Runes     string
	Talismans string
	Champions string
	Cosmetics string
}

// Source is one content file's bytes, and the name to report problems under.
type Source struct {
	Name string
	Data []byte
}

// Sources are the content files, read.
type Sources struct {
	Spells    Source
	Islands   Source
	Outfits   Source
	Grimoires Source
	Runes     Source
	Talismans Source
	Champions Source
	Cosmetics Source
}

// each pairs every source with the file it comes from, for the two readers.
func (s *Sources) each(visit func(into *Source, diskPath, shippedName string) error, p Paths) error {
	for _, f := range []struct {
		into    *Source
		disk    string
		shipped string
	}{
		{&s.Spells, p.Spells, shipped.SpellsFile},
		{&s.Islands, p.Islands, shipped.IslandsFile},
		{&s.Outfits, p.Outfits, shipped.OutfitsFile},
		{&s.Grimoires, p.Grimoires, shipped.GrimoiresFile},
		{&s.Runes, p.Runes, shipped.RunesFile},
		{&s.Talismans, p.Talismans, shipped.TalismansFile},
		{&s.Champions, p.Champions, shipped.ChampionsFile},
		{&s.Cosmetics, p.Cosmetics, shipped.CosmeticsFile},
	} {
		if err := visit(f.into, f.disk, f.shipped); err != nil {
			return err
		}
	}
	return nil
}

// Load reads and validates the content files from disk. The balance fills in
// the stats a grimoire does not set itself.
func Load(paths Paths, balance config.Balance, bounds Bounds) (Catalogue, error) {
	var src Sources
	err := src.each(func(into *Source, disk, _ string) error {
		data, err := os.ReadFile(disk)
		if err != nil {
			return fmt.Errorf("reading %s: %w", disk, err)
		}
		*into = Source{Name: disk, Data: data}
		return nil
	}, paths)
	if err != nil {
		return Catalogue{}, err
	}
	return Parse(src, balance, bounds)
}

// Shipped is the content compiled into the binary: the files in config/ as
// they were when it was built.
func Shipped(balance config.Balance, bounds Bounds) (Catalogue, error) {
	var src Sources
	err := src.each(func(into *Source, _, name string) error {
		data, err := fs.ReadFile(shipped.Files, name)
		if err != nil {
			return err
		}
		*into = Source{Name: path.Join("config", name), Data: data}
		return nil
	}, Paths{})
	if err != nil {
		return Catalogue{}, err
	}
	return Parse(src, balance, bounds)
}

// Parse decodes and validates content already in memory. The names are only
// used to say where a problem is. Every problem found is reported, joined,
// rather than just the first: fixing a file one error per restart is tedious.
func Parse(src Sources, balance config.Balance, bounds Bounds) (Catalogue, error) {
	var (
		sf  spellsFile
		wf  islandsFile
		of  outfitsFile
		gf  grimoiresFile
		rf  runesFile
		tf  talismansFile
		chf championsFile
		cf  cosmeticsFile
	)
	for _, d := range []struct {
		src  Source
		into any
	}{
		{src.Spells, &sf}, {src.Islands, &wf}, {src.Outfits, &of}, {src.Grimoires, &gf},
		{src.Runes, &rf}, {src.Talismans, &tf}, {src.Champions, &chf}, {src.Cosmetics, &cf},
	} {
		if err := decodeStrict(d.src.Data, d.into); err != nil {
			return Catalogue{}, &Problem{File: d.src.Name, Field: "(document)", Problem: err.Error()}
		}
	}

	v := &validator{}
	spells := v.spells(src.Spells.Name, sf, bounds)
	v.world(src.Islands.Name, wf)
	cat := v.loadouts(src, loadoutFiles{of, gf, rf, tf, chf, cf}, spells, balance)
	if len(v.problems) > 0 {
		return Catalogue{}, errors.Join(v.problems...)
	}
	cat.Spells = spells
	cat.Terrains = wf.Terrains
	cat.Bestiary = wf.Bestiary
	cat.Armours = wf.Armours
	cat.Palettes = wf.Palettes
	cat.Islands = wf.Islands
	return cat, nil
}

// decodeStrict refuses fields the schema does not know. A misspelt key would
// otherwise decode as a zero — a spell costing 0 AP — without a word.
func decodeStrict(data []byte, out any) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return err
	}
	if dec.More() {
		return errors.New("unexpected data after the top-level object")
	}
	return nil
}

// ---------------------------------------------------------------------------
// File schemas
// ---------------------------------------------------------------------------

// spellsFile is spells.json. Colours are set once per element rather than on
// every spell, so two Fire spells cannot drift to two different reds.
type spellsFile struct {
	Elements map[string]string     `json:"elements"`
	Spells   map[string]spellEntry `json:"spells"`
}

// spellEntry is a types.Spell without the fields the loader derives: the id
// is the key, the colour is the element's.
type spellEntry struct {
	Name             string                    `json:"name"`
	Icon             string                    `json:"icon"`
	Element          string                    `json:"element"`
	Description      string                    `json:"description"`
	APCost           int                       `json:"APCost"`
	Range            int                       `json:"range"`
	Damage           int                       `json:"damage"`
	AreaOfEffect     string                    `json:"areaOfEffect"`
	NeedsLineOfSight bool                      `json:"needsLineOfSight"`
	MaxCastsPerTurn  int                       `json:"maxCastsPerTurn"`
	Cooldown         int                       `json:"cooldown"`
	CriticalChance   int                       `json:"criticalChance"`
	CriticalDamage   int                       `json:"criticalDamage"`
	Effect           *types.SpellEffect        `json:"effect"`
	Role             string                    `json:"role"`
	Ultimate         bool                      `json:"ultimate"`
	Targeting        string                    `json:"targeting"`
	Push             int                       `json:"push"`
	Terrain          string                    `json:"terrain"`
	Zone             *types.SpellZone          `json:"zone"`
	GrantMP          int                       `json:"grantMP"`
	Special          string                    `json:"special"`
	Relayed          bool                      `json:"relayed"`
	Conducts         bool                      `json:"conducts"`
	Hits             int                       `json:"hits"`
	TerrainTurns     int                       `json:"terrainTurns"`
	Legend           string                    `json:"legend"`
	Infusions        map[string]types.Infusion `json:"infusions"`
}
