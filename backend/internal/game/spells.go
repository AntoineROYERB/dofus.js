package game

import "game-server/internal/types"

// Catalogue is the authoritative spell list. The client used to keep a second
// copy in data/spells.ts, and the two had already drifted apart: "Gwendo na
// Gwendo" dealt 25 damage here and -1 there. The client now renders whatever
// this catalogue broadcasts.
//
// Colors are hex rather than CSS class names on purpose. Class names sent at
// runtime would be purged by the client's Tailwind build, which is exactly how
// the old bg-brown-100 ended up rendering as nothing at all.
func Catalogue() map[string]types.Spell {
	return map[string]types.Spell{
		"1": {
			ID:               1,
			Name:             "Fireball",
			Color:            "#dc2626",
			Icon:             "🔥",
			APCost:           4,
			Range:            6,
			Damage:           30,
			AreaOfEffect:     types.AoECircle,
			Element:          "Fire",
			Description:      "Fire · 30 damage · 4 AP · range 6 · circle blast",
			NeedsLineOfSight: true,
			MaxCastsPerTurn:  2,
			Cooldown:         1,
		},
		"2": {
			ID:               2,
			Name:             "Ice Spike",
			Color:            "#2563eb",
			Icon:             "❄️",
			APCost:           3,
			Range:            5,
			Damage:           20,
			AreaOfEffect:     types.AoELine,
			Element:          "Water",
			Description:      "Water · 20 damage · 3 AP · range 5 · pierces in a line",
			NeedsLineOfSight: true,
			MaxCastsPerTurn:  3,
			Cooldown:         0,
		},
		"3": {
			ID:               3,
			Name:             "Poison Dart",
			Color:            "#16a34a",
			Icon:             "☠️",
			APCost:           2,
			Range:            4,
			Damage:           10,
			AreaOfEffect:     types.AoENone,
			Element:          "Air",
			Description:      "Air · 10 damage · 2 AP · range 4 · single target",
			NeedsLineOfSight: true,
			MaxCastsPerTurn:  4,
			Cooldown:         0,
		},
		"4": {
			ID:               4,
			Name:             "Gwendo na Gwendo",
			Color:            "#b45309",
			Icon:             "🐸",
			APCost:           5,
			Range:            3,
			Damage:           25,
			AreaOfEffect:     types.AoECross,
			Element:          "Earth",
			Description:      "Earth · 25 damage · 5 AP · range 3 · cross blast",
			NeedsLineOfSight: false,
			MaxCastsPerTurn:  1,
			Cooldown:         2,
		},
	}
}
