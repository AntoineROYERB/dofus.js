package game

import (
	"sort"

	"game-server/internal/types"
)

// The power orb is the one thing on the board nobody starts with. It appears
// once, as the third round opens, and whoever ends a move on it walks away
// with a buff big enough to turn the fight — which is the point: a duel that
// had settled into trading blows suddenly has somewhere to run to.
const (
	// PowerOrbTurn is the round the orb appears at the start of.
	PowerOrbTurn = 3
	// PowerOrbDuration is how many of the holder's turns the buff lasts,
	// counting the one it was picked up in.
	PowerOrbDuration = 3
	PowerOrbHeal     = 30
	PowerOrbAP       = 3
	PowerOrbMP       = 2
	PowerOrbShield   = 10
	// PowerOrbPower is added to every hit the holder lands.
	PowerOrbPower = 15
	// powerOrbMinDistance keeps the orb from landing at someone's feet, when
	// the board leaves any choice about it.
	powerOrbMinDistance = 2

	powerOrbSource = "Power Orb"
)

// spawnPowerOrbLocked drops the orb on the fairest free cell: the one whose
// walk is as close to the same length for every living character as the board
// allows, and among those the one furthest from them all. Midway between two
// fighters it was a rally point that dragged both into melee and cut fights a
// round short; out on the flank it is a detour, and taking it a choice. The
// seeded roll only breaks ties, so a replay puts it in the same place.
func (g *Game) spawnPowerOrbLocked() {
	var walks []map[types.Position]int
	for _, id := range g.sortedPlayerIDsLocked() {
		c := g.players[id].Character
		if !c.IsAlive || c.Position == nil {
			continue
		}
		walks = append(walks, walkingDistances(*c.Position, g.blocksMovementLocked))
	}
	if len(walks) == 0 {
		return
	}

	type candidate struct {
		cell           types.Position
		spread, far    int
		atSomeonesFeet bool
	}
	var candidates []candidate
	for x := -GridRadius; x <= GridRadius; x++ {
		for y := -GridRadius; y <= GridRadius; y++ {
			cell := types.Position{X: x, Y: y}
			if !InGrid(cell) || g.blocksMovementLocked(cell) {
				continue
			}
			near, far, reachable := -1, -1, true
			for _, walk := range walks {
				d, ok := walk[cell]
				if !ok {
					reachable = false
					break
				}
				if near == -1 || d < near {
					near = d
				}
				if d > far {
					far = d
				}
			}
			if !reachable {
				continue
			}
			candidates = append(candidates, candidate{
				cell: cell, spread: far - near, far: far,
				atSomeonesFeet: near < powerOrbMinDistance,
			})
		}
	}
	if len(candidates) == 0 {
		return
	}

	// Candidates were collected in a fixed order, and the sort is stable, so
	// the tied block the roll picks from is the same on every run.
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		if a.atSomeonesFeet != b.atSomeonesFeet {
			return !a.atSomeonesFeet
		}
		if a.spread != b.spread {
			return a.spread < b.spread
		}
		return a.far > b.far
	})
	best := candidates[0]
	tied := 1
	for tied < len(candidates) {
		c := candidates[tied]
		if c.atSomeonesFeet != best.atSomeonesFeet || c.spread != best.spread || c.far != best.far {
			break
		}
		tied++
	}
	cell := candidates[g.rng.Intn(tied)].cell

	g.powerOrb = &cell
	at := cell
	g.appendLogLocked(types.LogEntry{
		Actor: "A power orb", Kind: types.LogOrb, Text: "appears on the board", Target: &at,
	})
}

// claimPowerOrbLocked hands the orb to whoever just stepped onto it. The AP
// and MP are granted on the spot as well as for the turns to come: a pickup
// that only paid out next turn would feel like nothing happened.
func (g *Game) claimPowerOrbLocked(userID string) {
	p := g.players[userID]
	if g.powerOrb == nil || p.Character.Position == nil || *p.Character.Position != *g.powerOrb {
		return
	}
	at := *g.powerOrb
	g.powerOrb = nil

	c := &p.Character
	c.Health += PowerOrbHeal
	if c.Health > c.MaxHealth {
		c.Health = c.MaxHealth
	}
	c.ActionPoints += PowerOrbAP
	c.MovementPoints += PowerOrbMP
	for _, e := range []struct {
		kind  string
		value int
	}{
		{types.EffectAP, PowerOrbAP},
		{types.EffectMP, PowerOrbMP},
		{types.EffectShield, PowerOrbShield},
		{types.EffectPower, PowerOrbPower},
	} {
		applyEffect(c, types.Effect{
			Kind: e.kind, Value: e.value, TurnsLeft: PowerOrbDuration, Source: powerOrbSource,
		})
	}
	g.players[userID] = p

	g.appendLogLocked(types.LogEntry{
		Actor: c.Name, Kind: types.LogOrb, Text: "claims the power orb",
		APChange: PowerOrbAP, MPChange: PowerOrbMP, ShieldChange: PowerOrbShield,
		Target: &at,
	})
}
