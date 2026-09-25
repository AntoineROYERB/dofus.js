package content

import (
	"fmt"
	"strings"

	"game-server/internal/config"
	"game-server/internal/types"
)

// ---------------------------------------------------------------------------
// File schemas
// ---------------------------------------------------------------------------

type outfitsFile struct {
	Outfits []types.Outfit `json:"outfits"`
}

type grimoiresFile struct {
	Grimoires []grimoireEntry `json:"grimoires"`
}

// grimoireEntry is a types.Grimoire whose stats may be left out, in which
// case they come from balance.json. That keeps balance.json the one place to
// retune every fight at once, with a grimoire only saying how it differs.
type grimoireEntry struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Element        string   `json:"element"`
	Symbol         string   `json:"symbol"`
	Lore           string   `json:"lore"`
	Spells         []string `json:"spells"`
	Passive        string   `json:"passive"`
	Glyph          string   `json:"glyph"`
	MeleeBonus     int      `json:"meleeBonus"`
	Health         *int     `json:"health"`
	ActionPoints   *int     `json:"actionPoints"`
	MovementPoints *int     `json:"movementPoints"`
}

type runesFile struct {
	Runes []types.Rune `json:"runes"`
}

type talismansFile struct {
	Talismans []types.Talisman `json:"talismans"`
}

type championsFile struct {
	Champions []types.Champion `json:"champions"`
}

type cosmeticsFile struct {
	Cosmetics []types.Cosmetic `json:"cosmetics"`
}

// loadoutFiles are the decoded loadout files, checked together because they
// refer to each other and to the spells.
type loadoutFiles struct {
	outfits   outfitsFile
	grimoires grimoiresFile
	runes     runesFile
	talismans talismansFile
	champions championsFile
	cosmetics cosmeticsFile
}

// GrimoireSpells is how many spells a grimoire holds: with the outfit's basic
// attack and the talisman's ultimate, that is the five-spell bar.
const GrimoireSpells = 3

var knownRuneEffects = map[string]bool{
	types.RuneFinisher: true, types.RuneOpeningMP: true,
	types.RuneOpeningShield: true, types.RunePushResist: true,
}

var knownCosmetics = map[string]bool{
	types.CosmeticPet: true, types.CosmeticAura: true,
	types.CosmeticWings: true, types.CosmeticTitle: true,
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// loadouts checks every loadout file, on its own and against the others, and
// returns the catalogue's loadout half.
func (v *validator) loadouts(src Sources, f loadoutFiles, spells map[string]types.Spell, balance config.Balance) Catalogue {
	outfits := v.outfits(src.Outfits.Name, f.outfits, spells)
	grimoires := v.grimoires(src.Grimoires.Name, f.grimoires, spells, balance, outfits)
	runes := v.runes(src.Runes.Name, f.runes)
	talismans := v.talismans(src.Talismans.Name, f.talismans, spells, grimoires)
	v.basicAttacksFit(src.Outfits.Name, outfits, grimoires, spells)
	champions := v.champions(src.Champions.Name, f.champions, outfits, grimoires, runes, talismans)
	cosmetics := v.cosmetics(src.Cosmetics.Name, f.cosmetics)
	return Catalogue{
		Outfits:   outfits,
		Grimoires: grimoires,
		Runes:     runes,
		Talismans: talismans,
		Champions: champions,
		Cosmetics: cosmetics,
	}
}

// ids checks that a file defines at least one item, and that ids are well
// formed and unique. It returns where each id is.
func (v *validator) ids(file, list string, n int, idOf func(int) string) map[string]int {
	if n == 0 {
		v.add(file, list, "no %s defined", list)
	}
	ids := make(map[string]int, n)
	for i := range n {
		id := idOf(i)
		field := fmt.Sprintf("%s[%d].id", list, i)
		if !itemID.MatchString(id) {
			v.add(file, field, "%q must be lowercase letters, digits and dashes, starting with a letter", id)
		}
		if prev, dup := ids[id]; dup {
			v.add(file, field, "duplicate id %q, already used by %s[%d]", id, list, prev)
			continue
		}
		ids[id] = i
	}
	return ids
}

func (v *validator) required(file, field, value, why string) {
	if strings.TrimSpace(value) == "" {
		if why == "" {
			v.add(file, field, "must not be empty")
		} else {
			v.add(file, field, "must not be empty: %s", why)
		}
	}
}

func (v *validator) outfits(file string, of outfitsFile, spells map[string]types.Spell) []types.Outfit {
	v.ids(file, "outfits", len(of.Outfits), func(i int) string { return of.Outfits[i].ID })
	for i, o := range of.Outfits {
		field := func(name string) string { return fmt.Sprintf("outfits[%d].%s", i, name) }
		v.required(file, field("name"), o.Name, "")
		v.required(file, field("sprite"), o.Sprite, "it is how the outfit is drawn")
		v.required(file, field("weapon"), o.Weapon, "the wardrobe names it")
		if !knownElements[o.Element] {
			v.add(file, field("element"), "unknown element %q (known: %s)", o.Element, knownList(knownElements))
		}
		if !hexColour.MatchString(o.Palette.Primary) {
			v.add(file, field("palette.primary"), "%q is not a #rrggbb hex value", o.Palette.Primary)
		}
		if !hexColour.MatchString(o.Palette.Secondary) {
			v.add(file, field("palette.secondary"), "%q is not a #rrggbb hex value", o.Palette.Secondary)
		}
		spell, ok := spells[o.BasicAttack]
		switch {
		case !ok:
			v.add(file, field("basicAttack"), "unknown spell %q", o.BasicAttack)
		case spell.Ultimate:
			v.add(file, field("basicAttack"), "%s is an ultimate; ultimates come from talismans", spell.Name)
		case spell.Element != o.Element:
			v.add(file, field("basicAttack"), "%s is %s, not of the outfit's element %s", spell.Name, spell.Element, o.Element)
		}
	}
	return of.Outfits
}

func (v *validator) grimoires(file string, gf grimoiresFile, spells map[string]types.Spell, balance config.Balance, outfits []types.Outfit) []types.Grimoire {
	v.ids(file, "grimoires", len(gf.Grimoires), func(i int) string { return gf.Grimoires[i].ID })
	dressed := make(map[string]bool, len(outfits))
	for _, o := range outfits {
		dressed[o.Element] = true
	}

	grimoires := make([]types.Grimoire, 0, len(gf.Grimoires))
	for i, g := range gf.Grimoires {
		field := func(name string) string { return fmt.Sprintf("grimoires[%d].%s", i, name) }
		v.required(file, field("name"), g.Name, "")
		v.required(file, field("symbol"), g.Symbol, "")
		v.required(file, field("lore"), g.Lore, "")
		v.required(file, field("passive"), g.Passive, "the wardrobe shows it")
		v.required(file, field("glyph"), g.Glyph, "it is drawn under whoever carries the grimoire")
		if !knownElements[g.Element] {
			v.add(file, field("element"), "unknown element %q (known: %s)", g.Element, knownList(knownElements))
		} else if !dressed[g.Element] {
			v.add(file, field("element"), "no outfit is %s, so nobody could carry this grimoire", g.Element)
		}
		if g.MeleeBonus < 0 || g.MeleeBonus > 200 {
			v.add(file, field("meleeBonus"), "is %d, must be a percentage between 0 and 200", g.MeleeBonus)
		}

		health := orDefault(g.Health, balance.Health)
		actionPoints := orDefault(g.ActionPoints, balance.ActionPoints)
		movementPoints := orDefault(g.MovementPoints, balance.MovementPoints)
		for _, stat := range []struct {
			name  string
			value int
		}{{"health", health}, {"actionPoints", actionPoints}, {"movementPoints", movementPoints}} {
			if stat.value < 1 {
				v.add(file, field(stat.name), "is %d, must be at least 1", stat.value)
			}
		}

		if len(g.Spells) != GrimoireSpells {
			v.add(file, field("spells"), "has %d spells, a grimoire holds %d", len(g.Spells), GrimoireSpells)
		}
		inside := make(map[string]bool, len(g.Spells))
		for j, id := range g.Spells {
			spellField := fmt.Sprintf("grimoires[%d].spells[%d]", i, j)
			if inside[id] {
				v.add(file, spellField, "spell %q is in the grimoire twice", id)
				continue
			}
			inside[id] = true
			spell, ok := spells[id]
			switch {
			case !ok:
				v.add(file, spellField, "unknown spell %q", id)
			case spell.Ultimate:
				v.add(file, spellField, "%s is an ultimate; ultimates come from talismans", spell.Name)
			case spell.Element != g.Element:
				v.add(file, spellField, "%s is %s, not of the grimoire's element %s", spell.Name, spell.Element, g.Element)
			case spell.APCost > actionPoints:
				v.add(file, spellField, "%s costs %d AP, more than the grimoire's %d", spell.Name, spell.APCost, actionPoints)
			}
		}

		grimoires = append(grimoires, types.Grimoire{
			ID:             g.ID,
			Name:           g.Name,
			Element:        g.Element,
			Symbol:         g.Symbol,
			Lore:           g.Lore,
			Spells:         append([]string(nil), g.Spells...),
			Passive:        g.Passive,
			Glyph:          g.Glyph,
			MeleeBonus:     g.MeleeBonus,
			Health:         health,
			ActionPoints:   actionPoints,
			MovementPoints: movementPoints,
		})
	}
	return grimoires
}

// runes checks that every rune speaks the rune vocabulary and nothing else. A
// rune goes with any outfit, so it may not lean on an element: its effect
// cannot name one, and neither may the sentence a player reads.
func (v *validator) runes(file string, rf runesFile) []types.Rune {
	v.ids(file, "runes", len(rf.Runes), func(i int) string { return rf.Runes[i].ID })
	for i, r := range rf.Runes {
		field := func(name string) string { return fmt.Sprintf("runes[%d].%s", i, name) }
		v.required(file, field("name"), r.Name, "")
		v.required(file, field("description"), r.Description, "it is shown in full the first time the rune fires")
		for el := range knownElements {
			if strings.Contains(strings.ToLower(r.Description), strings.ToLower(el)) {
				v.add(file, field("description"), "mentions %s, but a rune is never elemental", el)
			}
		}
		e := r.Effect
		if !knownRuneEffects[e.Kind] {
			v.add(file, field("effect.kind"), "unknown rune effect %q (known: %s)", e.Kind, knownList(knownRuneEffects))
			continue
		}
		if e.Value <= 0 {
			v.add(file, field("effect.value"), "is %d, a rune effect must be positive", e.Value)
		}
		switch e.Kind {
		case types.RuneFinisher:
			if e.Threshold <= 0 || e.Threshold >= 100 {
				v.add(file, field("effect.threshold"), "is %d, must be a percentage of health between 1 and 99", e.Threshold)
			}
		case types.RuneOpeningShield:
			if e.Duration <= 0 {
				v.add(file, field("effect.duration"), "is %d, a shield must last at least one turn", e.Duration)
			}
		}
		if e.Kind != types.RuneFinisher && e.Threshold != 0 {
			v.add(file, field("effect.threshold"), "means nothing to a %s rune", e.Kind)
		}
		if e.Kind != types.RuneOpeningShield && e.Duration != 0 {
			v.add(file, field("effect.duration"), "means nothing to a %s rune", e.Kind)
		}
	}
	return rf.Runes
}

// talismans checks that each talisman carries exactly one ultimate, and that
// any grimoire can afford it: a talisman goes with any outfit.
func (v *validator) talismans(file string, tf talismansFile, spells map[string]types.Spell, grimoires []types.Grimoire) []types.Talisman {
	v.ids(file, "talismans", len(tf.Talismans), func(i int) string { return tf.Talismans[i].ID })
	for i, t := range tf.Talismans {
		field := func(name string) string { return fmt.Sprintf("talismans[%d].%s", i, name) }
		v.required(file, field("name"), t.Name, "")
		v.required(file, field("sprite"), t.Sprite, "it is what orbits the character")
		spell, ok := spells[t.Ultimate]
		if !ok {
			v.add(file, field("ultimate"), "unknown spell %q", t.Ultimate)
			continue
		}
		if !spell.Ultimate {
			v.add(file, field("ultimate"), "%s is not an ultimate", spell.Name)
		}
		for _, g := range grimoires {
			if spell.APCost > g.ActionPoints {
				v.add(file, field("ultimate"), "%s costs %d AP, more than the %s grimoire's %d", spell.Name, spell.APCost, g.Name, g.ActionPoints)
			}
		}
	}
	return tf.Talismans
}

// basicAttacksFit checks that every grimoire of an outfit's element can afford
// the outfit's basic attack.
func (v *validator) basicAttacksFit(file string, outfits []types.Outfit, grimoires []types.Grimoire, spells map[string]types.Spell) {
	for i, o := range outfits {
		spell, ok := spells[o.BasicAttack]
		if !ok {
			continue // already reported
		}
		for _, g := range grimoires {
			if g.Element == o.Element && spell.APCost > g.ActionPoints {
				v.add(file, fmt.Sprintf("outfits[%d].basicAttack", i), "%s costs %d AP, more than the %s grimoire's %d", spell.Name, spell.APCost, g.Name, g.ActionPoints)
			}
		}
	}
}

func (v *validator) champions(file string, cf championsFile, outfits []types.Outfit, grimoires []types.Grimoire, runes []types.Rune, talismans []types.Talisman) []types.Champion {
	ids := v.ids(file, "champions", len(cf.Champions), func(i int) string { return cf.Champions[i].ID })
	outfitElement := make(map[string]string, len(outfits))
	for _, o := range outfits {
		outfitElement[o.ID] = o.Element
	}
	grimoireElement := make(map[string]string, len(grimoires))
	for _, g := range grimoires {
		grimoireElement[g.ID] = g.Element
	}
	runeIDs := make(map[string]bool, len(runes))
	for _, r := range runes {
		runeIDs[r.ID] = true
	}
	talismanIDs := make(map[string]bool, len(talismans))
	for _, t := range talismans {
		talismanIDs[t.ID] = true
	}

	for i, c := range cf.Champions {
		field := func(name string) string { return fmt.Sprintf("champions[%d].%s", i, name) }
		v.required(file, field("name"), c.Name, "")
		if len(c.Lines) != 2 {
			v.add(file, field("lines"), "has %d lines, want 2: one when challenged, one when beaten", len(c.Lines))
		}
		for j, line := range c.Lines {
			v.required(file, fmt.Sprintf("champions[%d].lines[%d]", i, j), line, "")
		}

		oe, okO := outfitElement[c.Set.Outfit]
		ge, okG := grimoireElement[c.Set.Grimoire]
		if !okO {
			v.add(file, field("set.outfit"), "unknown outfit %q", c.Set.Outfit)
		}
		if !okG {
			v.add(file, field("set.grimoire"), "unknown grimoire %q", c.Set.Grimoire)
		}
		if okO && okG && oe != ge {
			v.add(file, field("set.grimoire"), "is %s but the outfit is %s: a set never mixes elements", ge, oe)
		}
		if !runeIDs[c.Set.Rune] {
			v.add(file, field("set.rune"), "unknown rune %q", c.Set.Rune)
		}
		if !talismanIDs[c.Set.Talisman] {
			v.add(file, field("set.talisman"), "unknown talisman %q", c.Set.Talisman)
		}

		if c.UnlockedBy != "" {
			if c.UnlockedBy == c.ID {
				v.add(file, field("unlockedBy"), "a champion cannot unlock itself")
			} else if _, ok := ids[c.UnlockedBy]; !ok {
				v.add(file, field("unlockedBy"), "unknown champion %q", c.UnlockedBy)
			}
		}
	}
	v.unlockChain(file, cf, ids)
	return cf.Champions
}

// unlockChain makes sure every champion can eventually be reached: something
// has to be open from the start, and no champion may wait on a loop of
// champions that all wait on each other.
func (v *validator) unlockChain(file string, cf championsFile, ids map[string]int) {
	if len(cf.Champions) == 0 {
		return
	}
	open := false
	for _, c := range cf.Champions {
		if c.UnlockedBy == "" {
			open = true
		}
	}
	if !open {
		v.add(file, "champions", "every champion has unlockedBy set, so none can ever be challenged")
		return
	}
	for i, c := range cf.Champions {
		seen := map[string]bool{c.ID: true}
		for next := c.UnlockedBy; next != ""; {
			j, ok := ids[next]
			if !ok {
				break // already reported as an unknown champion
			}
			if seen[next] {
				v.add(file, fmt.Sprintf("champions[%d].unlockedBy", i), "unlock chain loops back through %q and can never be satisfied", next)
				break
			}
			seen[next] = true
			next = cf.Champions[j].UnlockedBy
		}
	}
}

// cosmetics checks the looks. The file's schema has no field a fight could
// read, and the strict decoder refuses any it does not know, so a cosmetic
// with a stat in it never loads.
func (v *validator) cosmetics(file string, cf cosmeticsFile) []types.Cosmetic {
	seen := make(map[string]int, len(cf.Cosmetics))
	for i, c := range cf.Cosmetics {
		field := func(name string) string { return fmt.Sprintf("cosmetics[%d].%s", i, name) }
		if !itemID.MatchString(c.ID) {
			v.add(file, field("id"), "%q must be lowercase letters, digits and dashes, starting with a letter", c.ID)
		}
		if prev, dup := seen[c.ID]; dup {
			v.add(file, field("id"), "duplicate id %q, already used by cosmetics[%d]", c.ID, prev)
		}
		seen[c.ID] = i
		if !knownCosmetics[c.Kind] {
			v.add(file, field("kind"), "unknown cosmetic kind %q (known: %s)", c.Kind, knownList(knownCosmetics))
		}
		v.required(file, field("name"), c.Name, "")
		v.required(file, field("sprite"), c.Sprite, "")
	}
	return append([]types.Cosmetic{}, cf.Cosmetics...)
}
