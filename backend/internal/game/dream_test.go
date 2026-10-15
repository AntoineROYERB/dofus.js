package game

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"game-server/internal/types"
)

// dreamFight seats one player carrying boons and one monster, under the
// shipped content, and plays nothing yet.
func dreamFight(t *testing.T, seed int64, twists *Twists, boons []string, monsters ...string) *Game {
	t.Helper()
	cat := shippedContent(t)
	g := NewWithOptions(Options{Seed: seed, TurnDuration: time.Hour, Content: &cat, Seats: 1 + len(monsters), Twists: twists})
	if err := g.AddPlayerSeated("p", "P", look("Dreamer"), Seat{Team: TeamParty, Boons: boons}); err != nil {
		t.Fatalf("AddPlayerSeated: %v", err)
	}
	for _, m := range monsters {
		if _, err := g.AddBotOf(BotSpec{Monster: m, Team: TeamDream, Mode: BotStandsStill}); err != nil {
			t.Fatalf("AddBotOf(%s): %v", m, err)
		}
	}
	return g
}

func TestAMonsterFightsWithItsOwnSheet(t *testing.T) {
	g := dreamFight(t, 1, nil, nil, "caillou_2")
	cat := g.catalogue
	sheet, _ := cat.DreamMonster("caillou_2")
	bot := g.Snapshot().Players["bot-2"]
	c := bot.Character
	if c.Name != "Caillou" || c.Color != sheet.Color || bot.Monster != "caillou_2" || bot.Team != TeamDream {
		t.Fatalf("seated as %q in %s (monster %q, team %q), want Caillou in %s", c.Name, c.Color, bot.Monster, bot.Team, sheet.Color)
	}
	if c.MaxHealth != sheet.Health || c.MaxActionPoints != sheet.ActionPoints || c.MaxMovementPoints != sheet.MovementPoints {
		t.Fatalf("stats %d/%d/%d, want the sheet's %d/%d/%d", c.MaxHealth, c.MaxActionPoints, c.MaxMovementPoints,
			sheet.Health, sheet.ActionPoints, sheet.MovementPoints)
	}
	if len(bot.SpellBar) != len(sheet.Bar) || bot.SpellBar[0] != sheet.Bar[0] {
		t.Fatalf("bar %v, want the sheet's %v", bot.SpellBar, sheet.Bar)
	}
}

func TestBoonsChangeNumbersAndSpells(t *testing.T) {
	plain := dreamFight(t, 1, nil, nil, "caillou").Snapshot().Players["p"]
	blessed := dreamFight(t, 1, nil, []string{"vigor", "vigor", "focus", "long-arm", "quick-hands", "wake-up"}, "caillou").Snapshot()
	p := blessed.Players["p"]

	if p.Character.MaxHealth != plain.Character.MaxHealth+20 {
		t.Errorf("two Vigors: max health %d, want %d", p.Character.MaxHealth, plain.Character.MaxHealth+20)
	}
	if p.Character.MaxActionPoints != plain.Character.MaxActionPoints+1 {
		t.Errorf("Focus: %d AP, want %d", p.Character.MaxActionPoints, plain.Character.MaxActionPoints+1)
	}
	if len(p.Boons) != 6 {
		t.Errorf("boons on the wire %v, want all six", p.Boons)
	}

	basic := blessed.Spells[p.SpellBar[0]]
	original := blessed.Spells[plain.SpellBar[0]]
	if basic.BaseID != original.ID || basic.ID == original.ID {
		t.Fatalf("the basic attack is %d (from %d); a changed spell is a spell of its own made from %d", basic.ID, basic.BaseID, original.ID)
	}
	if basic.APCost != max(1, original.APCost-1) {
		t.Errorf("Quick Hands: basic attack costs %d, want %d", basic.APCost, max(1, original.APCost-1))
	}
	if original.Range >= 2 && basic.Range != original.Range+1 {
		t.Errorf("Long Arm: basic attack reaches %d, want %d", basic.Range, original.Range+1)
	}
	if last := p.SpellBar[len(p.SpellBar)-1]; blessed.Spells[last].Special != types.SpecialRevive {
		t.Errorf("Wake Up is not on the bar: %v", p.SpellBar)
	}
	if _, ok := p.Spells[p.SpellBar[0]]; !ok {
		t.Errorf("the changed basic attack has no state to be cast with")
	}
}

func TestSharpenedRaisesEveryHit(t *testing.T) {
	s := scaleDamage(types.Spell{Damage: 6, CriticalDamage: 8}, 10)
	if s.Damage != 7 || s.CriticalDamage != 9 {
		t.Fatalf("10%% on 6/8 gave %d/%d, want 7/9: a small spell rounds up its share", s.Damage, s.CriticalDamage)
	}
}

func TestAnUnknownBoonIsRefused(t *testing.T) {
	cat := shippedContent(t)
	g := NewWithOptions(Options{Seed: 1, Content: &cat, Seats: 2})
	if err := g.AddPlayerSeated("p", "P", look("Dreamer"), Seat{Team: TeamParty, Boons: []string{"wings"}}); !errors.Is(err, ErrUnknownBoon) {
		t.Fatalf("got %v, want ErrUnknownBoon", err)
	}
}

func TestTwistsAreLaidAndRecorded(t *testing.T) {
	twists := &Twists{AP: 1, MP: -1, NoCover: true, Terrain: []TerrainTwist{{Kind: types.TerrainFire, Pattern: types.PatternScatter, Count: 6}}}
	g := dreamFight(t, 4, twists, nil, "caillou")
	snap := g.Snapshot()
	if len(snap.Obstacles) != 0 {
		t.Errorf("Open Field dealt %d cover", len(snap.Obstacles))
	}
	fire := 0
	for _, cell := range snap.Terrain {
		if cell.Kind == types.TerrainFire {
			fire++
		}
	}
	if fire != 6 {
		t.Errorf("Burning Ground laid %d fire, want 6", fire)
	}
	plain := dreamFight(t, 4, nil, nil, "caillou").Snapshot().Players["p"].Character
	c := snap.Players["p"].Character
	if c.MaxActionPoints != plain.MaxActionPoints+1 || c.MaxMovementPoints != plain.MaxMovementPoints-1 {
		t.Errorf("Heavy Limbs: %d AP %d MP, want %d and %d", c.MaxActionPoints, c.MaxMovementPoints, plain.MaxActionPoints+1, plain.MaxMovementPoints-1)
	}
	rec := g.Recording()
	if rec.Twists == nil || !rec.Twists.NoCover {
		t.Fatalf("the recording lost the twists: %+v", rec.Twists)
	}
	encoded, _ := json.Marshal(rec)
	var back Recording
	if err := json.Unmarshal(encoded, &back); err != nil {
		t.Fatal(err)
	}
	replayed, err := replayUnder(back, g)
	if err != nil {
		t.Fatalf("replay: %v", err)
	}
	want, _ := json.Marshal(snap)
	got, _ := json.Marshal(replayed.Snapshot())
	if string(want) != string(got) {
		t.Fatalf("a fight with twists did not replay the way it was dealt:\n%s\n%s", want, got)
	}
}

// partyOfTwo is two players, one carrying Wake Up, against one monster, with
// the fight started and everyone where the test wants them.
func partyOfTwo(t *testing.T, healerBoons ...string) *Game {
	t.Helper()
	cat := shippedContent(t)
	g := NewWithOptions(Options{Seed: 3, TurnDuration: time.Hour, Content: &cat, Seats: 3})
	if err := g.AddPlayerSeated("a", "A", look("Healer"), Seat{Team: TeamParty, Boons: healerBoons}); err != nil {
		t.Fatal(err)
	}
	if err := g.AddPlayerSeated("b", "B", look("Fallen"), Seat{Team: TeamParty}); err != nil {
		t.Fatal(err)
	}
	if _, err := g.AddBotOf(BotSpec{Monster: "caillou", Team: TeamDream, Mode: BotStandsStill}); err != nil {
		t.Fatal(err)
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	for id, pos := range map[string]types.Position{"a": {X: 0, Y: 0}, "b": {X: 0, Y: 2}, "bot-3": {X: 5, Y: 0}} {
		p := g.players[id]
		placed := pos
		p.Character.Position = &placed
		p.HasPositioned = true
		g.players[id] = p
	}
	g.obstacles = map[types.Position]bool{}
	g.ground = nil
	g.terrain = nil
	g.turnOrder = []string{"a", "bot-3", "b"}
	g.beginPlayLocked()
	return g
}

func wakeUpKey(t *testing.T, g *Game, id string) int {
	t.Helper()
	snap := g.Snapshot()
	for _, key := range snap.Players[id].SpellBar {
		if snap.Spells[key].Special == types.SpecialRevive {
			return snap.Spells[key].ID
		}
	}
	t.Fatalf("%s carries no Wake Up", id)
	return 0
}

func TestWakeUpStandsAFallenAllyBackUpOnce(t *testing.T) {
	g := partyOfTwo(t, "wake-up")
	wake := wakeUpKey(t, g, "a")

	if err := g.CastSpell("a", wake, types.Position{X: 0, Y: 2}); !errors.Is(err, ErrNoFallenAlly) {
		t.Fatalf("waking someone standing: %v, want ErrNoFallenAlly", err)
	}
	g.mu.Lock()
	g.damageLocked("b", 10_000)
	over := g.checkGameOverLocked()
	g.mu.Unlock()
	if over {
		t.Fatal("the fight ended with one of the party still standing")
	}
	if err := g.CastSpell("a", wake, types.Position{X: 5, Y: 0}); err == nil {
		t.Fatal("Wake Up was cast on a living enemy")
	}
	if err := g.CastSpell("a", wake, types.Position{X: 0, Y: 2}); err != nil {
		t.Fatalf("Wake Up on the fallen ally: %v", err)
	}
	b := g.Snapshot().Players["b"].Character
	if !b.IsAlive || b.Health != b.MaxHealth*ReviveHealth/100 {
		t.Fatalf("after Wake Up: alive %v at %d/%d, want standing at %d%%", b.IsAlive, b.Health, b.MaxHealth, ReviveHealth)
	}

	g.mu.Lock()
	g.damageLocked("b", 10_000)
	p := g.players["a"]
	p.Character.ActionPoints = 12
	g.players["a"] = p
	g.mu.Unlock()
	if err := g.CastSpell("a", wake, types.Position{X: 0, Y: 2}); !errors.Is(err, ErrSpentThisFight) {
		t.Fatalf("a second Wake Up in the same fight: %v, want ErrSpentThisFight", err)
	}
}

func TestSecondWindCatchesAFallOnce(t *testing.T) {
	g := partyOfTwo(t, "second-wind")
	g.mu.Lock()
	g.damageLocked("a", 10_000)
	first := g.players["a"]
	g.damageLocked("a", 10_000)
	second := g.players["a"]
	g.mu.Unlock()
	if !first.Character.IsAlive || first.Character.Health != 1 || !first.SecondWindSpent {
		t.Fatalf("first fall: alive %v at %d (spent %v), want standing at 1", first.Character.IsAlive, first.Character.Health, first.SecondWindSpent)
	}
	if second.Character.IsAlive {
		t.Fatal("Second Wind caught a second fall")
	}
}

func TestThickSkinTakesAPointOffEveryHit(t *testing.T) {
	g := partyOfTwo(t, "thick-skin", "thick-skin")
	g.mu.Lock()
	before := g.players["a"].Character.Health
	dealt := g.damageLocked("a", 10)
	g.mu.Unlock()
	if dealt != 8 || g.Snapshot().Players["a"].Character.Health != before-8 {
		t.Fatalf("a hit of 10 through two Thick Skins dealt %d, want 8", dealt)
	}
}

func TestOverflowCarriesWhatWasLeft(t *testing.T) {
	g := partyOfTwo(t, "overflow")
	full := g.Snapshot().Players["a"].Character.ActionPoints
	mustEndTurn(t, g) // a ends with everything unspent
	mustEndTurn(t, g) // the monster
	mustEndTurn(t, g) // b
	if got := g.Snapshot().Players["a"].Character.ActionPoints; got != full+2 {
		t.Fatalf("after a turn with all AP left, %d AP, want %d: two carry over", got, full+2)
	}
}

func TestEarlyUltimateCanBeCastOnTheFirstTurn(t *testing.T) {
	g := partyOfTwo(t, "early-ultimate")
	snap := g.Snapshot()
	ultimate := snap.Spells[snap.Players["a"].SpellBar[4]]
	if !ultimate.Ultimate {
		t.Fatalf("slot 5 is %s, not an ultimate", ultimate.Name)
	}
	g.mu.Lock()
	p := g.players["a"]
	p.Character.ActionPoints = 12
	g.players["a"] = p
	g.mu.Unlock()
	err := g.CastSpell("a", ultimate.ID, types.Position{X: 5, Y: 0})
	if errors.Is(err, ErrUltimateNotReady) {
		t.Fatal("Early Ultimate still waited for turn 2")
	}
}

func TestDreamShieldCoversTheWholeParty(t *testing.T) {
	g := partyOfTwo(t, "dream-shield")
	snap := g.Snapshot()
	for _, id := range []string{"a", "b"} {
		if effectTotal(snap.Players[id].Character, types.EffectShield) < 3 {
			t.Errorf("%s started unshielded: %+v", id, snap.Players[id].Character.Effects)
		}
	}
	if effectTotal(snap.Players["bot-3"].Character, types.EffectShield) != 0 {
		t.Error("Dream Shield shielded the monsters too")
	}
}

func TestSharedStrengthLendsAPToAlliesNearby(t *testing.T) {
	g := partyOfTwo(t, "shared-strength")
	g.mu.Lock()
	defer g.mu.Unlock()
	if extra := g.sharedAPLocked("b"); extra != 1 {
		t.Fatalf("an ally two cells away gets %d AP from Shared Strength, want 1", extra)
	}
	p := g.players["b"]
	far := types.Position{X: 0, Y: 6}
	p.Character.Position = &far
	g.players["b"] = p
	if extra := g.sharedAPLocked("b"); extra != 0 {
		t.Fatalf("an ally six cells away gets %d AP, want none", extra)
	}
}
