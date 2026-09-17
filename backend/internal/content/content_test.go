package content

import (
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"testing"

	"game-server/internal/config"
)

// The board is a diamond of radius 7; internal/game hands in the same bound.
var testBounds = Bounds{MaxRange: 14}

const (
	spellsPath  = "../../config/spells.json"
	classesPath = "../../config/classes.json"
	balancePath = "../../config/balance.json"
)

// shippedCatalogue loads the files exactly as the server does at startup.
func shippedCatalogue(t *testing.T) Catalogue {
	t.Helper()
	cat, err := Load(spellsPath, classesPath, config.LoadBalance(balancePath), testBounds)
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

// shippedBarSize is how many spells a shipped class carries. Eight was too
// many to learn in a first fight; five, each doing something the others do
// not, is the design.
const shippedBarSize = 5

func TestEveryShippedClassCarriesFiveSpells(t *testing.T) {
	for _, class := range shippedCatalogue(t).Classes {
		if len(class.Spells) != shippedBarSize {
			t.Errorf("%s has %d spells, every class should carry %d", class.ID, len(class.Spells), shippedBarSize)
		}
	}
}

func TestEveryShippedClassCanAffordItsWholeBar(t *testing.T) {
	cat := shippedCatalogue(t)
	for _, class := range cat.Classes {
		for _, id := range class.Spells {
			spell, ok := cat.Spells[id]
			if !ok {
				t.Errorf("%s lists spell %s, which does not exist", class.ID, id)
				continue
			}
			if spell.APCost < 1 || spell.APCost > class.ActionPoints {
				t.Errorf("%s: %s costs %d AP, the class has %d", class.ID, spell.Name, spell.APCost, class.ActionPoints)
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

// The elemental identities are the design, so they are checked as such:
// every spell belongs to exactly one class and is of that class's element,
// every class has one ultimate, and no two spells on a bar play the same
// role — a spell that only repeats another is one more thing to learn for
// nothing.
func TestShippedClassesKeepTheirElementalIdentity(t *testing.T) {
	cat := shippedCatalogue(t)
	holders := map[string]int{}
	for _, class := range cat.Classes {
		for _, id := range class.Spells {
			holders[id]++
		}
	}

	elements := map[string]bool{}
	for _, class := range cat.Classes {
		if elements[class.Element] {
			t.Errorf("%s is a second %s class; each class is one element's identity", class.ID, class.Element)
		}
		elements[class.Element] = true

		ultimates := 0
		roles := map[string]string{}
		for _, id := range class.Spells {
			spell := cat.Spells[id]
			if holders[id] != 1 {
				t.Errorf("%s shares %s with another class; every spell is one class's own", class.ID, spell.Name)
			}
			if spell.Element != class.Element {
				t.Errorf("%s carries %s, a %s spell, not %s", class.ID, spell.Name, spell.Element, class.Element)
			}
			if spell.Ultimate {
				ultimates++
			}
			if other, dup := roles[spell.Role]; dup {
				t.Errorf("%s: %s and %s both play the %q role", class.ID, other, spell.Name, spell.Role)
			}
			roles[spell.Role] = spell.Name
		}
		if ultimates != 1 {
			t.Errorf("%s has %d ultimates, want 1", class.ID, ultimates)
		}
	}

	for id := range cat.Spells {
		if holders[id] == 0 {
			t.Errorf("spell %s (%s) is on no class's bar", id, cat.Spells[id].Name)
		}
	}
}

// Every spell has to do something besides damage: change the target, the
// caster, or the board. Two spells that only hit for different numbers are
// the same spell.
func TestEveryShippedSpellDoesMoreThanDamage(t *testing.T) {
	for id, spell := range shippedCatalogue(t).Spells {
		if spell.Effect == nil && spell.Terrain == "" && spell.Zone == nil && spell.Push == 0 &&
			spell.GrantMP == 0 && spell.Special == "" && !spell.Relayed && !spell.Conducts {
			t.Errorf("spell %s (%s) only deals damage", id, spell.Name)
		}
	}
}

func TestShippedUnlockArcReachesEveryClass(t *testing.T) {
	cat := shippedCatalogue(t)
	unlocked := map[string]bool{}
	for progress := true; progress; {
		progress = false
		for _, class := range cat.Classes {
			if !unlocked[class.ID] && (class.UnlockedBy == "" || unlocked[class.UnlockedBy]) {
				unlocked[class.ID] = true
				progress = true
			}
		}
	}
	for _, class := range cat.Classes {
		if !unlocked[class.ID] {
			t.Errorf("%s can never be unlocked", class.ID)
		}
	}
}

func TestClassStatsFallBackToTheBalance(t *testing.T) {
	balance := config.Balance{Health: 77, ActionPoints: 9, MovementPoints: 2}
	cat, err := Parse("spells.json", validSpells(t), "classes.json", mutateClasses(t, func(c map[string]any) {
		delete(c, "health")
		c["movementPoints"] = 6
	}), balance, testBounds)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	got := cat.Classes[0]
	if got.Health != 77 || got.ActionPoints != 9 || got.MovementPoints != 6 {
		t.Errorf("stats = %d/%d/%d, want 77/9/6 (health and AP from the balance, MP from the class)",
			got.Health, got.ActionPoints, got.MovementPoints)
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
		{"self spell with a range", func(s map[string]any) { spell(s, "9")["range"] = 3 }, `spells["9"].range`, "must be 0"},
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
			_, err := Parse("config/spells.json", data, "config/classes.json", validClasses(t), config.DefaultBalance, testBounds)
			assertProblem(t, err, "config/spells.json", tc.field, tc.reason)
		})
	}
}

func TestMalformedClassesAreRefused(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(class map[string]any)
		field  string
		reason string
	}{
		{"unknown spell", func(c map[string]any) { c["spells"] = []any{"1", "999"} }, "classes[0].spells[1]", `unknown spell "999"`},
		{"spell twice on the bar", func(c map[string]any) { c["spells"] = []any{"1", "1"} }, "classes[0].spells[1]", "on the bar twice"},
		{"bar too long", func(c map[string]any) {
			c["spells"] = []any{"1", "2", "3", "4", "5", "6", "7", "8", "9"}
		}, "classes[0].spells", "holds 1 to 8"},
		{"empty bar", func(c map[string]any) { c["spells"] = []any{} }, "classes[0].spells", "holds 1 to 8"},
		{"spell costing more than the class has", func(c map[string]any) { c["actionPoints"] = 3 }, "classes[0].spells[2]", "more than the class's 3"},
		{"no passive", func(c map[string]any) { c["passive"] = " " }, "classes[0].passive", "must not be empty"},
		{"melee bonus out of range", func(c map[string]any) { c["meleeBonus"] = -5 }, "classes[0].meleeBonus", "between 0 and 200"},
		{"two ultimates", func(c map[string]any) { c["spells"] = []any{"5", "10"} }, "classes[0].spells", "at most one"},
		{"unknown element", func(c map[string]any) { c["element"] = "Void" }, "classes[0].element", `unknown element "Void"`},
		{"palette not hex", func(c map[string]any) {
			c["palette"] = map[string]any{"primary": "bg-red-500", "secondary": "#ffffff"}
		}, "classes[0].palette.primary", "#rrggbb"},
		{"zero health", func(c map[string]any) { c["health"] = 0 }, "classes[0].health", "at least 1"},
		{"one line of flavour", func(c map[string]any) {
			c["opponent"] = map[string]any{"name": "Nobody", "lines": []any{"only one"}}
		}, "classes[0].opponent.lines", "want 2"},
		{"unlocked by an unknown class", func(c map[string]any) { c["unlockedBy"] = "ghost" }, "classes[0].unlockedBy", `unknown class "ghost"`},
		{"misspelt field", func(c map[string]any) { c["spels"] = []any{"1"} }, "(document)", `unknown field "spels"`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data := mutateClasses(t, tc.mutate)
			_, err := Parse("config/spells.json", validSpells(t), "config/classes.json", data, config.DefaultBalance, testBounds)
			assertProblem(t, err, "config/classes.json", tc.field, tc.reason)
		})
	}
}

func TestDuplicateClassIDsAreRefused(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal(validClasses(t), &doc); err != nil {
		t.Fatal(err)
	}
	classes := doc["classes"].([]any)
	classes[1].(map[string]any)["id"] = classes[0].(map[string]any)["id"]
	data, _ := json.Marshal(doc)

	_, err := Parse("config/spells.json", validSpells(t), "config/classes.json", data, config.DefaultBalance, testBounds)
	assertProblem(t, err, "config/classes.json", "classes[1].id", "duplicate id")
}

func TestUnlockLoopsAreRefused(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal(validClasses(t), &doc); err != nil {
		t.Fatal(err)
	}
	// Close the chain on itself: the first class now waits on the last, and
	// every class waits on the one before it.
	classes := doc["classes"].([]any)
	last := classes[len(classes)-1].(map[string]any)["id"]
	classes[0].(map[string]any)["unlockedBy"] = last
	data, _ := json.Marshal(doc)

	_, err := Parse("config/spells.json", validSpells(t), "config/classes.json", data, config.DefaultBalance, testBounds)
	assertProblem(t, err, "config/classes.json", "classes", "no opponent can ever be challenged")
}

func TestEveryProblemIsReportedAtOnce(t *testing.T) {
	data := mutateSpells(t, func(s map[string]any) {
		spell(s, "1")["APCost"] = 0
		spell(s, "2")["areaOfEffect"] = "donut"
	})
	_, err := Parse("config/spells.json", data, "config/classes.json", validClasses(t), config.DefaultBalance, testBounds)
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
	_, err := Load("nope/spells.json", classesPath, config.DefaultBalance, testBounds)
	if err == nil || !strings.Contains(err.Error(), "nope/spells.json") {
		t.Errorf("error = %v, want it to name the missing file", err)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func validSpells(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(spellsPath)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func validClasses(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(classesPath)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

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

// mutateClasses edits the first class of the shipped file.
func mutateClasses(t *testing.T, mutate func(map[string]any)) []byte {
	t.Helper()
	var doc map[string]any
	if err := json.Unmarshal(validClasses(t), &doc); err != nil {
		t.Fatal(err)
	}
	mutate(doc["classes"].([]any)[0].(map[string]any))
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return data
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
