package game

import (
	"fmt"
	"sort"
	"strings"
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

	// What the board refuses, taken from the snapshot: cover and characters.
	obstacles := make(map[types.Position]bool, len(state.Obstacles))
	for _, o := range state.Obstacles {
		obstacles[o] = true
	}
	blocked := func(pos types.Position) bool {
		if obstacles[pos] {
			return true
		}
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
	// Sorted rather than ranged over directly: two spells can be tied on
	// damage — Frost Nova and Drain both do 10 — and Go map order would pick a
	// different one on each run, which is enough to make a recorded match
	// replay into a different fight.
	ready := readySpells(state, me)
	best := types.Spell{}
	bestID := 0
	for _, spell := range ready {
		if !reaches(from, target, spell, blocked) {
			continue
		}
		if bestID == 0 || spell.Damage > best.Damage {
			best, bestID = spell, spell.ID
		}
	}
	if bestID != 0 {
		return BotAction{Kind: BotCast, SpellID: bestID, Target: target}
	}

	if mp := me.Character.MovementPoints; mp > 0 {
		// The bot's own cell stops being in the way the moment it leaves it.
		walkable := func(pos types.Position) bool { return pos != from && blocked(pos) }
		if dest, ok := stepIntoRange(from, target, mp, ready, walkable); ok {
			return BotAction{Kind: BotMove, Target: dest}
		}
		if dest, ok := stepToward(from, target, mp, walkable); ok {
			return BotAction{Kind: BotMove, Target: dest}
		}
	}
	return BotAction{Kind: BotEnd}
}

// readySpells lists the spells on the bot's bar it could cast this turn if the
// target were in reach: affordable, off cooldown, with casts left. The
// catalogue carries every class's spells, so the bar is the only place a bot
// of any class looks.
func readySpells(state types.GameState, me types.Player) []types.Spell {
	var ready []types.Spell
	for _, key := range sortedKeys(state.Spells) {
		st, onBar := me.Spells[key]
		if !onBar {
			continue
		}
		spell := state.Spells[key]
		if spell.APCost > me.Character.ActionPoints || st.CooldownLeft > 0 {
			continue
		}
		if spell.MaxCastsPerTurn > 0 && st.CastsThisTurn >= spell.MaxCastsPerTurn {
			continue
		}
		ready = append(ready, spell)
	}
	return ready
}

// reaches reports whether a spell cast from one cell can land on another
// without catching its caster in the blast. Friendly fire is real — a cross
// cast at an adjacent enemy hits both of them — and a bot that never noticed
// used to trade itself out of fights it was winning.
func reaches(from, target types.Position, spell types.Spell, blocked func(types.Position) bool) bool {
	if Distance(from, target) > spell.Range {
		return false
	}
	if spell.NeedsLineOfSight && !HasLineOfSight(from, target, blocked) {
		return false
	}
	return spell.Damage == 0 || !containsPosition(AffectedPositions(spell, target, from), from)
}

// stepIntoRange finds the nearest reachable cell from which a damaging spell
// the bot can still afford would land. Walking closer is not the same thing:
// two characters either side of a single block of cover can be two cells
// apart with no line between them, and a bot that only ever shortens the
// distance stands there forever.
func stepIntoRange(from, target types.Position, mp int, ready []types.Spell, blocked func(types.Position) bool) (types.Position, bool) {
	reachable := Reachable(from, mp, blocked)
	cells := make([]types.Position, 0, len(reachable))
	for cell := range reachable {
		cells = append(cells, cell)
	}
	sortPositions(cells)

	best, bestSteps := types.Position{}, -1
	for _, cell := range cells {
		steps := reachable[cell]
		if bestSteps != -1 && steps >= bestSteps {
			continue
		}
		for _, spell := range ready {
			if spell.Damage > 0 && reaches(cell, target, spell, blocked) {
				best, bestSteps = cell, steps
				break
			}
		}
	}
	return best, bestSteps != -1
}

func nearestEnemy(state types.GameState, botID string, from types.Position) (types.Position, bool) {
	// Ties go to the lowest user id rather than to whichever key Go's map
	// happened to hand out first.
	best := types.Position{}
	bestDist := -1
	for _, id := range sortedKeys(state.Players) {
		p := state.Players[id]
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

// stepToward picks the reachable cell that gets closest to the target. It uses
// the same walk the server charges for, so the bot never asks for a move that
// will be refused — before this it stepped in a straight line and simply
// bounced off cover. Closest is measured as a walk too, not as the crow
// flies: a cell on the far side of a wall is near on paper and nowhere near
// on foot.
func stepToward(from, target types.Position, mp int, blocked func(types.Position) bool) (types.Position, bool) {
	walk := walkingDistances(target, blocked)
	measure := func(p types.Position) int {
		if d, ok := walk[p]; ok {
			return d
		}
		// Nothing walks to the target at all — it is boxed in. Straight-line
		// distance at least gets the bot next to the box.
		return len(walk) + Distance(p, target)
	}

	best := from
	bestDist := measure(from)

	// Reachable returns a map, and several cells are usually the same distance
	// from the target. Walking it in a fixed order is what stops the bot from
	// stepping somewhere else on a replay.
	reachable := Reachable(from, mp, blocked)
	cells := make([]types.Position, 0, len(reachable))
	for cell := range reachable {
		cells = append(cells, cell)
	}
	sortPositions(cells)

	for _, cell := range cells {
		if d := measure(cell); d < bestDist {
			best, bestDist = cell, d
		}
	}
	return best, best != from
}

// walkingDistances measures, for every cell that can walk to the target, how
// many steps that walk takes. The target itself is usually occupied, so it is
// the one cell that counts as open.
func walkingDistances(target types.Position, blocked func(types.Position) bool) map[types.Position]int {
	dist := map[types.Position]int{target: 0}
	queue := []types.Position{target}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, next := range Neighbours(current) {
			if _, seen := dist[next]; seen || blocked(next) {
				continue
			}
			dist[next] = dist[current] + 1
			queue = append(queue, next)
		}
	}
	return dist
}

// sortedKeys walks a map in a fixed order. Everything the bot decides from is
// a map on a snapshot, and every one of those decisions has to come out the
// same way twice.
func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sortPositions(list []types.Position) {
	sort.Slice(list, func(i, j int) bool {
		if list[i].X != list[j].X {
			return list[i].X < list[j].X
		}
		return list[i].Y < list[j].Y
	})
}

// ---------------------------------------------------------------------------
// Game integration
// ---------------------------------------------------------------------------

// AddBot drops a server-played opponent of the default class into the room.
func (g *Game) AddBot() (string, error) {
	return g.AddBotOfClass("")
}

// AddBotOfClass drops a server-played opponent into the room, already ready
// to start. It plays the class it is given, under that class's opponent's
// name and colours; empty means the default class.
func (g *Game) AddBotOfClass(classID string) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusCreatingPlayer {
		return "", ErrGameInProgress
	}
	if len(g.players) >= MaxPlayersPerRoom {
		return "", ErrRoomFull
	}
	class, err := g.classLocked(classID)
	if err != nil {
		return "", err
	}

	id := fmt.Sprintf("%s%d", BotIDPrefix, len(g.players)+1)
	g.recordLocked(id, CmdAddBot, addBotPayload{Class: class.ID})
	name := class.Opponent.Name
	p := newPlayer(id, name, class, types.Character{
		Name:   name,
		Color:  class.Palette.Primary,
		Symbol: strings.ToUpper(string([]rune(name)[:1])),
	})
	p.IsBot = true
	g.players[id] = p
	g.startPlacementIfReadyLocked()
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
	for _, id := range g.sortedPlayerIDsLocked() {
		p := g.players[id]
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
//
// The deadline is read from the game's own clock rather than taken as an
// argument: a timeout changes the game, so it is a recorded command, and a
// command whose timestamp came from somewhere the recording cannot see would
// make the replay diverge the moment a player let their clock run out.
func (g *Game) ExpireTurnIfDue() bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusPlaying || g.turnEndsAt.IsZero() || g.now().Before(g.turnEndsAt) {
		return false
	}
	current := ""
	if g.turnIdx < len(g.turnOrder) {
		current = g.turnOrder[g.turnIdx]
	}
	g.recordLocked(current, CmdTimeout, nil)
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
