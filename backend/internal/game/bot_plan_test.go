package game

import (
	"errors"
	"reflect"
	"sort"
	"testing"
	"time"

	"game-server/internal/content"
	"game-server/internal/types"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// points sets what a character has left of its turn.
func points(g *Game, id string, ap, mp int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p := g.players[id]
	p.Character.ActionPoints, p.Character.MovementPoints = ap, mp
	g.players[id] = p
}

// playsAs makes a seated character a bot of a level, and a boss if one is
// named.
func playsAs(g *Game, id string, level BotLevel, boss string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p := g.players[id]
	p.IsBot, p.BotLevel, p.Boss = true, string(level), boss
	g.players[id] = p
}

// burning puts burns on a character.
func burning(g *Game, id string, stacks int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p := g.players[id]
	addBurn(&p.Character, stacks)
	g.players[id] = p
}

// decide is the bot's next step on the board as it sees it, unbent by noise.
func decide(g *Game, id string) BotAction {
	return decideBotAction(g.SnapshotFor(id), id, 0)
}

// ---------------------------------------------------------------------------
// It plans its turn rather than its next cast
// ---------------------------------------------------------------------------

func TestTheBotBurnsBeforeItDetonates(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	setBar(g, "a", "1", "3")
	// Room for a Kindle and a Combustion. Combustion hits as hard on its
	// own, but only the burn the Kindle leaves gives it something to set off.
	points(g, "a", 7, 0)

	action := decide(g, "a")
	if action.Kind != BotCast || action.SpellID != spellKindle {
		t.Fatalf("action = %+v, want Kindle first, so Combustion has a burn to set off", action)
	}
}

func TestTheBotPushesLast(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	setBar(g, "a", "7", "11")
	points(g, "a", 6, 0)

	// Hydro Cannon first would throw b three cells further, beyond
	// Lightning's range of five: the second cast would have nothing to hit.
	action := decide(g, "a")
	if action.Kind != BotCast || action.SpellID != spellLightning {
		t.Fatalf("action = %+v, want Lightning before the push", action)
	}
}

func TestTheBotLeapsInToHammer(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 5})
	asChampion(g, "a", "old-grund")
	setBar(g, "a", "16", "17")
	points(g, "a", 6, 0)

	action := decide(g, "a")
	if action.Kind != BotCast || action.SpellID != spellEarthleap {
		t.Fatalf("action = %+v, want a leap next to b", action)
	}
	if Distance(action.Target, types.Position{Y: 5}) != 1 {
		t.Errorf("leap lands on %+v, want next to b, where the hammer reaches", action.Target)
	}
}

// ---------------------------------------------------------------------------
// It reads the ground, and its reading agrees with the server's
// ---------------------------------------------------------------------------

// The planner works out where a walk ends without walking it. If it gets that
// wrong it plans the rest of its turn from the wrong cell, so its walks are
// held to the server's.
func TestTheBotKnowsWhereAWalkOnIceEnds(t *testing.T) {
	cases := []struct {
		name  string
		setUp func(g *Game)
		to    types.Position
	}{
		{"island ice", func(g *Game) {
			groundOn(g, GroundIce, nil, types.Position{X: 2, Y: 0})
		}, types.Position{X: 2, Y: 0}},
		{"spell ice", func(g *Game) {
			g.mu.Lock()
			g.placeTerrainLocked(types.Position{X: 1, Y: 0}, types.TerrainIce, "b")
			g.placeTerrainLocked(types.Position{X: 2, Y: 0}, types.TerrainIce, "b")
			g.mu.Unlock()
		}, types.Position{X: 1, Y: 0}},
		{"a trap on the way", func(g *Game) {
			g.mu.Lock()
			g.placeTerrainLocked(types.Position{X: 1, Y: 0}, types.TerrainTrap, "b")
			g.mu.Unlock()
		}, types.Position{X: 3, Y: 0}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := duel(t, types.Position{}, types.Position{Y: 6})
			tc.setUp(g)
			snap := g.SnapshotFor("a")
			b := readBoard(snap, "a", mindOf(snap.Players["a"], 0))
			predicted := b.walkEnd(types.Position{}, tc.to)

			move(t, g, "a", tc.to)
			if got := pos(g, "a"); got != predicted.end {
				t.Errorf("the bot expected to end on %+v, the server put it on %+v", predicted.end, got)
			}
		})
	}
}

func TestTheBotKnowsWhichPylonsWouldWallTheBoardOff(t *testing.T) {
	// A pocket of craters with one way in: a pylon in the doorway shuts it,
	// which the server refuses. Two windwalkers that did not know asked for
	// it every turn, and the fight never ended.
	g := duel(t, types.Position{}, types.Position{Y: 6})
	pocket := types.Position{X: -3, Y: 3}
	door := Neighbours(pocket)[0]
	g.mu.Lock()
	for _, n := range Neighbours(pocket)[1:] {
		g.placeTerrainLocked(n, types.TerrainCrater, "b")
	}
	g.mu.Unlock()

	snap := g.SnapshotFor("a")
	b := readBoard(snap, "a", mindOf(snap.Players["a"], 0))
	if !b.wallsIn(door) {
		t.Errorf("a pylon on the pocket's door %+v does not wall it in, the bot thinks", door)
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, cell := range boardCells() {
		if b.solid(cell) {
			continue
		}
		if got, want := b.wallsIn(cell), !g.staysConnectedLocked(cell); got != want {
			t.Errorf("a pylon on %+v: the bot says walls in = %v, the server %v", cell, got, want)
		}
	}
}

func TestTheBotDoesNotEndItsTurnInAcid(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 2})
	groundOn(g, GroundAcidPool, nil, types.Position{}, types.Position{X: -1}, types.Position{Y: -1})
	points(g, "a", 0, 3)

	action := decide(g, "a")
	if action.Kind != BotMove {
		t.Fatalf("action = %+v, want it to walk out of the acid", action)
	}
	snap := g.Snapshot()
	b := readBoard(snap, "a", mindOf(snap.Players["a"], 0))
	if end := b.walkEnd(types.Position{}, action.Target).end; b.groundKind(end) == GroundAcidPool {
		t.Errorf("it walked to %+v, still in the acid", end)
	}
}

func TestTheBotWalksThroughFireRatherThanStandInIt(t *testing.T) {
	// Ringed by fire, a bot that treated fire as a wall stood inside the ring
	// for the rest of the match. b is one cell beyond Kindle's reach.
	start := types.Position{Y: -1}
	g := duel(t, start, types.Position{Y: 7})
	setBar(g, "a", "1")
	g.mu.Lock()
	for _, n := range Neighbours(start) {
		g.placeTerrainLocked(n, types.TerrainFire, "b")
	}
	g.mu.Unlock()

	if action := decide(g, "a"); action.Kind != BotMove {
		t.Errorf("action = %+v, want it to walk out through the fire to where Kindle reaches", action)
	}
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

func TestAHardBotEndsItsTurnOutOfReach(t *testing.T) {
	// a has spent its points; b is a brawler that leaps five and walks four,
	// so it reaches ten cells, and a is eight off with four to walk.
	start, brawler := types.Position{Y: -1}, types.Position{Y: 7}
	for _, tc := range []struct {
		level   BotLevel
		backOff bool
	}{{BotHard, true}, {BotNormal, false}} {
		t.Run(string(tc.level), func(t *testing.T) {
			g := duel(t, start, brawler)
			asChampion(g, "b", "old-grund")
			setBar(g, "b", "16", "17")
			playsAs(g, "a", tc.level, "")
			points(g, "a", 0, 4)

			action := decide(g, "a")
			backedOff := action.Kind == BotMove && Distance(action.Target, brawler) > Distance(start, brawler)
			if backedOff != tc.backOff {
				t.Errorf("%s bot chose %+v; backed off = %v, want %v", tc.level, action, backedOff, tc.backOff)
			}
		})
	}
}

func TestParseBotLevelTakesWhatTheWireCanSay(t *testing.T) {
	for _, s := range []string{"", "easy", "normal", "hard"} {
		if _, ok := ParseBotLevel(s); !ok {
			t.Errorf("ParseBotLevel(%q) refused", s)
		}
	}
	if _, ok := ParseBotLevel("nightmare"); ok {
		t.Error(`ParseBotLevel("nightmare") accepted`)
	}
}

// islands.json names the levels by string, and the content package checks
// them against its own list: the two lists have to be the same.
func TestTheLevelsTheContentNamesAreTheLevelsTheBotPlays(t *testing.T) {
	var fromContent, fromGame []string
	for level := range content.OpponentLevels {
		fromContent = append(fromContent, level)
	}
	for level := range levelTraitsOf {
		fromGame = append(fromGame, string(level))
	}
	sort.Strings(fromContent)
	sort.Strings(fromGame)
	if !reflect.DeepEqual(fromContent, fromGame) {
		t.Errorf("islands.json may name %v, the bot plays %v", fromContent, fromGame)
	}
}

func TestOpponentsGetHarderAcrossTheCampaign(t *testing.T) {
	rank := map[string]int{"easy": 0, "normal": 1, "hard": 2}
	islands := Content().Islands
	for i := 1; i < len(islands); i++ {
		if rank[islands[i].OpponentLevel] < rank[islands[i-1].OpponentLevel] {
			t.Errorf("%s fights at %s after %s fought at %s", islands[i].ID, islands[i].OpponentLevel,
				islands[i-1].ID, islands[i-1].OpponentLevel)
		}
	}
	if first, last := islands[0].OpponentLevel, islands[len(islands)-1].OpponentLevel; first != "easy" || last != "hard" {
		t.Errorf("the campaign runs from %s to %s, want easy to hard", first, last)
	}
}

func TestAnOpponentFightsAtItsIslandsLevel(t *testing.T) {
	for _, island := range Content().Islands {
		g := NewWithOptions(Options{Seed: 1, Island: island.ID})
		id, err := g.AddBotOf(BotSpec{})
		if err != nil {
			t.Fatalf("%s: AddBotOf: %v", island.ID, err)
		}
		if got := g.Snapshot().Players[id].BotLevel; got != island.OpponentLevel {
			t.Errorf("%s: opponent plays at %q, want the island's %q", island.ID, got, island.OpponentLevel)
		}
	}
	g := NewWithOptions(Options{Seed: 1})
	id, _ := g.AddBotOf(BotSpec{Level: BotHard})
	if got := g.Snapshot().Players[id].BotLevel; got != string(BotHard) {
		t.Errorf("an opponent asked to play hard plays %q", got)
	}
}

func TestAnUnknownLevelIsRefused(t *testing.T) {
	if _, err := New().AddBotOf(BotSpec{Level: "nightmare"}); !errors.Is(err, ErrUnknownBotLevel) {
		t.Errorf("AddBotOf(nightmare) = %v, want ErrUnknownBotLevel", err)
	}
}

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

// Every ruler in the bestiary is played by a profile of the same id, and
// every profile plays somebody: the sentence a player reads about a boss has
// to describe something the server actually does.
func TestEveryRulerHasAProfile(t *testing.T) {
	var rulers []string
	for _, m := range Content().Bestiary {
		if m.Rank != types.RankMonster {
			rulers = append(rulers, m.ID)
		}
	}
	sort.Strings(rulers)
	if profiles := BossProfileIDs(); !reflect.DeepEqual(rulers, profiles) {
		t.Errorf("the bestiary's rulers are %v, the server plays %v", rulers, profiles)
	}
}

func TestABossFightsInItsChampionsSetUnderItsOwnName(t *testing.T) {
	g := New()
	id, err := g.AddBotOf(BotSpec{Boss: "boss_kraken"})
	if err != nil {
		t.Fatalf("AddBotOf: %v", err)
	}
	p := g.Snapshot().Players[id]
	if p.Character.Loadout.Grimoire != "tidecaller" || p.Character.Name != "Kraken" || p.Boss != "boss_kraken" {
		t.Errorf("the Kraken carries the %s grimoire and is called %q (boss %q)", p.Character.Loadout.Grimoire, p.Character.Name, p.Boss)
	}

	if _, err := New().AddBotOf(BotSpec{Boss: "boss_nobody"}); !errors.Is(err, ErrUnknownBoss) {
		t.Errorf("an unknown boss: %v, want ErrUnknownBoss", err)
	}
	if _, err := New().AddBotOf(BotSpec{Boss: "caillou"}); !errors.Is(err, ErrUnknownBoss) {
		t.Errorf("a plain monster as a boss: %v, want ErrUnknownBoss", err)
	}
	if _, err := New().AddBotOf(BotSpec{Boss: "boss_kraken", Champion: "ashka"}); !errors.Is(err, ErrBossChampion) {
		t.Errorf("the Kraken in Ashka's set: %v, want ErrBossChampion", err)
	}
}

func TestTheAshKingWaitsForThreeBurns(t *testing.T) {
	for _, tc := range []struct {
		boss  string
		burns int
		want  int
	}{
		{"", 2, spellCombustion},                  // anyone else cashes two burns in
		{"legend_roi_cendre", 2, spellKindle},     // the Ash King piles on a third
		{"legend_roi_cendre", 3, spellCombustion}, // and then sets them off
	} {
		g := duel(t, types.Position{}, types.Position{Y: 4})
		setBar(g, "a", "1", "3")
		playsAs(g, "a", BotHard, tc.boss)
		burning(g, "b", tc.burns)
		points(g, "a", 4, 0)

		if action := decide(g, "a"); action.SpellID != tc.want {
			t.Errorf("boss %q against %d burns cast %+v, want spell %d", tc.boss, tc.burns, action, tc.want)
		}
	}
}

func TestMotherGloopDragsYouIntoHerAcid(t *testing.T) {
	for _, tc := range []struct {
		boss string
		want int
	}{{"", spellLightning}, {"boss_mere_gloop", spellGrapple}} {
		g := duel(t, types.Position{}, types.Position{Y: 4})
		asChampion(g, "a", "old-grund")
		// Pulled two cells, b lands on (0,2).
		groundOn(g, GroundAcidPool, nil, types.Position{Y: 2})
		setBar(g, "a", "7", "18")
		playsAs(g, "a", BotHard, tc.boss)
		points(g, "a", 3, 0)

		if action := decide(g, "a"); action.SpellID != tc.want {
			t.Errorf("boss %q cast %+v, want spell %d", tc.boss, action, tc.want)
		}
	}
}

func TestTheHeartOfWinterFreezesTheGroundUnderYou(t *testing.T) {
	for _, tc := range []struct {
		boss string
		want int
	}{{"", spellHydroCannon}, {"boss_coeur_hiver", spellFrozenGround}} {
		g := duel(t, types.Position{}, types.Position{Y: 4})
		setBar(g, "a", "11", "14")
		playsAs(g, "a", BotHard, tc.boss)
		points(g, "a", 3, 0)

		if action := decide(g, "a"); action.SpellID != tc.want {
			t.Errorf("boss %q cast %+v, want spell %d", tc.boss, action, tc.want)
		}
	}
}

func TestTheEyeOfTheSwarmNeverEndsItsTurnWithinReach(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 2})
	asChampion(g, "a", "sef")
	playsAs(g, "a", BotHard, "boss_oeil_nuee")
	points(g, "a", 0, 5)

	action := decide(g, "a")
	if action.Kind != BotMove || Distance(action.Target, types.Position{Y: 2}) < 5 {
		t.Errorf("the Eye chose %+v, want it at least five cells off", action)
	}
}

func TestMonolitheRaisesAPillarInYourLineOfFire(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 4})
	asChampion(g, "a", "old-grund")
	setBar(g, "a", "19")
	setBar(g, "b", "1", "3")
	playsAs(g, "a", BotNormal, "boss_monolithe")
	points(g, "a", 2, 0)
	// Rooted, b cannot walk round a pillar to see past it.
	g.mu.Lock()
	rooted := g.players["b"]
	applyEffect(&rooted.Character, types.Effect{Kind: types.EffectRoot, Value: 1, TurnsLeft: 2})
	g.players["b"] = rooted
	g.mu.Unlock()

	action := decide(g, "a")
	if action.Kind != BotCast || action.SpellID != spellPillar {
		t.Fatalf("Monolithe chose %+v, want a pillar", action)
	}
	if err := g.CastSpell("a", action.SpellID, action.Target); err != nil {
		t.Fatalf("the server refused the pillar: %v", err)
	}
	g.mu.RLock()
	defer g.mu.RUnlock()
	if HasLineOfSight(types.Position{Y: 4}, types.Position{}, g.blocksSightLocked) {
		t.Errorf("the pillar on %+v leaves b a line of sight", action.Target)
	}
}

// ---------------------------------------------------------------------------
// Whole matches
// ---------------------------------------------------------------------------

// playBots plays two server-played opponents against each other to the end
// and reports which seat won, "" for none.
func playBots(t *testing.T, seed int64, island string, a, b BotSpec) (winner string, g *Game) {
	t.Helper()
	// A fixed clock, so the commands' timestamps are the same every time too.
	clock := func() time.Time { return time.UnixMilli(0) }
	g = NewWithOptions(Options{Seed: seed, TurnDuration: time.Hour, Island: island, Clock: clock})
	first, err := g.AddBotOf(a)
	if err != nil {
		t.Fatalf("AddBotOf(%+v): %v", a, err)
	}
	second, err := g.AddBotOf(b)
	if err != nil {
		t.Fatalf("AddBotOf(%+v): %v", b, err)
	}
	for step := 0; g.Status() == types.StatusPlaying; step++ {
		if step >= stepLimit {
			t.Fatalf("seed %d: still playing after %d steps", seed, stepLimit)
		}
		g.PlayBotStep()
	}
	for id, seat := range map[string]string{first: "first", second: "second"} {
		if g.Snapshot().Players[id].Character.IsAlive {
			return seat, g
		}
	}
	return "", g
}

// The default opponent against itself is a coin toss: the seat it joins in
// and the initiative it rolls must not decide the fight.
func TestTheDefaultBotIsEvenWithItself(t *testing.T) {
	n := 8
	if testing.Short() {
		n = 3
	}
	champions := Content().Champions
	first, played := 0, 0
	for i, a := range champions {
		for j, b := range champions {
			for k := 0; k < n; k++ {
				seed := int64(3_000_000 + i*1_000 + j*100 + k)
				if w, _ := playBots(t, seed, "", BotSpec{Champion: a.ID}, BotSpec{Champion: b.ID}); w == "first" {
					first++
				}
				played++
			}
		}
	}
	rate := float64(first) / float64(played)
	t.Logf("the first seat wins %.0f%% of %d", rate*100, played)
	if rate < 0.40 || rate > 0.60 {
		t.Errorf("the first seat wins %.0f%% of the default bot's matches against itself, want about half", rate*100)
	}
}

// A player who plays well beats the easy opponent, whatever the champion: the
// hard bot stands in for them, each champion against itself so the set does
// not decide it.
func TestTheHardBotBeatsTheEasyOneReliably(t *testing.T) {
	n := 10
	if testing.Short() {
		n = 4
	}
	won, played := 0, 0
	for i, champion := range Content().Champions {
		for k := 0; k < n; k++ {
			hard, easy := BotSpec{Champion: champion.ID, Level: BotHard}, BotSpec{Champion: champion.ID, Level: BotEasy}
			// Each seat half the time, so initiative does not decide it either.
			seed := int64(4_000_000 + i*1_000 + k)
			if k%2 == 0 {
				if w, _ := playBots(t, seed, "", hard, easy); w == "first" {
					won++
				}
			} else if w, _ := playBots(t, seed, "", easy, hard); w == "second" {
				won++
			}
			played++
		}
	}
	rate := float64(won) / float64(played)
	t.Logf("hard beats easy in %.0f%% of %d", rate*100, played)
	if rate < 0.85 {
		t.Errorf("the hard bot beats the easy one %.0f%% of the time, want 85%% or more", rate*100)
	}
}

// The bot never draws from the game's own randomness: a replay applies its
// recorded commands without asking it again, and a draw taken while deciding
// would put every roll after it out of step. So a match between bots is the
// same match every time it is played from the same seed, and its recording
// replays to the same end — on an island, where the ground gives the bot the
// most to think about.
func TestABotMatchIsAPureFunctionOfItsSeed(t *testing.T) {
	for _, island := range []string{"ice", "fire", "air"} {
		a := BotSpec{Champion: "sef", Level: BotHard}
		b := BotSpec{Champion: "mother-brine", Level: BotEasy}
		_, once := playBots(t, 77, island, a, b)
		_, twice := playBots(t, 77, island, a, b)
		if !reflect.DeepEqual(once.Recording().Commands, twice.Recording().Commands) {
			t.Errorf("%s: the same seed played two different matches", island)
		}
		replayed, err := Replay(once.Recording())
		if err != nil {
			t.Fatalf("%s: Replay: %v", island, err)
		}
		if want, got := snapshotJSON(t, once), snapshotJSON(t, replayed); want != got {
			t.Errorf("%s: the replay ended somewhere else\n played:   %s\n replayed: %s", island, want, got)
		}
	}
}

func TestABossMatchReplays(t *testing.T) {
	_, g := playBots(t, 12, "fire", BotSpec{Boss: "legend_roi_cendre"}, BotSpec{Champion: "old-grund", Level: BotHard})
	replayed, err := Replay(g.Recording())
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if want, got := snapshotJSON(t, g), snapshotJSON(t, replayed); want != got {
		t.Errorf("the replay ended somewhere else\n played:   %s\n replayed: %s", want, got)
	}
	if p := replayed.Snapshot().Players["bot-1"]; p.Boss != "legend_roi_cendre" || p.BotLevel == "" {
		t.Errorf("the replayed boss is %q at level %q", p.Boss, p.BotLevel)
	}
}
