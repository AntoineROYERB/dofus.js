package dream

import (
	"math/rand"

	"game-server/internal/content"
	"game-server/internal/types"
)

// BoonOffer deals one player the three boons a win offers them, one per
// rarity the room pays in. A boon they hold already is offered again only if
// it stacks; a boon that would do nothing for them — a lore of another
// grimoire, a second cast of a basic attack on a cooldown, something to
// share with allies they do not have — is never offered. A rarity with
// nothing left to offer falls back to any boon that is.
func BoonOffer(cat content.Catalogue, seed int64, floor, seat int, rarities []string, held []string, kit types.Kit, party int) []string {
	rng := source(seed, floor, saltBoons+seat*16)
	have := map[string]bool{}
	for _, id := range held {
		have[id] = true
	}
	offered := map[string]bool{}
	eligible := func(b types.DreamBoon) bool {
		if offered[b.ID] || (have[b.ID] && !b.Stacks) {
			return false
		}
		return useful(cat, b, kit, party)
	}

	var out []string
	for _, rarity := range rarities {
		if id, ok := pick(cat, rng, func(b types.DreamBoon) bool { return b.Rarity == rarity && eligible(b) }); ok {
			out = append(out, id)
			offered[id] = true
			continue
		}
		if id, ok := pick(cat, rng, eligible); ok {
			out = append(out, id)
			offered[id] = true
		}
	}
	return out
}

func pick(cat content.Catalogue, rng *rand.Rand, keep func(types.DreamBoon) bool) (string, bool) {
	var pool []string
	for _, b := range cat.Dream.Boons {
		if keep(b) {
			pool = append(pool, b.ID)
		}
	}
	if len(pool) == 0 {
		return "", false
	}
	return pool[rng.Intn(len(pool))], true
}

// useful reports whether a boon would change anything for a fighter.
func useful(cat content.Catalogue, b types.DreamBoon, kit types.Kit, party int) bool {
	if b.Grimoire != "" && b.Grimoire != kit.Grimoire.ID {
		return false
	}
	switch b.Effect.Kind {
	case types.BoonGrantSpell:
		// Standing an ally back up wants an ally.
		spell := cat.Spells[b.Effect.Spell]
		return spell.Special != types.SpecialRevive || party > 1
	case types.BoonSharedAP:
		return party > 1
	case types.BoonBasicTwice:
		if len(kit.Bar) == 0 {
			return false
		}
		basic := cat.Spells[kit.Bar[0]]
		return basic.MaxCastsPerTurn > 0 && basic.Cooldown == 0
	case types.BoonBasicDiscount:
		return len(kit.Bar) > 0 && cat.Spells[kit.Bar[0]].APCost > 1
	}
	return true
}
