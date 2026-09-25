package game

import (
	"math/rand"
	"sort"

	"game-server/internal/types"
)

// An island's ground: the tactical variety of the campaign. Where the terrain
// in mechanics.go is what spells leave behind, this is what the map is made of
// before anybody casts anything — tall grass to hide in, rock to hide behind,
// water that slows, ice that carries you on, acid, lava, wind. Each map is
// dealt at most two of them, from the island it is fought on.
//
// Every rule is a small module behind one interface, and the rest of the game
// only ever asks the interface. The names, icons and the sentence a player
// reads live with the island in config/islands.json; a test holds the two
// lists to each other.

// Terrain ids, as config/islands.json names them.
const (
	GroundTallGrass    = "tall_grass"
	GroundRock         = "rock"
	GroundShallowWater = "shallow_water"
	GroundIce          = "ice"
	GroundAcidPool     = "acid_pool"
	GroundLava         = "lava"
	GroundAirCurrent   = "air_current"
)

// The numbers behind the ground. A starting point, to tune by playing; they
// are part of the rules fingerprint like every other number a fight is fought
// under.
const (
	// GrassSightRange is how close you have to be to see someone in tall
	// grass.
	GrassSightRange = 2
	// ShallowWaterCost is what a step into shallow water costs, in MP.
	ShallowWaterCost = 2
	// ShallowWaterBonus is the extra water damage, in percent, taken standing
	// in it.
	ShallowWaterBonus = 10
	// IceSlide is how many cells further ice carries whoever arrives on it.
	IceSlide = 1
	// AcidPercent is the share of max health an acid pool eats at the end of
	// a turn spent in it.
	AcidPercent = 5
	// LavaBurnPercent is the share of max health lava takes off whoever
	// starts a turn next to it.
	LavaBurnPercent = 3
	// AirCurrentPush is how far a current carries whoever starts a turn on it.
	AirCurrentPush = 1
)

// GroundRule is one terrain of the library. The methods are the hooks the
// fight calls at the moments a terrain can matter; a rule only overrides the
// ones it has something to say at, and inherits "nothing happens" for the
// rest from noRule.
type GroundRule interface {
	ID() string
	// Solid ground cannot be stood on or walked through.
	Solid() bool
	// BlocksSight stops a line of sight crossing the cell.
	BlocksSight() bool
	// Conceals hides whoever stands in it from anyone further than
	// GrassSightRange.
	Conceals() bool
	// EnterCost is the movement points a step onto the cell costs.
	EnterCost() int
	// DamageTaken adjusts a hit of an element on whoever stands in it.
	DamageTaken(element string, amount int) int

	// onEnter runs when a character arrives on the cell, walking or pushed,
	// with the step it arrived by. It reports whether that stops it there.
	onEnter(g *Game, id string, cell types.GroundCell, dir types.Position) (stop bool)
	// atTurnStart runs when a character starts its turn on the cell.
	atTurnStart(g *Game, id string, cell types.GroundCell)
	// besideTurnStart runs, once per kind, when a character starts its turn
	// next to a cell of it.
	besideTurnStart(g *Game, id string)
	// atTurnEnd runs when a character ends its turn on the cell.
	atTurnEnd(g *Game, id string)
}

// noRule is ground that does nothing, for the rules to build on.
type noRule struct{}

func (noRule) Solid() bool                                                  { return false }
func (noRule) BlocksSight() bool                                            { return false }
func (noRule) Conceals() bool                                               { return false }
func (noRule) EnterCost() int                                               { return 1 }
func (noRule) DamageTaken(_ string, amount int) int                         { return amount }
func (noRule) onEnter(*Game, string, types.GroundCell, types.Position) bool { return false }
func (noRule) atTurnStart(*Game, string, types.GroundCell)                  {}
func (noRule) besideTurnStart(*Game, string)                                {}
func (noRule) atTurnEnd(*Game, string)                                      {}

// tallGrass: a unit inside is invisible from more than two cells away.
type tallGrass struct{ noRule }

func (tallGrass) ID() string     { return GroundTallGrass }
func (tallGrass) Conceals() bool { return true }

// rock: blocks movement and line of sight.
type rock struct{ noRule }

func (rock) ID() string        { return GroundRock }
func (rock) Solid() bool       { return true }
func (rock) BlocksSight() bool { return true }

// shallowWater: costs 2 MP to enter; +10% water damage taken.
type shallowWater struct{ noRule }

func (shallowWater) ID() string     { return GroundShallowWater }
func (shallowWater) EnterCost() int { return ShallowWaterCost }
func (shallowWater) DamageTaken(element string, amount int) int {
	if element == "Water" {
		return amount * (100 + ShallowWaterBonus) / 100
	}
	return amount
}

// ice: whoever arrives on it slides one cell further the way they were going.
type ice struct{ noRule }

func (ice) ID() string { return GroundIce }
func (ice) onEnter(g *Game, id string, _ types.GroundCell, dir types.Position) bool {
	if dir == (types.Position{}) {
		return false
	}
	slid := 0
	for slid < IceSlide {
		pos := *g.players[id].Character.Position
		next := types.Position{X: pos.X + dir.X, Y: pos.Y + dir.Y}
		if !g.freeLocked(next) {
			break
		}
		g.setPositionLocked(id, next)
		slid++
		// Where the slide ends still acts — fire, a trap — but a second ice
		// cell does not carry them on again: it is one extra cell, not a rink.
		if g.enterCellLocked(id) {
			break
		}
	}
	if slid == 0 {
		return false
	}
	g.effectLogLocked(id, "slides on the ice", 0)
	return true
}

// acidPool: lose 5% of max health at the end of a turn spent in it.
type acidPool struct{ noRule }

func (acidPool) ID() string { return GroundAcidPool }
func (acidPool) atTurnEnd(g *Game, id string) {
	dealt := g.damageLocked(id, percentOfMaxHealth(g.players[id].Character, AcidPercent))
	g.effectLogLocked(id, "is eaten by the acid", dealt)
}

// lava: impassable, and the cells around it burn for 3% of max health.
type lava struct{ noRule }

func (lava) ID() string  { return GroundLava }
func (lava) Solid() bool { return true }
func (lava) besideTurnStart(g *Game, id string) {
	dealt := g.damageLocked(id, percentOfMaxHealth(g.players[id].Character, LavaBurnPercent))
	g.effectLogLocked(id, "is scorched by the lava", dealt)
}

// airCurrent: pushes whoever starts a turn on it one cell with the wind.
type airCurrent struct{ noRule }

func (airCurrent) ID() string { return GroundAirCurrent }
func (airCurrent) atTurnStart(g *Game, id string, cell types.GroundCell) {
	if cell.Wind == nil {
		return
	}
	moved := 0
	for moved < AirCurrentPush {
		pos := *g.players[id].Character.Position
		next := types.Position{X: pos.X + cell.Wind.X, Y: pos.Y + cell.Wind.Y}
		if !g.freeLocked(next) {
			break
		}
		g.setPositionLocked(id, next)
		moved++
		if g.arriveLocked(id, *cell.Wind) {
			break
		}
	}
	if moved > 0 {
		g.effectLogLocked(id, "is carried by the wind", 0)
	}
}

// groundRules is the library, by id.
var groundRules = func() map[string]GroundRule {
	rules := map[string]GroundRule{}
	for _, r := range []GroundRule{tallGrass{}, rock{}, shallowWater{}, ice{}, acidPool{}, lava{}, airCurrent{}} {
		rules[r.ID()] = r
	}
	return rules
}()

// GroundRuleFor looks a terrain up in the library.
func GroundRuleFor(id string) (GroundRule, bool) {
	r, ok := groundRules[id]
	return r, ok
}

// GroundRuleIDs lists the library, sorted.
func GroundRuleIDs() []string {
	ids := make([]string, 0, len(groundRules))
	for id := range groundRules {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func percentOfMaxHealth(c types.Character, percent int) int {
	return max(1, c.MaxHealth*percent/100)
}

// ---------------------------------------------------------------------------
// The ground in play
// ---------------------------------------------------------------------------

// groundAtLocked is the island's terrain on a cell, and its rule.
func (g *Game) groundAtLocked(pos types.Position) (types.GroundCell, GroundRule, bool) {
	cell, ok := g.ground[pos]
	if !ok {
		return types.GroundCell{}, nil, false
	}
	rule, ok := groundRules[cell.Kind]
	return cell, rule, ok
}

func (g *Game) solidGroundLocked(pos types.Position) bool {
	_, rule, ok := g.groundAtLocked(pos)
	return ok && rule.Solid()
}

func (g *Game) groundBlocksSightLocked(pos types.Position) bool {
	_, rule, ok := g.groundAtLocked(pos)
	return ok && rule.BlocksSight()
}

// enterCostLocked is what a step onto a cell costs in movement points.
func (g *Game) enterCostLocked(pos types.Position) int {
	if _, rule, ok := g.groundAtLocked(pos); ok {
		return rule.EnterCost()
	}
	return 1
}

// arriveLocked is everything a character finds on a cell it has just been
// put on by a step, a push or the wind: what spells left there, then the
// island's own ground. It reports whether that stops it where it is.
func (g *Game) arriveLocked(id string, dir types.Position) (stop bool) {
	if g.enterCellLocked(id) {
		return true
	}
	return g.groundEnterLocked(id, dir)
}

// groundEnterLocked is what the island's ground does to a character that has
// just arrived on it, by the step dir. It reports whether that stops it.
func (g *Game) groundEnterLocked(id string, dir types.Position) (stop bool) {
	p := g.players[id]
	if !p.Character.IsAlive || p.Character.Position == nil {
		return true
	}
	if cell, rule, ok := g.groundAtLocked(*p.Character.Position); ok {
		return rule.onEnter(g, id, cell, dir)
	}
	return false
}

// groundAtTurnStartLocked is what the island does to a character as its turn
// begins: the cell it stands on first — the wind may move it — then whatever
// burns beside where it ends up.
func (g *Game) groundAtTurnStartLocked(id string) {
	p := g.players[id]
	if !p.Character.IsAlive || p.Character.Position == nil {
		return
	}
	if cell, rule, ok := g.groundAtLocked(*p.Character.Position); ok {
		rule.atTurnStart(g, id, cell)
	}

	p = g.players[id]
	if !p.Character.IsAlive || p.Character.Position == nil {
		return
	}
	seen := map[string]bool{}
	for _, n := range Neighbours(*p.Character.Position) {
		cell, rule, ok := g.groundAtLocked(n)
		if !ok || seen[cell.Kind] {
			continue
		}
		seen[cell.Kind] = true
		rule.besideTurnStart(g, id)
		if !g.players[id].Character.IsAlive {
			return
		}
	}
}

// groundAtTurnEndLocked is what the island does to a character as its turn
// ends. It reports whether that ended the fight.
func (g *Game) groundAtTurnEndLocked(id string) (over bool) {
	p, ok := g.players[id]
	if !ok || !p.Character.IsAlive || p.Character.Position == nil {
		return false
	}
	_, rule, ok := g.groundAtLocked(*p.Character.Position)
	if !ok {
		return false
	}
	before := g.aliveLocked()
	rule.atTurnEnd(g, id)
	g.logDeathsSinceLocked(before)
	return g.checkGameOverLocked()
}

// concealedFromLocked reports whether one character cannot be seen by
// another: it stands in terrain that hides it, and the viewer is further than
// GrassSightRange — or has nobody on the board to see from.
func (g *Game) concealedFromLocked(viewerID, id string) bool {
	if viewerID == id {
		return false
	}
	c := g.players[id].Character
	if !c.IsAlive || c.Position == nil {
		return false
	}
	_, rule, ok := g.groundAtLocked(*c.Position)
	if !ok || !rule.Conceals() {
		return false
	}
	viewer, ok := g.players[viewerID]
	if !ok || viewer.Character.Position == nil || !viewer.Character.IsAlive {
		return true
	}
	return Distance(*viewer.Character.Position, *c.Position) > GrassSightRange
}

func (g *Game) groundSnapshotLocked() []types.GroundCell {
	out := make([]types.GroundCell, 0, len(g.ground))
	for _, cell := range g.ground {
		if cell.Wind != nil {
			wind := *cell.Wind
			cell.Wind = &wind
		}
		out = append(out, cell)
	}
	sortGround(out)
	return out
}

func sortGround(cells []types.GroundCell) {
	sort.Slice(cells, func(i, j int) bool {
		a, b := cells[i].Position, cells[j].Position
		if a.X != b.X {
			return a.X < b.X
		}
		return a.Y < b.Y
	})
}

// ---------------------------------------------------------------------------
// Laying the ground
// ---------------------------------------------------------------------------

// groundPatches is how a terrain is spread over a board: how many patches,
// and how many cells each. Lines are laid straight along their wind.
var groundPatches = map[string]struct {
	patches, size int
	line          bool
}{
	GroundTallGrass:    {3, 5, false},
	GroundRock:         {3, 2, false},
	GroundShallowWater: {3, 4, false},
	GroundIce:          {2, 5, false},
	GroundAcidPool:     {3, 3, false},
	GroundLava:         {2, 3, false},
	GroundAirCurrent:   {3, 3, true},
}

var windDirections = []types.Position{{X: 1, Y: 0}, {X: -1, Y: 0}, {X: 0, Y: 1}, {X: 0, Y: -1}}

// GenerateGround lays an island's terrains over a board already dealt its
// starting cells and cover. It is a function of the random source alone, so a
// seed lays the same ground every time. Starting cells are left bare, solid
// ground keeps clear of the cells beside them too, and no solid cell is laid
// that would cut the board in two.
func GenerateGround(kinds []string, reserved []types.Position, obstacles map[types.Position]bool, rng *rand.Rand) []types.GroundCell {
	off := map[types.Position]bool{}
	nearStart := map[types.Position]bool{}
	for _, p := range reserved {
		off[p] = true
		nearStart[p] = true
		for _, n := range Neighbours(p) {
			nearStart[n] = true
		}
	}
	blocked := make(map[types.Position]bool, len(obstacles))
	for p := range obstacles {
		blocked[p] = true
	}
	laid := map[types.Position]bool{}

	var out []types.GroundCell
	for _, kind := range kinds {
		rule, ok := groundRules[kind]
		shape, shaped := groundPatches[kind]
		if !ok || !shaped {
			continue
		}
		open := func(p types.Position) bool {
			if !InGrid(p) || off[p] || blocked[p] || laid[p] {
				return false
			}
			return !rule.Solid() || !nearStart[p]
		}
		candidates := boardCells()
		rng.Shuffle(len(candidates), func(i, j int) { candidates[i], candidates[j] = candidates[j], candidates[i] })

		patches := 0
		for _, seed := range candidates {
			if patches == shape.patches {
				break
			}
			if !open(seed) {
				continue
			}
			var cells []types.Position
			var wind *types.Position
			if shape.line {
				dir := windDirections[rng.Intn(len(windDirections))]
				wind = &dir
				p := seed
				for len(cells) < shape.size && open(p) {
					cells = append(cells, p)
					p = types.Position{X: p.X + dir.X, Y: p.Y + dir.Y}
				}
			} else {
				cells = growPatch(seed, shape.size, open, rng)
			}
			if rule.Solid() {
				for _, p := range cells {
					blocked[p] = true
				}
				if !boardStaysConnected(blocked, reserved) {
					for _, p := range cells {
						delete(blocked, p)
					}
					continue
				}
			}
			for _, p := range cells {
				laid[p] = true
				cell := types.GroundCell{Position: p, Kind: kind}
				if wind != nil {
					w := *wind
					cell.Wind = &w
				}
				out = append(out, cell)
			}
			patches++
		}
	}
	sortGround(out)
	return out
}

// growPatch grows a blob of up to n cells from a seed, a random open
// neighbour at a time.
func growPatch(seed types.Position, n int, open func(types.Position) bool, rng *rand.Rand) []types.Position {
	patch := []types.Position{seed}
	in := map[types.Position]bool{seed: true}
	for len(patch) < n {
		var edge []types.Position
		for _, p := range patch {
			for _, q := range Neighbours(p) {
				if !in[q] && open(q) {
					edge = append(edge, q)
				}
			}
		}
		if len(edge) == 0 {
			break
		}
		next := edge[rng.Intn(len(edge))]
		in[next] = true
		patch = append(patch, next)
	}
	return patch
}

// boardCells is every cell of the board, in a fixed order.
func boardCells() []types.Position {
	cells := make([]types.Position, 0, 2*GridRadius*GridRadius+2*GridRadius+1)
	for x := -GridRadius; x <= GridRadius; x++ {
		for y := -GridRadius; y <= GridRadius; y++ {
			if p := (types.Position{X: x, Y: y}); InGrid(p) {
				cells = append(cells, p)
			}
		}
	}
	return cells
}
