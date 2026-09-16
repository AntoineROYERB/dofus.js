// Package shipped embeds the content files that live beside it, so the game
// always has a valid catalogue to fall back on — in tests, in tools, in any
// package that builds a game without going through the server's startup.
//
// The directory is config/ because that is where someone retuning the game
// looks; the package is not called config so it cannot be confused with
// internal/config, which reads the environment. The server itself still loads
// these files from disk at boot (see SPELLS_FILE and CLASSES_FILE), so they
// can be edited in a deployed image without a rebuild.
package shipped

import "embed"

// Files holds spells.json and classes.json exactly as they are checked in.
//
//go:embed spells.json classes.json
var Files embed.FS

const (
	SpellsFile  = "spells.json"
	ClassesFile = "classes.json"
)
