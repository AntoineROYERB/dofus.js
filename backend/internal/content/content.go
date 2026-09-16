// Package content loads the game's spells and classes from JSON and refuses
// anything it would be wrong to serve.
//
// The spell list used to be a Go map literal, which made adding a spell a code
// change and adding a class impossible without one. It is data now, and data
// someone edits by hand gets a typo in it sooner or later — so everything here
// is checked once, at startup, and a bad file stops the server with a message
// naming the file, the field and the problem, rather than shipping a fight
// that breaks on the first cast.
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

// Catalogue is every spell and every class, validated and resolved: a class's
// stats are filled in from the balance where the file leaves them out, and a
// spell's colour comes from its element. Treat it as read-only once loaded.
type Catalogue struct {
	// Spells is keyed by id, as it goes over the wire.
	Spells map[string]types.Spell
	// Classes are in file order, which is picker order and unlock order.
	Classes []types.Class
}

// Class looks a class up by id.
func (c Catalogue) Class(id string) (types.Class, bool) {
	for _, class := range c.Classes {
		if class.ID == id {
			return class, true
		}
	}
	return types.Class{}, false
}

// DefaultClass is what a character gets when nobody picked: the first class
// in the file. Validation guarantees there is one.
func (c Catalogue) DefaultClass() types.Class {
	return c.Classes[0]
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

// Load reads and validates the two content files from disk. The balance fills
// in the stats a class does not set itself.
func Load(spellsPath, classesPath string, balance config.Balance, bounds Bounds) (Catalogue, error) {
	spells, err := os.ReadFile(spellsPath)
	if err != nil {
		return Catalogue{}, fmt.Errorf("reading %s: %w", spellsPath, err)
	}
	classes, err := os.ReadFile(classesPath)
	if err != nil {
		return Catalogue{}, fmt.Errorf("reading %s: %w", classesPath, err)
	}
	return Parse(spellsPath, spells, classesPath, classes, balance, bounds)
}

// Shipped is the content compiled into the binary: the files in config/ as
// they were when it was built.
func Shipped(balance config.Balance, bounds Bounds) (Catalogue, error) {
	read := func(name string) ([]byte, error) { return fs.ReadFile(shipped.Files, name) }
	spells, err := read(shipped.SpellsFile)
	if err != nil {
		return Catalogue{}, err
	}
	classes, err := read(shipped.ClassesFile)
	if err != nil {
		return Catalogue{}, err
	}
	return Parse(path.Join("config", shipped.SpellsFile), spells,
		path.Join("config", shipped.ClassesFile), classes, balance, bounds)
}

// Parse decodes and validates content already in memory. The names are only
// used to say where a problem is. Every problem found is reported, joined,
// rather than just the first: fixing a file one error per restart is tedious.
func Parse(spellsName string, spellsData []byte, classesName string, classesData []byte, balance config.Balance, bounds Bounds) (Catalogue, error) {
	var sf spellsFile
	if err := decodeStrict(spellsData, &sf); err != nil {
		return Catalogue{}, &Problem{File: spellsName, Field: "(document)", Problem: err.Error()}
	}
	var cf classesFile
	if err := decodeStrict(classesData, &cf); err != nil {
		return Catalogue{}, &Problem{File: classesName, Field: "(document)", Problem: err.Error()}
	}

	v := &validator{}
	spells := v.spells(spellsName, sf, bounds)
	classes := v.classes(classesName, cf, spells, balance)
	if len(v.problems) > 0 {
		return Catalogue{}, errors.Join(v.problems...)
	}
	return Catalogue{Spells: spells, Classes: classes}, nil
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
	Name             string             `json:"name"`
	Icon             string             `json:"icon"`
	Element          string             `json:"element"`
	Description      string             `json:"description"`
	APCost           int                `json:"APCost"`
	Range            int                `json:"range"`
	Damage           int                `json:"damage"`
	AreaOfEffect     string             `json:"areaOfEffect"`
	NeedsLineOfSight bool               `json:"needsLineOfSight"`
	MaxCastsPerTurn  int                `json:"maxCastsPerTurn"`
	Cooldown         int                `json:"cooldown"`
	CriticalChance   int                `json:"criticalChance"`
	CriticalDamage   int                `json:"criticalDamage"`
	Effect           *types.SpellEffect `json:"effect"`
}

type classesFile struct {
	Classes []classEntry `json:"classes"`
}

// classEntry is a types.Class whose stats may be left out, in which case they
// come from balance.json. That keeps balance.json the one place to retune
// every fight at once, with a class only saying how it differs.
type classEntry struct {
	ID             string              `json:"id"`
	Name           string              `json:"name"`
	Element        string              `json:"element"`
	Symbol         string              `json:"symbol"`
	Palette        types.ClassPalette  `json:"palette"`
	Lore           string              `json:"lore"`
	Health         *int                `json:"health"`
	ActionPoints   *int                `json:"actionPoints"`
	MovementPoints *int                `json:"movementPoints"`
	Spells         []string            `json:"spells"`
	Opponent       types.ClassOpponent `json:"opponent"`
	UnlockedBy     string              `json:"unlockedBy"`
}
