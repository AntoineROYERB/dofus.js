package game

import (
	"fmt"
	"time"

	"game-server/internal/types"
)

// BotIDPrefix marks the synthetic connections the server plays itself.
const BotIDPrefix = "bot-"

// BotAction is one step a bot wants to take. Deciding is separated from
// applying so the decision can be tested against a plain snapshot.
type BotAction struct {
	Kind    string // "cast", "move" or "end"
	SpellID int
	Target  types.Position
}

const (
	BotCast = "cast"
	BotMove = "move"
	BotEnd  = "end"
)

// DecideBotAction picks the bot's next step: hit the nearest living enemy if
// anything is in range and affordable, otherwise close the distance, otherwise
// pass. It is deliberately simple — the point is that a lone visitor can play
// a whole match, not that the opponent is hard to beat.
func DecideBotAction(state types.GameState, botID string) BotAction {
	me, ok := state.Players[botID]
	if !ok || !me.Character.IsAlive || me.Character.Position == nil {
		return BotAction{Kind: BotEnd}
	}
	from := *me.Character.Position

	target, found := nearestEnemy(state, botID, from)
	if !found {
		return BotAction{Kind: BotEnd}
	}

	// Occupancy for the line-of-sight check, taken from the snapshot.
	blocked := func(pos types.Position) bool {
		for _, p := range state.Players {
			if p.Character.IsAlive && p.Character.Position != nil && *p.Character.Position == pos {
				return true
			}
		}
		return false
	}

	// Best spell the bot can actually cast right now, strongest first. It has
	// to respect cooldowns, per-turn limits and line of sight like anyone else,
	// or it would spend its turn on casts the server refuses.
	best := types.Spell{}
	bestID := 0
	for key, spell := range state.Spells {
		if spell.APCost > me.Character.ActionPoints {
			continue
		}
		if Distance(from, target) > spell.Range {
			continue
		}
		st := me.Spells[key]
		if st.CooldownLeft > 0 {
			continue
		}
		if spell.MaxCastsPerTurn > 0 && st.CastsThisTurn >= spell.MaxCastsPerTurn {
			continue
		}
		if spell.NeedsLineOfSight && !HasLineOfSight(from, target, blocked) {
			continue
		}
		if bestID == 0 || spell.Damage > best.Damage {
			best, bestID = spell, spell.ID
		}
	}
	if bestID != 0 {
		return BotAction{Kind: BotCast, SpellID: bestID, Target: target}
	}

	if me.Character.MovementPoints > 0 {
		if dest, ok := stepToward(state, from, target, me.Character.MovementPoints); ok {
			return BotAction{Kind: BotMove, Target: dest}
		}
	}
	return BotAction{Kind: BotEnd}
}

func nearestEnemy(state types.GameState, botID string, from types.Position) (types.Position, bool) {
	best := types.Position{}
	bestDist := -1
	for id, p := range state.Players {
		if id == botID || !p.Character.IsAlive || p.Character.Position == nil {
			continue
		}
		d := Distance(from, *p.Character.Position)
		if bestDist == -1 || d < bestDist {
			best, bestDist = *p.Character.Position, d
		}
	}
	return best, bestDist >= 0
}

// stepToward walks as far toward the target as the movement points allow,
// stopping on the closest free cell it can actually reach.
func stepToward(state types.GameState, from, target types.Position, mp int) (types.Position, bool) {
	occupied := map[types.Position]bool{}
	for _, p := range state.Players {
		if p.Character.Position != nil {
			occupied[*p.Character.Position] = true
		}
	}

	best := from
	bestDist := Distance(from, target)
	cur := from

	for step := 0; step < mp; step++ {
		next := cur
		switch {
		case next.X != target.X:
			next.X += sign(target.X - next.X)
		case next.Y != target.Y:
			next.Y += sign(target.Y - next.Y)
		default:
			return best, best != from
		}
		if !InGrid(next) {
			break
		}
		cur = next
		if occupied[cur] {
			continue // walk through, but do not stop here
		}
		if d := Distance(cur, target); d < bestDist {
			best, bestDist = cur, d
		}
	}
	return best, best != from
}

func sign(n int) int {
	if n < 0 {
		return -1
	}
	if n > 0 {
		return 1
	}
	return 0
}

// ---------------------------------------------------------------------------
// Game integration
// ---------------------------------------------------------------------------

// AddBot drops a server-played opponent into the room, already ready to start.
func (g *Game) AddBot() (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusCreatingPlayer {
		return "", ErrGameInProgress
	}
	if len(g.players) >= MaxPlayersPerRoom {
		return "", ErrRoomFull
	}

	id := fmt.Sprintf("%s%d", BotIDPrefix, len(g.players)+1)
	g.players[id] = types.Player{
		UserID:    id,
		UserName:  "Cpu",
		Connected: true,
		IsReady:   true,
		IsBot:     true,
		Spells:    g.freshSpellStateLocked(),
		Character: types.Character{
			Name:           "Cpu",
			Color:          "#7c3aed",
			Symbol:         "C",
			ActionPoints:   StartingActionPoints,
			MovementPoints: StartingMovementPoints,
			Health:         StartingHealth,
			MaxHealth:      StartingHealth,
			IsAlive:        true,
		},
	}
	return id, nil
}

// CurrentBot returns the id of the bot whose turn it is, if any.
func (g *Game) CurrentBot() (string, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if g.status != types.StatusPlaying || g.turnIdx >= len(g.turnOrder) {
		return "", false
	}
	id := g.turnOrder[g.turnIdx]
	p, ok := g.players[id]
	return id, ok && p.IsBot && p.Character.IsAlive
}

// PlayBotStep performs one action for the bot whose turn it is and reports
// whether the bot still holds the turn afterwards. The hub calls it on a timer
// so the moves are paced for a human to follow.
func (g *Game) PlayBotStep() (acted bool) {
	id, ok := g.CurrentBot()
	if !ok {
		return false
	}

	action := DecideBotAction(g.Snapshot(), id)
	switch action.Kind {
	case BotCast:
		if err := g.CastSpell(id, action.SpellID, action.Target); err == nil {
			return true
		}
	case BotMove:
		if err := g.Move(id, action.Target); err == nil {
			return true
		}
	}
	// Anything else, including a refused action, ends the bot's turn rather
	// than looping on a move it cannot make.
	return g.EndTurn(id) == nil
}

// placeBotsLocked puts every bot on one of its offered cells as soon as the
// placement phase opens, so a human never waits on the computer.
func (g *Game) placeBotsLocked() {
	for id, p := range g.players {
		if !p.IsBot || p.HasPositioned {
			continue
		}
		for _, pos := range p.Character.InitialPositions {
			if _, taken := g.playerAtLocked(pos); taken {
				continue
			}
			placed := pos
			p.Character.Position = &placed
			p.HasPositioned = true
			g.players[id] = p
			break
		}
	}
}

// ExpireTurnIfDue passes the turn on when the current player has run out of
// time, and reports whether it did.
func (g *Game) ExpireTurnIfDue(now time.Time) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusPlaying || g.turnEndsAt.IsZero() || now.Before(g.turnEndsAt) {
		return false
	}
	g.advanceTurnLocked()
	return true
}

// TurnEndsAt reports the current turn's deadline, zero when none is running.
func (g *Game) TurnEndsAt() time.Time {
	g.mu.RLock()
	defer g.mu.RUnlock()
	if g.status != types.StatusPlaying {
		return time.Time{}
	}
	return g.turnEndsAt
}
