package content

import (
	"fmt"
	"regexp"
	"strings"

	"game-server/internal/types"
)

// MaxTerrainsPerIsland keeps a map readable: two kinds of special cell are
// enough to plan around, and more turn every step into a lookup.
const MaxTerrainsPerIsland = 2

// islandsFile is islands.json: the world's layers other than the elements,
// which are fixed. Everything an island cites has to be declared here first,
// so a typo in an island is caught as an unknown name rather than drawn as
// nothing.
type islandsFile struct {
	Terrains []types.Terrain                `json:"terrains"`
	Bestiary []types.Monster                `json:"bestiary"`
	Armours  []types.Armour                 `json:"armours"`
	Palettes map[string]types.IslandPalette `json:"palettes"`
	Islands  []types.Island                 `json:"islands"`
}

// Ids in islands.json are file and sprite names, so they keep to what both
// are safe with.
var worldID = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

// islandElements are the elements an island or an armour may have: the four
// of the spells, and neutral for what has none.
func islandElement(e string) bool {
	return knownElements[e] || e == types.ElementNeutral
}

var knownRanks = map[string]bool{types.RankMonster: true, types.RankBoss: true, types.RankLegend: true}

// How many colours each shade of a palette has. The painter indexes into
// them, so a short list would draw undefined rather than fail.
var paletteShades = []struct {
	name  string
	count int
	get   func(types.IslandPalette) []string
}{
	{"ground", 3, func(p types.IslandPalette) []string { return p.Ground }},
	{"stone", 4, func(p types.IslandPalette) []string { return p.Stone }},
	{"wood", 2, func(p types.IslandPalette) []string { return p.Wood }},
	{"leaves", 4, func(p types.IslandPalette) []string { return p.Leaves }},
	{"pine", 3, func(p types.IslandPalette) []string { return p.Pine }},
	{"flowers", 3, func(p types.IslandPalette) []string { return p.Flowers }},
	{"earth", 2, func(p types.IslandPalette) []string { return p.Earth }},
	{"liquid", 4, func(p types.IslandPalette) []string { return p.Liquid }},
}

// world checks islands.json on its own: it cites nothing from the other files.
func (v *validator) world(file string, wf islandsFile) {
	terrains := v.uniqueIDs(file, "terrains", len(wf.Terrains), func(i int) string { return wf.Terrains[i].ID })
	for i, t := range wf.Terrains {
		field := func(name string) string { return fmt.Sprintf("terrains[%d].%s", i, name) }
		v.nonEmpty(file, field("name"), t.Name)
		v.nonEmpty(file, field("icon"), t.Icon)
		v.nonEmpty(file, field("rule"), t.Rule)
	}

	monsters := v.uniqueIDs(file, "bestiary", len(wf.Bestiary), func(i int) string { return wf.Bestiary[i].ID })
	for i, m := range wf.Bestiary {
		v.nonEmpty(file, fmt.Sprintf("bestiary[%d].name", i), m.Name)
		if !knownRanks[m.Rank] {
			v.add(file, fmt.Sprintf("bestiary[%d].rank", i), "unknown rank %q (known: %s)", m.Rank, knownList(knownRanks))
		}
	}

	armours := v.uniqueIDs(file, "armours", len(wf.Armours), func(i int) string { return wf.Armours[i].ID })
	for i, a := range wf.Armours {
		v.nonEmpty(file, fmt.Sprintf("armours[%d].name", i), a.Name)
		if !islandElement(a.Element) {
			v.add(file, fmt.Sprintf("armours[%d].element", i), "unknown element %q (known: %s, %s)", a.Element, knownList(knownElements), types.ElementNeutral)
		}
	}

	for _, id := range sortedStrings(wf.Palettes) {
		p := wf.Palettes[id]
		field := func(name string) string { return fmt.Sprintf("palettes[%q].%s", id, name) }
		if !worldID.MatchString(id) {
			v.add(file, fmt.Sprintf("palettes[%q]", id), "id must be lowercase letters, digits and underscores, starting with a letter")
		}
		for _, shade := range paletteShades {
			colours := shade.get(p)
			if len(colours) != shade.count {
				v.add(file, field(shade.name), "has %d colours, want %d", len(colours), shade.count)
			}
			for j, c := range colours {
				v.hex(file, fmt.Sprintf("%s[%d]", field(shade.name), j), c)
			}
		}
		for _, c := range []struct{ name, value string }{
			{"path", p.Path}, {"grass", p.Grass}, {"shadow", p.Shadow}, {"outline", p.Outline}, {"accent", p.Accent},
		} {
			v.hex(file, field(c.name), c.value)
		}
	}

	if len(wf.Islands) == 0 {
		v.add(file, "islands", "no islands defined")
	}
	v.uniqueIDs(file, "islands", len(wf.Islands), func(i int) string { return wf.Islands[i].ID })
	armourOf := map[string]int{}
	bossOf := map[string]int{}
	for i, is := range wf.Islands {
		field := func(name string) string { return fmt.Sprintf("islands[%d].%s", i, name) }
		v.nonEmpty(file, field("name"), is.Name)
		if !islandElement(is.Element) {
			v.add(file, field("element"), "unknown element %q (known: %s, %s)", is.Element, knownList(knownElements), types.ElementNeutral)
		}

		if len(is.Terrains) == 0 || len(is.Terrains) > MaxTerrainsPerIsland {
			v.add(file, field("terrains"), "has %d terrains, an island has 1 to %d", len(is.Terrains), MaxTerrainsPerIsland)
		}
		seen := map[string]bool{}
		for j, t := range is.Terrains {
			if seen[t] {
				v.add(file, fmt.Sprintf("%s[%d]", field("terrains"), j), "terrain %q is listed twice", t)
			}
			seen[t] = true
			if _, ok := terrains[t]; !ok {
				v.add(file, fmt.Sprintf("%s[%d]", field("terrains"), j), "unknown terrain %q", t)
			}
		}

		if _, ok := wf.Palettes[is.Palette]; !ok {
			v.add(file, field("palette"), "unknown palette %q", is.Palette)
		}

		for j, m := range is.Lineage {
			f := fmt.Sprintf("%s[%d]", field("lineage"), j)
			if k, ok := monsters[m]; !ok {
				v.add(file, f, "unknown monster %q", m)
			} else if rank := wf.Bestiary[k].Rank; rank != types.RankMonster {
				v.add(file, f, "%q is a %s, and a boss rules an island rather than roaming it", m, rank)
			}
		}

		if is.Boss != "" {
			if k, ok := monsters[is.Boss]; !ok {
				v.add(file, field("boss"), "unknown monster %q", is.Boss)
			} else if wf.Bestiary[k].Rank == types.RankMonster {
				v.add(file, field("boss"), "%q is a plain monster, not a boss or a legend", is.Boss)
			} else if prev, dup := bossOf[is.Boss]; dup {
				v.add(file, field("boss"), "%q already rules islands[%d]", is.Boss, prev)
			} else {
				bossOf[is.Boss] = i
			}
		}

		if _, ok := armours[is.Armour]; !ok {
			v.add(file, field("armour"), "unknown armour %q", is.Armour)
		} else if prev, dup := armourOf[is.Armour]; dup {
			v.add(file, field("armour"), "%q is already unlocked by islands[%d]", is.Armour, prev)
		} else {
			armourOf[is.Armour] = i
		}

		if is.Fights < 1 {
			v.add(file, field("fights"), "is %d, a chapter has at least one fight", is.Fights)
		}
	}
}

// uniqueIDs checks the ids of a list and returns where each one is.
func (v *validator) uniqueIDs(file, list string, n int, id func(int) string) map[string]int {
	at := make(map[string]int, n)
	for i := 0; i < n; i++ {
		field := fmt.Sprintf("%s[%d].id", list, i)
		key := id(i)
		if !worldID.MatchString(key) {
			v.add(file, field, "%q must be lowercase letters, digits and underscores, starting with a letter", key)
		}
		if prev, dup := at[key]; dup {
			v.add(file, field, "duplicate id %q, already used by %s[%d]", key, list, prev)
			continue
		}
		at[key] = i
	}
	return at
}

func (v *validator) nonEmpty(file, field, value string) {
	if strings.TrimSpace(value) == "" {
		v.add(file, field, "must not be empty")
	}
}

func (v *validator) hex(file, field, value string) {
	if !hexColour.MatchString(value) {
		v.add(file, field, "%q is not a #rrggbb hex value", value)
	}
}
