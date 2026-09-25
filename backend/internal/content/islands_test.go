package content

import (
	"encoding/json"
	"testing"

	"game-server/internal/config"
)

// ---------------------------------------------------------------------------
// The shipped world.
// ---------------------------------------------------------------------------

func TestTheSevenLaunchIslandsShip(t *testing.T) {
	cat := shippedCatalogue(t)
	want := []struct{ id, element, boss, armour string }{
		{"prairie", "Neutral", "", "starter"},
		{"earth", "Earth", "boss_monolithe", "monolithe"},
		{"water", "Water", "boss_kraken", "kraken"},
		{"ice", "Water", "boss_coeur_hiver", "coeur_hiver"},
		{"air", "Air", "boss_oeil_nuee", "oeil_nuee"},
		{"acid", "Earth", "boss_mere_gloop", "mere_gloop"},
		{"fire", "Fire", "legend_roi_cendre", "roi_cendre"},
	}
	if len(cat.Islands) != len(want) {
		t.Fatalf("%d islands ship, want %d", len(cat.Islands), len(want))
	}
	for i, w := range want {
		got := cat.Islands[i]
		if got.ID != w.id || got.Element != w.element || got.Boss != w.boss || got.Armour != w.armour {
			t.Errorf("islands[%d] = %s/%s/%s/%s, want %s/%s/%s/%s", i,
				got.ID, got.Element, got.Boss, got.Armour, w.id, w.element, w.boss, w.armour)
		}
	}
}

// Every sheet in the bestiary is a sprite the client loads by name, and every
// monster is somewhere: a sheet nobody lives on is one nobody will ever see.
func TestEveryMonsterLivesOnAnIsland(t *testing.T) {
	cat := shippedCatalogue(t)
	placed := map[string]bool{}
	for _, is := range cat.Islands {
		for _, m := range is.Lineage {
			placed[m] = true
		}
		placed[is.Boss] = true
	}
	for _, m := range cat.Bestiary {
		if !placed[m.ID] {
			t.Errorf("%s is in the bestiary but on no island", m.ID)
		}
	}
}

// ---------------------------------------------------------------------------
// A malformed islands.json is refused, and the refusal says where and why.
// ---------------------------------------------------------------------------

func TestMalformedIslandsAreRefused(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(doc map[string]any)
		field  string
		reason string
	}{
		{"three terrains", func(d map[string]any) {
			island(d, 3)["terrains"] = []any{"ice", "shallow_water", "rock"}
		}, "islands[3].terrains", "1 to 2"},
		{"no terrain", func(d map[string]any) { island(d, 1)["terrains"] = []any{} }, "islands[1].terrains", "1 to 2"},
		{"unknown terrain", func(d map[string]any) {
			island(d, 1)["terrains"] = []any{"quicksand"}
		}, "islands[1].terrains[0]", `unknown terrain "quicksand"`},
		{"terrain twice", func(d map[string]any) {
			island(d, 1)["terrains"] = []any{"rock", "rock"}
		}, "islands[1].terrains[1]", "listed twice"},
		{"unknown monster", func(d map[string]any) {
			island(d, 1)["lineage"] = []any{"caillou", "dragon"}
		}, "islands[1].lineage[1]", `unknown monster "dragon"`},
		{"boss roaming a lineage", func(d map[string]any) {
			island(d, 1)["lineage"] = []any{"boss_kraken"}
		}, "islands[1].lineage[0]", "is a boss"},
		{"unknown boss", func(d map[string]any) { island(d, 1)["boss"] = "boss_nobody" }, "islands[1].boss", `unknown monster "boss_nobody"`},
		{"monster as a boss", func(d map[string]any) { island(d, 1)["boss"] = "caillou" }, "islands[1].boss", "plain monster"},
		{"boss ruling two islands", func(d map[string]any) {
			island(d, 2)["boss"] = "boss_monolithe"
		}, "islands[2].boss", "already rules islands[1]"},
		{"unknown armour", func(d map[string]any) { island(d, 1)["armour"] = "tin_can" }, "islands[1].armour", `unknown armour "tin_can"`},
		{"armour unlocked twice", func(d map[string]any) {
			island(d, 2)["armour"] = "monolithe"
		}, "islands[2].armour", "already unlocked by islands[1]"},
		{"unknown palette", func(d map[string]any) { island(d, 1)["palette"] = "neon" }, "islands[1].palette", `unknown palette "neon"`},
		{"unknown element", func(d map[string]any) { island(d, 1)["element"] = "Void" }, "islands[1].element", `unknown element "Void"`},
		{"no fights", func(d map[string]any) { island(d, 1)["fights"] = 0 }, "islands[1].fights", "at least one fight"},
		{"duplicate island", func(d map[string]any) { island(d, 2)["id"] = "earth" }, "islands[2].id", "duplicate id"},
		{"no islands", func(d map[string]any) { d["islands"] = []any{} }, "islands", "no islands"},
		{"armour of no element", func(d map[string]any) {
			d["armours"].([]any)[1].(map[string]any)["element"] = "Rust"
		}, "armours[1].element", `unknown element "Rust"`},
		{"unknown rank", func(d map[string]any) {
			d["bestiary"].([]any)[0].(map[string]any)["rank"] = "minion"
		}, "bestiary[0].rank", `unknown rank "minion"`},
		{"terrain without a rule", func(d map[string]any) {
			d["terrains"].([]any)[0].(map[string]any)["rule"] = ""
		}, "terrains[0].rule", "must not be empty"},
		{"short palette", func(d map[string]any) {
			d["palettes"].(map[string]any)["ice"].(map[string]any)["liquid"] = []any{"#ffffff"}
		}, `palettes["ice"].liquid`, "want 4"},
		{"palette colour not hex", func(d map[string]any) {
			d["palettes"].(map[string]any)["ice"].(map[string]any)["accent"] = "blue"
		}, `palettes["ice"].accent`, "#rrggbb"},
		{"misspelt field", func(d map[string]any) { island(d, 1)["bos"] = "x" }, "(document)", `unknown field "bos"`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data := mutateIslands(t, tc.mutate)
			_, err := Parse(sources(validSpells(t), validClasses(t), data), config.DefaultBalance, testBounds)
			assertProblem(t, err, "config/islands.json", tc.field, tc.reason)
		})
	}
}

// An island is data only: one more entry, citing what is already declared,
// and nothing else changes.
func TestANewIslandIsOnlyData(t *testing.T) {
	data := mutateIslands(t, func(d map[string]any) {
		d["armours"] = append(d["armours"].([]any), map[string]any{"id": "tidewalker", "name": "Tidewalker", "element": "Water"})
		d["islands"] = append(d["islands"].([]any), map[string]any{
			"id": "lagoon", "name": "Lagoon", "element": "Water", "terrains": []any{"shallow_water", "tall_grass"},
			"palette": "water", "lineage": []any{"poulpinet"}, "boss": "", "armour": "tidewalker", "fights": 3,
		})
	})
	cat, err := Parse(sources(validSpells(t), validClasses(t), data), config.DefaultBalance, testBounds)
	if err != nil {
		t.Fatalf("a new island was refused:\n%v", err)
	}
	last := cat.Islands[len(cat.Islands)-1]
	if last.ID != "lagoon" || len(last.Terrains) != 2 || last.Palette != "water" {
		t.Errorf("last island = %+v, want the lagoon as written", last)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func mutateIslands(t *testing.T, mutate func(map[string]any)) []byte {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(validIslands(t), &doc); err != nil {
		t.Fatal(err)
	}
	mutate(doc)
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func island(doc map[string]any, i int) map[string]any {
	return doc["islands"].([]any)[i].(map[string]any)
}
