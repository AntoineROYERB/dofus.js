package game

import (
	"math/rand"
	"testing"

	"game-server/internal/types"
)

func TestInGrid(t *testing.T) {
	cases := []struct {
		pos  types.Position
		want bool
	}{
		{types.Position{X: 0, Y: 0}, true},
		{types.Position{X: 7, Y: 0}, true},
		{types.Position{X: -4, Y: 3}, true},
		{types.Position{X: 8, Y: 0}, false},
		{types.Position{X: 4, Y: 4}, false},
		{types.Position{X: -7, Y: -1}, false},
	}
	for _, tc := range cases {
		if got := InGrid(tc.pos); got != tc.want {
			t.Errorf("InGrid(%+v) = %v, want %v", tc.pos, got, tc.want)
		}
	}
}

func TestDistanceIsManhattan(t *testing.T) {
	got := Distance(types.Position{X: -2, Y: 1}, types.Position{X: 1, Y: -1})
	if got != 5 {
		t.Errorf("Distance = %d, want 5", got)
	}
	if d := Distance(types.Position{X: 3, Y: 3}, types.Position{X: 3, Y: 3}); d != 0 {
		t.Errorf("Distance to self = %d, want 0", d)
	}
}

// A circle used to be a ring of eight cells at distance 2 with a hole in the
// middle, so a fireball aimed straight at someone missed them entirely.
func TestCirclePatternCoversTheTargetedCell(t *testing.T) {
	pattern, rotates := AreaPattern(types.AoECircle)
	if rotates {
		t.Error("a circle should not be rotated")
	}
	if !containsPosition(pattern, types.Position{X: 0, Y: 0}) {
		t.Fatalf("circle pattern %v does not cover the targeted cell", pattern)
	}
}

func TestAreaPatternDefaultsToSingleCell(t *testing.T) {
	for _, aoe := range []string{types.AoENone, "", "nonsense"} {
		pattern, rotates := AreaPattern(aoe)
		if rotates || len(pattern) != 1 || pattern[0] != (types.Position{X: 0, Y: 0}) {
			t.Errorf("AreaPattern(%q) = %v, %v; want a single unrotated cell", aoe, pattern, rotates)
		}
	}
}

func TestLineAreaFollowsTheCastDirection(t *testing.T) {
	spell := types.Spell{AreaOfEffect: types.AoELine, Range: 6}
	caster := types.Position{X: 0, Y: 0}

	// Casting east (same row, increasing X) should lay the line along +X.
	got := AffectedPositions(spell, types.Position{X: 2, Y: 0}, caster)
	want := []types.Position{{X: 2, Y: 0}, {X: 3, Y: 0}, {X: 4, Y: 0}}
	assertSameCells(t, got, want)

	// Casting north (same column, decreasing Y) should mirror the line.
	got = AffectedPositions(spell, types.Position{X: 0, Y: -2}, caster)
	want = []types.Position{{X: 0, Y: -2}, {X: 0, Y: -3}, {X: 0, Y: -4}}
	assertSameCells(t, got, want)
}

func TestAffectedPositionsDropsCellsOffTheBoard(t *testing.T) {
	spell := types.Spell{AreaOfEffect: types.AoECircle, Range: 10}
	// Targeting the far edge pushes half the blast outside the diamond.
	got := AffectedPositions(spell, types.Position{X: 7, Y: 0}, types.Position{X: 0, Y: 0})
	if len(got) == 0 {
		t.Fatal("expected some cells to survive clipping")
	}
	for _, p := range got {
		if !InGrid(p) {
			t.Errorf("AffectedPositions returned off-board cell %+v", p)
		}
	}
}

func TestDealInitialPositionsGivesEveryoneDistinctCells(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	dealt := DealInitialPositions([]string{"a", "b", "c"}, rng)

	seen := map[types.Position]string{}
	for id, positions := range dealt {
		if len(positions) != InitialPositionChoices {
			t.Errorf("player %s got %d starting cells, want %d", id, len(positions), InitialPositionChoices)
		}
		for _, p := range positions {
			if !InGrid(p) {
				t.Errorf("player %s got off-board starting cell %+v", id, p)
			}
			if p.X == 0 || p.Y == 0 {
				t.Errorf("player %s got starting cell %+v on an axis", id, p)
			}
			if owner, dup := seen[p]; dup {
				t.Errorf("cell %+v dealt to both %s and %s", p, owner, id)
			}
			seen[p] = id
		}
	}
}

// Three cells in three different corners could not be read as a starting area,
// which is the whole point of offering a choice of them.
func TestDealInitialPositionsGivesEachSideOneBlock(t *testing.T) {
	for seed := int64(0); seed < 30; seed++ {
		dealt := DealInitialPositions([]string{"a", "b"}, rand.New(rand.NewSource(seed)))
		for id, positions := range dealt {
			if !isContiguous(positions) {
				t.Errorf("seed %d: %s got a scattered block %+v", seed, id, positions)
			}
		}

		// Neither side may start nearer the middle than the other.
		distA := Distance(types.Position{}, dealt["a"][0])
		distB := Distance(types.Position{}, dealt["b"][0])
		if distA != distB {
			t.Errorf("seed %d: anchors sit %d and %d from the centre, want them level",
				seed, distA, distB)
		}
		if between := Distance(dealt["a"][0], dealt["b"][0]); between < GridRadius {
			t.Errorf("seed %d: the two sides start %d apart, want them facing across the board",
				seed, between)
		}
	}
}

// isContiguous reports whether every cell can be reached from the first by
// stepping between cells of the set.
func isContiguous(cells []types.Position) bool {
	if len(cells) == 0 {
		return false
	}
	set := make(map[types.Position]bool, len(cells))
	for _, c := range cells {
		set[c] = true
	}
	reached := map[types.Position]bool{cells[0]: true}
	queue := []types.Position{cells[0]}
	for len(queue) > 0 {
		cell := queue[0]
		queue = queue[1:]
		for _, next := range Neighbours(cell) {
			if set[next] && !reached[next] {
				reached[next] = true
				queue = append(queue, next)
			}
		}
	}
	return len(reached) == len(cells)
}

func assertSameCells(t *testing.T, got, want []types.Position) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for _, w := range want {
		if !containsPosition(got, w) {
			t.Fatalf("got %v, want it to contain %+v", got, w)
		}
	}
}
