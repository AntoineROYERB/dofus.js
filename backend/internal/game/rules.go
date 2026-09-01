package game

import (
	"game-server/internal/types"
	"math/rand"
)

// GridRadius defines the playable board: a diamond of every cell whose
// Manhattan distance from the origin is at most GridRadius. It matches the
// client's grid of size 15 (radius 7).
const GridRadius = 7

// Starting stats. The server assigns these; a client never sends them.
const (
	StartingHealth         = 100
	StartingActionPoints   = 6
	StartingMovementPoints = 4
	InitialPositionChoices = 3
	MinPlayers             = 2
)

// InGrid reports whether a position lies on the board.
func InGrid(p types.Position) bool {
	return abs(p.X)+abs(p.Y) <= GridRadius
}

// Distance is the Manhattan distance, which is how both movement points and
// spell range are measured on this board.
func Distance(a, b types.Position) int {
	return abs(b.X-a.X) + abs(b.Y-a.Y)
}

// Direction returns the orientation from one cell to another for the four
// axis-aligned cases, and "" when the two cells are neither on the same row
// nor the same column. Directional patterns are not rotated in that case.
func Direction(from, to types.Position) string {
	if from.X == to.X {
		if from.Y > to.Y {
			return "down"
		}
		return "up"
	}
	if from.Y == to.Y {
		if from.X > to.X {
			return "left"
		}
		return "right"
	}
	return ""
}

// Rotate turns a pattern offset to face the given direction.
func Rotate(p types.Position, direction string) types.Position {
	switch direction {
	case "down":
		return types.Position{X: -p.X, Y: -p.Y}
	case "left":
		return types.Position{X: -p.Y, Y: p.X}
	case "right":
		return types.Position{X: p.Y, Y: -p.X}
	default: // "up" and the unrotated case
		return p
	}
}

// AreaPattern returns the offsets an area of effect covers around the targeted
// cell, and whether the pattern should be rotated to face the cast direction.
func AreaPattern(areaOfEffect string) (pattern []types.Position, rotates bool) {
	switch areaOfEffect {
	case types.AoECircle:
		// The targeted cell is part of the blast. It used to be missing, so a
		// fireball aimed straight at an enemy did nothing to them.
		return []types.Position{
			{X: 0, Y: 0},
			{X: 2, Y: 0}, {X: 1, Y: 1}, {X: 0, Y: 2}, {X: -1, Y: 1},
			{X: -2, Y: 0}, {X: 1, Y: -1}, {X: 0, Y: -2}, {X: -1, Y: -1},
		}, false
	case types.AoELine:
		return []types.Position{{X: 0, Y: 0}, {X: 0, Y: 1}, {X: 0, Y: 2}}, true
	case types.AoECross:
		return []types.Position{
			{X: 0, Y: 0}, {X: 0, Y: 1}, {X: 1, Y: 0}, {X: -1, Y: 0}, {X: 0, Y: -1},
		}, true
	default: // types.AoENone
		return []types.Position{{X: 0, Y: 0}}, false
	}
}

// AffectedPositions resolves the cells a spell actually hits, dropping any
// that fall outside the board.
func AffectedPositions(spell types.Spell, target, caster types.Position) []types.Position {
	pattern, rotates := AreaPattern(spell.AreaOfEffect)

	direction := ""
	if rotates {
		direction = Direction(caster, target)
	}

	affected := make([]types.Position, 0, len(pattern))
	for _, offset := range pattern {
		if rotates {
			offset = Rotate(offset, direction)
		}
		p := types.Position{X: target.X + offset.X, Y: target.Y + offset.Y}
		if InGrid(p) {
			affected = append(affected, p)
		}
	}
	return affected
}

// DealInitialPositions hands each player its own set of starting cells, with
// no overlap between players. Positions off the axes are preferred so the two
// sides do not start facing each other down a straight line.
func DealInitialPositions(playerIDs []string, rng *rand.Rand) map[string][]types.Position {
	candidates := make([]types.Position, 0, 128)
	for x := -GridRadius; x <= GridRadius; x++ {
		for y := -GridRadius; y <= GridRadius; y++ {
			if x == 0 || y == 0 {
				continue
			}
			p := types.Position{X: x, Y: y}
			if InGrid(p) {
				candidates = append(candidates, p)
			}
		}
	}

	rng.Shuffle(len(candidates), func(i, j int) {
		candidates[i], candidates[j] = candidates[j], candidates[i]
	})

	dealt := make(map[string][]types.Position, len(playerIDs))
	next := 0
	for _, id := range playerIDs {
		positions := make([]types.Position, 0, InitialPositionChoices)
		for len(positions) < InitialPositionChoices && next < len(candidates) {
			positions = append(positions, candidates[next])
			next++
		}
		dealt[id] = positions
	}
	return dealt
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
