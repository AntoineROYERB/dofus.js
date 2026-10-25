package content

import (
	"fmt"

	"game-server/internal/types"
)

// MaxDreamMonsters is the most monsters a dream's room may hold: with a party
// of three, that is every seat a fight has.
const MaxDreamMonsters = 6

// MaxDreamParty is the most players a dream's party holds.
const MaxDreamParty = 3

// MonsterBar is the most spells a monster casts: a monster is a smaller thing
// than a champion.
const MonsterBar = 3

var knownTwists = map[string]bool{
	types.TwistTerrain: true, types.TwistMonsterHealth: true, types.TwistPoints: true,
	types.TwistTurnSeconds: true, types.TwistNoCover: true, types.TwistExtraMonster: true,
}

// Terrain a twist may lay before a fight. Traps belong to whoever set them,
// and a twist has nobody to set them.
var twistTerrain = map[string]bool{
	types.TerrainFire: true, types.TerrainSmoke: true, types.TerrainIce: true, types.TerrainWater: true,
}

var knownPatterns = map[string]bool{
	types.PatternScatter: true, types.PatternBand: true, types.PatternEdge: true,
}

var knownRarities = map[string]bool{
	types.RarityCommon: true, types.RarityRare: true, types.RarityLegendary: true,
}

var knownBoons = map[string]bool{
	types.BoonHealth: true, types.BoonAP: true, types.BoonMP: true, types.BoonGuard: true,
	types.BoonDamage: true, types.BoonRange: true, types.BoonBasicDiscount: true,
	types.BoonBasicTwice: true, types.BoonOpeningMP: true, types.BoonGrantSpell: true,
	types.BoonSharedAP: true, types.BoonSpellMod: true, types.BoonPushResist: true,
	types.BoonSecondWind: true, types.BoonEarlyUltimate: true, types.BoonPartyShield: true,
	types.BoonOverflow: true,
}

// boonsWithValue are the kinds whose Value is the whole of what they do, and
// so has to be there.
var boonsWithValue = map[string]bool{
	types.BoonHealth: true, types.BoonAP: true, types.BoonMP: true, types.BoonGuard: true,
	types.BoonDamage: true, types.BoonRange: true, types.BoonBasicDiscount: true,
	types.BoonBasicTwice: true, types.BoonOpeningMP: true, types.BoonSharedAP: true,
	types.BoonPushResist: true, types.BoonPartyShield: true, types.BoonOverflow: true,
}

// dream checks dreams.json against everything else, which is already built.
func (v *validator) dream(file string, d types.Dream, cat Catalogue) {
	v.dreamMonsters(file, d, cat)
	v.dreamTwists(file, d)
	v.dreamBoons(file, d, cat)
	boonIDs := map[string]bool{}
	for _, b := range d.Boons {
		boonIDs[b.ID] = true
	}
	v.dreamFloors(file, d.Floors, boonIDs)
	v.dreamWorld(file, d, cat)
}

func (v *validator) dreamMonsters(file string, d types.Dream, cat Catalogue) {
	v.uniqueIDs(file, "monsters", len(d.Monsters), func(i int) string { return d.Monsters[i].ID })
	for i, m := range d.Monsters {
		field := func(name string) string { return fmt.Sprintf("monsters[%d].%s", i, name) }
		sheet, ok := cat.Monster(m.ID)
		switch {
		case !ok:
			v.add(file, field("id"), "%q is not in the bestiary", m.ID)
		case sheet.Rank != types.RankMonster:
			v.add(file, field("id"), "%q is a %s, and a dream's rulers fight in their champion's set", m.ID, sheet.Rank)
		}
		kit, err := cat.Kit(m.Loadout)
		if m.Loadout.IsZero() {
			v.add(file, field("loadout"), "must name all four items: a monster has no default set")
		} else if err != nil {
			v.add(file, field("loadout"), "%v", err)
		}
		if len(m.Bar) == 0 || len(m.Bar) > MonsterBar {
			v.add(file, field("bar"), "holds %d spells, must hold 1 to %d", len(m.Bar), MonsterBar)
		}
		seen := map[string]bool{}
		for j, id := range m.Bar {
			spell, known := cat.Spells[id]
			switch {
			case !known:
				v.add(file, fmt.Sprintf("monsters[%d].bar[%d]", i, j), "unknown spell %q", id)
			case seen[id]:
				v.add(file, fmt.Sprintf("monsters[%d].bar[%d]", i, j), "spell %q is on the bar twice", id)
			case spell.Ultimate:
				v.add(file, fmt.Sprintf("monsters[%d].bar[%d]", i, j), "spell %q is an ultimate; a monster has none", id)
			case err == nil && !m.Loadout.IsZero() && !contains(kit.Bar, id):
				v.add(file, fmt.Sprintf("monsters[%d].bar[%d]", i, j), "spell %q is not on its set's bar %v", id, kit.Bar)
			}
			seen[id] = true
		}
		if m.Health < 1 || m.Health > 500 {
			v.add(file, field("health"), "is %d, must be between 1 and 500", m.Health)
		}
		if m.ActionPoints < 1 || m.ActionPoints > 12 {
			v.add(file, field("actionPoints"), "is %d, must be between 1 and 12", m.ActionPoints)
		}
		if m.MovementPoints < 0 || m.MovementPoints > 8 {
			v.add(file, field("movementPoints"), "is %d, must be between 0 and 8", m.MovementPoints)
		}
		cheapest := 0
		for _, id := range m.Bar {
			if spell, known := cat.Spells[id]; known && (cheapest == 0 || spell.APCost < cheapest) {
				cheapest = spell.APCost
			}
		}
		if cheapest > m.ActionPoints {
			v.add(file, field("actionPoints"), "is %d, and the cheapest spell on its bar costs %d: it could never cast", m.ActionPoints, cheapest)
		}
		if m.Threat < 1 {
			v.add(file, field("threat"), "is %d, must be at least 1: a free monster would fill every room", m.Threat)
		}
		v.hex(file, field("color"), m.Color)
	}
}

func (v *validator) dreamTwists(file string, d types.Dream) {
	v.ids(file, "twists", len(d.Twists), func(i int) string { return d.Twists[i].ID })
	for i, t := range d.Twists {
		field := func(name string) string { return fmt.Sprintf("twists[%d].%s", i, name) }
		v.nonEmpty(file, field("name"), t.Name)
		v.nonEmpty(file, field("description"), t.Description)
		if !knownTwists[t.Kind] {
			v.add(file, field("kind"), "unknown twist %q (known: %s)", t.Kind, knownList(knownTwists))
			continue
		}
		switch t.Kind {
		case types.TwistTerrain:
			if !twistTerrain[t.Terrain] {
				v.add(file, field("terrain"), "%q cannot be laid by a twist (known: %s)", t.Terrain, knownList(twistTerrain))
			}
			if !knownPatterns[t.Pattern] {
				v.add(file, field("pattern"), "unknown pattern %q (known: %s)", t.Pattern, knownList(knownPatterns))
			}
			if t.Value < 1 || t.Value > 20 {
				v.add(file, field("value"), "is %d cells, must be between 1 and 20", t.Value)
			}
		case types.TwistMonsterHealth:
			if t.Value < 1 || t.Value > 200 {
				v.add(file, field("value"), "is %d%%, must be between 1 and 200", t.Value)
			}
		case types.TwistPoints:
			if t.AP == 0 && t.MP == 0 {
				v.add(file, field("ap"), "and mp are both 0: the twist changes nothing")
			}
			if t.AP < -2 || t.AP > 2 || t.MP < -2 || t.MP > 2 {
				v.add(file, field("ap"), "and mp must each be between -2 and 2")
			}
		case types.TwistTurnSeconds:
			if t.Value < 10 || t.Value > 45 {
				v.add(file, field("value"), "is %d seconds, must be between 10 and 45", t.Value)
			}
		case types.TwistExtraMonster:
			if t.Value < 1 || t.Value > 2 {
				v.add(file, field("value"), "is %d, must be 1 or 2", t.Value)
			}
		}
	}
}

func (v *validator) dreamBoons(file string, d types.Dream, cat Catalogue) {
	v.ids(file, "boons", len(d.Boons), func(i int) string { return d.Boons[i].ID })
	rarities := map[string]int{}
	for i, b := range d.Boons {
		field := func(name string) string { return fmt.Sprintf("boons[%d].%s", i, name) }
		v.nonEmpty(file, field("name"), b.Name)
		v.nonEmpty(file, field("description"), b.Description)
		v.nonEmpty(file, field("icon"), b.Icon)
		if !knownRarities[b.Rarity] {
			v.add(file, field("rarity"), "unknown rarity %q (known: %s)", b.Rarity, knownList(knownRarities))
		}
		rarities[b.Rarity]++
		var grimoire types.Grimoire
		if b.Grimoire != "" {
			var ok bool
			if grimoire, ok = cat.Grimoire(b.Grimoire); !ok {
				v.add(file, field("grimoire"), "unknown grimoire %q", b.Grimoire)
			}
		}
		e := b.Effect
		if !knownBoons[e.Kind] {
			v.add(file, field("effect.kind"), "unknown boon %q (known: %s)", e.Kind, knownList(knownBoons))
			continue
		}
		if boonsWithValue[e.Kind] && e.Value < 1 {
			v.add(file, field("effect.value"), "is %d, must be at least 1", e.Value)
		}
		switch e.Kind {
		case types.BoonGrantSpell, types.BoonSpellMod:
			spell, ok := cat.Spells[e.Spell]
			if !ok {
				v.add(file, field("effect.spell"), "unknown spell %q", e.Spell)
				break
			}
			if e.Kind == types.BoonGrantSpell && spell.Ultimate {
				v.add(file, field("effect.spell"), "spell %q is an ultimate, and a fighter carries one already", e.Spell)
			}
			if e.Kind == types.BoonSpellMod {
				if e.APCost == 0 && e.SpellRange == 0 && e.EffectValue == 0 {
					v.add(file, field("effect"), "changes nothing about spell %q", e.Spell)
				}
				if e.EffectValue != 0 && spell.Effect == nil {
					v.add(file, field("effect.effectValue"), "spell %q has no effect to strengthen", e.Spell)
				}
				if b.Grimoire == "" {
					v.add(file, field("grimoire"), "must be set: a spell mod is for whoever carries the spell")
				} else if grimoire.ID != "" && !contains(grimoire.Spells, e.Spell) {
					v.add(file, field("effect.spell"), "spell %q is not in grimoire %q", e.Spell, b.Grimoire)
				}
			}
		case types.BoonSharedAP:
			if e.Range < 1 {
				v.add(file, field("effect.range"), "is %d, must be at least 1", e.Range)
			}
		case types.BoonPartyShield:
			if e.Duration < 1 {
				v.add(file, field("effect.duration"), "is %d, must be at least 1 turn", e.Duration)
			}
		}
	}
	for _, rarity := range []string{types.RarityCommon, types.RarityRare, types.RarityLegendary} {
		// A room offers three boons of a rarity; with fewer to draw from, a
		// player who holds them all would be offered nothing.
		if rarities[rarity] < 4 {
			v.add(file, "boons", "%d %s boons, must be at least 4 so that three can always be offered", rarities[rarity], rarity)
		}
	}
}

func (v *validator) dreamFloors(file string, f types.DreamFloors, boonIDs map[string]bool) {
	field := func(name string) string { return "floors." + name }
	if f.BossEvery < 2 {
		v.add(file, field("bossEvery"), "is %d, must be at least 2", f.BossEvery)
	}
	if f.BaseThreat < 10 {
		v.add(file, field("baseThreat"), "is %d tenths, must be at least 10: a room holds a monster at the least", f.BaseThreat)
	}
	if f.ThreatPerFloor < 0 {
		v.add(file, field("threatPerFloor"), "is %d, must not be negative", f.ThreatPerFloor)
	}
	if len(f.PartyThreat) != MaxDreamParty {
		v.add(file, field("partyThreat"), "holds %d values, must hold one per party size, 1 to %d", len(f.PartyThreat), MaxDreamParty)
	}
	for i, p := range f.PartyThreat {
		if p < 1 || (i > 0 && p < f.PartyThreat[i-1]) {
			v.add(file, field(fmt.Sprintf("partyThreat[%d]", i)), "is %d, must be positive and never below a smaller party's", p)
		}
	}
	if f.MaxMonsters < 1 || f.MaxMonsters > MaxDreamMonsters {
		v.add(file, field("maxMonsters"), "is %d, must be between 1 and %d", f.MaxMonsters, MaxDreamMonsters)
	}
	for name, curve := range map[string][]int{"healthPerFloor": f.HealthPerFloor, "damagePerFloor": f.DamagePerFloor} {
		if len(curve) != MaxDreamParty {
			v.add(file, field(name), "holds %d values, must hold one per party size, 1 to %d", len(curve), MaxDreamParty)
		}
		for i, p := range curve {
			if p < 0 || (i > 0 && p < curve[i-1]) {
				v.add(file, field(fmt.Sprintf("%s[%d]", name, i)), "is %d, must not be negative nor below a smaller party's", p)
			}
		}
	}
	if f.PartyBoonsEarlier < 0 {
		v.add(file, field("partyBoonsEarlier"), "is %d, must not be negative", f.PartyBoonsEarlier)
	}
	if len(f.Difficulties) != 3 {
		v.add(file, field("difficulties"), "holds %d, must hold three: a floor offers three rooms", len(f.Difficulties))
	}
	ids := map[string]bool{}
	for i, d := range f.Difficulties {
		at := func(name string) string { return field(fmt.Sprintf("difficulties[%d].%s", i, name)) }
		if !itemID.MatchString(d.ID) || ids[d.ID] {
			v.add(file, at("id"), "%q must be a unique lower-case id", d.ID)
		}
		ids[d.ID] = true
		v.nonEmpty(file, at("name"), d.Name)
		if d.Threat < 1 {
			v.add(file, at("threat"), "is %d%%, must be positive", d.Threat)
		}
		if d.Twists < 0 || d.Twists > 2 {
			v.add(file, at("twists"), "is %d, must be between 0 and 2", d.Twists)
		}
		if len(d.Rarities) != 3 {
			v.add(file, at("rarities"), "holds %d, must hold three: one per boon offered", len(d.Rarities))
		}
		for _, r := range d.Rarities {
			if !knownRarities[r] {
				v.add(file, at("rarities"), "unknown rarity %q", r)
			}
		}
	}
	if len(f.Levels) == 0 || f.Levels[0].From != 1 {
		v.add(file, field("levels"), "must start at floor 1")
	}
	for i, l := range f.Levels {
		if !OpponentLevels[l.Level] {
			v.add(file, field(fmt.Sprintf("levels[%d].level", i)), "unknown opponent level %q (known: %s)", l.Level, knownList(OpponentLevels))
		}
		if i > 0 && l.From <= f.Levels[i-1].From {
			v.add(file, field(fmt.Sprintf("levels[%d].from", i)), "is %d, must come after floor %d", l.From, f.Levels[i-1].From)
		}
	}
	if len(f.BossHealth) != MaxDreamParty {
		v.add(file, field("bossHealth"), "holds %d values, must hold one per party size, 1 to %d", len(f.BossHealth), MaxDreamParty)
	}
	for i, h := range f.BossHealth {
		if h < 50 || h > 1000 {
			v.add(file, field(fmt.Sprintf("bossHealth[%d]", i)), "is %d%%, must be between 50 and 1000", h)
		}
	}
	if f.EscortFrom < 1 {
		v.add(file, field("escortFrom"), "is %d, must be a floor", f.EscortFrom)
	}
	if f.SecondTwistFrom < 1 {
		v.add(file, field("secondTwistFrom"), "is %d, must be a floor", f.SecondTwistFrom)
	}
	for list, boons := range map[string][]types.DreamFloorBoon{"monsterBoons": f.MonsterBoons, "bossBoons": f.BossBoons} {
		for i, b := range boons {
			at := field(fmt.Sprintf("%s[%d]", list, i))
			if b.From < 1 {
				v.add(file, at+".from", "is %d, must be a floor", b.From)
			}
			if !boonIDs[b.Boon] {
				v.add(file, at+".boon", "unknown boon %q", b.Boon)
			}
		}
	}
}

// dreamWorld checks the islands and rulers a dream is fought among.
func (v *validator) dreamWorld(file string, d types.Dream, cat Catalogue) {
	if len(d.Islands) < 3 {
		v.add(file, "islands", "names %d islands, must name at least 3: a floor offers three rooms, each on its own island", len(d.Islands))
	}
	seen := map[string]bool{}
	for i, id := range d.Islands {
		field := fmt.Sprintf("islands[%d]", i)
		island, ok := cat.Island(id)
		if !ok {
			v.add(file, field, "unknown island %q", id)
			continue
		}
		if seen[id] {
			v.add(file, field, "island %q is named twice", id)
		}
		seen[id] = true
		if len(island.Lineage) == 0 {
			v.add(file, field, "island %q has no lineage: nobody lives there to fill a room", id)
		}
		for _, m := range island.Lineage {
			if _, ok := cat.DreamMonster(m); !ok {
				v.add(file, field, "monster %q of island %q has no entry in monsters", m, id)
			}
		}
	}
	if len(d.Bosses) == 0 {
		v.add(file, "bosses", "names no ruler: a boss floor needs one")
	}
	for i, id := range d.Bosses {
		field := fmt.Sprintf("bosses[%d]", i)
		boss, ok := cat.Monster(id)
		if !ok || boss.Rank == types.RankMonster {
			v.add(file, field, "%q is not a boss or a legend of the bestiary", id)
			continue
		}
		home := ""
		for _, island := range cat.Islands {
			if island.Boss == id {
				home = island.ID
			}
		}
		if home == "" {
			v.add(file, field, "%q rules no island, so it has no ground to be fought on", id)
		}
	}
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}
