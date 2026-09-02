package game

import (
	"container/heap"
	"math/rand"

	"game-server/internal/types"
)

// Neighbours returns the four orthogonal cells around a position that are on
// the board. Movement on this grid is never diagonal.
func Neighbours(p types.Position) []types.Position {
	candidates := [4]types.Position{
		{X: p.X + 1, Y: p.Y},
		{X: p.X - 1, Y: p.Y},
		{X: p.X, Y: p.Y + 1},
		{X: p.X, Y: p.Y - 1},
	}
	out := make([]types.Position, 0, 4)
	for _, c := range candidates {
		if InGrid(c) {
			out = append(out, c)
		}
	}
	return out
}

// FindPath walks from one cell to another around whatever `blocked` refuses,
// returning the steps after the start. It returns nil when there is no way
// through.
//
// Movement used to cost the straight-line Manhattan distance, which is only
// right on an empty board: with something in the way, the real walk is longer
// and sometimes impossible.
func FindPath(from, to types.Position, blocked func(types.Position) bool) []types.Position {
	if from == to {
		return []types.Position{}
	}
	if !InGrid(to) || blocked(to) {
		return nil
	}

	cameFrom := map[types.Position]types.Position{}
	cost := map[types.Position]int{from: 0}
	open := &frontier{{pos: from, priority: Distance(from, to)}}
	heap.Init(open)

	for open.Len() > 0 {
		current := heap.Pop(open).(node).pos
		if current == to {
			return rebuild(cameFrom, from, to)
		}
		for _, next := range Neighbours(current) {
			if blocked(next) {
				continue
			}
			stepCost := cost[current] + 1
			if known, seen := cost[next]; seen && stepCost >= known {
				continue
			}
			cost[next] = stepCost
			cameFrom[next] = current
			heap.Push(open, node{pos: next, priority: stepCost + Distance(next, to)})
		}
	}
	return nil
}

// Reachable lists every cell a character can walk to with the movement points
// it has left, and how many steps each one costs.
func Reachable(from types.Position, movementPoints int, blocked func(types.Position) bool) map[types.Position]int {
	reached := map[types.Position]int{from: 0}
	queue := []types.Position{from}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if reached[current] == movementPoints {
			continue
		}
		for _, next := range Neighbours(current) {
			if blocked(next) {
				continue
			}
			if _, seen := reached[next]; seen {
				continue
			}
			reached[next] = reached[current] + 1
			queue = append(queue, next)
		}
	}
	delete(reached, from)
	return reached
}

func rebuild(cameFrom map[types.Position]types.Position, from, to types.Position) []types.Position {
	path := []types.Position{}
	for at := to; at != from; at = cameFrom[at] {
		path = append(path, at)
	}
	// Collected backwards.
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	return path
}

type node struct {
	pos      types.Position
	priority int
}

type frontier []node

func (f frontier) Len() int            { return len(f) }
func (f frontier) Less(i, j int) bool  { return f[i].priority < f[j].priority }
func (f frontier) Swap(i, j int)       { f[i], f[j] = f[j], f[i] }
func (f *frontier) Push(x interface{}) { *f = append(*f, x.(node)) }
func (f *frontier) Pop() interface{} {
	old := *f
	n := len(old)
	item := old[n-1]
	*f = old[:n-1]
	return item
}

// ObstacleCount is how many blocked cells a board gets.
const ObstacleCount = 14

// GenerateObstacles scatters cover across the board, keeping clear of the
// starting cells that have already been dealt and of the centre, so nobody is
// walled in before the match begins.
func GenerateObstacles(reserved []types.Position, rng *rand.Rand) []types.Position {
	off := map[types.Position]bool{{X: 0, Y: 0}: true}
	for _, p := range reserved {
		off[p] = true
		// Leave the cells beside a starting square walkable too.
		for _, n := range Neighbours(p) {
			off[n] = true
		}
	}

	candidates := make([]types.Position, 0, 128)
	for x := -GridRadius; x <= GridRadius; x++ {
		for y := -GridRadius; y <= GridRadius; y++ {
			p := types.Position{X: x, Y: y}
			if InGrid(p) && !off[p] && abs(x)+abs(y) > 2 {
				candidates = append(candidates, p)
			}
		}
	}
	rng.Shuffle(len(candidates), func(i, j int) {
		candidates[i], candidates[j] = candidates[j], candidates[i]
	})

	chosen := map[types.Position]bool{}
	obstacles := make([]types.Position, 0, ObstacleCount)
	for _, p := range candidates {
		if len(obstacles) == ObstacleCount {
			break
		}
		// Keep the board connected: an obstacle that cuts it in two would
		// strand players on either side.
		chosen[p] = true
		if boardStaysConnected(chosen, reserved) {
			obstacles = append(obstacles, p)
		} else {
			delete(chosen, p)
		}
	}
	return obstacles
}

// boardStaysConnected checks that every free cell is still reachable from the
// first starting cell.
func boardStaysConnected(blocked map[types.Position]bool, reserved []types.Position) bool {
	start := types.Position{X: 0, Y: 0}
	if len(reserved) > 0 {
		start = reserved[0]
	}
	if blocked[start] {
		return false
	}

	free := 0
	for x := -GridRadius; x <= GridRadius; x++ {
		for y := -GridRadius; y <= GridRadius; y++ {
			p := types.Position{X: x, Y: y}
			if InGrid(p) && !blocked[p] {
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
			if blocked[n] || seen[n] {
				continue
			}
			seen[n] = true
			queue = append(queue, n)
		}
	}
	return len(seen) == free
}
