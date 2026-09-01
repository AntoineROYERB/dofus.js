package game

import (
	"errors"
	"math/rand"
	"testing"
	"time"

	"game-server/internal/types"
)

func TestBotCastsTheStrongestSpellItCanAfford(t *testing.T) {
	g := twoPlayerGame(t)

	// "a" stands at (0,0), "b" at (0,3): within Fireball's range of 6.
	action := DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotCast {
		t.Fatalf("action = %+v, want a cast", action)
	}
	if action.SpellID != 1 {
		t.Errorf("spell = %d, want 1 (Fireball, the most damaging affordable one)", action.SpellID)
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

	action := DecideBotAction(g.Snapshot(), "a")
	if action.Kind != BotMove {
		t.Fatalf("action = %+v, want a move", action)
	}
	before := Distance(types.Position{X: -7, Y: 0}, types.Position{X: 7, Y: 0})
	after := Distance(action.Target, types.Position{X: 7, Y: 0})
	if after >= before {
		t.Errorf("move to %+v does not close the distance (%d -> %d)", action.Target, before, after)
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
	if !p.IsBot || !p.IsReady || !p.Connected {
		t.Errorf("bot player = %+v, want it flagged, ready and connected", p)
	}
	if p.Character.Health != StartingHealth {
		t.Errorf("bot health = %d, want %d", p.Character.Health, StartingHealth)
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
	if err := g.SetReady("human"); err != nil {
		t.Fatalf("SetReady: %v", err)
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
	g := NewWithOptions(rand.New(rand.NewSource(3)), time.Minute)
	botID, err := g.AddBot()
	if err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	if err := g.AddPlayer("human", "User-human", look("Alice")); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if err := g.SetReady("human"); err != nil {
		t.Fatalf("SetReady: %v", err)
	}
	pos := g.Snapshot().Players["human"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("human", pos); err != nil {
		t.Fatalf("ChooseInitialPosition: %v", err)
	}
	if g.Status() != types.StatusPlaying {
		t.Fatalf("status = %q, want the match to start", g.Status())
	}

	// Drive both sides: the bot plays itself, the human always attacks or closes in.
	for step := 0; step < 400 && g.Status() == types.StatusPlaying; step++ {
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
		t.Fatalf("status = %q after 400 steps, want a finished match", g.Status())
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

	first := currentPlayerID(g)
	if g.ExpireTurnIfDue(time.Now()) {
		t.Fatal("the turn expired immediately")
	}

	// Well past the deadline.
	if !g.ExpireTurnIfDue(g.TurnEndsAt().Add(time.Second)) {
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
	if g.ExpireTurnIfDue(time.Now().Add(time.Hour)) {
		t.Error("a turn expired while no match was running")
	}
}
