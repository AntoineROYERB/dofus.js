package content

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"game-server/internal/config"
	"game-server/internal/types"
)

// Elements the client knows how to draw. An element is not just a colour: the
// board's spell effects switch on it, so an unknown one would cast invisibly.
var knownElements = map[string]bool{"Fire": true, "Air": true, "Water": true, "Earth": true}

var knownAreas = map[string]bool{
	types.AoENone: true, types.AoECircle: true, types.AoELine: true, types.AoECross: true,
}

var knownEffects = map[string]bool{
	types.EffectPoison: true, types.EffectRegen: true, types.EffectAP: true,
	types.EffectMP: true, types.EffectShield: true,
}

var (
	hexColour = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	classID   = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)
)

type validator struct {
	problems []error
}

func (v *validator) add(file, field, format string, args ...any) {
	v.problems = append(v.problems, &Problem{File: file, Field: field, Problem: fmt.Sprintf(format, args...)})
}

// spells checks every spell on its own and returns the ones it could build.
// Class-dependent rules — AP cost against the class's AP — are checked with
// the classes.
func (v *validator) spells(file string, sf spellsFile, bounds Bounds) map[string]types.Spell {
	for _, name := range sortedStrings(sf.Elements) {
		if !knownElements[name] {
			v.add(file, "elements."+name, "unknown element (known: %s)", knownList(knownElements))
		} else if !hexColour.MatchString(sf.Elements[name]) {
			v.add(file, "elements."+name, "colour %q is not a #rrggbb hex value", sf.Elements[name])
		}
	}
	if len(sf.Spells) == 0 {
		v.add(file, "spells", "no spells defined")
	}

	spells := make(map[string]types.Spell, len(sf.Spells))
	for _, key := range sortedSpellKeys(sf.Spells) {
		s := sf.Spells[key]
		field := func(name string) string { return fmt.Sprintf("spells[%q].%s", key, name) }

		id, err := strconv.Atoi(key)
		if err != nil || id < 1 || strconv.Itoa(id) != key {
			// The client sends a spell id as a number, so the key has to be one.
			v.add(file, fmt.Sprintf("spells[%q]", key), "id must be a positive integer with no leading zeros")
			continue
		}

		if strings.TrimSpace(s.Name) == "" {
			v.add(file, field("name"), "must not be empty")
		}
		if strings.TrimSpace(s.Icon) == "" {
			v.add(file, field("icon"), "must not be empty")
		}
		if strings.TrimSpace(s.Description) == "" {
			v.add(file, field("description"), "must not be empty")
		}
		if !knownElements[s.Element] {
			v.add(file, field("element"), "unknown element %q (known: %s)", s.Element, knownList(knownElements))
		} else if _, ok := sf.Elements[s.Element]; !ok {
			v.add(file, field("element"), "element %q has no colour in elements", s.Element)
		}
		if !knownAreas[s.AreaOfEffect] {
			v.add(file, field("areaOfEffect"), "unknown area %q (known: %s)", s.AreaOfEffect, knownList(knownAreas))
		}
		if s.APCost < 1 {
			v.add(file, field("APCost"), "is %d, must be at least 1", s.APCost)
		}
		if s.Range < 0 || s.Range > bounds.MaxRange {
			v.add(file, field("range"), "is %d, must be between 0 and %d (the width of the board)", s.Range, bounds.MaxRange)
		}
		if s.Damage < 0 {
			v.add(file, field("damage"), "is %d, must not be negative", s.Damage)
		}
		if s.CriticalChance < 0 || s.CriticalChance > 100 {
			v.add(file, field("criticalChance"), "is %d, must be a percentage between 0 and 100", s.CriticalChance)
		}
		if s.CriticalDamage < s.Damage {
			// Leaving it out entirely decodes as 0, which also lands here: a
			// critical that hits for less than a normal cast is never intended.
			v.add(file, field("criticalDamage"), "is %d, must be at least the base damage %d", s.CriticalDamage, s.Damage)
		}
		if s.Cooldown < 0 {
			v.add(file, field("cooldown"), "is %d, must not be negative", s.Cooldown)
		}
		if s.MaxCastsPerTurn < 0 {
			v.add(file, field("maxCastsPerTurn"), "is %d, must not be negative (0 means no limit)", s.MaxCastsPerTurn)
		}
		if s.Cooldown > 0 && s.MaxCastsPerTurn != 1 {
			// A cooldown starts on the first cast, so a second cast in the same
			// turn is refused anyway: the two numbers disagree about the spell.
			v.add(file, field("maxCastsPerTurn"), "is %d with a cooldown of %d; a spell on cooldown can only be cast once a turn, set it to 1", s.MaxCastsPerTurn, s.Cooldown)
		}
		if s.Effect != nil {
			v.effect(file, fmt.Sprintf("spells[%q].effect", key), *s.Effect)
		}
		if s.Damage == 0 && s.Effect == nil {
			v.add(file, fmt.Sprintf("spells[%q]", key), "does no damage and has no effect")
		}

		spells[key] = types.Spell{
			ID:               id,
			Name:             s.Name,
			Color:            sf.Elements[s.Element],
			Icon:             s.Icon,
			APCost:           s.APCost,
			Range:            s.Range,
			Damage:           s.Damage,
			AreaOfEffect:     s.AreaOfEffect,
			Element:          s.Element,
			Description:      s.Description,
			NeedsLineOfSight: s.NeedsLineOfSight,
			MaxCastsPerTurn:  s.MaxCastsPerTurn,
			Cooldown:         s.Cooldown,
			CriticalChance:   s.CriticalChance,
			CriticalDamage:   s.CriticalDamage,
			Effect:           s.Effect,
		}
	}
	return spells
}

func (v *validator) effect(file, field string, e types.SpellEffect) {
	if !knownEffects[e.Kind] {
		v.add(file, field+".kind", "unknown effect %q (known: %s)", e.Kind, knownList(knownEffects))
		return
	}
	if e.Duration < 1 {
		v.add(file, field+".duration", "is %d, must be at least 1 turn", e.Duration)
	}
	switch e.Kind {
	case types.EffectPoison, types.EffectRegen, types.EffectShield:
		if e.Value <= 0 {
			v.add(file, field+".value", "is %d, a %s effect must be positive", e.Value, e.Kind)
		}
	default:
		if e.Value == 0 {
			v.add(file, field+".value", "is 0, the effect would do nothing")
		}
	}
}

func (v *validator) classes(file string, cf classesFile, spells map[string]types.Spell, balance config.Balance) []types.Class {
	if len(cf.Classes) == 0 {
		v.add(file, "classes", "no classes defined")
		return nil
	}

	ids := make(map[string]int, len(cf.Classes))
	for i, c := range cf.Classes {
		if prev, dup := ids[c.ID]; dup {
			v.add(file, fmt.Sprintf("classes[%d].id", i), "duplicate id %q, already used by classes[%d]", c.ID, prev)
			continue
		}
		ids[c.ID] = i
	}

	classes := make([]types.Class, 0, len(cf.Classes))
	for i, c := range cf.Classes {
		field := func(name string) string { return fmt.Sprintf("classes[%d].%s", i, name) }

		if !classID.MatchString(c.ID) {
			v.add(file, field("id"), "%q must be lowercase letters, digits and dashes, starting with a letter", c.ID)
		}
		if strings.TrimSpace(c.Name) == "" {
			v.add(file, field("name"), "must not be empty")
		}
		if strings.TrimSpace(c.Symbol) == "" {
			v.add(file, field("symbol"), "must not be empty")
		}
		if strings.TrimSpace(c.Lore) == "" {
			v.add(file, field("lore"), "must not be empty")
		}
		if !knownElements[c.Element] {
			v.add(file, field("element"), "unknown element %q (known: %s)", c.Element, knownList(knownElements))
		}
		if !hexColour.MatchString(c.Palette.Primary) {
			v.add(file, field("palette.primary"), "%q is not a #rrggbb hex value", c.Palette.Primary)
		}
		if !hexColour.MatchString(c.Palette.Secondary) {
			v.add(file, field("palette.secondary"), "%q is not a #rrggbb hex value", c.Palette.Secondary)
		}

		health := orDefault(c.Health, balance.Health)
		actionPoints := orDefault(c.ActionPoints, balance.ActionPoints)
		movementPoints := orDefault(c.MovementPoints, balance.MovementPoints)
		for _, stat := range []struct {
			name  string
			value int
		}{{"health", health}, {"actionPoints", actionPoints}, {"movementPoints", movementPoints}} {
			if stat.value < 1 {
				v.add(file, field(stat.name), "is %d, must be at least 1", stat.value)
			}
		}

		if len(c.Spells) == 0 || len(c.Spells) > BarSlots {
			v.add(file, field("spells"), "has %d spells, the bar holds 1 to %d", len(c.Spells), BarSlots)
		}
		onBar := make(map[string]bool, len(c.Spells))
		for j, id := range c.Spells {
			spellField := fmt.Sprintf("classes[%d].spells[%d]", i, j)
			if onBar[id] {
				v.add(file, spellField, "spell %q is on the bar twice", id)
				continue
			}
			onBar[id] = true
			spell, ok := spells[id]
			if !ok {
				v.add(file, spellField, "unknown spell %q", id)
				continue
			}
			if spell.APCost > actionPoints {
				v.add(file, spellField, "%s costs %d AP, more than the class's %d", spell.Name, spell.APCost, actionPoints)
			}
		}

		if strings.TrimSpace(c.Opponent.Name) == "" {
			v.add(file, field("opponent.name"), "must not be empty")
		}
		if len(c.Opponent.Lines) != 2 {
			v.add(file, field("opponent.lines"), "has %d lines, want 2: one when challenged, one when beaten", len(c.Opponent.Lines))
		}
		for j, line := range c.Opponent.Lines {
			if strings.TrimSpace(line) == "" {
				v.add(file, fmt.Sprintf("classes[%d].opponent.lines[%d]", i, j), "must not be empty")
			}
		}

		if c.UnlockedBy != "" {
			if c.UnlockedBy == c.ID {
				v.add(file, field("unlockedBy"), "a class cannot unlock itself")
			} else if _, ok := ids[c.UnlockedBy]; !ok {
				v.add(file, field("unlockedBy"), "unknown class %q", c.UnlockedBy)
			}
		}

		classes = append(classes, types.Class{
			ID:             c.ID,
			Name:           c.Name,
			Element:        c.Element,
			Symbol:         c.Symbol,
			Palette:        c.Palette,
			Lore:           c.Lore,
			Health:         health,
			ActionPoints:   actionPoints,
			MovementPoints: movementPoints,
			Spells:         append([]string(nil), c.Spells...),
			Opponent: types.ClassOpponent{
				Name:  c.Opponent.Name,
				Lines: append([]string(nil), c.Opponent.Lines...),
			},
			UnlockedBy: c.UnlockedBy,
		})
	}

	v.unlockChain(file, cf, ids)
	return classes
}

// unlockChain makes sure every opponent can eventually be reached: something
// has to be open from the start, and no class may wait on a loop of classes
// that all wait on each other.
func (v *validator) unlockChain(file string, cf classesFile, ids map[string]int) {
	open := false
	for _, c := range cf.Classes {
		if c.UnlockedBy == "" {
			open = true
		}
	}
	if !open {
		v.add(file, "classes", "every class has unlockedBy set, so no opponent can ever be challenged")
		return
	}

	for i, c := range cf.Classes {
		seen := map[string]bool{c.ID: true}
		for next := c.UnlockedBy; next != ""; {
			j, ok := ids[next]
			if !ok {
				break // already reported as an unknown class
			}
			if seen[next] {
				v.add(file, fmt.Sprintf("classes[%d].unlockedBy", i), "unlock chain loops back through %q and can never be satisfied", next)
				break
			}
			seen[next] = true
			next = cf.Classes[j].UnlockedBy
		}
	}
}

func orDefault(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

func sortedStrings[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// sortedSpellKeys orders ids numerically where they are numbers, so problems
// come out in the order the file is read in.
func sortedSpellKeys(m map[string]spellEntry) []string {
	keys := sortedStrings(m)
	sort.SliceStable(keys, func(i, j int) bool {
		a, errA := strconv.Atoi(keys[i])
		b, errB := strconv.Atoi(keys[j])
		if errA != nil || errB != nil {
			return errA == nil && errB != nil
		}
		return a < b
	})
	return keys
}

func knownList(set map[string]bool) string {
	return strings.Join(sortedStrings(set), ", ")
}
