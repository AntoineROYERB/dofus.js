package game

import (
	"errors"
	"math/rand"
	"sort"
	"strings"

	"game-server/internal/types"
)

// A fight used to be a duel and nothing else: two fighters, and the last one
// standing won. Endless Dreams puts a party of up to three players against a
// room of up to six monsters (docs/adr/0004-teams.md), so a fighter now
// belongs to a side.
//
// A duel has no teams at all. Every fighter is then their own side, every
// rule that asks "who is an enemy" answers exactly as it did before, and a
// duel draws nothing new from the seed: the recorded fights still replay.

// MaxSeats is the most fighters a fight can hold: a party of three and a room
// of six monsters. The board is a diamond of 113 cells, which seats that many
// with room left to fight in.
const MaxSeats = 9

// Teams a fight in a dream is played between.
const (
	TeamParty = "party"
	TeamDream = "dream"
)

var (
	ErrTooManySeats = errors.New("a fight seats at most nine")
	ErrUnknownTeam  = errors.New("that team is not one this fight is played between")
)

// sideOf is the side a fighter fights on: their team, or themselves alone in
// a duel.
func sideOf(p types.Player) string {
	if p.Team != "" {
		return p.Team
	}
	return "solo:" + p.UserID
}

// sameSide reports whether two fighters fight together. A fighter is always
// on their own side.
func (g *Game) sameSideLocked(a, b string) bool {
	if a == b {
		return true
	}
	pa, okA := g.players[a]
	pb, okB := g.players[b]
	return okA && okB && pa.Team != "" && pa.Team == pb.Team
}

// teamedLocked reports whether this fight is played between teams rather than
// as a duel. One fighter with a team is enough: a room is either one or the
// other, from the moment it is set up.
func (g *Game) teamedLocked() bool {
	for _, p := range g.players {
		if p.Team != "" {
			return true
		}
	}
	return false
}

// capacityLocked is how many fighters this fight seats, and the number that
// has to be reached before placement opens.
func (g *Game) capacityLocked() int {
	return g.seats
}

// Capacity is how many fighters this fight seats.
func (g *Game) Capacity() int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.seats
}

// sidesStandingLocked lists the sides that still have someone on their feet,
// each with who is standing on it, in seat order.
func (g *Game) sidesStandingLocked() map[string][]string {
	sides := make(map[string][]string)
	for _, id := range g.sortedPlayerIDsLocked() {
		p := g.players[id]
		if p.Character.IsAlive {
			sides[sideOf(p)] = append(sides[sideOf(p)], id)
		}
	}
	return sides
}

// sidesSeatedLocked counts the sides with anyone seated at all.
func (g *Game) sidesSeatedLocked() int {
	seen := make(map[string]bool)
	for _, p := range g.players {
		seen[sideOf(p)] = true
	}
	return len(seen)
}

// teamRostersLocked groups the seated fighters by team, each roster sorted,
// and the teams sorted by name, so that what is dealt from the seed depends
// on nothing but the seed.
func (g *Game) teamRostersLocked() (teams []string, rosters map[string][]string) {
	rosters = make(map[string][]string)
	for _, id := range g.sortedPlayerIDsLocked() {
		team := sideOf(g.players[id])
		if _, seen := rosters[team]; !seen {
			teams = append(teams, team)
		}
		rosters[team] = append(rosters[team], id)
	}
	sort.Strings(teams)
	return teams, rosters
}

// teamInitiativeLocked rolls the turn order of a fight between teams. Each
// team's own order is shuffled, and so is which team opens, and then the
// teams take turns: a fighter of one, a fighter of the other. A side larger
// than the other plays the rest of its fighters one after another at the end
// of the round, which is how a room of six monsters still lets every player
// act between two of them.
func (g *Game) teamInitiativeLocked(teams []string, rosters map[string][]string) []string {
	shuffled := make([][]string, 0, len(teams))
	for _, team := range teams {
		ids := append([]string(nil), rosters[team]...)
		g.rng.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })
		shuffled = append(shuffled, ids)
	}
	g.rng.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })

	order := make([]string, 0, len(g.players))
	for round := 0; len(order) < len(g.players); round++ {
		for _, ids := range shuffled {
			if round < len(ids) {
				order = append(order, ids[round])
			}
		}
	}
	return order
}

// DealTeamPositions hands each team one block of adjacent starting cells,
// shared by its fighters, with the blocks opposite each other the way a
// duel's are. A block holds a cell for every fighter on the team and two
// more, so the last of them to place still has a choice.
func DealTeamPositions(teams []string, rosters map[string][]string, rng *rand.Rand) map[string][]types.Position {
	dealt := make(map[string][]types.Position, len(teams))
	taken := make(map[types.Position]bool)
	anchors := startingAnchors(len(teams), rng)
	for i, team := range teams {
		size := max(InitialPositionChoices, len(rosters[team])+2)
		dealt[team] = growCluster(anchors[i], size, taken)
	}
	return dealt
}

// winnerNamesLocked is how a side that won is named: its fighter's name in a
// duel, every name on it otherwise, in turn order.
func (g *Game) winnerNamesLocked(ids []string) string {
	if len(ids) == 1 {
		return g.players[ids[0]].Character.Name
	}
	at := make(map[string]int, len(g.turnOrder))
	for i, id := range g.turnOrder {
		at[id] = i
	}
	ordered := append([]string(nil), ids...)
	sort.SliceStable(ordered, func(i, j int) bool { return at[ordered[i]] < at[ordered[j]] })
	names := make([]string, len(ordered))
	for i, id := range ordered {
		names[i] = g.players[id].Character.Name
	}
	return strings.Join(names, ", ")
}

// WinnerTeam is the team that won a fight between teams, once it is over:
// empty in a duel, and when nobody was left standing.
func (g *Game) WinnerTeam() string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.winnerTeam
}
