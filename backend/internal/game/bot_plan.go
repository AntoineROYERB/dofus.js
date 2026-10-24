package game

import (
	"sort"
	"strconv"

	"game-server/internal/types"
)

// The planner. Each time it is asked, the bot weighs every cell it can walk
// to: the best run of casts it could make from there, and where it would end
// its turn afterwards. Then it takes the first step of the best of them — a
// cast, or the walk to where the casting is better — and is asked again once
// that step has landed, so it never acts on a plan the board has moved out
// from under.
//
// Everything is scored in tenths of a hit point: damage dealt is worth what
// it takes off, and the rest — a burn that will tick, an enemy thrown against
// the lava, a cell the enemy cannot reach — is priced in the same coin.

// Prices of what is not damage, in tenths of a hit point.
const (
	killBonus        = 250 // a dead enemy hits back with nothing
	burnStackValue   = 10 * BurnDamagePerStack
	slowValue        = 10 // per movement point taken off
	rootValue        = 30
	zoneValue        = 40
	pushedClearValue = 60 // a ranged caster throwing a brawler off its doorstep
	pulledInValue    = 60 // a brawler dragging a caster into reach
	stepCost         = 2  // per movement point spent, so it does not wander for nothing
	gapCost          = 30 // per cell it would still be short of hitting next turn
	closeness        = 3  // per cell of walk to the nearest enemy
	keepAwayCost     = 150
	minCoverGain     = 40
	patientTurns     = 8                                      // turns before caution starts to wear off
	fireCost         = 10 * BurnDamagePerStack * BurnDuration // a burn caught walking through fire
	hemmedInValue    = 15                                     // per rock raised beside an enemy, in its way out
	pillarWornValue  = 5                                      // per point a Stonewarden's pillar loses: it would have soaked a blow
	pylonWornValue   = 2                                      // per point a pylon loses, the enemy's or, as a cost, the bot's
	pylonBrokenValue = 80                                     // the enemy's spells weak for three turns
	pylonLostCost    = 80                                     // the bot's own, the same the other way
	pylonKeptValue   = 100                                    // a pylon still standing when the bot's next turn comes
	// relayCellsWeighed is how many cells a pylon could go on are checked
	// for shelter from the enemy.
	relayCellsWeighed = 6
)

// castStep is one cast of a plan.
type castStep struct {
	spell types.Spell
	aim   types.Position
}

// plan is a run of casts from one cell, and what it is worth.
type plan struct {
	casts []castStep
	value int
	// endAt is where the caster stands once the casts are done: a leap
	// moves it.
	endAt types.Position
}

// sim is the board partway through a planned run of casts. It is small and
// copied at every branch: the planner weighs a few thousand of them a
// decision.
type sim struct {
	b     *botBoard
	ready []types.Spell
	me    fighter
	foes  []fighter
	// things are the pylons, pillars and rocks standing on the board, as
	// the casts so far have left them: worn down, broken, raised, moved.
	things []thing
	// relayDown is the bot's own pylon broken during the plan: the spell
	// that sets one is on cooldown until it has recharged.
	relayDown bool
	// reshaped is the plan having changed what is solid: raised, broken or
	// moved something, or dug the ground. Until it has, whether a cell would
	// wall the board off is the board's own answer, worked out once.
	reshaped bool
	laid     []types.TerrainCell
	ap       int
	used     [maxBar]int // casts so far, by index in ready
	nth      *int        // options weighed so far, for the noise
}

// thing is something standing on a cell that a cast can wear down, break,
// raise or move: a pylon, a Stonewarden's pillar, a rock. They stand in the
// way and hide what is behind them, and the planner's casts change where
// they are, so the planner keeps its own list of them.
type thing struct {
	pos    types.Position
	kind   string // types.TerrainRelay or types.TerrainPillar
	owner  string
	health int
}

// maxBar is the most spells the planner weighs at once; a bar holds five.
const maxBar = 12

// newSim is the board as it is, with the bot standing on a cell.
func (b *botBoard) newSim(at types.Position, ready []types.Spell, nth *int) *sim {
	me := b.me
	me.pos = at
	return &sim{
		b:      b,
		ready:  ready,
		me:     me,
		foes:   append([]fighter(nil), b.foes...),
		things: b.things,
		ap:     b.me.player.Character.ActionPoints,
		nth:    nth,
	}
}

func (s *sim) clone() *sim {
	n := *s
	n.foes = append([]fighter(nil), s.foes...)
	// What was laid and what stands are shared until something changes:
	// capping the slices makes the next append copy them rather than write
	// into the parent's, and ownThings copies before anything is changed in
	// place.
	n.laid = s.laid[:len(s.laid):len(s.laid)]
	n.things = s.things[:len(s.things):len(s.things)]
	return &n
}

// ownThings gives this board a list of things of its own, to change in place.
func (s *sim) ownThings() {
	s.things = append([]thing(nil), s.things...)
}

func (s *sim) thingAt(pos types.Position) int {
	for i, t := range s.things {
		if t.pos == pos {
			return i
		}
	}
	return -1
}

// myRelay is where the bot's own pylon stands, if it has one.
func (s *sim) myRelay() (types.Position, bool) {
	for _, t := range s.things {
		if t.kind == types.TerrainRelay && t.owner == s.me.id {
			return t.pos, true
		}
	}
	return types.Position{}, false
}

// removeThing takes a thing off the board. The server deletes the cell's
// terrain with it, so what was under it does not come back either.
func (s *sim) removeThing(i int) {
	pos := s.things[i].pos
	s.things = append(s.things[:i:i], s.things[i+1:]...)
	s.clearCell(pos)
	s.reshaped = true
}

func (s *sim) clearCell(pos types.Position) {
	s.laid = append(s.laid, types.TerrainCell{Position: pos})
}

func (s *sim) taken(pos types.Position) bool {
	if pos == s.me.pos {
		return true
	}
	for _, f := range s.foes {
		if f.health > 0 && f.pos == pos {
			return true
		}
	}
	return s.b.allyAt(pos)
}

func (s *sim) terrainAt(pos types.Position) types.TerrainCell {
	if i := s.thingAt(pos); i >= 0 {
		t := s.things[i]
		return types.TerrainCell{Position: pos, Kind: t.kind, Owner: t.owner, Health: t.health}
	}
	for i := len(s.laid) - 1; i >= 0; i-- {
		if s.laid[i].Position == pos {
			return s.laid[i]
		}
	}
	if cell := s.b.terrain[pos]; !isThing(cell.Kind) {
		return cell
	}
	// A pylon or a pillar the plan has broken or moved away.
	return types.TerrainCell{}
}

// solid mirrors Game.solidLocked on the planner's board.
func (s *sim) solid(pos types.Position) bool {
	if !InGrid(pos) || s.b.groundIs(pos, GroundRule.Solid) || s.thingAt(pos) >= 0 {
		return true
	}
	if s.b.obstacles[pos] && !isThing(s.b.terrain[pos].Kind) {
		return true
	}
	kind := s.terrainAt(pos).Kind
	return kind == types.TerrainCrater || kind == types.TerrainFissure
}

func (s *sim) free(pos types.Position) bool {
	return !s.solid(pos) && !s.taken(pos)
}

// freeFor is free for one enemy on the move: the cell it is leaving is open.
func (s *sim) freeFor(i int) func(types.Position) bool {
	others := s.takenBut(i)
	return func(pos types.Position) bool { return !s.solid(pos) && !others(pos) }
}

func (s *sim) opaque(pos types.Position) bool {
	if s.thingAt(pos) >= 0 || s.taken(pos) || s.b.groundIs(pos, GroundRule.BlocksSight) {
		return true
	}
	if s.b.obstacles[pos] && !isThing(s.b.terrain[pos].Kind) {
		return true
	}
	return s.terrainAt(pos).Kind == types.TerrainSmoke
}

// wallsIn mirrors Game.staysConnectedLocked on the planner's board.
func (s *sim) wallsIn(extra types.Position) bool {
	if !s.reshaped {
		return s.b.wallsInCached(extra)
	}
	return wallsIn(s.solid, extra)
}

func (s *sim) foeAt(pos types.Position) int {
	for i, f := range s.foes {
		if f.health > 0 && f.pos == pos {
			return i
		}
	}
	return -1
}

// reach reports whether a spell cast from one cell may be aimed at another.
func (s *sim) reach(from, aim types.Position, spell types.Spell) bool {
	if Distance(from, aim) > spell.Range {
		return false
	}
	return !spell.NeedsLineOfSight || HasLineOfSight(from, aim, s.opaque)
}

// origin mirrors Game.castOriginLocked: a relayed spell goes out from the
// relay whenever the relay reaches, and from the caster otherwise.
func (s *sim) origin(aim types.Position, spell types.Spell) (types.Position, bool, bool) {
	if spell.Relayed {
		if relay, ok := s.myRelay(); ok && s.reach(relay, aim, spell) {
			return relay, true, true
		}
	}
	return s.me.pos, false, s.reach(s.me.pos, aim, spell)
}

// planFrom is the best run of casts the bot could make standing on a cell.
func (b *botBoard) planFrom(at types.Position, ready []types.Spell, nth *int) plan {
	s := b.newSim(at, ready, nth)
	p := s.search(b.mind.depth)
	if len(p.casts) == 0 {
		p.endAt = at
	}
	return p
}

// search finds the best run of casts from here. Runs are compared with where
// they leave the bot priced in, which is only ever different for a run that
// moves it — a leap, a swap with the pylon — so that a cast that does nothing
// but take the bot somewhere better is worth making.
func (s *sim) search(depth int) plan {
	best := plan{endAt: s.me.pos}
	if depth <= 0 {
		return best
	}
	bestScore := s.b.rest(s.me.pos)
	for i, spell := range s.ready {
		if i >= maxBar {
			break
		}
		if spell.APCost > s.ap || (spell.MaxCastsPerTurn > 0 && s.used[i]+s.b.castsSoFar(spell) >= spell.MaxCastsPerTurn) {
			continue
		}
		// A broken pylon puts the spell that sets one on cooldown; an infused
		// ultimate that leaves one is not that spell.
		if s.relayDown && spell.Special == types.SpecialRelay && len(spell.Infusions) == 0 {
			continue
		}
		for _, aim := range s.aims(spell, i) {
			value, next, ok := s.cast(spell, i, aim)
			if !ok {
				continue
			}
			sub := next.search(depth - 1)
			*s.nth++
			total := s.b.mind.bend(value, *s.nth) + sub.value
			if score := total + s.b.rest(sub.endAt); score > bestScore {
				bestScore = score
				best = plan{
					casts: append([]castStep{{spell: spell, aim: aim}}, sub.casts...),
					value: total,
					endAt: sub.endAt,
				}
			}
		}
	}
	return best
}

// castsSoFar is how often the bot has already cast a spell this turn.
func (b *botBoard) castsSoFar(spell types.Spell) int {
	return b.me.player.Spells[spellKey(spell)].CastsThisTurn
}

func spellKey(spell types.Spell) string {
	return strconv.Itoa(spell.ID)
}

// aims are the cells worth aiming a spell at: the enemies, the cells around
// them for a spell with an area, an enemy's pylon, where to land a leap,
// where to put a relay, the pylon to trade places with.
func (s *sim) aims(spell types.Spell, idx int) []types.Position {
	switch {
	case spell.Special == types.SpecialLeap:
		var cells []types.Position
		for _, f := range s.foes {
			if f.health <= 0 {
				continue
			}
			for _, cell := range sortedNeighbours(f.pos) {
				d := Distance(s.me.pos, cell)
				if d > 0 && d <= spell.Range && s.free(cell) && !s.b.hazard(cell) && !containsPosition(cells, cell) {
					cells = append(cells, cell)
				}
			}
		}
		return cells
	case spell.Special == types.SpecialRelay && spell.Damage <= 0:
		return s.relayCells(spell)
	case spell.Special == types.SpecialSwap:
		if relay, ok := s.myRelay(); ok {
			return []types.Position{relay}
		}
		return nil
	case spell.Targeting == types.TargetSelf:
		if spell.Damage > 0 {
			return []types.Position{s.me.pos}
		}
		return nil
	case spell.Targeting == types.TargetEmpty || spell.Damage <= 0:
		return nil
	}
	var cells []types.Position
	for _, f := range s.foes {
		if f.health <= 0 {
			continue
		}
		if !containsPosition(cells, f.pos) {
			cells = append(cells, f.pos)
		}
		if spell.AreaOfEffect != "" && spell.AreaOfEffect != types.AoENone {
			for _, n := range sortedNeighbours(f.pos) {
				if !containsPosition(cells, n) {
					cells = append(cells, n)
				}
			}
		}
	}
	// An enemy's pylon can be shot down: it is what makes its owner's spells
	// hit hard from across the board.
	for _, t := range s.things {
		if t.kind == types.TerrainRelay && t.owner != s.me.id && !containsPosition(cells, t.pos) {
			cells = append(cells, t.pos)
		}
	}
	return cells
}

// relayCells are where a relay would let a relayed spell still affordable
// after it land on an enemy: the nearest such cell to the bot, and the
// nearest the enemy cannot break the pylon on next turn, when that is another.
// None is offered when the relay already stands somewhere that does.
func (s *sim) relayCells(relaySpell types.Spell) []types.Position {
	var relayed []types.Spell
	for _, spell := range s.ready {
		if spell.Relayed && spell.Damage > 0 && spell.APCost <= s.ap-relaySpell.APCost {
			relayed = append(relayed, spell)
		}
	}
	if len(relayed) == 0 {
		return nil
	}
	landsFrom := func(from types.Position) bool {
		for _, spell := range relayed {
			for _, f := range s.foes {
				if f.health > 0 && s.reach(from, f.pos, spell) {
					return true
				}
			}
		}
		return false
	}
	if relay, ok := s.myRelay(); ok && landsFrom(relay) {
		return nil
	}
	var cells []types.Position
	for _, cell := range allCells {
		d := Distance(s.me.pos, cell)
		if d == 0 || d > relaySpell.Range || !s.free(cell) {
			continue
		}
		if relaySpell.NeedsLineOfSight && !HasLineOfSight(s.me.pos, cell, s.opaque) {
			continue
		}
		cells = append(cells, cell)
	}
	sort.SliceStable(cells, func(i, j int) bool { return Distance(s.me.pos, cells[i]) < Distance(s.me.pos, cells[j]) })
	var out []types.Position
	weighed := 0
	for _, cell := range cells {
		if !landsFrom(cell) || s.wallsIn(cell) {
			continue
		}
		if len(out) == 0 {
			out = append(out, cell)
		}
		// What the enemy could do to a cell is the dearest thing the
		// planner asks; a few cells are enough to find a sheltered one.
		if s.exposure(cell) < pylonKeptValue {
			if cell != out[0] {
				out = append(out, cell)
			}
			break
		}
		if weighed++; weighed >= relayCellsWeighed {
			break
		}
	}
	return out
}

// exposure is what standing a pylon on a cell is likely to cost: all it is
// worth if the enemy could break it there next turn, a share of it if they
// could wear it down.
func (s *sim) exposure(pos types.Position) int {
	threat := s.b.threat(pos)
	if threat >= 10*RelayHealth {
		return pylonKeptValue
	}
	return pylonKeptValue * threat / (10 * RelayHealth)
}

// cast plays one cast on the simulated board, mirroring Game.CastSpell, and
// reports what it was worth and the board it leaves.
func (s *sim) cast(spell types.Spell, idx int, aim types.Position) (int, *sim, bool) {
	b := s.b
	origin, via := s.me.pos, false
	switch {
	case spell.Targeting == types.TargetSelf:
		aim = s.me.pos
	case spell.Special == types.SpecialSwap:
		// Aimed at the pylon itself, wherever it stands.
		relay, ok := s.myRelay()
		if !ok || aim != relay || !s.reach(s.me.pos, aim, spell) {
			return 0, nil, false
		}
		n := s.clone()
		n.ap -= spell.APCost
		n.used[idx]++
		n.swap()
		// A swap is worth where it leaves the bot, which search prices.
		return 0, n, true
	default:
		var ok bool
		if origin, via, ok = s.origin(aim, spell); !ok {
			return 0, nil, false
		}
		if spell.Targeting == types.TargetEmpty {
			if !s.free(aim) {
				return 0, nil, false
			}
			if spell.Special == types.SpecialRelay && s.wallsIn(aim) {
				return 0, nil, false
			}
		}
	}

	// Everything that can refuse the cast is checked before the board is
	// copied: most of what the planner weighs is refused, and the copies
	// were most of what it cost.
	settles := spell.Special == types.SpecialRelay && spell.Damage <= 0
	landing := s.me.pos
	if spell.Special == types.SpecialLeap {
		landing = aim
	}
	var cells []types.Position
	spare := spell.Targeting == types.TargetSelf
	switch {
	case settles:
	case spell.Special == types.SpecialLeap:
		cells, spare = Neighbours(aim), true
	default:
		cells = AffectedPositions(spell, aim, origin)
	}
	if !settles {
		if !spare && spell.Damage > 0 && containsPosition(cells, landing) {
			return 0, nil, false // friendly fire on itself is never worth it
		}
		// Nor on its own side: a spell lands on whoever stands under it, and
		// a monster that hit the monster beside it would only be helping.
		if hurts(spell) {
			for _, cell := range cells {
				if b.allyAt(cell) {
					return 0, nil, false
				}
			}
		}
		hits := false
		for _, cell := range cells {
			if cell != landing && (s.foeAt(cell) >= 0 || s.struck(cell)) {
				hits = true
				break
			}
		}
		if !hits {
			return 0, nil, false // it hits nobody
		}
	}

	n := s.clone()
	n.ap -= spell.APCost
	n.used[idx]++
	if spell.Special == types.SpecialLeap {
		n.me.pos = aim
	}
	if settles {
		n.setRelay(aim)
		// A relay is worth what it lets the rest of the plan do, and the
		// turn after if the enemy cannot break it before then.
		return pylonKeptValue - s.exposure(aim)/2, n, true
	}

	damage := expectedDamage(spell)
	if via {
		damage = damage * (100 + RelayBonus) / 100
	}
	value, victims, ok := n.strike(spell, cells, damage)
	if !ok {
		return 0, nil, false
	}
	var before [8]types.Position
	for _, i := range victims {
		before[i] = n.foes[i].pos
	}
	// A spell that strikes more than once follows whoever it hit, wherever
	// the strike before has thrown them.
	for h := 1; h < spell.Hits; h++ {
		value += n.pushAll(spell, aim, origin, via, victims)
		var at []types.Position
		for _, i := range victims {
			if n.foes[i].health > 0 {
				at = append(at, n.foes[i].pos)
			}
		}
		again, _, ok := n.strike(spell, at, damage)
		if !ok {
			return 0, nil, false
		}
		value += again
	}

	// Where the cast leaves its victims is priced against where they stood,
	// so the ground it lays under them counts as well as where it throws them.
	var placedBefore [8]int
	for _, i := range victims {
		placedBefore[i] = n.placement(n.foes[i])
	}
	if spell.Terrain != "" {
		for _, cell := range cells {
			if spell.Special == types.SpecialCrater && cell == aim {
				continue
			}
			n.lay(cell, spell.Terrain)
		}
	}
	value += n.pushAll(spell, aim, origin, via, victims)
	value += n.reshape(spell, aim, origin)

	for _, i := range victims {
		f := n.foes[i]
		if f.health <= 0 {
			continue
		}
		value += n.placement(f) - placedBefore[i]
		// Throwing a brawler off its doorstep is worth something only if it
		// was on the doorstep to begin with: walking up to it for the
		// pleasure of pushing it away again is not. Nor is walking off the
		// doorstep and casting something that throws nobody anywhere.
		was, now := Distance(before[i], n.me.pos), Distance(f.pos, n.me.pos)
		switch {
		case n.me.meleeBonus == 0 && f.pos != before[i] && Distance(before[i], b.me.pos) == 1 && now > 1:
			value += pushedClearValue
		case n.me.meleeBonus > 0 && was > 1 && now == 1:
			value += pulledInValue
		}
		// A zone acts at the start of the victim's turn, before it can walk
		// out: a storm strikes once for certain. Drums beat at the start of
		// the bot's own turn, by when the victim may have walked off, unless
		// they follow it.
		if spell.Zone != nil && containsPosition(cells, f.pos) {
			switch {
			case spell.Zone.Kind == types.ZoneStorm:
				value += 10 * StormDamage
			case spell.Zone.Kind == types.ZoneDrums && spell.Element == "Air":
				value += 10 * DrumBeat * 3 / 4
			default:
				value += zoneValue
			}
		}
	}
	return value, n, true
}

// hurts reports whether a spell does anyone standing under it any harm:
// damage, a shove, or an effect laid on them rather than on its caster.
func hurts(spell types.Spell) bool {
	return spell.Damage > 0 || spell.Push != 0 || (spell.Effect != nil && !spell.Effect.OnSelf)
}

// struck reports whether a cast on a cell wears down something of the
// enemy's standing there: a pylon, or a pillar that still holds.
func (s *sim) struck(cell types.Position) bool {
	i := s.thingAt(cell)
	if i < 0 {
		return false
	}
	t := s.things[i]
	return t.owner != s.me.id && !s.b.isAlly(t.owner) && (t.kind == types.TerrainRelay || t.health > 0)
}

// strike mirrors Game.strikeLocked: the cast's damage and effects on every
// enemy on the covered cells, and on whatever of theirs stands there, cell by
// cell. It reports the enemies it hit, by index, in that order. A boss
// cashing burns in too early refuses it.
func (s *sim) strike(spell types.Spell, cells []types.Position, damage int) (int, []int, bool) {
	b := s.b
	value := 0
	var victims []int
	for _, cell := range cells {
		if s.struck(cell) {
			amount := damage
			if s.me.meleeBonus > 0 && Distance(s.me.pos, cell) == 1 {
				amount = amount * (100 + s.me.meleeBonus) / 100
			}
			value += s.wear(s.thingAt(cell), amount)
		}
		i := s.foeAt(cell)
		if i < 0 {
			continue
		}
		f := &s.foes[i]
		// A maelstrom tears the shield away before it hits, not after.
		if spell.Zone != nil && spell.Zone.Kind == types.ZoneMaelstrom {
			f.shield = 0
		}
		amount := damage
		if spell.Special == types.SpecialDetonate {
			bonus := f.burn * f.burnTurns * BurnDamagePerStack
			// A boss that waits for its burns to pile up does not cash
			// them in early — unless it would finish the fight.
			if wait := b.mind.boss.detonateAt; wait > 0 && f.burn < wait && amount+bonus < f.health {
				return 0, nil, false
			}
			amount += bonus
			f.burn, f.burnTurns = 0, 0
		}
		if spell.Conducts && s.terrainAt(cell).Kind == types.TerrainWater {
			amount = amount * (100 + ConductBonus) / 100
		}
		if s.me.meleeBonus > 0 && Distance(s.me.pos, cell) == 1 {
			amount = amount * (100 + s.me.meleeBonus) / 100
		}
		if s.me.finisher > 0 && f.health*100 < f.player.Character.MaxHealth*s.me.finisherBelow {
			amount = amount * (100 + s.me.finisher) / 100
		}
		if rule, ok := groundRules[b.groundKind(cell)]; ok {
			amount = rule.DamageTaken(spell.Element, amount)
		}
		value += s.hit(i, amount)
		victims = append(victims, i)
		if f.health <= 0 {
			continue
		}
		if e := spell.Effect; e != nil && !e.OnSelf {
			switch e.Kind {
			case types.EffectBurn:
				value += s.burn(i, e.Value)
			case types.EffectMP:
				value += -e.Value * slowValue
			case types.EffectRoot:
				value += rootValue
			}
		}
	}
	return value, victims, true
}

// hit mirrors Game.hitLocked: a blow on an enemy that a pillar of theirs it
// stands beside takes first, as much as it holds, and its shield after that.
func (s *sim) hit(i, amount int) int {
	f := &s.foes[i]
	if f.health <= 0 || amount <= 0 {
		return 0
	}
	value := 0
	if g := s.guardOf(f.id, f.pos); g >= 0 {
		s.ownThings()
		t := &s.things[g]
		taken := min(amount, t.health)
		amount -= taken
		t.health -= taken
		value += pillarWornValue * taken
		if t.health <= 0 {
			s.removeThing(g)
		}
	}
	if f.shield > 0 {
		amount = max(0, amount-f.shield)
	}
	return value + s.hurt(i, amount)
}

// guardOf mirrors Game.guardOfLocked: the pillar of theirs a fighter stands
// beside with the most left in it, corners included.
func (s *sim) guardOf(id string, pos types.Position) int {
	best := -1
	for _, n := range around(pos) {
		i := s.thingAt(n)
		if i < 0 {
			continue
		}
		t := s.things[i]
		if t.kind != types.TerrainPillar || t.owner != id || t.health <= 0 {
			continue
		}
		if best < 0 || t.health > s.things[best].health {
			best = i
		}
	}
	return best
}

// wear mirrors Game.hitRelayLocked and Game.hitPillarLocked: a pylon or a
// pillar worn down, and broken once it has nothing left. A pylon goes off as
// it breaks, on its owner's enemies next to it — the bot among them, if it is
// someone else's.
func (s *sim) wear(i, amount int) int {
	if i < 0 || amount <= 0 {
		return 0
	}
	s.ownThings()
	t := &s.things[i]
	if t.kind == types.TerrainPillar {
		if t.health <= 0 {
			return 0
		}
		worn := min(amount, t.health)
		t.health -= amount
		if t.health <= 0 {
			s.removeThing(i)
		}
		return pillarWornValue * worn
	}
	mine := t.owner == s.me.id
	worn := min(amount, t.health)
	t.health -= amount
	value := pylonWornValue * worn
	if mine {
		value = -value
	}
	if t.health > 0 {
		return value
	}
	pos, owner := t.pos, t.owner
	s.removeThing(i)
	if mine {
		value -= pylonLostCost
		s.relayDown = true
	} else {
		value += pylonBrokenValue
	}
	for _, n := range Neighbours(pos) {
		if n == s.me.pos && owner != s.me.id {
			blast := RelayBlast
			if s.me.shield > 0 {
				blast = max(0, blast-s.me.shield)
			}
			s.me.health -= blast
			value -= 10 * blast
			continue
		}
		if j := s.foeAt(n); j >= 0 && s.foes[j].id != owner {
			value += s.hit(j, RelayBlast)
		}
	}
	return value
}

// pushAll mirrors Game.pushVictimsLocked. A push goes away from where the
// spell came from — a leap's from where the bot lands — or, out of a pylon,
// draws its victims into it; a pull drags them to the bot.
func (s *sim) pushAll(spell types.Spell, aim, origin types.Position, via bool, victims []int) int {
	if spell.Push == 0 {
		return 0
	}
	from := origin
	if spell.Special == types.SpecialLeap {
		from = aim
	}
	value := 0
	for _, i := range victims {
		if s.foes[i].health <= 0 {
			continue
		}
		at := s.foes[i].pos
		switch {
		case spell.Push > 0 && via:
			value += s.shove(i, stepTowards(at, from), spell.Push, nil)
		case spell.Push > 0:
			value += s.shove(i, stepTowards(from, at), spell.Push, nil)
		default:
			caster := s.me.pos
			value += s.shove(i, stepTowards(at, caster), -spell.Push, &caster)
		}
	}
	return value
}

// reshape mirrors what Game.reshapeBoardLocked raises, digs or moves once the
// cast's damage is dealt and its victims thrown: a pylon, menhirs, a cage, a
// crater, fissures. Rocks next to an enemy are worth what they take off its
// way out.
func (s *sim) reshape(spell types.Spell, aim, origin types.Position) int {
	value := 0
	switch spell.Special {
	case types.SpecialRelay:
		if s.free(aim) && !s.wallsIn(aim) {
			s.setRelay(aim)
		}
	case types.SpecialFlank:
		// Across the cast, one either side of where it landed.
		side := Rotate(types.Position{X: 1}, facing(origin, aim))
		for _, sign := range []int{1, -1} {
			value += s.raiseRock(types.Position{X: aim.X + side.X*sign, Y: aim.Y + side.Y*sign})
		}
	case types.SpecialCage:
		// Every side but the one facing the caster.
		open := stepTowards(aim, origin)
		for _, n := range Neighbours(aim) {
			if n.X-aim.X == open.X && n.Y-aim.Y == open.Y {
				continue
			}
			value += s.raiseRock(n)
		}
	case types.SpecialCrater:
		if s.free(aim) && !s.wallsIn(aim) {
			s.laid = append(s.laid, types.TerrainCell{Position: aim, Kind: types.TerrainCrater, Owner: s.me.id})
			s.reshaped = true
		}
	case types.SpecialQuake:
		for _, offset := range quakeFissures {
			cell := types.Position{X: origin.X + offset.X, Y: origin.Y + offset.Y}
			if s.free(cell) && !s.wallsIn(cell) {
				s.laid = append(s.laid, types.TerrainCell{Position: cell, Kind: types.TerrainFissure, Owner: s.me.id})
				s.reshaped = true
			}
		}
	}
	return value
}

// setRelay stands the bot's pylon on a cell, whole, and takes down the one it
// had.
func (s *sim) setRelay(pos types.Position) {
	s.ownThings()
	for i, t := range s.things {
		if t.kind == types.TerrainRelay && t.owner == s.me.id {
			s.removeThing(i)
			break
		}
	}
	s.things = append(s.things, thing{pos: pos, kind: types.TerrainRelay, owner: s.me.id, health: RelayHealth})
	s.reshaped = true
}

// swap mirrors the server's Transfer: the bot and its pylon change places,
// the pylon keeping what health it had.
func (s *sim) swap() {
	s.ownThings()
	for i, t := range s.things {
		if t.kind == types.TerrainRelay && t.owner == s.me.id {
			s.clearCell(t.pos)
			s.clearCell(s.me.pos)
			s.things[i].pos, s.me.pos = s.me.pos, t.pos
			s.reshaped = true
			return
		}
	}
}

// raiseRock mirrors Game.raiseRockLocked and reports what the rock is worth:
// something when it stands in an enemy's way out.
func (s *sim) raiseRock(pos types.Position) int {
	if !s.free(pos) || s.wallsIn(pos) {
		return 0
	}
	s.ownThings()
	s.things = append(s.things, thing{pos: pos, kind: types.TerrainPillar, owner: s.me.id})
	s.reshaped = true
	value := 0
	for _, n := range Neighbours(pos) {
		if s.foeAt(n) >= 0 {
			value += hemmedInValue
		}
	}
	return value
}

// hurt takes damage off an enemy and prices it: what it took off, and the
// kill if it was one.
func (s *sim) hurt(i, amount int) int {
	f := &s.foes[i]
	if f.health <= 0 || amount <= 0 {
		return 0
	}
	dealt := min(amount, f.health)
	f.health -= amount
	value := 10 * dealt
	if f.health <= 0 && s.b.mind.finishes {
		value += killBonus
	}
	return value
}

func (s *sim) burn(i, stacks int) int {
	f := &s.foes[i]
	added := min(MaxBurnStacks, f.burn+stacks) - f.burn
	f.burn += added
	f.burnTurns = BurnDuration
	return added * burnStackValue
}

// lay mirrors Game.placeTerrainLocked, for what the planner needs to know.
func (s *sim) lay(pos types.Position, kind string) {
	if !InGrid(pos) || s.b.groundIs(pos, GroundRule.Solid) || s.thingAt(pos) >= 0 {
		return // a pylon, a pillar or a rock is never replaced
	}
	if s.b.obstacles[pos] && !isThing(s.b.terrain[pos].Kind) {
		return
	}
	existing := s.terrainAt(pos)
	if isSolidTerrain(existing.Kind) || existing.Kind == types.TerrainTrap {
		return
	}
	if kind == types.TerrainFire && (existing.Kind == types.TerrainWater || existing.Kind == types.TerrainIce) {
		return
	}
	if kind == types.TerrainTrap && s.taken(pos) {
		return
	}
	s.laid = append(s.laid, types.TerrainCell{Position: pos, Kind: kind, Owner: s.me.id})
}

// shove mirrors Game.shoveLocked, and prices what the shove itself does: a
// slam into something — a pylon slammed into is worn down too — a trap sprung.
func (s *sim) shove(i int, dir types.Position, n int, pullTo *types.Position) int {
	f := &s.foes[i]
	if pullTo == nil {
		n -= f.pushResist
	}
	if dir == (types.Position{}) || n <= 0 {
		return 0
	}
	value, moved := 0, 0
	for moved < n {
		if pullTo != nil && Distance(f.pos, *pullTo) <= 1 {
			break
		}
		next := types.Position{X: f.pos.X + dir.X, Y: f.pos.Y + dir.Y}
		if !s.free(next) {
			if pullTo == nil {
				value += s.hit(i, CollisionDamage)
				if t := s.thingAt(next); t >= 0 && s.things[t].kind == types.TerrainRelay {
					value += s.wear(t, CollisionDamage)
				}
			}
			break
		}
		f.pos = next
		moved++
		if stop, v := s.arrive(i, dir); stop {
			return value + v
		} else {
			value += v
		}
	}
	if moved > 0 && f.health > 0 {
		if end, slid := s.b.slide(s.terrainAt, f.pos, dir, s.freeFor(i), f.id); slid {
			f.pos = end
			if caught(s.terrainAt, end, f.id) {
				s.clearCell(end)
				value += s.hit(i, TrapDamage)
			}
		}
	}
	return value
}

func (s *sim) takenBut(i int) occupied {
	return func(pos types.Position) bool {
		if pos == s.foes[i].pos {
			return false
		}
		return s.taken(pos)
	}
}

// arrive mirrors Game.arriveLocked for an enemy put on a cell by a shove.
func (s *sim) arrive(i int, dir types.Position) (bool, int) {
	f := &s.foes[i]
	switch cell := s.terrainAt(f.pos); {
	case cell.Kind == types.TerrainFire:
		return false, s.burn(i, 1)
	case caught(s.terrainAt, f.pos, f.id):
		s.clearCell(f.pos) // a trap is spent once sprung
		return true, s.hit(i, TrapDamage)
	}
	if end, slid := s.b.iceCarries(f.pos, dir, s.freeFor(i)); slid {
		f.pos = end
		return true, 0
	}
	return false, 0
}

// placement is what an enemy's cell is worth to the bot: what the ground will
// do to it before it can walk off, and, for a boss, whether it is where the
// boss wants it.
func (s *sim) placement(f fighter) int {
	b := s.b
	value := 0
	if b.mind.readsGround {
		if b.besideLava(f.pos) {
			value += 10 * percentOfMaxHealth(f.player.Character, LavaBurnPercent)
		}
		switch cell := s.terrainAt(f.pos); cell.Kind {
		case types.TerrainFire:
			if f.burn < MaxBurnStacks {
				value += burnStackValue
			}
		case types.TerrainWater:
			if cell.Owner == s.me.id {
				value += slowValue * WaterSlow * 2
			}
		}
	}
	boss := b.mind.boss
	if w, ok := boss.wantsGround[b.groundKind(f.pos)]; ok {
		value += w
	}
	if w, ok := boss.wantsGround[GroundLava]; ok && b.besideLava(f.pos) {
		value += w
	}
	if w, ok := boss.wantsTerrain[s.terrainAt(f.pos).Kind]; ok {
		value += w
	}
	return value
}

// ---------------------------------------------------------------------------
// Where the turn ends
// ---------------------------------------------------------------------------

// rest is what ending the turn on a cell is worth: the ground, the enemy's
// answer, how far it is from hitting back next turn, and what a boss likes.
func (b *botBoard) rest(pos types.Position) int {
	value := 0
	if b.mind.readsGround {
		value -= b.groundCost(pos, b.me)
	}
	if caution := b.caution(); caution > 0 {
		value -= b.threat(pos) * caution / 100
	}
	if b.mind.aggression > 0 {
		value += b.offense(pos) * b.mind.aggression / 100
	}
	value -= b.distancePenalty(pos)
	boss := b.mind.boss
	for _, f := range b.foes {
		if d := Distance(pos, f.pos); d < boss.keepAway {
			value -= keepAwayCost * (boss.keepAway - d)
		}
	}
	for _, kind := range sortedKeys(boss.restsBy) {
		if b.groundKind(pos) == kind {
			value += boss.restsBy[kind]
			continue
		}
		for _, n := range Neighbours(pos) {
			if b.groundKind(n) == kind {
				value += boss.restsBy[kind]
				break
			}
		}
	}
	return value
}

// caution is the mind's, worn down once a fight drags on: past a point,
// whoever is still keeping out of reach has to come and fight, or two careful
// opponents would wait each other out for ever.
func (b *botBoard) caution() int {
	over := b.state.TurnNumber - patientTurns
	if over <= 0 {
		return b.mind.caution
	}
	return max(0, b.mind.caution*(patientTurns-over)/patientTurns)
}

// distancePenalty prices how far a cell is, on foot, from hitting the nearest
// enemy next turn with its best ordinary spell.
func (b *botBoard) distancePenalty(pos types.Position) int {
	d, ok := b.walkToFoes().get(pos)
	if !ok {
		// Nothing walks there from the enemy: a cell boxed in, or one only
		// the bot's own body opens. As the crow flies, then, but further.
		nearest := 4 * GridRadius
		for _, f := range b.foes {
			nearest = min(nearest, Distance(pos, f.pos))
		}
		d = 2*GridRadius + nearest
	}
	gap := max(0, d-(b.me.maxMP+b.strikeRange()))
	return gapCost*gap + closeness*d
}

// walkToFoes is, for every cell, the walk from it to the nearest enemy in
// sight. The enemies' own cells are the ends of it.
func (b *botBoard) walkToFoes() *cellMap {
	if b.walkCache != nil {
		return b.walkCache
	}
	ends := make([]types.Position, 0, len(b.foes))
	for _, f := range b.foes {
		ends = append(ends, f.pos)
	}
	// The bot walks it, so its own cell is open.
	b.walkCache = b.walkFrom(ends, b.othersThan(b.botID))
	return b.walkCache
}

// strikeRange is the range of the bot's hardest ordinary hit: how far from an
// enemy it wants to start its turn.
func (b *botBoard) strikeRange() int {
	if b.strikeCache > 0 {
		return b.strikeCache
	}
	best, bestRange := 0, 1
	for _, key := range b.bar(b.me) {
		spell, ok := b.spellOf(b.me, key)
		if !ok || spell.Ultimate || spell.Damage <= 0 || spell.Targeting != types.TargetAny {
			continue
		}
		if dmg := expectedDamage(spell); dmg > best {
			best, bestRange = dmg, spell.Range
		}
	}
	b.strikeCache = bestRange
	return bestRange
}

func sortedNeighbours(p types.Position) []types.Position {
	cells := Neighbours(p)
	sortPositions(cells)
	return cells
}
