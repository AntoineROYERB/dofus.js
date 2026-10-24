package content

import (
	"encoding/json"
	"testing"

	"game-server/internal/config"
	"game-server/internal/types"
)

func TestShippedDreamCoversEveryRoom(t *testing.T) {
	cat := shippedCatalogue(t)
	d := cat.Dream
	if len(d.Monsters) == 0 || len(d.Twists) == 0 || len(d.Boons) == 0 {
		t.Fatalf("the shipped dream is empty: %d monsters, %d twists, %d boons", len(d.Monsters), len(d.Twists), len(d.Boons))
	}
	// Each island's cheapest monster has to fit the smallest budget, or the
	// first floor of a solo run would have nobody in it.
	smallest := d.Floors.BaseThreat / 10
	for _, id := range d.Islands {
		island, _ := cat.Island(id)
		cheapest := 0
		for _, m := range island.Lineage {
			monster, _ := cat.DreamMonster(m)
			if cheapest == 0 || monster.Threat < cheapest {
				cheapest = monster.Threat
			}
		}
		if cheapest > smallest {
			t.Errorf("island %s's cheapest monster costs %d, more than the first floor's %d", id, cheapest, smallest)
		}
	}
	for _, b := range d.Boons {
		if b.Effect.Kind == types.BoonGrantSpell {
			if spell := cat.Spells[b.Effect.Spell]; spell.Special != types.SpecialRevive {
				t.Errorf("boon %s grants %s; the only spell a boon grants today is a revive", b.ID, spell.Name)
			}
		}
	}
}

// mutateDream edits the shipped dreams.json.
func mutateDream(t *testing.T, mutate func(map[string]any)) Sources {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(readFile(t, dreamsPath), &doc); err != nil {
		t.Fatal(err)
	}
	mutate(doc)
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	src := shippedSources(t)
	src.Dreams = Source{Name: "config/dreams.json", Data: data}
	return src
}

func at(doc map[string]any, list string, i int) map[string]any {
	return doc[list].([]any)[i].(map[string]any)
}

func TestABadDreamIsRefused(t *testing.T) {
	cases := []struct {
		name, field, reason string
		mutate              func(map[string]any)
	}{
		{"a monster not in the bestiary", "monsters[0].id", "not in the bestiary", func(d map[string]any) {
			at(d, "monsters", 0)["id"] = "nobody"
		}},
		{"a ruler as a monster", "monsters[0].id", "boss", func(d map[string]any) {
			at(d, "monsters", 0)["id"] = "boss_kraken"
		}},
		{"a monster with no set", "monsters[0].loadout", "must name all four", func(d map[string]any) {
			at(d, "monsters", 0)["loadout"] = map[string]any{}
		}},
		{"a monster with an empty bar", "monsters[0].bar", "must hold 1 to 3", func(d map[string]any) {
			at(d, "monsters", 0)["bar"] = []any{}
		}},
		{"a monster casting another set's spell", "monsters[0].bar[0]", "not on its set's bar", func(d map[string]any) {
			at(d, "monsters", 0)["bar"] = []any{"7"}
		}},
		{"a monster with an ultimate", "monsters[0].bar[0]", "ultimate", func(d map[string]any) {
			at(d, "monsters", 0)["bar"] = []any{"20"}
		}},
		{"a monster that can never cast", "monsters[0].actionPoints", "could never cast", func(d map[string]any) {
			at(d, "monsters", 0)["actionPoints"] = 2
		}},
		{"a free monster", "monsters[0].threat", "at least 1", func(d map[string]any) {
			at(d, "monsters", 0)["threat"] = 0
		}},
		{"a monster with no colour", "monsters[0].color", "", func(d map[string]any) {
			at(d, "monsters", 0)["color"] = "red"
		}},
		{"an unknown twist", "twists[0].kind", "unknown twist", func(d map[string]any) {
			at(d, "twists", 0)["kind"] = "earthquake"
		}},
		{"a twist laying traps", "twists[0].terrain", "cannot be laid", func(d map[string]any) {
			at(d, "twists", 0)["terrain"] = "trap"
		}},
		{"a twist with no pattern", "twists[0].pattern", "unknown pattern", func(d map[string]any) {
			at(d, "twists", 0)["pattern"] = "spiral"
		}},
		{"a twist changing no points", "twists[4].ap", "changes nothing", func(d map[string]any) {
			at(d, "twists", 4)["ap"] = 0
			at(d, "twists", 4)["mp"] = 0
		}},
		{"an unknown boon", "boons[0].effect.kind", "unknown boon", func(d map[string]any) {
			at(d, "boons", 0)["effect"] = map[string]any{"kind": "flight"}
		}},
		{"a boon of no rarity", "boons[0].rarity", "unknown rarity", func(d map[string]any) {
			at(d, "boons", 0)["rarity"] = "epic"
		}},
		{"a boon worth nothing", "boons[0].effect.value", "at least 1", func(d map[string]any) {
			at(d, "boons", 0)["effect"] = map[string]any{"kind": "health"}
		}},
		{"a boon granting an unknown spell", "boons[8].effect.spell", "unknown spell", func(d map[string]any) {
			at(d, "boons", 8)["effect"] = map[string]any{"kind": "grantSpell", "spell": "999"}
		}},
		{"a spell mod outside its grimoire", "boons[11].effect.spell", "not in grimoire", func(d map[string]any) {
			at(d, "boons", 11)["effect"] = map[string]any{"kind": "spellMod", "spell": "7", "apCost": -1}
		}},
		{"a floor with two rooms", "floors.difficulties", "must hold three", func(d map[string]any) {
			f := d["floors"].(map[string]any)
			f["difficulties"] = f["difficulties"].([]any)[:2]
		}},
		{"a room of seven", "floors.maxMonsters", "between 1 and 6", func(d map[string]any) {
			d["floors"].(map[string]any)["maxMonsters"] = 7
		}},
		{"levels that do not start at the bottom", "floors.levels", "must start at floor 1", func(d map[string]any) {
			d["floors"].(map[string]any)["levels"] = []any{map[string]any{"from": 3, "level": "easy"}}
		}},
		{"an island nobody lives on", "islands[0]", "no lineage", func(d map[string]any) {
			d["islands"].([]any)[0] = "fire"
		}},
		{"a boss that rules nothing", "bosses[0]", "not a boss", func(d map[string]any) {
			d["bosses"].([]any)[0] = "caillou"
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := Parse(mutateDream(t, c.mutate), config.LoadBalance(balancePath), testBounds)
			assertProblem(t, err, "config/dreams.json", c.field, c.reason)
		})
	}
}

func TestAReviveIsAimedAtTheFallen(t *testing.T) {
	spells := mutateSpells(t, func(doc map[string]any) {
		spell(doc, "33")["targeting"] = "any"
	})
	_, err := Parse(sources(spells, validIslands(t)), config.LoadBalance(balancePath), testBounds)
	assertProblem(t, err, "config/spells.json", `spells["33"].targeting`, "go together")

	spells = mutateSpells(t, func(doc map[string]any) {
		spell(doc, "33")["damage"] = 5
		spell(doc, "33")["criticalDamage"] = 5
	})
	_, err = Parse(sources(spells, validIslands(t)), config.LoadBalance(balancePath), testBounds)
	assertProblem(t, err, "config/spells.json", `spells["33"].special`, "nothing but stand an ally back up")
}
