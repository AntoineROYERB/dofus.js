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
	relay *types.Position
	laid  []types.TerrainCell
	ap    int
	used  [maxBar]int // casts so far, by index in ready
	nth   *int        // options weighed so far, for the noise
}

// maxBar is the most spells the planner weighs at once; a bar holds five.
const maxBar = 12

func (s *sim) clone() *sim {
	n := *s
	n.foes = append([]fighter(nil), s.foes...)
	// What was laid is shared until something more is: capping the slice
	// makes the next append copy it rather than write into the parent's.
	n.laid = s.laid[:len(s.laid):len(s.laid)]
	return &n
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
	return false
}

func (s *sim) terrainAt(pos types.Position) types.TerrainCell {
	for i := len(s.laid) - 1; i >= 0; i-- {
		if s.laid[i].Position == pos {
			return s.laid[i]
		}
	}
	return s.b.terrain[pos]
}

func (s *sim) opaque(pos types.Position) bool {
	return s.b.obstacles[pos] || terrainBlocksSight(s.terrainAt(pos).Kind) ||
		s.b.groundIs(pos, GroundRule.BlocksSight) || s.taken(pos)
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
	if spell.Relayed && s.relay != nil && s.reach(*s.relay, aim, spell) {
		return *s.relay, true, true
	}
	return s.me.pos, false, s.reach(s.me.pos, aim, spell)
}

// planFrom is the best run of casts the bot could make standing on a cell.
func (b *botBoard) planFrom(at types.Position, ready []types.Spell, nth *int) plan {
	me := b.me
	me.pos = at
	s := &sim{
		b:     b,
		ready: ready,
		me:    me,
		foes:  append([]fighter(nil), b.foes...),
		relay: b.relay,
		ap:    b.me.player.Character.ActionPoints,
		nth:   nth,
	}
	p := s.search(b.mind.depth)
	if len(p.casts) == 0 {
		p.endAt = at
	}
	return p
}

func (s *sim) search(depth int) plan {
	best := plan{endAt: s.me.pos}
	if depth <= 0 {
		return best
	}
	for i, spell := range s.ready {
		if i >= maxBar {
			break
		}
		if spell.APCost > s.ap || (spell.MaxCastsPerTurn > 0 && s.used[i]+s.b.castsSoFar(spell) >= spell.MaxCastsPerTurn) {
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
			if total > best.value {
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
// them for a spell with an area, where to land a leap, where to put a relay.
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
				if d > 0 && d <= spell.Range && s.b.free(cell, s.taken) && !s.b.hazard(cell) && !containsPosition(cells, cell) {
					cells = append(cells, cell)
				}
			}
		}
		return cells
	case spell.Special == types.SpecialRelay:
		if cell, ok := s.relayCell(spell, idx); ok {
			return []types.Position{cell}
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
	return cells
}

// relayCell is where a relay would let a relayed spell still affordable after
// it land on an enemy, nearest the bot first. None is offered when the relay
// already stands somewhere that does.
func (s *sim) relayCell(relaySpell types.Spell, idx int) (types.Position, bool) {
	var relayed []types.Spell
	for _, spell := range s.ready {
		if spell.Relayed && spell.Damage > 0 && spell.APCost <= s.ap-relaySpell.APCost {
			relayed = append(relayed, spell)
		}
	}
	if len(relayed) == 0 {
		return types.Position{}, false
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
	if s.relay != nil && landsFrom(*s.relay) {
		return types.Position{}, false
	}
	var cells []types.Position
	for _, cell := range allCells {
		d := Distance(s.me.pos, cell)
		if d == 0 || d > relaySpell.Range || !s.b.free(cell, s.taken) {
			continue
		}
		if relaySpell.NeedsLineOfSight && !HasLineOfSight(s.me.pos, cell, s.opaque) {
			continue
		}
		cells = append(cells, cell)
	}
	sort.SliceStable(cells, func(i, j int) bool { return Distance(s.me.pos, cells[i]) < Distance(s.me.pos, cells[j]) })
	for _, cell := range cells {
		if landsFrom(cell) {
			return cell, true
		}
	}
	return types.Position{}, false
}

// cast plays one cast on the simulated board, mirroring Game.CastSpell, and
// reports what it was worth and the board it leaves.
func (s *sim) cast(spell types.Spell, idx int, aim types.Position) (int, *sim, bool) {
	b := s.b
	origin, via := s.me.pos, false
	switch {
	case spell.Targeting == types.TargetSelf:
		aim = s.me.pos
	case spell.Special == types.SpecialLeap || spell.Special == types.SpecialRelay:
		if !s.b.free(aim, s.taken) || !s.reach(s.me.pos, aim, spell) {
			return 0, nil, false
		}
		if spell.Special == types.SpecialRelay && spell.Targeting == types.TargetEmpty && s.b.wallsIn(aim) {
			return 0, nil, false
		}
	default:
		var ok bool
		if origin, via, ok = s.origin(aim, spell); !ok {
			return 0, nil, false
		}
	}

	// Everything that can refuse the cast is checked before the board is
	// copied: most of what the planner weighs is refused, and the copies
	// were most of what it cost.
	landing := s.me.pos
	if spell.Special == types.SpecialLeap {
		landing = aim
	}
	var cells []types.Position
	spare := spell.Targeting == types.TargetSelf
	switch spell.Special {
	case types.SpecialRelay:
	case types.SpecialLeap:
		cells, spare = Neighbours(aim), true
	default:
		cells = AffectedPositions(spell, aim, origin)
	}
	if spell.Special != types.SpecialRelay {
		if !spare && spell.Damage > 0 && containsPosition(cells, landing) {
			return 0, nil, false // friendly fire on itself is never worth it
		}
		hits := false
		for _, cell := range cells {
			if cell != landing && s.foeAt(cell) >= 0 {
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
	switch spell.Special {
	case types.SpecialLeap:
		n.me.pos = aim
	case types.SpecialRelay:
		relay := aim
		n.relay = &relay
		// A relay is only worth what it lets the rest of the plan do.
		return 0, n, true
	}

	damage := expectedDamage(spell)
	if via {
		damage = damage * (100 + RelayBonus) / 100
	}
	value := 0
	var victims []int
	var before [8]types.Position
	for _, cell := range cells {
		i := n.foeAt(cell)
		if i < 0 {
			continue
		}
		f := &n.foes[i]
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
		if spell.Conducts && n.terrainAt(cell).Kind == types.TerrainWater {
			amount = amount * (100 + ConductBonus) / 100
		}
		if n.me.meleeBonus > 0 && Distance(n.me.pos, cell) == 1 {
			amount = amount * (100 + n.me.meleeBonus) / 100
		}
		if rule, ok := groundRules[b.groundKind(cell)]; ok {
			amount = rule.DamageTaken(spell.Element, amount)
		}
		value += n.hurt(i, absorb(f.player.Character, amount))
		if f.health <= 0 {
			continue
		}
		victims = append(victims, i)
		before[i] = f.pos
		if e := spell.Effect; e != nil && !e.OnSelf {
			switch e.Kind {
			case types.EffectBurn:
				value += n.burn(i, e.Value)
			case types.EffectMP:
				value += -e.Value * slowValue
			case types.EffectRoot:
				value += rootValue
			}
		}
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
	if spell.Push != 0 {
		for _, i := range victims {
			if n.foes[i].health <= 0 {
				continue
			}
			at := n.foes[i].pos
			if spell.Push > 0 {
				value += n.shove(i, stepTowards(origin, at), spell.Push, nil)
			} else {
				caster := n.me.pos
				value += n.shove(i, stepTowards(at, caster), -spell.Push, &caster)
			}
		}
	}
	for _, i := range victims {
		f := n.foes[i]
		if f.health <= 0 {
			continue
		}
		value += n.placement(f) - placedBefore[i]
		// Throwing a brawler off its doorstep is worth something only if it
		// was on the doorstep to begin with: walking up to it for the
		// pleasure of pushing it away again is not.
		was, now := Distance(before[i], n.me.pos), Distance(f.pos, n.me.pos)
		switch {
		case n.me.meleeBonus == 0 && Distance(before[i], b.me.pos) == 1 && now > 1:
			value += pushedClearValue
		case n.me.meleeBonus > 0 && was > 1 && now == 1:
			value += pulledInValue
		}
		// A zone acts at the start of the victim's turn, before it can walk
		// out: a storm strikes once for certain.
		if spell.Zone != nil && containsPosition(cells, f.pos) {
			if spell.Zone.Kind == types.ZoneStorm {
				value += 10 * StormDamage
			} else {
				value += zoneValue
			}
		}
	}
	return value, n, true
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
	if !InGrid(pos) || s.b.obstacles[pos] || s.b.groundIs(pos, GroundRule.Solid) {
		return
	}
	existing := s.terrainAt(pos)
	if isSolidTerrain(existing.Kind) || existing.Kind == types.TerrainTrap || existing.Kind == types.TerrainRelay {
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
// slam into something, a trap sprung.
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
		if !s.b.free(next, s.taken) {
			if pullTo == nil {
				value += s.hurt(i, CollisionDamage)
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
		if end, slid := s.b.slide(s.terrainAt, f.pos, dir, s.takenBut(i), f.id); slid {
			f.pos = end
			if caught(s.terrainAt, end, f.id) {
				value += s.hurt(i, TrapDamage)
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
		return true, s.hurt(i, TrapDamage)
	}
	if end, slid := s.b.iceCarries(f.pos, dir, s.takenBut(i)); slid {
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
		spell, ok := b.state.Spells[key]
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
