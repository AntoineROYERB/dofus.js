package game

import (
	"errors"
	"sort"

	"game-server/internal/types"
)

// The rules behind spells that change the board. A fight used to leave the
// map exactly as it found it; now a Pyromancer leaves fire behind, a
// Tidecaller water and ice, a Stonewarden pillars and fissures, and whatever
// they leave stays until something replaces it.

const (
	// UltimateFromTurn is the first turn an ultimate can be cast. The opening
	// turn is for finding each other, not for ending the fight.
	UltimateFromTurn = 2
	// TrapDamage is what a trap does to whoever springs it, on top of holding
	// them where they stand for the rest of the turn.
	TrapDamage = 10
	// CollisionDamage is what a push costs when it drives its victim into
	// something before it has run its course.
	CollisionDamage = 6
	// StormDamage is what a storm does to each enemy standing in it at the
	// start of their turn, doubled if they are standing in water.
	StormDamage = 9
	// WaterHealing is what its owner's water gives back at the start of their
	// turn; WaterSlow is the movement it costs anyone else.
	WaterHealing = 5
	WaterSlow    = 1
	// ConductMultiplier is what water does to a conducting spell's damage.
	ConductMultiplier = 2
)

var (
	ErrUltimateNotReady = errors.New("ultimates unlock on turn 2")
	ErrUltimateSpent    = errors.New("that ultimate has already been used this fight")
	ErrCellNotFree      = errors.New("that spell needs a free cell")
	ErrWouldWallIn      = errors.New("that would wall part of the board off")
)

// quakeFissures are where an earthquake opens the ground, around its caster.
// Only the four straight lines: a fissure on every cell two steps away would
// ring the caster in.
var quakeFissures = []types.Position{{X: 2, Y: 0}, {X: -2, Y: 0}, {X: 0, Y: 2}, {X: 0, Y: -2}}

func isSolidTerrain(kind string) bool {
	return kind == types.TerrainCrater || kind == types.TerrainFissure
}

// solidLocked reports whether nobody can stand on or walk through a cell,
// whoever is or is not on it.
func (g *Game) solidLocked(pos types.Position) bool {
	if !InGrid(pos) || g.obstacles[pos] {
		return true
	}
	cell, ok := g.terrain[pos]
	return ok && isSolidTerrain(cell.Kind)
}

// freeLocked reports whether a character could be put on a cell right now.
func (g *Game) freeLocked(pos types.Position) bool {
	if g.solidLocked(pos) {
		return false
	}
	_, taken := g.playerAtLocked(pos)
	return !taken
}

func (g *Game) terrainKindLocked(pos types.Position) string {
	return g.terrain[pos].Kind
}

// placeTerrainLocked leaves terrain on a cell and reports whether it took.
// Solid ground and cover are never replaced; neither are traps and relays,
// which are things set on the ground rather than the ground itself — ice
// spread over a trap leaves the trap waiting at the end of the slide. Fire
// never takes on water or ice: water puts fire out, not the other way round.
// A trap needs a cell nobody is standing on.
func (g *Game) placeTerrainLocked(pos types.Position, kind, owner string) bool {
	if !InGrid(pos) || g.obstacles[pos] {
		return false
	}
	existing, has := g.terrain[pos]
	if has && isSolidTerrain(existing.Kind) {
		return false
	}
	if has && kind != types.TerrainRelay &&
		(existing.Kind == types.TerrainTrap || existing.Kind == types.TerrainRelay) {
		return false
	}
	if kind == types.TerrainFire && has &&
		(existing.Kind == types.TerrainWater || existing.Kind == types.TerrainIce) {
		return false
	}
	if kind == types.TerrainTrap {
		if _, taken := g.playerAtLocked(pos); taken {
			return false
		}
	}
	if g.terrain == nil {
		g.terrain = make(map[types.Position]types.TerrainCell)
	}
	g.terrain[pos] = types.TerrainCell{Position: pos, Kind: kind, Owner: owner}
	return true
}

// relayOfLocked finds a player's relay.
func (g *Game) relayOfLocked(owner string) (types.Position, bool) {
	for pos, cell := range g.terrain {
		if cell.Kind == types.TerrainRelay && cell.Owner == owner {
			return pos, true
		}
	}
	return types.Position{}, false
}

// staysConnectedLocked reports whether every free cell of the board could
// still be walked to if the extra cells were blocked too. Characters do not
// count as blocking: they move.
func (g *Game) staysConnectedLocked(extra ...types.Position) bool {
	blocked := make(map[types.Position]bool, len(g.obstacles)+len(extra))
	for p := range g.obstacles {
		blocked[p] = true
	}
	for p, cell := range g.terrain {
		if isSolidTerrain(cell.Kind) {
			blocked[p] = true
		}
	}
	for _, p := range extra {
		blocked[p] = true
	}

	start, found := types.Position{}, false
	for _, id := range g.sortedPlayerIDsLocked() {
		c := g.players[id].Character
		if c.IsAlive && c.Position != nil && !blocked[*c.Position] {
			start, found = *c.Position, true
			break
		}
	}
	if !found {
		return true
	}

	free := 0
	for x := -GridRadius; x <= GridRadius; x++ {
		for y := -GridRadius; y <= GridRadius; y++ {
			if p := (types.Position{X: x, Y: y}); InGrid(p) && !blocked[p] {
				free++
			}
		}
	}
	seen := map[types.Position]bool{start: true}
	queue := []types.Position{start}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, n := range Neighbours(cur) {
			if !blocked[n] && !seen[n] {
				seen[n] = true
				queue = append(queue, n)
			}
		}
	}
	return len(seen) == free
}

// damageLocked takes health off a character through its shield and reports
// what got through. Deaths are noticed by the caller, which knows what to log.
func (g *Game) damageLocked(id string, amount int) int {
	p := g.players[id]
	if !p.Character.IsAlive || amount <= 0 {
		return 0
	}
	through := absorb(p.Character, amount)
	p.Character.Health -= through
	if p.Character.Health <= 0 {
		p.Character.Health = 0
		p.Character.IsAlive = false
	}
	g.players[id] = p
	return through
}

// aliveLocked lists who is standing, to compare against once an action has
// run its course.
func (g *Game) aliveLocked() map[string]bool {
	alive := make(map[string]bool, len(g.players))
	for id, p := range g.players {
		if p.Character.IsAlive {
			alive[id] = true
		}
	}
	return alive
}

// logDeathsSinceLocked writes a line for everyone who was standing before and
// is not now. Traps, collisions and storms can all kill, not only a spell's
// own damage.
func (g *Game) logDeathsSinceLocked(before map[string]bool) {
	for _, id := range g.sortedPlayerIDsLocked() {
		if before[id] && !g.players[id].Character.IsAlive {
			g.appendLogLocked(types.LogEntry{
				Actor: g.players[id].Character.Name, Kind: types.LogDeath, Text: "is out of the fight",
			})
		}
	}
}

func (g *Game) effectLogLocked(id, text string, damage int) {
	g.appendLogLocked(types.LogEntry{
		Actor: g.players[id].Character.Name, Kind: types.LogEffect, Text: text, Damage: damage,
	})
}

// setPositionLocked moves a character without any rule about how it got there.
func (g *Game) setPositionLocked(id string, pos types.Position) {
	p := g.players[id]
	placed := pos
	p.Character.Position = &placed
	g.players[id] = p
}

// enterCellLocked resolves what a character finds on the cell it has just
// arrived on, and reports whether that stops it where it is.
func (g *Game) enterCellLocked(id string) (stop bool) {
	p := g.players[id]
	if !p.Character.IsAlive || p.Character.Position == nil {
		return true
	}
	pos := *p.Character.Position
	cell, ok := g.terrain[pos]
	if !ok {
		return false
	}

	switch cell.Kind {
	case types.TerrainFire:
		addBurn(&p.Character, 1)
		g.players[id] = p
		g.effectLogLocked(id, "catches fire", 0)
	case types.TerrainTrap:
		if cell.Owner == id {
			return false
		}
		delete(g.terrain, pos)
		dealt := g.damageLocked(id, TrapDamage)
		p = g.players[id]
		p.Character.MovementPoints = 0
		g.players[id] = p
		g.effectLogLocked(id, "springs a trap and is held fast", dealt)
		return true
	}
	return false
}

// slideLocked carries a character across ice in the direction it was going,
// until the ice ends or something is in the way. It reports how far it went.
func (g *Game) slideLocked(id string, dir types.Position) int {
	if dir == (types.Position{}) {
		return 0
	}
	slid := 0
	for slid < 2*GridRadius {
		pos := *g.players[id].Character.Position
		if g.terrainKindLocked(pos) != types.TerrainIce {
			break
		}
		next := types.Position{X: pos.X + dir.X, Y: pos.Y + dir.Y}
		if !g.freeLocked(next) {
			break
		}
		g.setPositionLocked(id, next)
		slid++
		if g.enterCellLocked(id) {
			break
		}
	}
	if slid > 0 {
		g.effectLogLocked(id, "slides across the ice", 0)
	}
	return slid
}

// shoveLocked moves a character up to n cells along dir. A pull stops once
// its victim is next to the one pulling; a push that runs into something
// before it has run its course hurts.
func (g *Game) shoveLocked(id string, dir types.Position, n int, pullTo *types.Position) {
	if dir == (types.Position{}) || n <= 0 {
		return
	}
	moved := 0
	for moved < n {
		pos := *g.players[id].Character.Position
		if pullTo != nil && Distance(pos, *pullTo) <= 1 {
			break
		}
		next := types.Position{X: pos.X + dir.X, Y: pos.Y + dir.Y}
		if !g.freeLocked(next) {
			if pullTo == nil {
				dealt := g.damageLocked(id, CollisionDamage)
				g.effectLogLocked(id, "slams into something", dealt)
			}
			break
		}
		g.setPositionLocked(id, next)
		moved++
		if g.enterCellLocked(id) {
			return
		}
	}
	if moved == 0 {
		return
	}
	if pullTo != nil {
		g.effectLogLocked(id, "is dragged in", 0)
	} else {
		g.effectLogLocked(id, "is thrown back", 0)
	}
	g.slideLocked(id, dir)
}

// stepTowards is the one-cell step that goes from one cell most directly
// towards another, along the longer axis. Ties go along x.
func stepTowards(from, to types.Position) types.Position {
	dx, dy := to.X-from.X, to.Y-from.Y
	if dx == 0 && dy == 0 {
		return types.Position{}
	}
	if abs(dx) >= abs(dy) {
		return types.Position{X: sign(dx)}
	}
	return types.Position{Y: sign(dy)}
}

func sign(n int) int {
	switch {
	case n > 0:
		return 1
	case n < 0:
		return -1
	}
	return 0
}

// ---------------------------------------------------------------------------
// Turn start
// ---------------------------------------------------------------------------

// ageZonesLocked takes a turn off every zone its owner keeps up, at the start
// of that owner's turn.
func (g *Game) ageZonesLocked(owner string) {
	kept := g.zones[:0]
	for _, z := range g.zones {
		if z.Owner == owner {
			z.TurnsLeft--
		}
		if z.TurnsLeft > 0 {
			kept = append(kept, z)
		}
	}
	g.zones = kept
	if len(g.zones) == 0 {
		g.zones = nil
	}
}

// zonesActOnLocked is what an enemy's zones do to a character whose turn is
// starting inside them.
func (g *Game) zonesActOnLocked(id string) {
	for _, z := range g.zones {
		p := g.players[id]
		if z.Owner == id || !p.Character.IsAlive || p.Character.Position == nil ||
			!containsPosition(z.Cells, *p.Character.Position) {
			continue
		}
		switch z.Kind {
		case types.ZoneStorm:
			amount := StormDamage
			if g.terrainKindLocked(*p.Character.Position) == types.TerrainWater {
				amount *= ConductMultiplier
			}
			dealt := g.damageLocked(id, amount)
			g.effectLogLocked(id, "is struck by the storm", dealt)
		case types.ZoneMaelstrom:
			if *p.Character.Position != z.Center && g.freeLocked(z.Center) {
				g.setPositionLocked(id, z.Center)
				g.effectLogLocked(id, "is dragged into the maelstrom", 0)
				g.enterCellLocked(id)
				p = g.players[id]
			}
			stripBuffs(&p.Character)
			g.players[id] = p
		}
	}
}

// terrainAtTurnStartLocked is what the cell a character starts its turn on
// does to it before its effects tick: fire lights it; water puts its burns
// out, and heals it if the water is its own. Someone else's water is
// reported back, because it takes a movement point off a turn that has not
// been worked out yet.
func (g *Game) terrainAtTurnStartLocked(id string) (slowed bool) {
	p := g.players[id]
	if !p.Character.IsAlive || p.Character.Position == nil {
		return false
	}
	cell, ok := g.terrain[*p.Character.Position]
	if !ok {
		return false
	}
	switch cell.Kind {
	case types.TerrainFire:
		addBurn(&p.Character, 1)
		g.players[id] = p
		g.effectLogLocked(id, "is standing in fire", 0)
	case types.TerrainWater:
		if stacks, _ := takeBurn(&p.Character); stacks > 0 {
			g.players[id] = p
			g.effectLogLocked(id, "puts its burns out in the water", 0)
		}
		if cell.Owner != id {
			return true
		}
		if healed := min(WaterHealing, p.Character.MaxHealth-p.Character.Health); healed > 0 {
			p.Character.Health += healed
			g.players[id] = p
			g.effectLogLocked(id, "is soothed by the water", 0)
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

func (g *Game) terrainSnapshotLocked() []types.TerrainCell {
	out := make([]types.TerrainCell, 0, len(g.terrain))
	for _, cell := range g.terrain {
		out = append(out, cell)
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i].Position, out[j].Position
		if a.X != b.X {
			return a.X < b.X
		}
		return a.Y < b.Y
	})
	return out
}

func (g *Game) zonesSnapshotLocked() []types.Zone {
	out := make([]types.Zone, 0, len(g.zones))
	for _, z := range g.zones {
		z.Cells = append([]types.Position(nil), z.Cells...)
		out = append(out, z)
	}
	return out
}
