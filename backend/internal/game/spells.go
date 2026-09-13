package game

import (
	"game-server/internal/config"
	"game-server/internal/content"
	"game-server/internal/types"
)

// Spells and classes are content, not code: they live in config/spells.json
// and config/classes.json, and internal/content checks them before anything
// here sees them.
//
// The design they were written to still holds. Each spell answers one
// question — when would you pick this instead of the obvious one? — because
// the first catalogue was four flat damage spells, Fireball beat all of them
// on ratio, range and blast at once, and a match was over in three turns.
// Each element carries an identity, and each class is built around one: Fire
// is raw damage, Air trades immediate damage for damage over time and
// movement, Water controls and sustains, Earth defends and reaches what cover
// hides. Roughly 20 damage a turn leaves a fight running five or six turns,
// which is what gives the effects time to matter; the simulation test in
// balance_test.go is what holds the shipped numbers to that.

// ContentBounds are the facts about this board that content is checked
// against.
func ContentBounds() content.Bounds {
	// The two farthest cells of the diamond are opposite tips.
	return content.Bounds{MaxRange: 2 * GridRadius}
}

// current is what a game is built from when its Options do not say otherwise.
// It starts as the content compiled into the binary, so every package — tests
// and tools included — has a valid catalogue without any setup; the server
// swaps in the files it loaded from disk with ApplyContent.
var current = mustShippedContent()

func mustShippedContent() content.Catalogue {
	cat, err := content.Shipped(config.DefaultBalance, ContentBounds())
	if err != nil {
		// Only reachable if a checked-in file is broken, and then every test in
		// every package should fail loudly rather than run against nothing.
		panic("the content compiled in from config/ is invalid:\n" + err.Error())
	}
	return cat
}

// ApplyContent replaces the catalogue new games are built from. Call it once
// at startup, before the first room is created, in the same place as
// ApplyBalance — a game already in progress keeps the content it was dealt.
func ApplyContent(cat content.Catalogue) {
	current = cat
}

// Content is the catalogue new games are built from.
func Content() content.Catalogue {
	return current
}

// Catalogue is the authoritative spell list new games are dealt, as a copy
// the caller may keep.
func Catalogue() map[string]types.Spell {
	return copySpells(current.Spells)
}

func copySpells(in map[string]types.Spell) map[string]types.Spell {
	out := make(map[string]types.Spell, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
