// Package shipped embeds the content files that live beside it, so the game
// always has a valid catalogue to fall back on — in tests, in tools, in any
// package that builds a game without going through the server's startup.
//
// The directory is config/ because that is where someone retuning the game
// looks; the package is not called config so it cannot be confused with
// internal/config, which reads the environment. The server itself still loads
// these files from disk at boot (see SPELLS_FILE, ISLANDS_FILE and the
// loadout files: OUTFITS_FILE, GRIMOIRES_FILE, RUNES_FILE, TALISMANS_FILE,
// CHAMPIONS_FILE, COSMETICS_FILE), so they can be edited in a deployed image
// without a rebuild.
package shipped

import "embed"

// Files holds every content file exactly as it is checked in.
//
//go:embed spells.json islands.json outfits.json grimoires.json runes.json talismans.json champions.json cosmetics.json
var Files embed.FS

const (
	SpellsFile    = "spells.json"
	IslandsFile   = "islands.json"
	OutfitsFile   = "outfits.json"
	GrimoiresFile = "grimoires.json"
	RunesFile     = "runes.json"
	TalismansFile = "talismans.json"
	ChampionsFile = "champions.json"
	CosmeticsFile = "cosmetics.json"
)
