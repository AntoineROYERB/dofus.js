package game

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"game-server/internal/content"
	"game-server/internal/types"
)

func lookIn(name string, set types.Loadout) types.CharacterAppearance {
	a := look(name)
	a.Loadout = set
	return a
}

// otherChampion is any shipped champion that is not the default, so a test
// can tell "picked" from "fell back".
func otherChampion(t *testing.T) types.Champion {
	t.Helper()
	cat := Content()
	if len(cat.Champions) < 2 {
		t.Skip("the shipped content has a single champion")
	}
	return cat.Champions[1]
}

func kitFor(t *testing.T, set types.Loadout) types.Kit {
	t.Helper()
	kit, err := Content().Kit(set)
	if err != nil {
		t.Fatalf("Kit(%+v): %v", set, err)
	}
	return kit
}

func TestPickedLoadoutDecidesStatsAndBar(t *testing.T) {
	champion := otherChampion(t)
	kit := kitFor(t, champion.Set)
	g := New()
	if err := g.AddPlayer("a", "User-a", lookIn("Alice", champion.Set)); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}

	p := g.Snapshot().Players["a"]
	c := p.Character
	g2 := kit.Grimoire
	if c.Loadout != champion.Set || c.Health != g2.Health || c.ActionPoints != g2.ActionPoints || c.MovementPoints != g2.MovementPoints {
		t.Errorf("character = %+v, want the %s grimoire's stats", c, g2.ID)
	}
	want := append(append([]string{kit.Outfit.BasicAttack}, g2.Spells...), kit.Talisman.Ultimate)
	if !reflect.DeepEqual(p.SpellBar, want) {
		t.Errorf("spell bar = %v, want basic attack, grimoire, ultimate: %v", p.SpellBar, want)
	}
	if len(p.Spells) != len(want) {
		t.Errorf("tracks %d spells, want only the %d on the bar", len(p.Spells), len(want))
	}
}

func TestAnEmptyLoadoutIsTheFirstChampionsSet(t *testing.T) {
	g := New()
	if err := g.AddPlayer("a", "User-a", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if got, want := g.Snapshot().Players["a"].Character.Loadout, Content().DefaultChampion().Set; got != want {
		t.Errorf("loadout = %+v, want the first champion's set %+v", got, want)
	}
}

// A loadout is free: any rune and any talisman go with any outfit, as long as
// the grimoire is of the outfit's element.
func TestItemsMixAcrossSets(t *testing.T) {
	cat := Content()
	first, second := cat.Champions[0].Set, otherChampion(t).Set
	mixed := types.Loadout{Outfit: first.Outfit, Grimoire: first.Grimoire, Rune: second.Rune, Talisman: second.Talisman}
	g := New()
	if err := g.AddPlayer("a", "User-a", lookIn("Alice", mixed)); err != nil {
		t.Fatalf("AddPlayer with a mixed loadout: %v", err)
	}
	bar := g.Snapshot().Players["a"].SpellBar
	if last := bar[len(bar)-1]; last != kitFor(t, second).Talisman.Ultimate {
		t.Errorf("the ultimate is %s, want the one the other talisman carries", last)
	}
}

func TestBadLoadoutsAreRefusedAndNotRecorded(t *testing.T) {
	cat := Content()
	set := cat.Champions[0].Set
	other := otherChampion(t).Set
	for name, tc := range map[string]struct {
		loadout types.Loadout
		want    error
	}{
		"unknown item":   {types.Loadout{Outfit: set.Outfit, Grimoire: "necromancer", Rune: set.Rune, Talisman: set.Talisman}, content.ErrUnknownItem},
		"incomplete":     {types.Loadout{Outfit: set.Outfit}, content.ErrIncompleteSet},
		"mixed elements": {types.Loadout{Outfit: set.Outfit, Grimoire: other.Grimoire, Rune: set.Rune, Talisman: set.Talisman}, content.ErrElementsMismatch},
	} {
		t.Run(name, func(t *testing.T) {
			g := New()
			if err := g.AddPlayer("a", "User-a", lookIn("Alice", tc.loadout)); !errors.Is(err, tc.want) {
				t.Fatalf("AddPlayer = %v, want %v", err, tc.want)
			}
			if g.PlayerCount() != 0 || g.CommandCount() != 0 {
				t.Errorf("a refused join left %d players and %d commands behind", g.PlayerCount(), g.CommandCount())
			}
		})
	}
	if _, err := New().AddBotChampion("necromancer", BotFights); !errors.Is(err, ErrUnknownChampion) {
		t.Errorf("AddBotChampion with an unknown champion = %v, want ErrUnknownChampion", err)
	}
}

func TestSpellsOffTheBarCannotBeCast(t *testing.T) {
	cat := Content()
	bar := kitFor(t, cat.DefaultChampion().Set).Bar
	onBar := map[string]bool{}
	for _, id := range bar {
		onBar[id] = true
	}
	foreign := ""
	for _, key := range sortedKeys(cat.Spells) {
		if !onBar[key] {
			foreign = key
			break
		}
	}
	if foreign == "" {
		t.Skip("the default set carries every spell")
	}

	g := twoPlayerGame(t)
	setBar(g, "a", bar...)

	spell := cat.Spells[foreign]
	if err := g.CastSpell("a", spell.ID, types.Position{X: 0, Y: 3}); !errors.Is(err, ErrSpellNotOnBar) {
		t.Errorf("casting %s from another set's bar = %v, want ErrSpellNotOnBar", spell.Name, err)
	}
}

func TestBotPlaysItsChampionInItsSet(t *testing.T) {
	champion := otherChampion(t)
	kit := kitFor(t, champion.Set)
	g := New()
	id, err := g.AddBotChampion(champion.ID, BotFights)
	if err != nil {
		t.Fatalf("AddBotChampion: %v", err)
	}
	p := g.Snapshot().Players[id]
	if p.Character.Loadout != champion.Set || p.Character.Name != champion.Name || p.Character.Color != kit.Outfit.Palette.Primary {
		t.Errorf("bot = %+v, want %s in its set, in %s", p.Character, champion.Name, kit.Outfit.Palette.Primary)
	}
	if !reflect.DeepEqual(p.SpellBar, kit.Bar) {
		t.Errorf("bot bar = %v, want %v", p.SpellBar, kit.Bar)
	}
}

func TestTwoBotsStartTheFightOnTheirOwn(t *testing.T) {
	g := New()
	for i := 0; i < 2; i++ {
		if _, err := g.AddBot(); err != nil {
			t.Fatalf("AddBot: %v", err)
		}
	}
	if g.Status() != types.StatusPlaying {
		t.Errorf("status = %q with two bots placed, want the fight under way", g.Status())
	}
}

func TestRematchKeepsTheLoadout(t *testing.T) {
	champion := otherChampion(t)
	kit := kitFor(t, champion.Set)
	g := New()
	if err := g.AddPlayer("a", "User-a", lookIn("Alice", champion.Set)); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if err := g.AddPlayer("b", "User-b", look("Bob")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}

	g.mu.Lock()
	p := g.players["a"]
	p.Character.Health = 1
	g.status = types.StatusGameOver
	g.players["a"] = p
	g.mu.Unlock()

	if err := g.Restart("a"); err != nil {
		t.Fatalf("Restart: %v", err)
	}
	got := g.Snapshot().Players["a"]
	if got.Character.Loadout != champion.Set || got.Character.Health != kit.Grimoire.Health {
		t.Errorf("after a rematch: %+v with %d health, want %+v with %d",
			got.Character.Loadout, got.Character.Health, champion.Set, kit.Grimoire.Health)
	}
	if !reflect.DeepEqual(got.SpellBar, kit.Bar) {
		t.Errorf("after a rematch: bar %v, want %v", got.SpellBar, kit.Bar)
	}
}

func TestLoadoutChoicesReplay(t *testing.T) {
	champion := otherChampion(t)
	g := NewWithOptions(Options{Seed: 11, TurnDuration: time.Minute})
	if _, err := g.AddBotChampion(champion.ID, BotFights); err != nil {
		t.Fatalf("AddBotChampion: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", lookIn("Alice", champion.Set)); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}

	replayed, err := Replay(g.Recording())
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if want, got := snapshotJSON(t, g), snapshotJSON(t, replayed); want != got {
		t.Errorf("replay lost the loadout choices\n original: %s\n replayed: %s", want, got)
	}
}

// The engine and the bot only ever look at the bar they were dealt, so a
// grimoire with a single spell still plays a whole match.
func TestAShortBarPlaysAWholeMatch(t *testing.T) {
	cat := Content()
	short := cat
	short.Grimoires = append([]types.Grimoire(nil), cat.Grimoires...)
	set := cat.DefaultChampion().Set
	for i := range short.Grimoires {
		if short.Grimoires[i].ID == set.Grimoire {
			short.Grimoires[i].Spells = short.Grimoires[i].Spells[:1]
		}
	}
	want := len(kitFor(t, set).Bar) - 2

	g := NewWithOptions(Options{Seed: 5, TurnDuration: time.Hour, Content: &short})
	for i := 0; i < 2; i++ {
		if _, err := g.AddBot(); err != nil {
			t.Fatalf("AddBot: %v", err)
		}
	}
	for step := 0; step < 5000 && g.Status() == types.StatusPlaying; step++ {
		g.PlayBotStep()
	}
	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q, want two short-barred bots to finish a match", g.Status())
	}
	for _, p := range g.Snapshot().Players {
		if len(p.SpellBar) != want {
			t.Errorf("player %s has bar %v, want %d spells", p.UserID, p.SpellBar, want)
		}
	}
}

func TestChangingAnItemChangesTheRulesFingerprint(t *testing.T) {
	cat := Content()
	for name, change := range map[string]func(*content.Catalogue){
		"grimoire": func(c *content.Catalogue) {
			c.Grimoires = append([]types.Grimoire(nil), c.Grimoires...)
			c.Grimoires[0].Health++
		},
		"rune": func(c *content.Catalogue) {
			c.Runes = append([]types.Rune(nil), c.Runes...)
			c.Runes[0].Effect.Value++
		},
		"outfit": func(c *content.Catalogue) {
			c.Outfits = append([]types.Outfit(nil), c.Outfits...)
			c.Outfits[0].BasicAttack = c.Outfits[1].BasicAttack
		},
		"talisman": func(c *content.Catalogue) {
			c.Talismans = append([]types.Talisman(nil), c.Talismans...)
			c.Talismans[0].Ultimate = c.Talismans[1].Ultimate
		},
	} {
		changed := cat
		change(&changed)
		if rulesFingerprint(cat) == rulesFingerprint(changed) {
			t.Errorf("a %s changed and the fingerprint did not, so old recordings would replay under new numbers", name)
		}
	}
}

// ---------------------------------------------------------------------------
// Runes
// ---------------------------------------------------------------------------

// runeCatalogue is the shipped content with one rune's effect swapped in, so
// a test can carry exactly the rule it is about.
func withRune(g *Game, id string, effect types.RuneEffect) {
	g.mu.Lock()
	defer g.mu.Unlock()
	cat := g.catalogue
	cat.Runes = []types.Rune{{ID: "test-rune", Name: "Test", Description: "A test rune.", Effect: effect}}
	g.catalogue = cat
	p := g.players[id]
	set := cat.DefaultChampion().Set
	set.Rune = "test-rune"
	p.Character.Loadout = set
	g.players[id] = p
}

func TestAnAnchorShortensPushes(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 0, Y: 1})
	withRune(g, "b", types.RuneEffect{Kind: types.RunePushResist, Value: 2})
	setBar(g, "a", "8") // Gale, 3 cells
	cast(t, g, "a", 8, types.Position{X: 0, Y: 1})
	if got := pos(g, "b"); got != (types.Position{X: 0, Y: 2}) {
		t.Errorf("anchored target ended at %+v, want pushed 3-2 = 1 cell to {0 2}", got)
	}
}

func TestAnOpportunistPressesAWoundedTarget(t *testing.T) {
	strike := func(wounded bool) int {
		g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 0, Y: 2})
		withRune(g, "a", types.RuneEffect{Kind: types.RuneFinisher, Value: 50, Threshold: 30})
		g.mu.Lock()
		p := g.players["b"]
		if wounded {
			p.Character.Health = p.Character.MaxHealth / 4
		}
		before := p.Character.Health
		g.players["b"] = p
		g.mu.Unlock()
		setBar(g, "a", "1")
		cast(t, g, "a", 1, types.Position{X: 0, Y: 2})
		return before - character(g, "b").Health
	}
	healthy, wounded := strike(false), strike(true)
	if wounded != healthy*150/100 {
		t.Errorf("a wounded target took %d, want %d: 50%% more than the %d a healthy one took", wounded, healthy*150/100, healthy)
	}
}

func TestMomentumMovesTheFirstTurnOnly(t *testing.T) {
	g := duel(t, types.Position{X: 0, Y: 0}, types.Position{X: 0, Y: 5})
	withRune(g, "b", types.RuneEffect{Kind: types.RuneOpeningMP, Value: 2})
	base := kitFor(t, Content().DefaultChampion().Set).Grimoire.MovementPoints

	mustEndTurn(t, g) // a ends; b starts its first turn
	if got := character(g, "b").MovementPoints; got != base+2 {
		t.Errorf("first turn: %d MP, want %d + 2", got, base)
	}
	mustEndTurn(t, g) // b ends; a plays round 2
	mustEndTurn(t, g) // b starts its second turn
	if got := character(g, "b").MovementPoints; got != base {
		t.Errorf("second turn: %d MP, want the grimoire's %d again", got, base)
	}
}

func TestASecondSkinShieldsTheOpening(t *testing.T) {
	cat := Content()
	custom := cat
	custom.Runes = append([]types.Rune(nil), cat.Runes...)
	custom.Runes = append(custom.Runes, types.Rune{ID: "test-skin", Name: "Skin", Description: "A shield.",
		Effect: types.RuneEffect{Kind: types.RuneOpeningShield, Value: 3, Duration: 2}})
	set := cat.DefaultChampion().Set
	set.Rune = "test-skin"

	g := NewWithOptions(Options{Seed: 3, TurnDuration: time.Hour, Content: &custom})
	if err := g.AddPlayer("a", "User-a", lookIn("Alice", set)); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if _, err := g.AddBot(); err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	for id, p := range g.Snapshot().Players {
		if g.Status() == types.StatusPositionCharacters && !p.HasPositioned && id == "a" {
			if err := g.ChooseInitialPosition("a", p.Character.InitialPositions[0]); err != nil {
				t.Fatalf("ChooseInitialPosition: %v", err)
			}
		}
	}
	if g.Status() != types.StatusPlaying {
		t.Fatalf("status = %q, want the fight under way", g.Status())
	}
	shield := 0
	for _, e := range character(g, "a").Effects {
		if e.Kind == types.EffectShield {
			shield = e.Value
		}
	}
	if shield != 3 {
		t.Errorf("shield = %d as the fight starts, want the rune's 3", shield)
	}
}
