package game

import "game-server/internal/types"

// Element colours. Hex rather than CSS class names: class names sent at
// runtime would be purged by the client's Tailwind build, which is how the old
// bg-brown-100 ended up rendering as nothing.
const (
	colourFire  = "#dc2626"
	colourAir   = "#16a34a"
	colourWater = "#2563eb"
	colourEarth = "#b45309"
)

// Catalogue is the authoritative spell list.
//
// It is built around one question per spell: when would you pick this instead
// of the obvious one? The previous four were all pure damage with a nearly flat
// damage-per-AP, and Fireball beat every one of them on ratio, range and blast
// at once — so the best line was mechanical (Fireball + Dart, else Dart three
// times) and a match was over in three turns.
//
// Each element now carries an identity: Fire is raw damage, Air trades
// immediate damage for damage over time and movement, Water controls and
// sustains, Earth defends and reaches what cover hides. Roughly 20 damage a
// turn leaves a fight running five or six turns, which is what gives the
// effects time to matter.
func Catalogue() map[string]types.Spell {
	return map[string]types.Spell{
		// --- Fire: raw damage ------------------------------------------------
		"1": {
			ID:               1,
			Name:             "Ember",
			Color:            colourFire,
			Icon:             "🔥",
			APCost:           2,
			Range:            5,
			Damage:           7,
			AreaOfEffect:     types.AoENone,
			Element:          "Fire",
			Description:      "Fire · 7 damage · 2 AP · range 5 · three times a turn",
			NeedsLineOfSight: true,
			MaxCastsPerTurn:  3,
			Cooldown:         0,
			CriticalChance:   20,
			CriticalDamage:   11,
		},
		"2": {
			ID:               2,
			Name:             "Fireball",
			Color:            colourFire,
			Icon:             "☄️",
			APCost:           4,
			Range:            6,
			Damage:           18,
			AreaOfEffect:     types.AoECircle,
			Element:          "Fire",
			Description:      "Fire · 18 damage · 4 AP · range 6 · circle blast · 2 turn cooldown",
			NeedsLineOfSight: true,
			MaxCastsPerTurn:  1,
			Cooldown:         2,
			CriticalChance:   15,
			CriticalDamage:   27,
		},

		// --- Air: damage over time and movement -------------------------------
		"3": {
			ID:               3,
			Name:             "Venom",
			Color:            colourAir,
			Icon:             "☠️",
			APCost:           2,
			Range:            5,
			Damage:           4,
			AreaOfEffect:     types.AoENone,
			Element:          "Air",
			Description:      "Air · 4 damage then 5 a turn for 3 turns · 2 AP · range 5",
			NeedsLineOfSight: true,
			MaxCastsPerTurn:  2,
			Cooldown:         0,
			CriticalChance:   15,
			CriticalDamage:   6,
			Effect: &types.SpellEffect{
				Kind: types.EffectPoison, Value: 5, Duration: 3,
			},
		},
		"4": {
			ID:               4,
			Name:             "Gust",
			Color:            colourAir,
			Icon:             "🌀",
			APCost:           1,
			Range:            0,
			Damage:           0,
			AreaOfEffect:     types.AoENone,
			Element:          "Air",
			Description:      "Air · +3 movement points this turn · 1 AP · cast on yourself",
			NeedsLineOfSight: false,
			MaxCastsPerTurn:  1,
			Cooldown:         1,
			Effect: &types.SpellEffect{
				Kind: types.EffectMP, Value: 3, Duration: 1, OnSelf: true,
			},
		},

		// --- Water: control and sustain ---------------------------------------
		"5": {
			ID:               5,
			Name:             "Frost Nova",
			Color:            colourWater,
			Icon:             "❄️",
			APCost:           3,
			Range:            4,
			Damage:           10,
			AreaOfEffect:     types.AoECross,
			Element:          "Water",
			Description:      "Water · 10 damage and −2 movement for 2 turns · 3 AP · range 4 · cross",
			NeedsLineOfSight: true,
			MaxCastsPerTurn:  1,
			Cooldown:         1,
			CriticalChance:   15,
			CriticalDamage:   15,
			Effect: &types.SpellEffect{
				Kind: types.EffectMP, Value: -2, Duration: 2,
			},
		},
		"6": {
			ID:               6,
			Name:             "Drain",
			Color:            colourWater,
			Icon:             "💧",
			APCost:           3,
			Range:            3,
			Damage:           10,
			AreaOfEffect:     types.AoENone,
			Element:          "Water",
			Description:      "Water · 10 damage, heals you 5 a turn for 2 turns · 3 AP · range 3",
			NeedsLineOfSight: true,
			MaxCastsPerTurn:  1,
			Cooldown:         2,
			CriticalChance:   15,
			CriticalDamage:   15,
			Effect: &types.SpellEffect{
				Kind: types.EffectRegen, Value: 5, Duration: 2, OnSelf: true,
			},
		},

		// --- Earth: defence, and what reaches through cover -------------------
		"7": {
			ID:               7,
			Name:             "Stone Shell",
			Color:            colourEarth,
			Icon:             "🛡️",
			APCost:           2,
			Range:            0,
			Damage:           0,
			AreaOfEffect:     types.AoENone,
			Element:          "Earth",
			Description:      "Earth · soaks 10 damage per hit for 2 turns · 2 AP · cast on yourself",
			NeedsLineOfSight: false,
			MaxCastsPerTurn:  1,
			Cooldown:         2,
			Effect: &types.SpellEffect{
				Kind: types.EffectShield, Value: 10, Duration: 2, OnSelf: true,
			},
		},
		"8": {
			ID:           8,
			Name:         "Gwendo na Gwendo",
			Color:        colourEarth,
			Icon:         "🐸",
			APCost:       5,
			Range:        3,
			Damage:       16,
			AreaOfEffect: types.AoECross,
			Element:      "Earth",
			// The only answer to an opponent sitting behind cover, which is what
			// pays for the 5 AP and the short range.
			Description:      "Earth · 16 damage · 5 AP · range 3 · cross · ignores line of sight",
			NeedsLineOfSight: false,
			MaxCastsPerTurn:  1,
			Cooldown:         2,
			CriticalChance:   15,
			CriticalDamage:   24,
		},
	}
}
