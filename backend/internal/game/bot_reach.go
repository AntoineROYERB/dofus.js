package game

import (
	"container/heap"

	"game-server/internal/types"
)

// What either side could deal the other next turn, which is how the bot
// weighs where to end its own. It is asked about every cell the bot could
// stop on, several times a decision, so everything that does not depend on
// that cell is worked out once per decision and kept.

// threat is how much damage the enemies in sight could deal the bot next
// turn were it to end this one on a cell, in tenths of a hit point: each of
// them walking where it can — further, by the wind or a leap — and spending
// its points on what reaches. A cell in tall grass none of them can get close
// enough to see into is mostly safe; a player may still guess.
func (b *botBoard) threat(pos types.Position) int {
	if v, ok := b.threatCache[pos]; ok {
		return v
	}
	total := 0
	for _, foe := range b.foes {
		total += b.threatFrom(foe, pos, nil)
	}
	b.threatCache[pos] = total
	return total
}

// threatFrom is one enemy's answer to the bot standing on a cell, on the board
// with the screen's cells blocking sight as well.
func (b *botBoard) threatFrom(foe fighter, pos types.Position, screen []types.Position) int {
	opaque := func(p types.Position) bool {
		return b.opaque(p) || containsPosition(screen, p)
	}
	best := 0
	for _, v := range b.mobility(foe) {
		cells := b.reachOf(foe, v.mp)
		seen := false
		for _, from := range cells {
			if Distance(from, pos) <= GrassSightRange {
				seen = true
				break
			}
		}
		// A leap is for landing next to its target; anywhere else it lands,
		// walking would have done.
		var landings []types.Position
		if v.leap > 0 {
			for _, n := range sortedNeighbours(pos) {
				if !b.free(n, b.othersThan(foe.id)) {
					continue
				}
				for _, from := range cells {
					if d := Distance(from, n); d > 0 && d <= v.leap {
						landings = append(landings, n)
						break
					}
				}
			}
		}
		var buf [maxBar]strikeOption
		options := buf[:0]
		for _, key := range b.bar(foe) {
			spell, ok := b.usableNextTurn(foe, key, v.spent)
			if !ok {
				continue
			}
			amount := 0
			for _, group := range [][]types.Position{landings, cells} {
				for _, from := range group {
					if from == pos || !reachesFrom(spell, from, pos, opaque) {
						continue
					}
					hit := expectedDamage(spell)
					if foe.meleeBonus > 0 && Distance(from, pos) == 1 {
						hit = hit * (100 + foe.meleeBonus) / 100
					}
					amount = max(amount, hit)
					if foe.meleeBonus == 0 {
						break // nothing makes one cell hit harder than another
					}
				}
			}
			if amount > 0 {
				options = append(options, strikeOption{spell: spell, value: amount})
			}
		}
		damage := 10 * mostFor(v.ap, options)
		if !seen && b.groundIs(pos, GroundRule.Conceals) {
			damage /= 4
		}
		best = max(best, damage)
	}
	return best
}

// offense is the other side of it: what the bot could deal the nearest enemy
// next turn, starting it on a cell. Without it a cautious bot only ever backs
// off, and two of them stand out of each other's reach for ever.
//
// It is worked backwards: for each spell, the cells it would land on the
// enemy from, and the walk from every cell of the board to the nearest of
// those. Then a cell costs one lookup a spell, rather than a walk of its own.
func (b *botBoard) offense(pos types.Position) int {
	if v, ok := b.offenseCache[pos]; ok {
		return v
	}
	best := 0
	for _, foe := range b.foes {
		fire := b.firingAt(foe)
		for _, v := range b.mobility(b.me) {
			var buf [maxBar]strikeOption
			options := buf[:0]
			for _, f := range fire {
				if f.key == v.spent {
					continue
				}
				hit := 0
				if d, ok := f.near.get(pos); ok && (d <= v.mp || (v.leap > 0 && d <= v.mp+v.leap)) {
					hit = f.boosted
				} else if d, ok := f.walk.get(pos); ok && d <= v.mp {
					hit = f.plain
				}
				if hit > 0 {
					options = append(options, strikeOption{spell: f.spell, value: hit})
				}
			}
			best = max(best, 10*mostFor(v.ap, options))
		}
	}
	b.offenseCache[pos] = best
	return best
}

// firing is one of the bot's spells against one enemy: the walk from every
// cell to the nearest cell it lands from, and to the nearest one beside the
// enemy, where a brawler hits harder.
type firing struct {
	spell          types.Spell
	key            string
	walk, near     *cellMap
	plain, boosted int
}

func (b *botBoard) firingAt(foe fighter) []firing {
	if f, ok := b.firingCache[foe.id]; ok {
		return f
	}
	// The bot walks there, so its own cell is open; the enemies are not.
	taken := b.othersThan(b.botID)
	var out []firing
	for _, key := range b.bar(b.me) {
		spell, ok := b.usableNextTurn(b.me, key, "")
		if !ok {
			continue
		}
		var from, beside []types.Position
		for _, cell := range allCells {
			if cell == foe.pos || !b.free(cell, taken) || !reachesFrom(spell, cell, foe.pos, b.opaque) {
				continue
			}
			from = append(from, cell)
			if Distance(cell, foe.pos) == 1 {
				beside = append(beside, cell)
			}
		}
		if len(from) == 0 {
			continue
		}
		f := firing{spell: spell, key: key, plain: expectedDamage(spell), walk: b.walkFrom(from, taken)}
		f.boosted = f.plain
		if b.me.meleeBonus > 0 && len(beside) > 0 {
			f.boosted = f.plain * (100 + b.me.meleeBonus) / 100
			f.near = b.walkFrom(beside, taken)
		}
		out = append(out, f)
	}
	b.firingCache[foe.id] = out
	return out
}

// cellMap holds a number for every cell of the board, or nothing. The
// planner keeps several a decision, and maps of them were most of what it
// allocated.
type cellMap [boardSide * boardSide]int16

const boardSide = 2*GridRadius + 1

func newCellMap() *cellMap {
	m := &cellMap{}
	for i := range m {
		m[i] = -1
	}
	return m
}

func cellIndex(p types.Position) int {
	return (p.X+GridRadius)*boardSide + p.Y + GridRadius
}

func (m *cellMap) get(p types.Position) (int, bool) {
	if m == nil || !InGrid(p) {
		return 0, false
	}
	v := m[cellIndex(p)]
	return int(v), v >= 0
}

func (m *cellMap) set(p types.Position, v int) {
	m[cellIndex(p)] = int16(v)
}

// steps are the four ways a character moves, in the order Neighbours lists
// them.
var steps = [4]types.Position{{X: 1}, {X: -1}, {Y: 1}, {Y: -1}}

// walkFrom is, for every cell, the cheapest walk from it to the nearest of
// the given cells, priced as the server prices a step: by the cell entered.
// The bot's own cell is always one a walk can start from, whatever it stands
// on. So can the bot's own pylon, which it can trade places with, though no
// walk goes through it.
func (b *botBoard) walkFrom(ends []types.Position, taken occupied) *cellMap {
	relay, hasRelay := b.myRelay()
	dist := newCellMap()
	open := &frontier{}
	for _, e := range ends {
		dist.set(e, 0)
		heap.Push(open, node{pos: e})
	}
	for open.Len() > 0 {
		n := heap.Pop(open).(node)
		if d, _ := dist.get(n.pos); n.priority > d {
			continue
		}
		cost := b.enterCost(n.pos)
		for _, step := range steps {
			prev := types.Position{X: n.pos.X + step.X, Y: n.pos.Y + step.Y}
			pylon := hasRelay && prev == relay
			if prev != b.me.pos && !pylon && !b.free(prev, taken) {
				continue
			}
			d := n.priority + cost
			if known, ok := dist.get(prev); ok && known <= d {
				continue
			}
			dist.set(prev, d)
			if !pylon {
				heap.Push(open, node{pos: prev, priority: d})
			}
		}
	}
	return dist
}

// othersThan is everyone in sight standing in the way of one of them.
func (b *botBoard) othersThan(id string) occupied {
	return func(p types.Position) bool {
		if b.me.id != id && b.me.pos == p {
			return true
		}
		for _, f := range b.foes {
			if f.id != id && f.pos == p {
				return true
			}
		}
		return false
	}
}

// reachKey is one fighter walking with so many movement points.
type reachKey struct {
	id string
	mp int
}

// reachOf is where a fighter can walk next turn from where it stands, in a
// fixed order.
func (b *botBoard) reachOf(f fighter, mp int) []types.Position {
	key := reachKey{f.id, mp}
	if cells, ok := b.reachCache[key]; ok {
		return cells
	}
	taken := b.othersThan(f.id)
	walkable := func(p types.Position) bool { return p != f.pos && !b.free(p, taken) }
	reach := Reachable(f.pos, mp, walkable, b.enterCost)
	// Reachable has nothing to say about a fighter with no movement points,
	// not even where it stands; a rooted enemy still casts from there.
	reach[f.pos] = 0
	cells := sortedCells(reach)
	b.reachCache[key] = cells
	return cells
}

// getAbout is one way a fighter can spend a turn getting somewhere: on foot, or
// further for the points the wind or a leap costs.
type getAbout struct {
	mp, ap, leap int
	spent        string // the spell the extra reach costs
}

// mobility lists the ways a fighter could get about next turn. Leaving the
// leap out made a brawler think it could never hit from five cells off, so
// it hung back where it could do nothing at all.
func (b *botBoard) mobility(f fighter) []getAbout {
	if moves, ok := b.mobilityCache[f.id]; ok {
		return moves
	}
	moves := []getAbout{{mp: f.maxMP, ap: f.maxAP}}
	for _, key := range b.bar(f) {
		spell, ok := b.spellOf(f, key)
		if !ok || f.player.Spells[key].CooldownLeft > 1 || spell.APCost >= f.maxAP {
			continue
		}
		switch {
		case spell.GrantMP > 0:
			moves = append(moves, getAbout{mp: f.maxMP + spell.GrantMP, ap: f.maxAP - spell.APCost, spent: key})
		case spell.Special == types.SpecialLeap:
			moves = append(moves, getAbout{mp: f.maxMP, ap: f.maxAP - spell.APCost, leap: spell.Range, spent: key})
		}
	}
	b.mobilityCache[f.id] = moves
	return moves
}

// bar is a fighter's spells in a fixed order, read once a decision.
func (b *botBoard) bar(f fighter) []string {
	if keys, ok := b.barCache[f.id]; ok {
		return keys
	}
	keys := sortedKeys(f.player.Spells)
	b.barCache[f.id] = keys
	return keys
}

// usableNextTurn is a damaging spell on a fighter's bar that it will be able
// to cast when its next turn starts. A cooldown of one runs out as it does.
func (b *botBoard) usableNextTurn(f fighter, key, spent string) (types.Spell, bool) {
	spell, ok := b.spellOf(f, key)
	st := f.player.Spells[key]
	if key == spent || !ok || spell.Damage <= 0 || spell.APCost <= 0 || st.CooldownLeft > 1 {
		return types.Spell{}, false
	}
	if spell.Ultimate && (st.Spent || b.state.TurnNumber+1 < UltimateFromTurn) {
		return types.Spell{}, false
	}
	return spell, true
}

// strikeOption is a spell that reaches, and what it would deal.
type strikeOption struct {
	spell types.Spell
	value int
}

// mostFor is the most a turn's action points buy among spells that reach,
// each at most as often as it may be cast in a turn.
func mostFor(ap int, options []strikeOption) int {
	if ap <= 0 {
		return 0
	}
	var buf [32]int
	if ap >= len(buf) {
		ap = len(buf) - 1
	}
	best := buf[:ap+1]
	for _, o := range options {
		casts := o.spell.MaxCastsPerTurn
		if casts <= 0 {
			casts = ap / o.spell.APCost
		}
		for n := 0; n < casts; n++ {
			for left := ap; left >= o.spell.APCost; left-- {
				best[left] = max(best[left], best[left-o.spell.APCost]+o.value)
			}
		}
	}
	return best[ap]
}

// allCells is every cell of the board, in a fixed order, for reading only.
var allCells = boardCells()

func sortedCells[V any](m map[types.Position]V) []types.Position {
	cells := make([]types.Position, 0, len(m))
	for cell := range m {
		cells = append(cells, cell)
	}
	sortPositions(cells)
	return cells
}
