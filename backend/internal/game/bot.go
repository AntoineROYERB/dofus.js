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

// BotMode is how a server-played opponent behaves.
type BotMode string

const (
	// BotFights is the ordinary opponent: it closes the distance and hits.
	BotFights BotMode = "fight"
	/*
	 * BotStandsStill takes hits and passes its turn, and does nothing else.
	 * The tutorial opens against one, so that a player being shown which
	 * button is which is not being shot at while they read. It is the mode,
	 * not the difficulty: the same opponent wakes up and fights properly the
	 * moment the tour ends.
	 */
	BotStandsStill BotMode = "dummy"
)

// ParseBotMode reads a mode off the wire. Empty means the ordinary opponent,
// so a client that has never heard of modes asks for what it always did.
func ParseBotMode(s string) (BotMode, bool) {
	switch BotMode(s) {
	case "", BotFights:
		return BotFights, true
	case BotStandsStill:
		return BotStandsStill, true
	}
	return "", false
}

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

// DecideBotAction picks the bot's next step at the default level, with no
// roll to bend it. Tests ask it about a board; a game asks decideBotAction,
// which knows the bot's level and has a roll to give it.
func DecideBotAction(state types.GameState, botID string) BotAction {
	return decideBotAction(state, botID, 0)
}

// decideBotAction picks the bot's next step. It weighs every cell it can walk
// to — the best run of casts from there, then the best place to end the turn
// within what walking it leaves — and takes the first step of the best: the
// cast, or the walk to where the casting is better. With nothing to cast from
// anywhere it readies something that will reach (more movement), walks to
// where its turn is best ended, and spends what is left on cover or slowing
// ground before it hands the turn back.
func decideBotAction(state types.GameState, botID string, roll uint64) BotAction {
	me, ok := state.Players[botID]
	if !ok || !me.Character.IsAlive || me.Character.Position == nil {
		return BotAction{Kind: BotEnd}
	}
	// A dummy has nothing to decide: whatever the board looks like, it stands
	// where it is and hands the turn back.
	if me.IsDummy {
		return BotAction{Kind: BotEnd}
	}
	mind := mindOf(me, roll)
	c := me.Character
	if acted := c.ActionPoints < c.MaxActionPoints || c.MovementPoints < c.MaxMovementPoints; acted && mind.idles > 0 && int(splitmix(roll)%100) < mind.idles {
		return BotAction{Kind: BotEnd}
	}
	b := readBoard(state, botID, mind)
	if len(b.foes) == 0 {
		return b.seek()
	}
	// It has to respect cooldowns, per-turn limits and line of sight like
	// anyone else, or it would spend its turn on casts the server refuses.
	ready := readySpells(state, me, b.me.element)
	stands := b.stands()
	mp := me.Character.MovementPoints

	nth := 0
	bestAt, bestScore := -1, 0
	var best plan
	for i, st := range stands {
		p := b.planFrom(st.at, ready, &nth)
		score := p.value - stepCost*(mp-st.mpLeft) - st.fires*fireCost
		if len(p.casts) > 0 {
			score += b.restWithin(p.endAt, st.mpLeft, stands)
		} else {
			score += b.rest(st.at)
		}
		nth++
		score = b.mind.bend(score, nth)
		if bestAt == -1 || score > bestScore {
			bestAt, bestScore, best = i, score, p
		}
	}

	if len(best.casts) == 0 {
		// Nothing lands from anywhere this turn: more movement may change
		// that, so that comes before walking.
		if action, ok := b.speedUp(ready); ok {
			return action
		}
	}
	if st := stands[bestAt]; st.at != b.me.pos {
		return BotAction{Kind: BotMove, Target: st.walkTo}
	}
	if len(best.casts) > 0 {
		first := best.casts[0]
		return BotAction{Kind: BotCast, SpellID: first.spell.ID, Target: first.aim}
	}
	if action, ok := b.cover(ready); ok {
		return action
	}
	if action, ok := b.layTerrain(ready); ok {
		return action
	}
	return BotAction{Kind: BotEnd}
}

// restWithin is the best place to end the turn a few steps from a cell: the
// cells it could walk on to once its casts are done.
func (b *botBoard) restWithin(from types.Position, mpLeft int, stands []stand) int {
	best := b.rest(from)
	for _, st := range stands {
		if st.at != from && Distance(from, st.at) <= mpLeft {
			best = max(best, b.rest(st.at))
		}
	}
	return best
}

// seek is what the bot does with nobody in sight: walk towards the tall grass
// it cannot see into, where whoever is left must be hiding.
func (b *botBoard) seek() BotAction {
	mp := b.me.player.Character.MovementPoints
	if !b.hidden || mp <= 0 {
		return BotAction{Kind: BotEnd}
	}
	from := b.me.pos
	target, found := types.Position{}, false
	for _, cell := range boardCells() {
		if !b.groundIs(cell, GroundRule.Conceals) || Distance(from, cell) <= GrassSightRange {
			continue
		}
		if !found || Distance(from, cell) < Distance(from, target) {
			target, found = cell, true
		}
	}
	if !found {
		return BotAction{Kind: BotEnd}
	}
	walkable := func(pos types.Position) bool {
		return pos != from && (!b.free(pos, b.standing) || caught(b.terrainAt, pos, b.botID))
	}
	if dest, ok := stepToward(from, target, mp, walkable, b.enterCost); ok {
		return BotAction{Kind: BotMove, Target: dest}
	}
	return BotAction{Kind: BotEnd}
}

// speedUp catches the wind to walk further, when something that hits is
// still affordable after.
func (b *botBoard) speedUp(ready []types.Spell) (BotAction, bool) {
	ap := b.me.player.Character.ActionPoints
	if b.me.player.Character.MovementPoints <= 0 {
		return BotAction{}, false
	}
	for _, spell := range ready {
		if spell.GrantMP <= 0 {
			continue
		}
		for _, other := range ready {
			if other.ID != spell.ID && other.Damage > 0 && other.APCost <= ap-spell.APCost {
				return BotAction{Kind: BotCast, SpellID: spell.ID, Target: b.me.pos}, true
			}
		}
	}
	return BotAction{}, false
}

// cover puts smoke or a pillar in the enemy's line of fire, where it takes
// the most off what the enemy could deal the bot next turn.
func (b *botBoard) cover(ready []types.Spell) (BotAction, bool) {
	if !b.mind.covers {
		return BotAction{}, false
	}
	from := b.me.pos
	now := 0
	for _, foe := range b.foes {
		now += b.threatFrom(foe, from, nil)
	}
	if now == 0 {
		return BotAction{}, false
	}
	s := b.newSim(b.me.pos, nil, nil)
	best, bestSpell, bestGain := types.Position{}, 0, minCoverGain-1
	for _, spell := range ready {
		pillar := spell.Special == types.SpecialPillar
		if !pillar && spell.Terrain != types.TerrainSmoke {
			continue
		}
		for _, cell := range boardCells() {
			if Distance(from, cell) > rangeFrom(spell, b.terrain[from].Kind) || Distance(from, cell) == 0 {
				continue
			}
			if !b.free(cell, b.standing) || (spell.NeedsLineOfSight && !s.reach(from, cell, spell)) {
				continue
			}
			if pillar && b.wallsIn(cell) {
				continue
			}
			screen := []types.Position{cell}
			if !pillar {
				screen = AffectedPositions(spell, cell, from)
			}
			after := 0
			for _, foe := range b.foes {
				after += b.threatFrom(foe, from, screen)
			}
			if gain := now - after; gain > bestGain {
				best, bestSpell, bestGain = cell, spell.ID, gain
			}
		}
	}
	if bestSpell == 0 {
		return BotAction{}, false
	}
	return BotAction{Kind: BotCast, SpellID: bestSpell, Target: best}, true
}

// layTerrain spends what is left of a turn putting slowing ground on an
// enemy: water or traps.
func (b *botBoard) layTerrain(ready []types.Spell) (BotAction, bool) {
	s := b.newSim(b.me.pos, nil, nil)
	for _, spell := range ready {
		if spell.Damage > 0 || (spell.Terrain != types.TerrainWater && spell.Terrain != types.TerrainTrap) {
			continue
		}
		for _, f := range b.foes {
			if s.reach(b.me.pos, f.pos, spell) && !containsPosition(AffectedPositions(spell, f.pos, b.me.pos), b.me.pos) {
				return BotAction{Kind: BotCast, SpellID: spell.ID, Target: f.pos}, true
			}
		}
	}
	return BotAction{}, false
}

// readySpells lists the spells on the bot's bar it could cast this turn if the
// target were in reach: affordable, off cooldown, with casts left, and — for
// an ultimate — unlocked and unused. The catalogue carries every loadout's
// spells, so the bar is the only place a bot of any loadout looks. A
// legendary's ultimate is weighed as the server will cast it, infused with
// the element the bot wears.
func readySpells(state types.GameState, me types.Player, element string) []types.Spell {
	var ready []types.Spell
	for _, key := range sortedKeys(state.Spells) {
		st, onBar := me.Spells[key]
		if !onBar {
			continue
		}
		spell := infused(state.Spells[key], element)
		if spell.APCost > me.Character.ActionPoints || st.CooldownLeft > 0 {
			continue
		}
		if spell.MaxCastsPerTurn > 0 && st.CastsThisTurn >= spell.MaxCastsPerTurn {
			continue
		}
		if spell.Ultimate && (st.Spent || (state.TurnNumber < UltimateFromTurn && !me.Character.Blessings.EarlyUltimate)) {
			continue
		}
		// Standing an ally back up is not something the planner weighs.
		if spell.Special == types.SpecialRevive {
			continue
		}
		ready = append(ready, spell)
	}
	return ready
}

// infused mirrors CastSpell's infusion: a legendary's ultimate takes on the
// element its caster wears.
func infused(spell types.Spell, element string) types.Spell {
	if _, ok := spell.Infusions[element]; ok {
		return spell.Infused(element)
	}
	return spell
}

// spellOf is a spell on a fighter's bar as it would cast it.
func (b *botBoard) spellOf(f fighter, key string) (types.Spell, bool) {
	spell, ok := b.state.Spells[key]
	return infused(spell, f.element), ok
}

// stepToward picks the reachable cell that gets closest to the target. It uses
// the same walk the server charges for, so the bot never asks for a move that
// will be refused — before this it stepped in a straight line and simply
// bounced off cover. Closest is measured as a walk too, not as the crow
// flies: a cell on the far side of a wall is near on paper and nowhere near
// on foot.
func stepToward(from, target types.Position, mp int, blocked func(types.Position) bool, cost func(types.Position) int) (types.Position, bool) {
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
	reachable := Reachable(from, mp, blocked, cost)
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

// AddBot drops the first champion, in its set, into the room as an opponent,
// one that fights.
func (g *Game) AddBot() (string, error) {
	return g.AddBotChampion("", BotFights)
}

// AddBotChampion drops a champion into the room as an opponent, in that
// champion's set and at the level the island sets; empty means the first
// champion.
func (g *Game) AddBotChampion(championID string, mode BotMode) (string, error) {
	return g.AddBotOf(BotSpec{Champion: championID, Mode: mode})
}

// BotSpec is who a server-played opponent is and how it plays.
type BotSpec struct {
	// Champion is the champion whose set it fights in; empty means the first
	// champion, or the boss's own.
	Champion string
	Mode     BotMode
	// Level is how well it plays; empty means the island's level, or
	// DefaultBotLevel off the islands.
	Level BotLevel
	// Boss is a ruler of an island from the bestiary, which brings its own
	// set, name and way of fighting. Empty for an ordinary opponent.
	Boss string
	// Team is the side it fights on; empty in a duel.
	Team string
	// Monster is a dream's monster, by bestiary id: it brings its own set,
	// bar, numbers and colour. Champion and Boss are then left empty.
	Monster string
	// Stats replace the numbers its set or its sheet would give it: a
	// monster or a boss grown for the floor and the party it faces.
	Stats *types.FighterStats
	// Boons are what it carries, as a player would: a boss's early
	// ultimate.
	Boons []string
}

// AddBotOf drops a server-played opponent into the room, already ready to
// start. It plays in its champion's set, under the champion's name and its
// outfit's colours, or under the boss's name when it is one.
func (g *Game) AddBotOf(spec BotSpec) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.status != types.StatusCreatingPlayer {
		return "", ErrGameInProgress
	}
	if len(g.players) >= g.capacityLocked() {
		return "", ErrRoomFull
	}
	if _, ok := ParseBotLevel(string(spec.Level)); !ok {
		return "", ErrUnknownBotLevel
	}
	if spec.Monster != "" {
		return g.addMonsterLocked(spec)
	}
	boons, err := g.boonsOfLocked(spec.Boons)
	if err != nil {
		return "", err
	}
	var boss types.Monster
	if spec.Boss != "" {
		var ok bool
		if boss, ok = g.catalogue.Monster(spec.Boss); !ok || boss.Rank == types.RankMonster {
			return "", ErrUnknownBoss
		}
		if spec.Champion != "" && spec.Champion != boss.Champion {
			return "", ErrBossChampion
		}
		spec.Champion = boss.Champion
	}
	champion, err := g.championLocked(spec.Champion)
	if err != nil {
		return "", err
	}
	kit, err := g.catalogue.Kit(champion.Set)
	if err != nil {
		return "", err
	}
	if spec.Level == "" {
		spec.Level = DefaultBotLevel
		if island, ok := g.catalogue.Island(g.island); ok && island.OpponentLevel != "" {
			spec.Level = BotLevel(island.OpponentLevel)
		}
	}

	id := g.nextBotIDLocked()
	// The level is written down as it was resolved, so a recording replays
	// the same opponent even after the island's level is retuned.
	g.recordLocked(id, CmdAddBot, addBotPayload{Champion: champion.ID, Mode: string(spec.Mode), Level: string(spec.Level), Boss: spec.Boss, Team: spec.Team, Stats: spec.Stats, Boons: spec.Boons})
	name := champion.Name
	if boss.Name != "" {
		name = boss.Name
	}
	p := newPlayer(id, name, kit, types.Character{
		Name:   name,
		Color:  kit.Outfit.Palette.Primary,
		Symbol: strings.ToUpper(string([]rune(name)[:1])),
	})
	p.IsBot = true
	p.IsDummy = spec.Mode == BotStandsStill
	p.BotLevel = string(spec.Level)
	p.Boss = spec.Boss
	p.Team = spec.Team
	if spec.Stats != nil {
		withStats(&p, *spec.Stats)
	}
	g.blessLocked(&p, boons)
	g.refillLocked(&p)
	g.players[id] = p
	g.startPlacementIfReadyLocked()
	return id, nil
}

/*
 * WakeBots turns every opponent that was standing still into one that fights,
 * for the rest of the match. It is how a tutorial becomes an ordinary solo
 * game: the fight carries on in the room it started in, with the same
 * opponent, rather than sending the player back to the lobby to find another.
 *
 * It goes the one way only. Nothing puts a fighting opponent back to sleep,
 * because nothing should: an opponent that stops fighting mid-match reads as
 * a bug, whoever asked for it.
 */
func (g *Game) WakeBots(userID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if _, ok := g.players[userID]; !ok {
		return ErrNoCharacter
	}
	woken := false
	for _, id := range g.sortedPlayerIDsLocked() {
		p := g.players[id]
		if !p.IsDummy {
			continue
		}
		p.IsDummy = false
		g.players[id] = p
		woken = true
	}
	if !woken {
		return ErrNobodyAsleep
	}
	g.recordLocked(userID, CmdWakeBots, nil)
	return nil
}

// nextBotIDLocked names a bot by its seat. In a duel the seat is free by
// construction; in a room that fills and empties before a fight between
// teams starts, the next free number is taken instead.
func (g *Game) nextBotIDLocked() string {
	for n := len(g.players) + 1; ; n++ {
		id := fmt.Sprintf("%s%d", BotIDPrefix, n)
		if _, taken := g.players[id]; !taken {
			return id
		}
	}
}

// addMonsterLocked seats a dream's monster: its own set, bar, numbers and
// colour, under the name the bestiary gives it.
func (g *Game) addMonsterLocked(spec BotSpec) (string, error) {
	m, kit, name, err := g.monsterLocked(spec.Monster)
	if err != nil {
		return "", err
	}
	if spec.Champion != "" || spec.Boss != "" {
		return "", ErrUnknownMonster
	}
	boons, err := g.boonsOfLocked(spec.Boons)
	if err != nil {
		return "", err
	}
	if spec.Level == "" {
		spec.Level = DefaultBotLevel
	}
	stats := types.FighterStats{Health: m.Health, ActionPoints: m.ActionPoints, MovementPoints: m.MovementPoints}
	if spec.Stats != nil {
		stats = *spec.Stats
	}
	id := g.nextBotIDLocked()
	g.recordLocked(id, CmdAddBot, addBotPayload{
		Mode: string(spec.Mode), Level: string(spec.Level), Team: spec.Team,
		Monster: m.ID, Stats: &stats, Boons: spec.Boons,
	})
	p := newPlayer(id, name, kit, types.Character{
		Name:   name,
		Color:  m.Color,
		Symbol: strings.ToUpper(string([]rune(name)[:1])),
	})
	withBar(&p, m.Bar)
	withStats(&p, stats)
	p.IsBot = true
	p.IsDummy = spec.Mode == BotStandsStill
	p.BotLevel = string(spec.Level)
	p.Team = spec.Team
	p.Monster = m.ID
	g.blessLocked(&p, boons)
	g.refillLocked(&p)
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

	// The bot sees what a player in its place would: nobody hidden in tall
	// grass beyond arm's reach. Its roll comes from the seed and how far into
	// the match it is, never from the game's own source.
	g.mu.RLock()
	roll := botRoll(g.seed, g.cmdSeq)
	g.mu.RUnlock()
	action := decideBotAction(g.SnapshotFor(id), id, roll)
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
	if g.groundAtTurnEndLocked(current) {
		return true
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
