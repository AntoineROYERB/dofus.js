package content

import (
	"encoding/json"
	"errors"
	"os"
	"strconv"
	"strings"
	"testing"

	"game-server/internal/config"
	"game-server/internal/types"
)

// The board is a diamond of radius 7; internal/game hands in the same bound.
var testBounds = Bounds{MaxRange: 14}

const (
	spellsPath    = "../../config/spells.json"
	islandsPath   = "../../config/islands.json"
	outfitsPath   = "../../config/outfits.json"
	grimoiresPath = "../../config/grimoires.json"
	runesPath     = "../../config/runes.json"
	talismansPath = "../../config/talismans.json"
	championsPath = "../../config/champions.json"
	cosmeticsPath = "../../config/cosmetics.json"
	balancePath   = "../../config/balance.json"
)

var shippedPaths = Paths{
	Spells: spellsPath, Islands: islandsPath,
	Outfits: outfitsPath, Grimoires: grimoiresPath, Runes: runesPath,
	Talismans: talismansPath, Champions: championsPath, Cosmetics: cosmeticsPath,
}

// shippedCatalogue loads the files exactly as the server does at startup.
func shippedCatalogue(t *testing.T) Catalogue {
	t.Helper()
	cat, err := Load(shippedPaths, config.LoadBalance(balancePath), testBounds)
	if err != nil {
		t.Fatalf("the shipped content does not load:\n%v", err)
	}
	return cat
}

// ---------------------------------------------------------------------------
// Properties of the shipped content. These run against the real files, so an
// edit that breaks one fails CI rather than a match.
// ---------------------------------------------------------------------------

func TestShippedContentLoads(t *testing.T) {
	shippedCatalogue(t)
}

func TestEmbeddedContentMatchesTheFilesOnDisk(t *testing.T) {
	onDisk := shippedCatalogue(t)
	embedded, err := Shipped(config.LoadBalance(balancePath), testBounds)
	if err != nil {
		t.Fatalf("the embedded content does not load:\n%v", err)
	}
	a, _ := json.Marshal(onDisk)
	b, _ := json.Marshal(embedded)
	if string(a) != string(b) {
		t.Error("the content compiled into the binary differs from config/ on disk")
	}
}

// shippedBarSize is how many spells a champion's set puts on the bar. Eight
// was too many to learn in a first fight; five, each doing something the
// others do not, is the design: a basic attack, three spells, an ultimate.
const shippedBarSize = 5

// shippedKits resolves every champion's set, as the server would seat it.
func shippedKits(t *testing.T) (Catalogue, map[string]types.Kit) {
	t.Helper()
	cat := shippedCatalogue(t)
	kits := make(map[string]types.Kit, len(cat.Champions))
	for _, c := range cat.Champions {
		kit, err := cat.Kit(c.Set)
		if err != nil {
			t.Fatalf("%s's set does not resolve: %v", c.ID, err)
		}
		kits[c.ID] = kit
	}
	return cat, kits
}

func TestEveryChampionSetMakesAFiveSpellBar(t *testing.T) {
	_, kits := shippedKits(t)
	for id, kit := range kits {
		if len(kit.Bar) != shippedBarSize {
			t.Errorf("%s's set makes a bar of %d spells, want %d", id, len(kit.Bar), shippedBarSize)
		}
	}
}

func TestEveryChampionCanAffordItsWholeBar(t *testing.T) {
	cat, kits := shippedKits(t)
	for id, kit := range kits {
		for _, spellID := range kit.Bar {
			spell := cat.Spells[spellID]
			if spell.APCost < 1 || spell.APCost > kit.Grimoire.ActionPoints {
				t.Errorf("%s: %s costs %d AP, the grimoire gives %d", id, spell.Name, spell.APCost, kit.Grimoire.ActionPoints)
			}
		}
	}
}

func TestShippedSpellsRespectTheRules(t *testing.T) {
	for id, spell := range shippedCatalogue(t).Spells {
		if spell.Range < 0 || spell.Range > testBounds.MaxRange {
			t.Errorf("spell %s range %d is off the board", id, spell.Range)
		}
		if !knownAreas[spell.AreaOfEffect] {
			t.Errorf("spell %s has unknown area %q", id, spell.AreaOfEffect)
		}
		if !knownElements[spell.Element] {
			t.Errorf("spell %s has unknown element %q", id, spell.Element)
		}
		if spell.CriticalDamage < spell.Damage {
			t.Errorf("spell %s crits for %d, less than its %d base", id, spell.CriticalDamage, spell.Damage)
		}
		if spell.CriticalChance < 0 || spell.CriticalChance > 100 {
			t.Errorf("spell %s crit chance %d is not a percentage", id, spell.CriticalChance)
		}
		if spell.Cooldown > 0 && spell.MaxCastsPerTurn != 1 {
			t.Errorf("spell %s has a cooldown and %d casts a turn", id, spell.MaxCastsPerTurn)
		}
		if !hexColour.MatchString(spell.Color) {
			t.Errorf("spell %s colour %q is not hex", id, spell.Color)
		}
		// The description is what a player reads; it has to agree with the
		// number the server actually deals.
		if spell.Damage > 0 && !strings.Contains(spell.Description, strconv.Itoa(spell.Damage)+" damage") {
			t.Errorf("spell %s (%s) deals %d but its description says %q", id, spell.Name, spell.Damage, spell.Description)
		}
	}
}

// The elemental identities are the design, so they are checked as such: each
// champion's set is one element's identity, every spell sits on exactly one
// champion's bar and is of that set's element, the ultimate comes last from
// the talisman, and no two spells on a bar play the same role — a spell that
// only repeats another is one more thing to learn for nothing.
func TestShippedChampionsKeepTheirElementalIdentity(t *testing.T) {
	cat, kits := shippedKits(t)
	holders := map[string]int{}
	for _, kit := range kits {
		for _, id := range kit.Bar {
			holders[id]++
		}
	}

	elements := map[string]string{}
	for _, c := range cat.Champions {
		kit := kits[c.ID]
		if other, dup := elements[kit.Element]; dup {
			t.Errorf("%s is a second %s champion after %s; each is one element's identity", c.ID, kit.Element, other)
		}
		elements[kit.Element] = c.ID

		roles := map[string]string{}
		for i, id := range kit.Bar {
			spell := cat.Spells[id]
			if holders[id] != 1 {
				t.Errorf("%s shares %s with another champion; every spell is one set's own", c.ID, spell.Name)
			}
			if spell.Element != kit.Element {
				t.Errorf("%s carries %s, a %s spell, not %s", c.ID, spell.Name, spell.Element, kit.Element)
			}
			if last := i == len(kit.Bar)-1; spell.Ultimate != last {
				t.Errorf("%s: %s is at slot %d; the ultimate, and only it, comes last", c.ID, spell.Name, i+1)
			}
			if other, dup := roles[spell.Role]; dup {
				t.Errorf("%s: %s and %s both play the %q role", c.ID, other, spell.Name, spell.Role)
			}
			roles[spell.Role] = spell.Name
		}
	}

	// A basic attack an outfit carries may be on no champion's bar: those are
	// won in the portals (ADR 2). So may an ultimate a talisman carries: the
	// legendaries' are loot. Every other spell is some champion's.
	worn := map[string]bool{}
	for _, o := range cat.Outfits {
		worn[o.BasicAttack] = true
	}
	for _, tl := range cat.Talismans {
		worn[tl.Ultimate] = true
	}
	for id := range cat.Spells {
		if holders[id] == 0 && !worn[id] {
			t.Errorf("spell %s (%s) is on no champion's bar, no outfit's and no talisman's", id, cat.Spells[id].Name)
		}
	}
}

// Every grimoire spell and ultimate has to do something besides damage:
// change the target, the caster, or the board. Two spells that only hit for
// different numbers are the same spell. The one exception is an outfit's
// basic attack that no champion carries: a plain swing or throw of its
// weapon, told apart by its reach.
func TestEveryShippedSpellDoesMoreThanDamage(t *testing.T) {
	cat := shippedCatalogue(t)
	plain := map[string]bool{}
	for _, o := range cat.Outfits {
		plain[o.BasicAttack] = true
	}
	for _, c := range cat.Champions {
		for _, o := range cat.Outfits {
			if o.ID == c.Set.Outfit {
				delete(plain, o.BasicAttack)
			}
		}
	}
	for id, spell := range cat.Spells {
		if plain[id] {
			continue
		}
		// An infused spell is judged as each element casts it.
		casts := []types.Spell{spell}
		for element := range spell.Infusions {
			casts = append(casts, spell.Infused(element))
		}
		if len(casts) > 1 {
			casts = casts[1:]
		}
		for _, cast := range casts {
			if cast.Effect == nil && cast.Terrain == "" && cast.Zone == nil && cast.Push == 0 &&
				cast.GrantMP == 0 && cast.Special == "" && !cast.Relayed && !cast.Conducts {
				t.Errorf("spell %s (%s) only deals damage in %s", id, cast.Name, cast.Element)
			}
		}
	}
}

func TestShippedUnlockArcReachesEveryChampion(t *testing.T) {
	cat := shippedCatalogue(t)
	unlocked := map[string]bool{}
	for progress := true; progress; {
		progress = false
		for _, c := range cat.Champions {
			if !unlocked[c.ID] && (c.UnlockedBy == "" || unlocked[c.UnlockedBy]) {
				unlocked[c.ID] = true
				progress = true
			}
		}
	}
	for _, c := range cat.Champions {
		if !unlocked[c.ID] {
			t.Errorf("%s can never be unlocked", c.ID)
		}
	}
}

func TestGrimoireStatsFallBackToTheBalance(t *testing.T) {
	balance := config.Balance{Health: 77, ActionPoints: 9, MovementPoints: 2}
	src := shippedSources(t)
	src.Grimoires.Data = mutateFirst(t, grimoiresPath, "grimoires", func(g map[string]any) {
		delete(g, "health")
		g["movementPoints"] = 6
	})
	cat, err := Parse(src, balance, testBounds)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	got := cat.Grimoires[0]
	if got.Health != 77 || got.ActionPoints != 9 || got.MovementPoints != 6 {
		t.Errorf("stats = %d/%d/%d, want 77/9/6 (health and AP from the balance, MP from the grimoire)",
			got.Health, got.ActionPoints, got.MovementPoints)
	}
}

func TestAKitIsTheBarAndTheItems(t *testing.T) {
	cat := shippedCatalogue(t)
	champion := cat.DefaultChampion()
	kit, err := cat.Kit(types.Loadout{})
	if err != nil {
		t.Fatalf("Kit of an empty loadout: %v", err)
	}
	if kit.Loadout != champion.Set {
		t.Errorf("an empty loadout resolved to %+v, want the first champion's set %+v", kit.Loadout, champion.Set)
	}
	want := append(append([]string{kit.Outfit.BasicAttack}, kit.Grimoire.Spells...), kit.Talisman.Ultimate)
	if strings.Join(kit.Bar, ",") != strings.Join(want, ",") {
		t.Errorf("bar = %v, want basic attack, grimoire, ultimate: %v", kit.Bar, want)
	}

	other := cat.Champions[1].Set
	for name, tc := range map[string]struct {
		loadout types.Loadout
		want    error
	}{
		"unknown talisman": {types.Loadout{Outfit: champion.Set.Outfit, Grimoire: champion.Set.Grimoire, Rune: champion.Set.Rune, Talisman: "ghost"}, ErrUnknownItem},
		"missing rune":     {types.Loadout{Outfit: champion.Set.Outfit, Grimoire: champion.Set.Grimoire, Talisman: champion.Set.Talisman}, ErrIncompleteSet},
		"mixed elements":   {types.Loadout{Outfit: champion.Set.Outfit, Grimoire: other.Grimoire, Rune: champion.Set.Rune, Talisman: champion.Set.Talisman}, ErrElementsMismatch},
	} {
		if _, err := cat.Kit(tc.loadout); !errors.Is(err, tc.want) {
			t.Errorf("%s: Kit = %v, want %v", name, err, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// A malformed file is refused, and the refusal says where and why.
// ---------------------------------------------------------------------------

func TestMalformedSpellsAreRefused(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(spells map[string]any)
		field  string
		reason string
	}{
		{"zero AP cost", func(s map[string]any) { spell(s, "1")["APCost"] = 0 }, `spells["1"].APCost`, "at least 1"},
		{"negative range", func(s map[string]any) { spell(s, "1")["range"] = -1 }, `spells["1"].range`, "between 0 and 14"},
		{"range off the board", func(s map[string]any) { spell(s, "1")["range"] = 15 }, `spells["1"].range`, "between 0 and 14"},
		{"unknown area", func(s map[string]any) { spell(s, "1")["areaOfEffect"] = "donut" }, `spells["1"].areaOfEffect`, `unknown area "donut"`},
		{"unknown element", func(s map[string]any) { spell(s, "1")["element"] = "Lightning" }, `spells["1"].element`, `unknown element "Lightning"`},
		{"weak critical", func(s map[string]any) { spell(s, "1")["criticalDamage"] = 3 }, `spells["1"].criticalDamage`, "at least the base damage"},
		{"crit chance over 100", func(s map[string]any) { spell(s, "1")["criticalChance"] = 120 }, `spells["1"].criticalChance`, "between 0 and 100"},
		{"cooldown with several casts", func(s map[string]any) {
			spell(s, "1")["cooldown"] = 2
		}, `spells["1"].maxCastsPerTurn`, "cooldown of 2"},
		{"unknown effect", func(s map[string]any) {
			spell(s, "3")["effect"] = map[string]any{"kind": "sleep", "value": 1, "duration": 1}
		}, `spells["3"].effect.kind`, `unknown effect "sleep"`},
		{"effect with no duration", func(s map[string]any) {
			spell(s, "3")["effect"] = map[string]any{"kind": "poison", "value": 5, "duration": 0}
		}, `spells["3"].effect.duration`, "at least 1 turn"},
		{"id that is not a number", func(s map[string]any) {
			spells := s["spells"].(map[string]any)
			spells["fire"] = spells["1"]
		}, `spells["fire"]`, "positive integer"},
		{"no role", func(s map[string]any) { spell(s, "1")["role"] = "" }, `spells["1"].role`, "must not be empty"},
		{"unknown targeting", func(s map[string]any) { spell(s, "1")["targeting"] = "ally" }, `spells["1"].targeting`, `unknown targeting "ally"`},
		{"self spell with a range", func(s map[string]any) { spell(s, "20")["range"] = 3 }, `spells["20"].range`, "must be 0"},
		{"swap not aimed at a cell", func(s map[string]any) {
			spell(s, "9")["targeting"] = "self"
			spell(s, "9")["range"] = 0
		}, `spells["9"].targeting`, "must be \"any\""},
		{"unknown terrain", func(s map[string]any) { spell(s, "2")["terrain"] = "lava" }, `spells["2"].terrain`, `unknown terrain "lava"`},
		{"unknown special", func(s map[string]any) { spell(s, "3")["special"] = "teleport" }, `spells["3"].special`, `unknown special "teleport"`},
		{"leap aimed at any cell", func(s map[string]any) { spell(s, "16")["targeting"] = "any" }, `spells["16"].targeting`, "must be \"empty\""},
		{"quake not on its caster", func(s map[string]any) {
			spell(s, "20")["targeting"] = "any"
			spell(s, "20")["range"] = 3
		}, `spells["20"].targeting`, "must be \"self\""},
		{"unknown zone", func(s map[string]any) {
			spell(s, "10")["zone"] = map[string]any{"kind": "fog", "duration": 2}
		}, `spells["10"].zone.kind`, `unknown zone "fog"`},
		{"ultimate with a cooldown", func(s map[string]any) { spell(s, "5")["cooldown"] = 3 }, `spells["5"].cooldown`, "on an ultimate"},
		{"spell that does nothing", func(s map[string]any) {
			delete(spell(s, "4"), "terrain")
		}, `spells["4"]`, "does nothing"},
		{"colour that is not hex", func(s map[string]any) {
			s["elements"].(map[string]any)["Fire"] = "red"
		}, "elements.Fire", "#rrggbb"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data := mutateSpells(t, tc.mutate)
			_, err := Parse(sources(data, validIslands(t)), config.DefaultBalance, testBounds)
			assertProblem(t, err, "config/spells.json", tc.field, tc.reason)
		})
	}
}

func TestMalformedLoadoutsAreRefused(t *testing.T) {
	cases := []struct {
		name   string
		path   string
		list   string
		at     int
		mutate func(item map[string]any)
		file   string
		field  string
		reason string
	}{
		// Outfits.
		{"outfit of no element", outfitsPath, "outfits", 0, func(o map[string]any) { o["element"] = "Void" }, "outfits", "outfits[0].element", `unknown element "Void"`},
		{"basic attack that is an ultimate", outfitsPath, "outfits", 0, func(o map[string]any) { o["basicAttack"] = "5" }, "outfits", "outfits[0].basicAttack", "ultimates come from talismans"},
		{"basic attack of another element", outfitsPath, "outfits", 0, func(o map[string]any) { o["basicAttack"] = "11" }, "outfits", "outfits[0].basicAttack", "not of the outfit's element"},
		{"outfit palette not hex", outfitsPath, "outfits", 0, func(o map[string]any) {
			o["palette"] = map[string]any{"primary": "bg-red-500", "secondary": "#ffffff"}
		}, "outfits", "outfits[0].palette.primary", "#rrggbb"},
		{"outfit with stats", outfitsPath, "outfits", 0, func(o map[string]any) { o["health"] = 200 }, "outfits", "(document)", `unknown field "health"`},
		// Grimoires.
		{"grimoire of two spells", grimoiresPath, "grimoires", 0, func(g map[string]any) { g["spells"] = []any{"2", "3"} }, "grimoires", "grimoires[0].spells", "a grimoire holds 3"},
		{"ultimate in a grimoire", grimoiresPath, "grimoires", 0, func(g map[string]any) { g["spells"] = []any{"2", "3", "5"} }, "grimoires", "grimoires[0].spells[2]", "ultimates come from talismans"},
		{"spell of another element", grimoiresPath, "grimoires", 0, func(g map[string]any) { g["spells"] = []any{"2", "3", "12"} }, "grimoires", "grimoires[0].spells[2]", "not of the grimoire's element"},
		{"spell twice in a grimoire", grimoiresPath, "grimoires", 0, func(g map[string]any) { g["spells"] = []any{"2", "2", "3"} }, "grimoires", "grimoires[0].spells[1]", "twice"},
		{"spell costing more than the grimoire gives", grimoiresPath, "grimoires", 0, func(g map[string]any) { g["actionPoints"] = 3 }, "grimoires", "grimoires[0].spells[1]", "more than the grimoire's 3"},
		{"no passive", grimoiresPath, "grimoires", 0, func(g map[string]any) { g["passive"] = " " }, "grimoires", "grimoires[0].passive", "must not be empty"},
		{"no glyph", grimoiresPath, "grimoires", 0, func(g map[string]any) { delete(g, "glyph") }, "grimoires", "grimoires[0].glyph", "must not be empty"},
		{"melee bonus out of range", grimoiresPath, "grimoires", 0, func(g map[string]any) { g["meleeBonus"] = -5 }, "grimoires", "grimoires[0].meleeBonus", "between 0 and 200"},
		{"zero health", grimoiresPath, "grimoires", 0, func(g map[string]any) { g["health"] = 0 }, "grimoires", "grimoires[0].health", "at least 1"},
		// Runes.
		{"unknown rune effect", runesPath, "runes", 0, func(r map[string]any) {
			r["effect"] = map[string]any{"kind": "burnMore", "value": 1}
		}, "runes", "runes[0].effect.kind", `unknown rune effect "burnMore"`},
		{"rune that mentions an element", runesPath, "runes", 0, func(r map[string]any) { r["description"] = "Fire hits harder." }, "runes", "runes[0].description", "never elemental"},
		{"rune effect of nothing", runesPath, "runes", 0, func(r map[string]any) {
			r["effect"] = map[string]any{"kind": "pushResist", "value": 0}
		}, "runes", "runes[0].effect.value", "must be positive"},
		{"finisher with no threshold", runesPath, "runes", 0, func(r map[string]any) {
			r["effect"] = map[string]any{"kind": "finisher", "value": 20}
		}, "runes", "runes[0].effect.threshold", "between 1 and 99"},
		// Talismans.
		{"talisman without an ultimate", talismansPath, "talismans", 0, func(tl map[string]any) { tl["ultimate"] = "2" }, "talismans", "talismans[0].ultimate", "not an ultimate"},
		{"talisman of an unknown spell", talismansPath, "talismans", 0, func(tl map[string]any) { tl["ultimate"] = "999" }, "talismans", "talismans[0].ultimate", `unknown spell "999"`},
		// Champions.
		{"set of two elements", championsPath, "champions", 0, func(c map[string]any) {
			c["set"].(map[string]any)["grimoire"] = "tidecaller"
		}, "champions", "champions[0].set.grimoire", "never mixes elements"},
		{"set with an unknown rune", championsPath, "champions", 0, func(c map[string]any) {
			c["set"].(map[string]any)["rune"] = "ghost"
		}, "champions", "champions[0].set.rune", `unknown rune "ghost"`},
		{"one line of flavour", championsPath, "champions", 0, func(c map[string]any) { c["lines"] = []any{"only one"} }, "champions", "champions[0].lines", "want 2"},
		{"unlocked by an unknown champion", championsPath, "champions", 1, func(c map[string]any) { c["unlockedBy"] = "ghost" }, "champions", "champions[1].unlockedBy", `unknown champion "ghost"`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			src := shippedSources(t)
			data := mutateAt(t, tc.path, tc.list, tc.at, tc.mutate)
			target := src.of(tc.list)
			target.Data = data
			_, err := Parse(src, config.DefaultBalance, testBounds)
			assertProblem(t, err, "config/"+tc.file+".json", tc.field, tc.reason)
		})
	}
}

func TestACosmeticCannotCarryAStat(t *testing.T) {
	src := shippedSources(t)
	src.Cosmetics.Data = []byte(`{"cosmetics":[{"id":"ember-pet","kind":"pet","name":"Ember","sprite":"ember","damage":5}]}`)
	_, err := Parse(src, config.DefaultBalance, testBounds)
	assertProblem(t, err, "config/cosmetics.json", "(document)", `unknown field "damage"`)
}

func TestDuplicateItemIDsAreRefused(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal(readFile(t, grimoiresPath), &doc); err != nil {
		t.Fatal(err)
	}
	list := doc["grimoires"].([]any)
	list[1].(map[string]any)["id"] = list[0].(map[string]any)["id"]
	src := shippedSources(t)
	src.Grimoires.Data, _ = json.Marshal(doc)

	_, err := Parse(src, config.DefaultBalance, testBounds)
	assertProblem(t, err, "config/grimoires.json", "grimoires[1].id", "duplicate id")
}

func TestUnlockLoopsAreRefused(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal(readFile(t, championsPath), &doc); err != nil {
		t.Fatal(err)
	}
	// Close the chain on itself: the first champion now waits on the last,
	// and every champion waits on the one before it.
	list := doc["champions"].([]any)
	last := list[len(list)-1].(map[string]any)["id"]
	list[0].(map[string]any)["unlockedBy"] = last
	src := shippedSources(t)
	src.Champions.Data, _ = json.Marshal(doc)

	_, err := Parse(src, config.DefaultBalance, testBounds)
	assertProblem(t, err, "config/champions.json", "champions", "none can ever be challenged")
}

func TestEveryProblemIsReportedAtOnce(t *testing.T) {
	data := mutateSpells(t, func(s map[string]any) {
		spell(s, "1")["APCost"] = 0
		spell(s, "2")["areaOfEffect"] = "donut"
	})
	_, err := Parse(sources(data, validIslands(t)), config.DefaultBalance, testBounds)
	if err == nil {
		t.Fatal("Parse accepted two broken spells")
	}
	for _, want := range []string{`spells["1"].APCost`, `spells["2"].areaOfEffect`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error does not mention %s:\n%v", want, err)
		}
	}
}

func TestMissingFileIsNamed(t *testing.T) {
	paths := shippedPaths
	paths.Spells = "nope/spells.json"
	_, err := Load(paths, config.DefaultBalance, testBounds)
	if err == nil || !strings.Contains(err.Error(), "nope/spells.json") {
		t.Errorf("error = %v, want it to name the missing file", err)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// shippedSources is every shipped file, named as the server names them, so
// problems can be asserted against the names it would print.
func shippedSources(t *testing.T) Sources {
	t.Helper()
	named := func(name, path string) Source {
		return Source{Name: "config/" + name, Data: readFile(t, path)}
	}
	return Sources{
		Spells:    named("spells.json", spellsPath),
		Islands:   named("islands.json", islandsPath),
		Outfits:   named("outfits.json", outfitsPath),
		Grimoires: named("grimoires.json", grimoiresPath),
		Runes:     named("runes.json", runesPath),
		Talismans: named("talismans.json", talismansPath),
		Champions: named("champions.json", championsPath),
		Cosmetics: named("cosmetics.json", cosmeticsPath),
	}
}

// sources is the shipped content with the spells and islands given.
func sources(spells, islands []byte) Sources {
	src := Sources{}
	src.Spells = Source{Name: "config/spells.json", Data: spells}
	src.Islands = Source{Name: "config/islands.json", Data: islands}
	for _, f := range []struct {
		into *Source
		name string
		path string
	}{
		{&src.Outfits, "outfits.json", outfitsPath}, {&src.Grimoires, "grimoires.json", grimoiresPath},
		{&src.Runes, "runes.json", runesPath}, {&src.Talismans, "talismans.json", talismansPath},
		{&src.Champions, "champions.json", championsPath}, {&src.Cosmetics, "cosmetics.json", cosmeticsPath},
	} {
		data, err := os.ReadFile(f.path)
		if err != nil {
			panic(err)
		}
		*f.into = Source{Name: "config/" + f.name, Data: data}
	}
	return src
}

// of is the loadout source a list lives in.
func (s *Sources) of(list string) *Source {
	return map[string]*Source{
		"outfits": &s.Outfits, "grimoires": &s.Grimoires, "runes": &s.Runes,
		"talismans": &s.Talismans, "champions": &s.Champions, "cosmetics": &s.Cosmetics,
	}[list]
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func validSpells(t *testing.T) []byte  { return readFile(t, spellsPath) }
func validIslands(t *testing.T) []byte { return readFile(t, islandsPath) }

func mutateSpells(t *testing.T, mutate func(map[string]any)) []byte {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(validSpells(t), &doc); err != nil {
		t.Fatal(err)
	}
	mutate(doc)
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// mutateAt edits one item of a shipped list file.
func mutateAt(t *testing.T, path, list string, index int, mutate func(map[string]any)) []byte {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(readFile(t, path), &doc); err != nil {
		t.Fatal(err)
	}
	mutate(doc[list].([]any)[index].(map[string]any))
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// mutateFirst edits the first item of a shipped list file.
func mutateFirst(t *testing.T, path, list string, mutate func(map[string]any)) []byte {
	t.Helper()
	return mutateAt(t, path, list, 0, mutate)
}

func spell(doc map[string]any, id string) map[string]any {
	return doc["spells"].(map[string]any)[id].(map[string]any)
}

func assertProblem(t *testing.T, err error, file, field, reason string) {
	t.Helper()
	if err == nil {
		t.Fatalf("Parse accepted the file, want a problem with %s", field)
	}
	want := file + ": " + field + ": "
	for _, line := range strings.Split(err.Error(), "\n") {
		if strings.HasPrefix(line, want) && strings.Contains(line, reason) {
			return
		}
	}
	t.Errorf("no problem reported as %q...%q in:\n%v", want, reason, err)
}
