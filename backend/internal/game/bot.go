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

// DecideBotAction picks the bot's next step: hit the nearest living enemy as
// hard as it can if anything lands, otherwise set up a hit (leap next to it,
// put a relay in reach), otherwise close the distance, otherwise lay down
// whatever terrain it has on the enemy, otherwise pass. It is deliberately
// simple — the point is that a lone visitor can play a whole match, not that
// the opponent is hard to beat.
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

	board := readBoard(state, botID)
	// Best spell the bot can actually cast right now, strongest first. It has
	// to respect cooldowns, per-turn limits and line of sight like anyone else,
	// or it would spend its turn on casts the server refuses.
	ready := readySpells(state, me)

	// A leap that puts a heavier hit in reach comes before a lighter hit that
	// is in reach already.
	if action, ok := board.leapIn(me, from, target, ready); ok {
		return action
	}
	if action, ok := board.bestAttack(me, from, target, ready); ok {
		return action
	}
	if action, ok := board.setUp(me, from, target, ready); ok {
		return action
	}

	if mp := me.Character.MovementPoints; mp > 0 {
		// The bot's own cell stops being in the way the moment it leaves it,
		// and it does not walk into what the enemy left on the ground.
		walkable := func(pos types.Position) bool {
			return pos != from && (board.blocked(pos) || board.hazard(pos))
		}
		if dest, ok := board.stepIntoRange(from, target, mp, ready, walkable); ok {
			return BotAction{Kind: BotMove, Target: dest}
		}
		if dest, ok := stepToward(from, target, mp, walkable); ok {
			return BotAction{Kind: BotMove, Target: dest}
		}
	}

	if action, ok := board.layTerrain(from, target, ready); ok {
		return action
	}
	return BotAction{Kind: BotEnd}
}

// botBoard is what the bot reads off a snapshot to decide with.
type botBoard struct {
	state      types.GameState
	botID      string
	obstacles  map[types.Position]bool
	terrain    map[types.Position]types.TerrainCell
	relay      *types.Position
	meleeBonus int
}

func readBoard(state types.GameState, botID string) botBoard {
	b := botBoard{
		state:     state,
		botID:     botID,
		obstacles: make(map[types.Position]bool, len(state.Obstacles)),
		terrain:   make(map[types.Position]types.TerrainCell, len(state.Terrain)),
	}
	for _, o := range state.Obstacles {
		b.obstacles[o] = true
	}
	for _, cell := range state.Terrain {
		b.terrain[cell.Position] = cell
		if cell.Kind == types.TerrainRelay && cell.Owner == botID {
			relay := cell.Position
			b.relay = &relay
		}
	}
	if class, ok := Content().Class(state.Players[botID].Character.Class); ok {
		b.meleeBonus = class.MeleeBonus
	}
	return b
}

func (b botBoard) occupied(pos types.Position) bool {
	for _, p := range b.state.Players {
		if p.Character.IsAlive && p.Character.Position != nil && *p.Character.Position == pos {
			return true
		}
	}
	return false
}

// blocked reports what the board refuses to a walker: cover, solid ground and
// characters.
func (b botBoard) blocked(pos types.Position) bool {
	if !InGrid(pos) || b.obstacles[pos] || isSolidTerrain(b.terrain[pos].Kind) {
		return true
	}
	return b.occupied(pos)
}

// blocksSight is the same, with smoke instead of solid ground.
func (b botBoard) blocksSight(pos types.Position) bool {
	if b.obstacles[pos] || b.terrain[pos].Kind == types.TerrainSmoke {
		return true
	}
	return b.occupied(pos)
}

func (b botBoard) free(pos types.Position) bool {
	return !b.blocked(pos)
}

// lands reports whether a spell cast from one cell hits the target without
// catching its caster in the blast. Friendly fire is real — a cross cast at
// an adjacent enemy hits both of them — and a bot that never noticed used to
// trade itself out of fights it was winning.
func (b botBoard) lands(from, caster, target types.Position, spell types.Spell) bool {
	if spell.Targeting == types.TargetSelf {
		return from == caster && containsPosition(AffectedPositions(spell, caster, caster), target)
	}
	if spell.Targeting == types.TargetEmpty {
		return false
	}
	if Distance(from, target) > spell.Range {
		return false
	}
	if spell.NeedsLineOfSight && !HasLineOfSight(from, target, b.blocksSight) {
		return false
	}
	return spell.Damage == 0 || !containsPosition(AffectedPositions(spell, target, from), caster)
}

// origins are the cells a spell may be cast from: where the bot stands, and
// its relay for a spell that can use one.
func (b botBoard) origins(from types.Position, spell types.Spell) []types.Position {
	if spell.Relayed && b.relay != nil {
		return []types.Position{from, *b.relay}
	}
	return []types.Position{from}
}

// estimate is roughly what a spell will take off the target, which is all
// the bot ranks its options by.
func (b botBoard) estimate(caster, target types.Position, spell types.Spell) int {
	amount := spell.Damage
	if spell.Special == types.SpecialDetonate {
		for _, id := range sortedKeys(b.state.Players) {
			c := b.state.Players[id].Character
			if c.Position != nil && *c.Position == target {
				for _, e := range c.Effects {
					if e.Kind == types.EffectBurn {
						amount += e.Value * e.TurnsLeft * BurnDamagePerStack
					}
				}
			}
		}
	}
	if spell.Effect != nil && spell.Effect.Kind == types.EffectBurn && !spell.Effect.OnSelf {
		amount += spell.Effect.Value * BurnDamagePerStack
	}
	if spell.Conducts && b.terrain[target].Kind == types.TerrainWater {
		amount *= ConductMultiplier
	}
	if b.meleeBonus > 0 && Distance(caster, target) == 1 {
		amount = amount * (100 + b.meleeBonus) / 100
	}
	// Where the target ends up counts too. A class that hits hardest up close
	// wants it dragged in; anyone else wants it thrown off their doorstep.
	switch {
	case spell.Push > 0 && Distance(caster, target) == 1 && b.meleeBonus == 0:
		dir := stepTowards(caster, target)
		if b.free(types.Position{X: target.X + dir.X, Y: target.Y + dir.Y}) {
			amount += 8
		}
	case spell.Push < 0 && Distance(caster, target) > 1 && b.meleeBonus > 0:
		amount += 6
	}
	return amount
}

// hazard reports ground the bot should not walk into: fire, whoever lit it,
// and the enemy's traps.
func (b botBoard) hazard(pos types.Position) bool {
	cell, ok := b.terrain[pos]
	if !ok {
		return false
	}
	return cell.Kind == types.TerrainFire || (cell.Kind == types.TerrainTrap && cell.Owner != b.botID)
}

// bestAttack is the hardest-hitting spell that lands on the target right now.
func (b botBoard) bestAttack(me types.Player, from, target types.Position, ready []types.Spell) (BotAction, bool) {
	best, bestID, bestScore := types.Position{}, 0, 0
	for _, spell := range ready {
		if spell.Damage <= 0 {
			continue
		}
		for _, origin := range b.origins(from, spell) {
			if !b.lands(origin, from, target, spell) {
				continue
			}
			aim := target
			if spell.Targeting == types.TargetSelf {
				aim = from
			}
			if score := b.estimate(from, target, spell); bestID == 0 || score > bestScore {
				best, bestID, bestScore = aim, spell.ID, score
			}
			break
		}
	}
	if bestID == 0 {
		return BotAction{}, false
	}
	return BotAction{Kind: BotCast, SpellID: bestID, Target: best}, true
}

// leapIn leaps next to the target when a melee spell is still affordable
// once it has landed.
func (b botBoard) leapIn(me types.Player, from, target types.Position, ready []types.Spell) (BotAction, bool) {
	if Distance(from, target) <= 1 {
		return BotAction{}, false
	}
	for _, leap := range ready {
		if leap.Special != types.SpecialLeap {
			continue
		}
		melee := false
		for _, other := range ready {
			if other.Range == 1 && other.Damage > 0 && other.APCost <= me.Character.ActionPoints-leap.APCost {
				melee = true
			}
		}
		if !melee {
			continue
		}
		if cell, ok := b.landing(from, target, leap); ok {
			return BotAction{Kind: BotCast, SpellID: leap.ID, Target: cell}, true
		}
	}
	return BotAction{}, false
}

// landing is the free, safe cell next to the target a leap can reach,
// nearest the bot first.
func (b botBoard) landing(from, target types.Position, leap types.Spell) (types.Position, bool) {
	cells := Neighbours(target)
	sortPositions(cells)
	best, bestDist := types.Position{}, -1
	for _, cell := range cells {
		d := Distance(from, cell)
		if b.free(cell) && !b.hazard(cell) && d <= leap.Range && d > 0 && (bestDist == -1 || d < bestDist) {
			best, bestDist = cell, d
		}
	}
	return best, bestDist != -1
}

// setUp is a cast that does no harm by itself but makes the next one land:
// leaping next to the target, or putting a relay within reach of it, or
// catching the wind to walk further.
func (b botBoard) setUp(me types.Player, from, target types.Position, ready []types.Spell) (BotAction, bool) {
	ap := me.Character.ActionPoints
	for _, spell := range ready {
		// Only worth it if something that hits is still affordable after.
		followUp := false
		for _, other := range ready {
			if other.ID != spell.ID && other.Damage > 0 && other.APCost <= ap-spell.APCost {
				followUp = true
			}
		}
		if !followUp {
			continue
		}

		switch {
		case spell.Special == types.SpecialLeap && Distance(from, target) > 1:
			if cell, ok := b.landing(from, target, spell); ok {
				return BotAction{Kind: BotCast, SpellID: spell.ID, Target: cell}, true
			}

		case spell.Special == types.SpecialRelay:
			if cell, ok := b.relayCell(from, target, spell, ready, ap-spell.APCost); ok {
				return BotAction{Kind: BotCast, SpellID: spell.ID, Target: cell}, true
			}

		case spell.GrantMP > 0 && me.Character.MovementPoints > 0:
			return BotAction{Kind: BotCast, SpellID: spell.ID, Target: from}, true
		}
	}
	return BotAction{}, false
}

// relayCell finds where a relay would let a relayed spell land on the target,
// nearest the bot first. None is offered when the current relay already does.
func (b botBoard) relayCell(from, target types.Position, relaySpell types.Spell, ready []types.Spell, apLeft int) (types.Position, bool) {
	var relayed []types.Spell
	for _, spell := range ready {
		if spell.Relayed && spell.Damage > 0 && spell.APCost <= apLeft {
			relayed = append(relayed, spell)
		}
	}
	if len(relayed) == 0 {
		return types.Position{}, false
	}
	if b.relay != nil {
		for _, spell := range relayed {
			if b.lands(*b.relay, from, target, spell) {
				return types.Position{}, false
			}
		}
	}

	var cells []types.Position
	for x := -GridRadius; x <= GridRadius; x++ {
		for y := -GridRadius; y <= GridRadius; y++ {
			cell := types.Position{X: x, Y: y}
			d := Distance(from, cell)
			if !InGrid(cell) || d == 0 || d > relaySpell.Range || !b.free(cell) {
				continue
			}
			if relaySpell.NeedsLineOfSight && !HasLineOfSight(from, cell, b.blocksSight) {
				continue
			}
			cells = append(cells, cell)
		}
	}
	sortPositions(cells)
	sort.SliceStable(cells, func(i, j int) bool { return Distance(from, cells[i]) < Distance(from, cells[j]) })
	for _, cell := range cells {
		for _, spell := range relayed {
			if b.lands(cell, from, target, spell) {
				return cell, true
			}
		}
	}
	return types.Position{}, false
}

// layTerrain spends what is left of a turn putting slowing ground on the
// target: water or traps. Smoke and pillars need more judgement than this bot
// has, so it leaves them alone.
func (b botBoard) layTerrain(from, target types.Position, ready []types.Spell) (BotAction, bool) {
	for _, spell := range ready {
		if spell.Damage > 0 || (spell.Terrain != types.TerrainWater && spell.Terrain != types.TerrainTrap) {
			continue
		}
		if b.lands(from, from, target, spell) {
			return BotAction{Kind: BotCast, SpellID: spell.ID, Target: target}, true
		}
	}
	return BotAction{}, false
}

// readySpells lists the spells on the bot's bar it could cast this turn if the
// target were in reach: affordable, off cooldown, with casts left, and — for
// an ultimate — unlocked and unused. The catalogue carries every class's
// spells, so the bar is the only place a bot of any class looks.
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
		if spell.Ultimate && (st.Spent || state.TurnNumber < UltimateFromTurn) {
			continue
		}
		ready = append(ready, spell)
	}
	return ready
}

// reaches reports whether a spell cast from one cell can land on another on a
// board with nothing but the given blockers on it.
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
func (b botBoard) stepIntoRange(from, target types.Position, mp int, ready []types.Spell, blocked func(types.Position) bool) (types.Position, bool) {
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
			if spell.Damage > 0 && b.lands(cell, cell, target, spell) {
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
