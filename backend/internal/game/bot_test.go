package game

import (
	"errors"
	"testing"
	"time"

	"game-server/internal/types"
)

func TestBotCastsTheStrongestSpellItCanAfford(t *testing.T) {
	g := twoPlayerGame(t)
	// Ranged spells only, so a leap into melee is not an option.
	setBar(g, "a", "1", "7", "11", "14")

	// "a" stands at (0,0), "b" at (0,3): within Geyser's range of 6, and
	// nothing else in reach hits as hard.
	action := DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotCast {
		t.Fatalf("action = %+v, want a cast", action)
	}
	if action.SpellID != 11 {
		t.Errorf("spell = %d, want 11 (Geyser, the most damaging affordable one)", action.SpellID)
	}
	if action.Target != (types.Position{X: 0, Y: 3}) {
		t.Errorf("target = %+v, want the enemy's cell", action.Target)
	}
}

func TestBotClosesTheDistanceWhenNothingIsInRange(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: -7, Y: 0},
		"b": {X: 7, Y: 0},
	}, "a", "b")
	// Only a plain spell on the bar: nothing to leap, relay or speed up with,
	// so walking is the only way to get anywhere.
	setBar(g, "a", "1")

	action := DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotMove {
		t.Fatalf("action = %+v, want a move", action)
	}
	// Closer on foot, around the cover the board was dealt — which is not
	// always closer as the crow flies.
	from, target := types.Position{X: -7, Y: 0}, types.Position{X: 7, Y: 0}
	g.mu.RLock()
	walk := walkingDistances(target, func(p types.Position) bool { return p != from && g.blocksMovementLocked(p) })
	g.mu.RUnlock()
	if before, after := walk[from], walk[action.Target]; after >= before {
		t.Errorf("move to %+v does not close the walk (%d -> %d)", action.Target, before, after)
	}
	if !InGrid(action.Target) {
		t.Errorf("move target %+v is off the board", action.Target)
	}
}

func TestBotEndsItsTurnWhenItCanDoNothing(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: -7, Y: 0},
		"b": {X: 7, Y: 0},
	}, "a", "b")

	// No action points and no movement points left.
	g.mu.Lock()
	p := g.players["a"]
	p.Character.ActionPoints = 0
	p.Character.MovementPoints = 0
	g.players["a"] = p
	g.mu.Unlock()

	if action := DecideBotAction(g.Snapshot(), "a"); action.Kind != BotEnd {
		t.Errorf("action = %+v, want the turn to end", action)
	}
}

func TestBotIgnoresDeadOpponents(t *testing.T) {
	g := playingGame(t, map[string]types.Position{
		"a": {X: 0, Y: 0},
		"b": {X: 0, Y: 2},
		"c": {X: 0, Y: 5},
	}, "a", "b", "c")

	g.mu.Lock()
	p := g.players["b"]
	p.Character.IsAlive = false
	g.players["b"] = p
	g.mu.Unlock()
	setBar(g, "a", "1", "7", "11", "14")

	action := DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotCast {
		t.Fatalf("action = %+v, want a cast", action)
	}
	if action.Target != (types.Position{X: 0, Y: 5}) {
		t.Errorf("target = %+v, want the living opponent at {0 5}", action.Target)
	}
}

// ---------------------------------------------------------------------------
// Bots inside a game
// ---------------------------------------------------------------------------

func TestAddBotJoinsReadyAndFlagged(t *testing.T) {
	g := New()
	id, err := g.AddBot()
	if err != nil {
		t.Fatalf("AddBot: %v", err)
	}

	p := g.Snapshot().Players[id]
	if !p.IsBot || !p.Connected {
		t.Errorf("bot player = %+v, want it flagged and connected", p)
	}
	class := Content().DefaultClass()
	if p.Character.Class != class.ID || p.Character.Health != class.Health {
		t.Errorf("bot is %s with %d health, want the default class %s with %d",
			p.Character.Class, p.Character.Health, class.ID, class.Health)
	}
	if p.Character.Name != class.Opponent.Name {
		t.Errorf("bot is named %q, want its class's opponent %q", p.Character.Name, class.Opponent.Name)
	}
}

func TestAddBotRefusedOnceTheGameStarts(t *testing.T) {
	g := twoPlayerGame(t)
	if _, err := g.AddBot(); !errors.Is(err, ErrGameInProgress) {
		t.Errorf("AddBot mid-game = %v, want ErrGameInProgress", err)
	}
}

func TestBotTakesItsStartingCellWithoutBeingAsked(t *testing.T) {
	g := New()
	botID, err := g.AddBot()
	if err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}

	snap := g.Snapshot()
	if snap.GameStatus != types.StatusPositionCharacters {
		t.Fatalf("status = %q, want the placement phase", snap.GameStatus)
	}
	bot := snap.Players[botID]
	if !bot.HasPositioned || bot.Character.Position == nil {
		t.Fatalf("the bot is still waiting to be placed: %+v", bot)
	}
	if !InGrid(*bot.Character.Position) {
		t.Errorf("bot placed off the board at %+v", *bot.Character.Position)
	}
}

// A lone visitor has to be able to play a whole match, which is the entire
// reason the bot exists.
func TestAHumanCanPlayAWholeMatchAgainstTheBot(t *testing.T) {
	g := NewWithOptions(Options{Seed: 3, TurnDuration: time.Minute})
	botID, err := g.AddBot()
	if err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	pos := g.Snapshot().Players["human"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("human", pos); err != nil {
		t.Fatalf("ChooseInitialPosition: %v", err)
	}
	if g.Status() != types.StatusPlaying {
		t.Fatalf("status = %q, want the match to start", g.Status())
	}

	// Drive both sides: the bot plays itself, the human always attacks or closes in.
	for step := 0; step < 1200 && g.Status() == types.StatusPlaying; step++ {
		if id, isBot := g.CurrentBot(); isBot && id == botID {
			g.PlayBotStep()
			continue
		}
		action := DecideBotAction(g.Snapshot(), "human")
		switch action.Kind {
		case BotCast:
			if g.CastSpell("human", action.SpellID, action.Target) != nil {
				g.EndTurn("human")
			}
		case BotMove:
			if g.Move("human", action.Target) != nil {
				g.EndTurn("human")
			}
		default:
			g.EndTurn("human")
		}
	}

	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q after 1200 steps, want a finished match", g.Status())
	}
	if _, over := g.Winner(); !over {
		t.Error("the match ended without a winner")
	}
}

// ---------------------------------------------------------------------------
// Turn clock
// ---------------------------------------------------------------------------

func TestTurnExpiresAndPassesPlayOn(t *testing.T) {
	g := twoPlayerGame(t)

	// The clock is swapped for one the test drives, which is the same seam a
	// replay uses to put a recorded timeout back where it happened.
	clock := newFakeClock(g.TurnEndsAt().Add(-time.Second))
	g.clock = clock.Now

	first := currentPlayerID(g)
	if g.ExpireTurnIfDue() {
		t.Fatal("the turn expired immediately")
	}

	// Well past the deadline.
	clock.set(g.TurnEndsAt().Add(time.Second))
	if !g.ExpireTurnIfDue() {
		t.Fatal("the turn did not expire once its deadline passed")
	}
	if second := currentPlayerID(g); second == first {
		t.Errorf("play is still with %q after the turn expired", second)
	}
}

func TestTurnDeadlineIsPublishedAndRearmed(t *testing.T) {
	g := twoPlayerGame(t)

	first := g.Snapshot().TurnEndsAt
	if first == 0 {
		t.Fatal("the snapshot carries no turn deadline")
	}

	mustEndTurn(t, g)
	// Both turns can start inside the same millisecond, so the deadline is only
	// required not to go backwards — and to still be ahead of now.
	second := g.Snapshot().TurnEndsAt
	if second < first {
		t.Errorf("deadline = %d after ending a turn, want at least %d", second, first)
	}
	if second <= time.Now().UnixMilli() {
		t.Errorf("deadline = %d is already in the past", second)
	}
}

func TestNoTurnDeadlineOutsidePlay(t *testing.T) {
	g := New()
	if err := g.AddPlayer("a", "User-a", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if got := g.Snapshot().TurnEndsAt; got != 0 {
		t.Errorf("TurnEndsAt = %d before the match starts, want 0", got)
	}
	if g.ExpireTurnIfDue() {
		t.Error("a turn expired while no match was running")
	}
}

// ---------------------------------------------------------------------------
// The opponent that stands still
// ---------------------------------------------------------------------------

func TestParseBotModeTakesWhatTheWireCanSay(t *testing.T) {
	for in, want := range map[string]BotMode{
		"":      BotFights,
		"fight": BotFights,
		"dummy": BotStandsStill,
	} {
		got, ok := ParseBotMode(in)
		if !ok || got != want {
			t.Errorf("ParseBotMode(%q) = %q, %v; want %q, true", in, got, ok, want)
		}
	}
	if _, ok := ParseBotMode("asleep"); ok {
		t.Error("ParseBotMode accepted a mode nothing implements")
	}
}

// Whatever the board looks like — in range, out of range, at full points — a
// dummy hands the turn straight back. This is the guarantee the tutorial
// leans on: a player reading a card is not being shot at while they read.
func TestADummyDoesNothingWhateverTheBoardLooksLike(t *testing.T) {
	boards := map[string]map[string]types.Position{
		"enemy in its face":      {"a": {X: 0, Y: 0}, "b": {X: 0, Y: 1}},
		"enemy across the board": {"a": {X: -7, Y: 0}, "b": {X: 7, Y: 0}},
	}
	for name, cells := range boards {
		t.Run(name, func(t *testing.T) {
			g := playingGame(t, cells, "a", "b")
			// A fighting opponent would have something to do here.
			if action := DecideBotAction(g.Snapshot(), "a"); action.Kind == BotEnd {
				t.Fatalf("the board leaves nothing to do even for a fighter: %+v", action)
			}

			state := g.Snapshot()
			me := state.Players["a"]
			me.IsDummy = true
			state.Players["a"] = me

			if action := DecideBotAction(state, "a"); action.Kind != BotEnd {
				t.Errorf("a dummy chose %+v, want it to pass", action)
			}
		})
	}
}

func TestADummyOpponentNeverTouchesTheHuman(t *testing.T) {
	g := NewWithOptions(Options{Seed: 5, TurnDuration: time.Minute})
	botID, err := g.AddBotOfClass("", BotStandsStill)
	if err != nil {
		t.Fatalf("AddBotOfClass: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if !g.Snapshot().Players[botID].IsDummy {
		t.Fatal("the opponent was asked to stand still and did not say so")
	}
	pos := g.Snapshot().Players["human"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("human", pos); err != nil {
		t.Fatalf("ChooseInitialPosition: %v", err)
	}

	before := g.Snapshot().Players[botID].Character
	health := g.Snapshot().Players["human"].Character.Health
	// Ten turns of the human doing nothing at all but passing.
	for turn := 0; turn < 10; turn++ {
		if _, isBot := g.CurrentBot(); isBot {
			g.PlayBotStep()
			continue
		}
		if err := g.EndTurn("human"); err != nil {
			t.Fatalf("EndTurn: %v", err)
		}
	}

	after := g.Snapshot().Players[botID].Character
	if before.Position == nil || after.Position == nil || *before.Position != *after.Position {
		t.Errorf("the dummy moved from %+v to %+v", before.Position, after.Position)
	}
	if got := g.Snapshot().Players["human"].Character.Health; got != health {
		t.Errorf("the human is on %d health, want the %d they started with", got, health)
	}
	if g.Status() != types.StatusPlaying {
		t.Errorf("status = %q, want a match still going nowhere", g.Status())
	}
}

func TestWakingTheOpponentMakesItFight(t *testing.T) {
	g := NewWithOptions(Options{Seed: 5, TurnDuration: time.Minute})
	botID, err := g.AddBotOfClass("", BotStandsStill)
	if err != nil {
		t.Fatalf("AddBotOfClass: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	pos := g.Snapshot().Players["human"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("human", pos); err != nil {
		t.Fatalf("ChooseInitialPosition: %v", err)
	}

	if err := g.WakeBots("human"); err != nil {
		t.Fatalf("WakeBots: %v", err)
	}
	if g.Snapshot().Players[botID].IsDummy {
		t.Fatal("the opponent is still marked as standing still")
	}

	// It now plays its turn like any other opponent: something happens.
	before := g.Snapshot().Players[botID].Character
	for step := 0; step < 40 && g.Status() == types.StatusPlaying; step++ {
		if _, isBot := g.CurrentBot(); isBot {
			g.PlayBotStep()
			continue
		}
		if err := g.EndTurn("human"); err != nil {
			t.Fatalf("EndTurn: %v", err)
		}
	}
	after := g.Snapshot().Players[botID].Character
	human := g.Snapshot().Players["human"].Character
	moved := before.Position != nil && after.Position != nil && *before.Position != *after.Position
	if !moved && human.Health == human.MaxHealth {
		t.Error("the woken opponent neither moved nor landed a hit")
	}
}

func TestWakingIsRefusedWhenNobodyIsAsleep(t *testing.T) {
	g := New()
	if _, err := g.AddBot(); err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if err := g.WakeBots("human"); !errors.Is(err, ErrNobodyAsleep) {
		t.Errorf("WakeBots against a fighting opponent = %v, want ErrNobodyAsleep", err)
	}
	if err := g.WakeBots("nobody"); !errors.Is(err, ErrNoCharacter) {
		t.Errorf("WakeBots from a stranger = %v, want ErrNoCharacter", err)
	}
}

// The mode and the wake-up both ride in the command log, so a tutorial match
// replays as the tutorial it was rather than as a fight nobody had.
func TestATutorialMatchReplaysAsOne(t *testing.T) {
	g := NewWithOptions(Options{Seed: 5, TurnDuration: time.Minute})
	botID, err := g.AddBotOfClass("", BotStandsStill)
	if err != nil {
		t.Fatalf("AddBotOfClass: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	pos := g.Snapshot().Players["human"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("human", pos); err != nil {
		t.Fatalf("ChooseInitialPosition: %v", err)
	}
	// A couple of turns, whoever holds the first one.
	for step := 0; step < 4; step++ {
		if _, isBot := g.CurrentBot(); isBot {
			g.PlayBotStep()
			continue
		}
		if err := g.EndTurn("human"); err != nil {
			t.Fatalf("EndTurn: %v", err)
		}
	}

	replayed, err := Replay(g.Recording())
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if !replayed.Snapshot().Players[botID].IsDummy {
		t.Error("the replayed opponent fights; the recorded one stood still")
	}

	if err := g.WakeBots("human"); err != nil {
		t.Fatalf("WakeBots: %v", err)
	}
	woken, err := Replay(g.Recording())
	if err != nil {
		t.Fatalf("Replay after waking: %v", err)
	}
	if woken.Snapshot().Players[botID].IsDummy {
		t.Error("the replayed opponent is still asleep; the recorded one was woken")
	}
}
