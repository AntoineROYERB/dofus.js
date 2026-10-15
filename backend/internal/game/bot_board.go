package game

import (
	"game-server/internal/types"
)

// What a bot reads off a snapshot, and the rules it mirrors to see where
// things will end up: where a walk stops on ice, where a push leaves its
// victim, what the ground costs whoever ends a turn on it. The mirrors have
// to agree with the server the way the client's previews do — a bot that
// thinks a walk ends somewhere it does not plans the rest of its turn from
// the wrong cell — and bot_test.go holds them to it.

// fighter is one character as the planner sees it.
type fighter struct {
	id                string
	pos               types.Position
	health, maxHealth int
	burn, burnTurns   int
	pushResist        int
	maxAP, maxMP      int
	meleeBonus        int
	// player is a pointer so that copying a fighter, which the planner
	// does at every branch, copies a few words rather than a whole player.
	player *types.Player
}

// botBoard is the board from one bot's eyes: what it can see, and nothing
// the snapshot kept from it.
type botBoard struct {
	state     types.GameState
	botID     string
	mind      botMind
	me        fighter
	foes      []fighter // living and in sight, by id
	hidden    bool      // someone living is hidden from it in tall grass
	obstacles map[types.Position]bool
	terrain   map[types.Position]types.TerrainCell
	ground    map[types.Position]types.GroundCell
	relay     *types.Position

	threatCache   map[types.Position]int
	offenseCache  map[types.Position]int
	walkCache     *cellMap
	strikeCache   int
	reachCache    map[reachKey][]types.Position
	mobilityCache map[string][]getAbout
	barCache      map[string][]string
	firingCache   map[string][]firing
}

func readBoard(state types.GameState, botID string, mind botMind) *botBoard {
	b := &botBoard{
		state:         state,
		botID:         botID,
		mind:          mind,
		obstacles:     make(map[types.Position]bool, len(state.Obstacles)),
		terrain:       make(map[types.Position]types.TerrainCell, len(state.Terrain)),
		ground:        make(map[types.Position]types.GroundCell, len(state.Ground)),
		threatCache:   map[types.Position]int{},
		offenseCache:  map[types.Position]int{},
		reachCache:    map[reachKey][]types.Position{},
		mobilityCache: map[string][]getAbout{},
		barCache:      map[string][]string{},
		firingCache:   map[string][]firing{},
	}
	for _, cell := range state.Ground {
		b.ground[cell.Position] = cell
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
	for _, id := range sortedKeys(state.Players) {
		p := state.Players[id]
		if !p.Character.IsAlive {
			continue
		}
		if p.Character.Position == nil {
			if id != botID && p.Character.Concealed {
				b.hidden = true
			}
			continue
		}
		f := fighterOf(p)
		if id == botID {
			b.me = f
		} else {
			b.foes = append(b.foes, f)
		}
	}
	return b
}

func fighterOf(p types.Player) fighter {
	c := p.Character
	f := fighter{
		id:        p.UserID,
		pos:       *c.Position,
		health:    c.Health,
		maxHealth: max(1, c.MaxHealth),
		// What its next turn will start with. Zero is a real answer — a
		// rooted enemy walks nowhere — so it is never read as "unknown".
		maxAP:  c.MaxActionPoints,
		maxMP:  c.MaxMovementPoints,
		player: &p,
	}
	for _, e := range c.Effects {
		if e.Kind == types.EffectBurn {
			f.burn, f.burnTurns = e.Value, e.TurnsLeft
		}
	}
	// What its kit makes of it, as the server's kitOf reads it: a character
	// with no loadout has neither bonus.
	if !c.Loadout.IsZero() {
		if kit, err := Content().Kit(c.Loadout); err == nil {
			f.meleeBonus = kit.Grimoire.MeleeBonus
			if kit.Rune.Effect.Kind == types.RunePushResist {
				f.pushResist = kit.Rune.Effect.Value
			}
		}
	}
	return f
}

// solid is what nobody stands on or walks through, whoever is where.
func (b *botBoard) solid(pos types.Position) bool {
	return !InGrid(pos) || b.obstacles[pos] || isSolidTerrain(b.terrain[pos].Kind) || b.groundIs(pos, GroundRule.Solid)
}

// wallsIn mirrors Game.staysConnectedLocked for one more solid cell: whether
// a pylon or a pillar stood there would cut part of the board off. The server
// refuses such a cast, and a bot that did not know kept asking for it, turn
// after turn, while the turn it lost each time ran out.
func (b *botBoard) wallsIn(extra types.Position) bool {
	blocked := func(p types.Position) bool { return p == extra || b.solid(p) }
	cells := boardCells()
	free := 0
	start, found := types.Position{}, false
	for _, p := range cells {
		if blocked(p) {
			continue
		}
		free++
		if !found {
			start, found = p, true
		}
	}
	if !found {
		return false
	}
	seen := map[types.Position]bool{start: true}
	queue := []types.Position{start}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, n := range Neighbours(cur) {
			if InGrid(n) && !blocked(n) && !seen[n] {
				seen[n] = true
				queue = append(queue, n)
			}
		}
	}
	return len(seen) != free
}

// opaque is what stops a line of sight, whoever is where.
func (b *botBoard) opaque(pos types.Position) bool {
	return b.obstacles[pos] || terrainBlocksSight(b.terrain[pos].Kind) || b.groundIs(pos, GroundRule.BlocksSight)
}

func (b *botBoard) groundIs(pos types.Position, ask func(GroundRule) bool) bool {
	cell, ok := b.ground[pos]
	if !ok {
		return false
	}
	rule, ok := groundRules[cell.Kind]
	return ok && ask(rule)
}

func (b *botBoard) groundKind(pos types.Position) string {
	return b.ground[pos].Kind
}

// enterCost is what the server charges for a step onto a cell.
func (b *botBoard) enterCost(pos types.Position) int {
	if cell, ok := b.ground[pos]; ok {
		if rule, ok := groundRules[cell.Kind]; ok {
			return rule.EnterCost()
		}
	}
	return 1
}

// besideLava reports a cell lava scorches whoever starts a turn on.
func (b *botBoard) besideLava(pos types.Position) bool {
	if len(b.ground) == 0 {
		return false
	}
	for _, step := range steps {
		if b.groundKind(types.Position{X: pos.X + step.X, Y: pos.Y + step.Y}) == GroundLava {
			return true
		}
	}
	return false
}

// hazard is what the bot will not walk through: fire, whoever lit it, and
// the enemy's traps.
func (b *botBoard) hazard(pos types.Position) bool {
	cell, ok := b.terrain[pos]
	if !ok {
		return false
	}
	return cell.Kind == types.TerrainFire || (cell.Kind == types.TerrainTrap && cell.Owner != b.botID)
}

// occupied reports whether someone stands on a cell. The planner moves
// people around as it thinks, so the board never answers this on its own.
type occupied func(types.Position) bool

// standing is who stands where on the board as it is.
func (b *botBoard) standing(pos types.Position) bool {
	if pos == b.me.pos {
		return true
	}
	for _, f := range b.foes {
		if f.pos == pos {
			return true
		}
	}
	return false
}

func (b *botBoard) free(pos types.Position, taken occupied) bool {
	return !b.solid(pos) && !taken(pos)
}

// terrainAt is what spells left on a cell. The planner lays terrain as it
// thinks too, and reads it through its own lookup.
func (b *botBoard) terrainAt(pos types.Position) types.TerrainCell {
	return b.terrain[pos]
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

// stand is somewhere the bot can be this turn: where it ends up, the cell it
// asks to walk to for that, the movement points it has left there, and how
// many fires the walk goes through.
type stand struct {
	at, walkTo types.Position
	mpLeft     int
	fires      int
}

// stands lists where the bot can be by walking, itself included, in a fixed
// order. A bot that reads the ground knows a walk onto ice ends further on,
// and plans from where it will stand rather than from where it aimed.
//
// Fire is walked through at a price rather than walked round: a pyromancer's
// own fire can ring it completely, and a bot that treated fire as a wall
// stood inside the ring for the rest of the match.
func (b *botBoard) stands() []stand {
	mp := b.me.player.Character.MovementPoints
	from := b.me.pos
	walkable := func(pos types.Position) bool {
		return pos != from && (!b.free(pos, b.standing) || caught(b.terrainAt, pos, b.botID))
	}
	out := []stand{{at: from, walkTo: from, mpLeft: mp}}
	if mp <= 0 {
		return out
	}
	reachable := Reachable(from, mp, walkable, b.enterCost)
	cells := make([]types.Position, 0, len(reachable))
	for cell := range reachable {
		if cell != from {
			cells = append(cells, cell)
		}
	}
	sortPositions(cells)

	// The server walks its own path, which is not always the one Reachable
	// found; it only matters where the ground can change the walk.
	replay := false
	for _, cell := range b.terrain {
		if k := cell.Kind; k == types.TerrainFire || k == types.TerrainIce || k == types.TerrainTrap {
			replay = true
			break
		}
	}
	for _, cell := range b.ground {
		if cell.Kind == GroundIce {
			replay = true
			break
		}
	}

	seen := map[types.Position]int{from: 0}
	for _, cell := range cells {
		w := walk{end: cell, spent: reachable[cell]}
		if replay {
			w = b.walkEnd(from, cell)
		}
		end := w.end
		if !b.mind.readsGround {
			end = cell // it does not see the ice coming
		}
		if w.caught {
			continue
		}
		s := stand{at: end, walkTo: cell, mpLeft: mp - w.spent, fires: w.fires}
		if i, dup := seen[end]; dup {
			if better := out[i]; s.fires < better.fires || (s.fires == better.fires && s.mpLeft > better.mpLeft) {
				out[i] = s
			}
			continue
		}
		seen[end] = len(out)
		out = append(out, s)
	}
	return out
}

// walk is where a walk ends and what it went through on the way.
type walk struct {
	end    types.Position
	spent  int
	fires  int
	caught bool
}

// walkEnd mirrors Game.Move: the path the server will walk — its own, which
// is not always the one the bot would have chosen — and where the ground
// stops it: a trap holds, ice carries on.
func (b *botBoard) walkEnd(from, to types.Position) walk {
	blocked := func(pos types.Position) bool { return !b.free(pos, b.standing) }
	path := FindPath(from, to, blocked, b.enterCost)
	w := walk{end: from}
	if path == nil {
		return w
	}
	// Once it has set off, the cell it left is free for a slide to cross.
	others := func(pos types.Position) bool { return pos != from && b.standing(pos) }
	pos := from
	for _, step := range path {
		dir := types.Position{X: step.X - pos.X, Y: step.Y - pos.Y}
		w.spent += b.enterCost(step)
		pos = step
		w.end = pos
		if b.terrainAt(pos).Kind == types.TerrainFire {
			w.fires++
		}
		if caught(b.terrainAt, pos, b.botID) {
			w.caught = true
			return w
		}
		if end, slid := b.slide(b.terrainAt, pos, dir, others, b.botID); slid {
			w.end = end
			w.caught = caught(b.terrainAt, end, b.botID)
			return w
		}
		if end, slid := b.iceCarries(pos, dir, others); slid {
			w.end = end
			return w
		}
	}
	return w
}

// caught reports whether arriving on a cell stops whoever arrives: someone
// else's trap.
func caught(terrain func(types.Position) types.TerrainCell, pos types.Position, who string) bool {
	cell := terrain(pos)
	return cell.Kind == types.TerrainTrap && cell.Owner != who
}

// slide mirrors Game.slideLocked: spell ice carries whoever is on it along
// until it ends or something is in the way.
func (b *botBoard) slide(terrain func(types.Position) types.TerrainCell, pos, dir types.Position, taken occupied, who string) (types.Position, bool) {
	if dir == (types.Position{}) {
		return pos, false
	}
	slid := 0
	for slid < 2*GridRadius && terrain(pos).Kind == types.TerrainIce {
		next := types.Position{X: pos.X + dir.X, Y: pos.Y + dir.Y}
		if !b.free(next, taken) {
			break
		}
		pos = next
		slid++
		if caught(terrain, pos, who) {
			break
		}
	}
	return pos, slid > 0
}

// iceCarries mirrors the island's ice: one cell further, once.
func (b *botBoard) iceCarries(pos, dir types.Position, taken occupied) (types.Position, bool) {
	if dir == (types.Position{}) || b.groundKind(pos) != GroundIce {
		return pos, false
	}
	next := types.Position{X: pos.X + dir.X, Y: pos.Y + dir.Y}
	if !b.free(next, taken) {
		return pos, false
	}
	return next, true
}

// ---------------------------------------------------------------------------
// The end of a turn
// ---------------------------------------------------------------------------

// groundCost is what ending a turn on a cell will cost whoever does, in
// tenths of a hit point, before anyone else acts: acid at the end of this
// turn, lava and the wind at the start of the next, fire, someone else's
// water or a storm. Negative is ground that helps — its own water heals.
func (b *botBoard) groundCost(pos types.Position, f fighter) int {
	cost := 0
	if b.groundKind(pos) == GroundAcidPool {
		cost += 10 * percentOfMaxHealth(f.player.Character, AcidPercent)
	}
	// The wind moves it first, and it is where the wind leaves it that
	// burns beside the lava.
	next := pos
	if cell, ok := b.ground[pos]; ok && cell.Kind == GroundAirCurrent && cell.Wind != nil {
		carried := types.Position{X: pos.X + cell.Wind.X, Y: pos.Y + cell.Wind.Y}
		if !b.solid(carried) {
			next = carried
		}
	}
	if b.besideLava(next) {
		cost += 10 * percentOfMaxHealth(f.player.Character, LavaBurnPercent)
	}
	switch cell := b.terrain[next]; cell.Kind {
	case types.TerrainFire:
		cost += 10 * BurnDamagePerStack * 2
	case types.TerrainWater:
		if cell.Owner == f.id {
			cost -= 10 * min(WaterHealing, f.maxHealth-f.health)
		} else {
			cost += 10 * WaterSlow * 2
		}
	}
	for _, z := range b.state.Zones {
		if z.Owner != f.id && z.Kind == types.ZoneStorm && containsPosition(z.Cells, next) {
			cost += 10 * StormDamage
		}
	}
	return cost
}

// reachesFrom reports whether a spell cast from one cell lands on another,
// with only what the board itself holds in the way.
func reachesFrom(spell types.Spell, from, to types.Position, opaque func(types.Position) bool) bool {
	if spell.Targeting == types.TargetSelf {
		return containsPosition(AffectedPositions(spell, from, from), to) && from != to
	}
	if spell.Targeting == types.TargetEmpty {
		return false
	}
	if Distance(from, to) > spell.Range {
		return false
	}
	return !spell.NeedsLineOfSight || HasLineOfSight(from, to, opaque)
}

// expectedDamage is a spell's damage with its critical chance priced in.
func expectedDamage(spell types.Spell) int {
	crit := spell.CriticalDamage
	if crit == 0 {
		crit = spell.Damage
	}
	return (spell.Damage*(100-spell.CriticalChance) + crit*spell.CriticalChance) / 100
}
