package game

import (
	"fmt"
	"strconv"
	"testing"

	"game-server/internal/types"
)

// The planner plays every cast on a board of its own before it chooses one.
// When it gets a cast wrong — a push the wrong way, a pylon it thinks still
// stands, a hit it thinks lands in full — it plans the rest of its turn from
// a board that does not exist. Each case here sets a cast up, asks the
// planner what it will do, casts it on the server, and holds the two to each
// other: where everyone stands, what they have left, what stands on the board
// and what covers it. The board has no criticals, so damage is exact.

// mirrorCase is one cast to hold the planner to.
type mirrorCase struct {
	name string
	// a casts at b, three cells up, unless the set-up moves them.
	a, b  types.Position
	setUp func(g *Game)
	spell int
	aim   types.Position
	// refused is a cast the server turns down, which the planner must not
	// count on either.
	refused bool
}

func placeRelay(g *Game, owner string, at types.Position, health int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.setRelayLocked(at, owner, health)
}

func placeCairn(g *Game, owner string, at types.Position) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.obstacles[at] = true
	if g.terrain == nil {
		g.terrain = map[types.Position]types.TerrainCell{}
	}
	g.terrain[at] = types.TerrainCell{Position: at, Kind: types.TerrainPillar, Owner: owner, Health: PillarHealth}
}

func wounded(g *Game, id string, health int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p := g.players[id]
	p.Character.Health = health
	g.players[id] = p
}

func shielded(g *Game, id string, value int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p := g.players[id]
	applyEffect(&p.Character, types.Effect{Kind: types.EffectShield, Value: value, TurnsLeft: 1, Source: "test"})
	g.players[id] = p
}

var mirrorCases = []mirrorCase{
	// The pylon and the windwalker.
	{name: "Sef trades places with its pylon", setUp: func(g *Game) {
		asChampion(g, "a", "sef")
		placeRelay(g, "a", types.Position{X: 3, Y: 1}, RelayHealth-4)
	}, spell: spellTransfer, aim: types.Position{X: 3, Y: 1}},
	{name: "a swap aimed anywhere but the pylon is refused", setUp: func(g *Game) {
		asChampion(g, "a", "sef")
		placeRelay(g, "a", types.Position{X: 3, Y: 1}, RelayHealth)
	}, spell: spellTransfer, aim: types.Position{X: 2, Y: 1}, refused: true},
	{name: "a relayed push draws its victim into the pylon", setUp: func(g *Game) {
		asChampion(g, "a", "sef")
		placeRelay(g, "a", types.Position{Y: 5}, RelayHealth)
	}, spell: spellGale, aim: types.Position{Y: 3}},
	{name: "a pylon slammed into once too often breaks and goes off", setUp: func(g *Game) {
		asChampion(g, "a", "sef")
		placeRelay(g, "a", types.Position{Y: 5}, CollisionDamage)
	}, spell: spellGale, aim: types.Position{Y: 3}},
	{name: "a relayed spell goes out from the pylon and hits harder", setUp: func(g *Game) {
		asChampion(g, "a", "sef")
		placeRelay(g, "a", types.Position{X: 2, Y: 4}, RelayHealth)
	}, b: types.Position{Y: 6}, spell: spellLightning, aim: types.Position{Y: 6}},
	{name: "an enemy's pylon takes a hit and is worn down", setUp: func(g *Game) {
		asChampion(g, "b", "sef")
		placeRelay(g, "b", types.Position{X: 3}, RelayHealth)
	}, spell: spellKindle, aim: types.Position{X: 3}},
	{name: "an enemy's pylon broken goes off on whoever stands beside it", setUp: func(g *Game) {
		asChampion(g, "b", "sef")
		placeRelay(g, "b", types.Position{X: 1}, damageOfSpell(spellKindle))
	}, b: types.Position{X: 2, Y: 1}, spell: spellKindle, aim: types.Position{X: 1}},
	{name: "an enemy's pylon stands in the line of fire", setUp: func(g *Game) {
		asChampion(g, "b", "sef")
		placeRelay(g, "b", types.Position{Y: 2}, RelayHealth)
	}, spell: spellKindle, aim: types.Position{Y: 3}, refused: true},
	{name: "a pylon set aside walls nothing off and stands whole", setUp: func(g *Game) {
		asChampion(g, "a", "sef")
		placeRelay(g, "a", types.Position{X: -3}, 3)
	}, spell: spellUpdraft, aim: types.Position{X: 2, Y: 2}},

	// The legendaries' ultimates, in each element they change in.
	{name: "the cleaver raises a menhir either side in earth", setUp: func(g *Game) {
		asChampion(g, "a", "old-grund")
	}, spell: spellCleaver, aim: types.Position{Y: 3}},
	{name: "the cleaver plants a pylon in the air", setUp: func(g *Game) {
		asChampion(g, "a", "sef")
	}, spell: spellCleaver, aim: types.Position{Y: 3}},
	{name: "the cleaver burns in fire", setUp: func(g *Game) {
		asChampion(g, "a", "ashka")
	}, spell: spellCleaver, aim: types.Position{Y: 3}},
	{name: "the cleaver freezes the line in water", setUp: func(g *Game) {
		asChampion(g, "a", "mother-brine")
	}, spell: spellCleaver, aim: types.Position{Y: 3}},
	{name: "the ray cages its target in earth, open towards the caster", setUp: func(g *Game) {
		asChampion(g, "a", "old-grund")
	}, spell: spellRay, aim: types.Position{Y: 3}},
	{name: "the ray strikes three times and throws between them in the air", setUp: func(g *Game) {
		asChampion(g, "a", "sef")
	}, spell: spellRay, aim: types.Position{Y: 3}},
	{name: "the ray freezes a cross in water", setUp: func(g *Game) {
		asChampion(g, "a", "mother-brine")
	}, spell: spellRay, aim: types.Position{Y: 3}},
	{name: "the drums strike in fire", setUp: func(g *Game) {
		asChampion(g, "a", "ashka")
	}, spell: spellDrums, aim: types.Position{Y: 3}},
	{name: "the maw throws away from where it comes out", setUp: func(g *Game) {
		asChampion(g, "a", "ashka")
	}, b: types.Position{X: 1, Y: 3}, spell: spellMaw, aim: types.Position{Y: 3}},

	// The outfits' basic attacks.
	{name: "the lantern sets the target's cell alight", b: types.Position{Y: 1}, spell: spellLanternSwing, aim: types.Position{Y: 1}},
	{name: "the heart burst burns a cross", spell: spellHeartBurst, aim: types.Position{Y: 3}},
	{name: "the lance runs through a line and throws back", spell: spellLanceCharge, aim: types.Position{Y: 1}},
	{name: "the feathers strike three times", b: types.Position{Y: 6}, spell: spellSteelFeathers, aim: types.Position{Y: 6}},
	{name: "the trident hooks a cell closer", b: types.Position{Y: 2}, spell: spellTridentHook, aim: types.Position{Y: 2}},
	{name: "the tide orb leaves a puddle", spell: spellTideOrb, aim: types.Position{Y: 3}},
	{name: "the flail sweeps round its bearer", b: types.Position{X: -1}, spell: spellFlailSweep, aim: types.Position{}},
	{name: "the stone is lobbed over cover", setUp: func(g *Game) {
		g.mu.Lock()
		g.obstacles[types.Position{Y: 2}] = true
		g.mu.Unlock()
	}, b: types.Position{Y: 4}, spell: spellStoneLob, aim: types.Position{Y: 4}},

	// What the kit makes of a hit.
	{name: "a Stonewarden's pillar takes the blow first", setUp: func(g *Game) {
		asChampion(g, "b", "old-grund")
		placeCairn(g, "b", types.Position{X: 1, Y: 4})
	}, spell: spellKindle, aim: types.Position{Y: 3}},
	{name: "a pillar worn through lets the rest of the blow by", setUp: func(g *Game) {
		asChampion(g, "a", "old-grund")
		asChampion(g, "b", "old-grund")
		placeCairn(g, "b", types.Position{X: 1, Y: 2})
	}, b: types.Position{Y: 1}, spell: spellHammer, aim: types.Position{Y: 1}},
	{name: "an Opportunist rune presses a wounded target harder", setUp: func(g *Game) {
		asChampion(g, "a", "ashka")
		wounded(g, "b", 20)
	}, spell: spellKindle, aim: types.Position{Y: 3}},
	{name: "a shield soaks part of every hit", setUp: func(g *Game) {
		shielded(g, "b", 3)
	}, spell: spellKindle, aim: types.Position{Y: 3}},
	{name: "a maelstrom tears the shield away before it hits", setUp: func(g *Game) {
		shielded(g, "b", 3)
	}, spell: spellMaelstrom, aim: types.Position{Y: 3}},
}

// The planner weighs a legendary's ultimate as the server will cast it, in
// the element its caster wears, not as the catalogue writes it.
func TestTheBotWeighsAnUltimateInItsOwnElement(t *testing.T) {
	g := duel(t, types.Position{}, types.Position{Y: 3})
	asChampion(g, "a", "old-grund")
	setBar(g, "a", strconv.Itoa(spellCleaver))
	onTurn(g, UltimateFromTurn)
	snap := g.SnapshotFor("a")
	b := readBoard(snap, "a", mindOf(snap.Players["a"], 0))
	ready := readySpells(snap, snap.Players["a"], b.me.element)
	if len(ready) != 1 || ready[0].Special != types.SpecialFlank {
		t.Fatalf("ready = %+v, want the cleaver as earth makes it, raising menhirs", ready)
	}
}

func damageOfSpell(id int) int {
	return Content().Spells[strconv.Itoa(id)].Damage
}

func TestThePlannerForeseesWhatEachCastDoes(t *testing.T) {
	for _, tc := range mirrorCases {
		t.Run(tc.name, func(t *testing.T) {
			b := tc.b
			if b == (types.Position{}) {
				b = types.Position{Y: 3}
			}
			g := duel(t, tc.a, b)
			setBar(g, "a", strconv.Itoa(tc.spell))
			points(g, "a", 12, 0)
			onTurn(g, UltimateFromTurn)
			if tc.setUp != nil {
				tc.setUp(g)
			}

			predicted, ok := foresee(g, "a", tc.spell, tc.aim)
			err := g.CastSpell("a", tc.spell, tc.aim)
			if tc.refused {
				if err == nil {
					t.Fatalf("the server took the cast; the case expects it refused")
				}
				if ok {
					t.Errorf("the server refuses the cast (%v), the planner counts on it", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("CastSpell: %v", err)
			}
			if !ok {
				t.Fatalf("the server takes the cast, the planner thinks it refused or pointless")
			}
			for _, diff := range mirrorDiffs(g, predicted) {
				t.Error(diff)
			}
		})
	}
}

// foresee is the planner's board once one cast is played on it.
func foresee(g *Game, id string, spellID int, aim types.Position) (*sim, bool) {
	snap := g.SnapshotFor(id)
	b := readBoard(snap, id, mindOf(snap.Players[id], 0))
	spell := infused(snap.Spells[strconv.Itoa(spellID)], b.me.element)
	nth := 0
	s := b.newSim(b.me.pos, []types.Spell{spell}, &nth)
	_, n, ok := s.cast(spell, 0, aim)
	return n, ok
}

// mirrorDiffs lists every way the server's board differs from the planner's.
func mirrorDiffs(g *Game, predicted *sim) []string {
	var diffs []string
	snap := g.Snapshot()
	me := snap.Players[predicted.me.id].Character
	if *me.Position != predicted.me.pos {
		diffs = append(diffs, fmt.Sprintf("the caster is on %+v, the planner put it on %+v", *me.Position, predicted.me.pos))
	}
	if me.Health != max(0, predicted.me.health) {
		diffs = append(diffs, fmt.Sprintf("the caster has %d health, the planner expected %d", me.Health, predicted.me.health))
	}
	for _, f := range predicted.foes {
		c := snap.Players[f.id].Character
		if c.Health != max(0, f.health) {
			diffs = append(diffs, fmt.Sprintf("%s has %d health, the planner expected %d", f.id, c.Health, f.health))
		}
		if c.IsAlive && *c.Position != f.pos {
			diffs = append(diffs, fmt.Sprintf("%s is on %+v, the planner put it on %+v", f.id, *c.Position, f.pos))
		}
		if stacks, _ := burnOf(c); stacks != f.burn {
			diffs = append(diffs, fmt.Sprintf("%s carries %d burns, the planner expected %d", f.id, stacks, f.burn))
		}
	}
	var standing []thing
	for _, cell := range snap.Terrain {
		if isThing(cell.Kind) {
			standing = append(standing, thing{pos: cell.Position, kind: cell.Kind, owner: cell.Owner, health: cell.Health})
		}
	}
	expected := append([]thing(nil), predicted.things...)
	sortThings(expected)
	if fmt.Sprint(standing) != fmt.Sprint(expected) {
		diffs = append(diffs, fmt.Sprintf("standing on the board: %+v, the planner expected %+v", standing, expected))
	}
	for _, cell := range boardCells() {
		if got, want := terrainAt(g, cell), predicted.terrainAt(cell).Kind; got != want {
			diffs = append(diffs, fmt.Sprintf("%+v is %q, the planner expected %q", cell, got, want))
		}
		if blocked, want := rockAt(g, cell), predicted.solid(cell) && !predicted.b.groundIs(cell, GroundRule.Solid) &&
			predicted.terrainAt(cell).Kind != types.TerrainCrater && predicted.terrainAt(cell).Kind != types.TerrainFissure &&
			predicted.terrainAt(cell).Kind != types.TerrainRelay; blocked != want {
			diffs = append(diffs, fmt.Sprintf("%+v blocked = %v, the planner expected %v", cell, blocked, want))
		}
	}
	return diffs
}
