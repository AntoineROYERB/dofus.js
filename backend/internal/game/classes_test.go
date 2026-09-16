package game

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"game-server/internal/content"
	"game-server/internal/types"
)

func lookAs(name, class string) types.CharacterAppearance {
	a := look(name)
	a.Class = class
	return a
}

// otherClass is any shipped class that is not the default, so a test can tell
// "picked" from "fell back".
func otherClass(t *testing.T) types.Class {
	t.Helper()
	cat := Content()
	if len(cat.Classes) < 2 {
		t.Skip("the shipped content has a single class")
	}
	return cat.Classes[1]
}

func TestPickedClassDecidesStatsAndBar(t *testing.T) {
	class := otherClass(t)
	g := New()
	if err := g.AddPlayer("a", "User-a", lookAs("Alice", class.ID)); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}

	p := g.Snapshot().Players["a"]
	c := p.Character
	if c.Class != class.ID || c.Health != class.Health || c.ActionPoints != class.ActionPoints || c.MovementPoints != class.MovementPoints {
		t.Errorf("character = %+v, want %s's stats", c, class.ID)
	}
	if !reflect.DeepEqual(p.SpellBar, class.Spells) {
		t.Errorf("spell bar = %v, want %v in the class's order", p.SpellBar, class.Spells)
	}
	if len(p.Spells) != len(class.Spells) {
		t.Errorf("tracks %d spells, want only the %d on the bar", len(p.Spells), len(class.Spells))
	}
	for _, id := range class.Spells {
		if _, ok := p.Spells[id]; !ok {
			t.Errorf("spell %s from the class is missing from the player's spells", id)
		}
	}
}

func TestUnknownClassIsRefusedAndNotRecorded(t *testing.T) {
	g := New()
	if err := g.AddPlayer("a", "User-a", lookAs("Alice", "necromancer")); !errors.Is(err, ErrUnknownClass) {
		t.Fatalf("AddPlayer with an unknown class = %v, want ErrUnknownClass", err)
	}
	if g.PlayerCount() != 0 || g.CommandCount() != 0 {
		t.Errorf("a refused join left %d players and %d commands behind", g.PlayerCount(), g.CommandCount())
	}
	if _, err := g.AddBotOfClass("necromancer"); !errors.Is(err, ErrUnknownClass) {
		t.Errorf("AddBotOfClass with an unknown class = %v, want ErrUnknownClass", err)
	}
}

func TestSpellsOffTheBarCannotBeCast(t *testing.T) {
	cat := Content()
	caster := cat.DefaultClass()
	onBar := map[string]bool{}
	for _, id := range caster.Spells {
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
		t.Skip("the default class carries every spell")
	}

	g := twoPlayerGame(t)
	g.mu.Lock()
	p := g.players["a"]
	p.Spells = freshSpellState(caster.Spells)
	p.SpellBar = caster.Spells
	g.players["a"] = p
	g.mu.Unlock()

	spell := cat.Spells[foreign]
	if err := g.CastSpell("a", spell.ID, types.Position{X: 0, Y: 3}); !errors.Is(err, ErrSpellNotOnBar) {
		t.Errorf("casting %s from another class's bar = %v, want ErrSpellNotOnBar", spell.Name, err)
	}
}

func TestBotPlaysItsClassOpponent(t *testing.T) {
	class := otherClass(t)
	g := New()
	id, err := g.AddBotOfClass(class.ID)
	if err != nil {
		t.Fatalf("AddBotOfClass: %v", err)
	}
	p := g.Snapshot().Players[id]
	if p.Character.Class != class.ID || p.Character.Name != class.Opponent.Name || p.Character.Color != class.Palette.Primary {
		t.Errorf("bot = %+v, want %s's opponent %q in %s", p.Character, class.ID, class.Opponent.Name, class.Palette.Primary)
	}
	if !reflect.DeepEqual(p.SpellBar, class.Spells) {
		t.Errorf("bot bar = %v, want %v", p.SpellBar, class.Spells)
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

func TestRematchKeepsTheClass(t *testing.T) {
	class := otherClass(t)
	g := New()
	if err := g.AddPlayer("a", "User-a", lookAs("Alice", class.ID)); err != nil {
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
	if got.Character.Class != class.ID || got.Character.Health != class.Health {
		t.Errorf("after a rematch: class %s with %d health, want %s with %d",
			got.Character.Class, got.Character.Health, class.ID, class.Health)
	}
	if !reflect.DeepEqual(got.SpellBar, class.Spells) {
		t.Errorf("after a rematch: bar %v, want %v", got.SpellBar, class.Spells)
	}
}

func TestClassChoicesReplay(t *testing.T) {
	class := otherClass(t)
	g := NewWithOptions(Options{Seed: 11, TurnDuration: time.Minute})
	if _, err := g.AddBotOfClass(class.ID); err != nil {
		t.Fatalf("AddBotOfClass: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", lookAs("Alice", class.ID)); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}

	replayed, err := Replay(g.Recording())
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if want, got := snapshotJSON(t, g), snapshotJSON(t, replayed); want != got {
		t.Errorf("replay lost the class choices\n original: %s\n replayed: %s", want, got)
	}
}

// A class need not fill every slot; the engine and the bot only ever look at
// the bar they were dealt.
func TestAClassWithAShortBarPlaysAWholeMatch(t *testing.T) {
	cat := Content()
	short := cat.DefaultClass()
	short.ID = "apprentice"
	short.Spells = []string{"1"} // Ember only
	custom := content.Catalogue{Spells: cat.Spells, Classes: []types.Class{short}}

	g := NewWithOptions(Options{Seed: 5, TurnDuration: time.Hour, Content: &custom})
	for i := 0; i < 2; i++ {
		if _, err := g.AddBot(); err != nil {
			t.Fatalf("AddBot: %v", err)
		}
	}
	for step := 0; step < 5000 && g.Status() == types.StatusPlaying; step++ {
		g.PlayBotStep()
	}
	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q, want two one-spell bots to finish a match", g.Status())
	}
	for _, p := range g.Snapshot().Players {
		if len(p.SpellBar) != 1 || len(p.Spells) != 1 {
			t.Errorf("player %s has bar %v, want just Ember", p.UserID, p.SpellBar)
		}
	}
}

func TestChangingAClassChangesTheRulesFingerprint(t *testing.T) {
	cat := Content()
	changed := content.Catalogue{Spells: cat.Spells, Classes: append([]types.Class(nil), cat.Classes...)}
	changed.Classes[0].Health++

	if rulesFingerprint(cat) == rulesFingerprint(changed) {
		t.Error("a class's health changed and the fingerprint did not, so old recordings would replay under new numbers")
	}
}
