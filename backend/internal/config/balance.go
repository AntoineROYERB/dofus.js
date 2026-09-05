package config

import (
	"encoding/json"
	"log"
	"os"
)

// Balance holds the game's tunable numbers — health, action points, movement
// points — separately from the code that enforces them. For now it only
// covers a character's starting stats; more of the game's numbers (obstacle
// count, turn length, spell costs...) can move in here the same way later.
type Balance struct {
	Health         int `json:"health"`
	ActionPoints   int `json:"actionPoints"`
	MovementPoints int `json:"movementPoints"`
}

// DefaultBalance is what the game shipped with, and what a missing or
// malformed balance file falls back to.
var DefaultBalance = Balance{
	Health:         100,
	ActionPoints:   6,
	MovementPoints: 4,
}

// LoadBalance reads gameplay constants from a JSON file. A missing file is
// not an error — most setups run on the defaults — but a malformed one is
// logged rather than silently ignored, since that usually means a typo in a
// file someone was just hand-editing.
func LoadBalance(path string) Balance {
	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[Config] reading %s: %v, using defaults", path, err)
		}
		return DefaultBalance
	}

	balance := DefaultBalance
	if err := json.Unmarshal(data, &balance); err != nil {
		log.Printf("[Config] parsing %s: %v, using defaults", path, err)
		return DefaultBalance
	}
	return balance
}
