package dream

import (
	"errors"
	"time"

	"game-server/internal/content"
	"game-server/internal/game"
	"game-server/internal/types"
)

// Phases a run goes through. A run gathers its party, then loops on choosing
// a room, fighting in it and taking boons, until the party falls.
const (
	PhaseGathering = "gathering"
	PhaseRoom      = "room"
	PhaseFighting  = "fighting"
	PhaseBoons     = "boons"
	PhaseOver      = "over"
)

// BoonSeconds is how long a party has to take its boons. Whoever has not
// chosen by then gets the first one offered: one player gone to make a
// coffee cannot hold the other two on the stairs.
const BoonSeconds = 30

// Rejections, written for a player to read.
var (
	ErrNotTheLeader   = errors.New("only the party's leader can do that")
	ErrPartyFull      = errors.New("the party is full")
	ErrWrongPhase     = errors.New("that is not something to do right now")
	ErrNotInTheRun    = errors.New("you are not in this dream")
	ErrNoSuchRoom     = errors.New("there is no such room")
	ErrNotOffered     = errors.New("that boon was not offered to you")
	ErrAlreadyChose   = errors.New("you have already chosen")
	ErrAlreadyInParty = errors.New("you are already in this party")
)

// Member is one player of a run.
type Member struct {
	// Key is the member's secret, kept by their client, that lets them back
	// into the run after a reload or a server restart. It never leaves the
	// server except to the member it belongs to.
	Key string `json:"key"`
	// UserID is the connection the member is playing on now.
	UserID string                    `json:"userId"`
	Look   types.CharacterAppearance `json:"look"`
	Boons  []string                  `json:"boons"`
	// SecondWindSpent is once a run: the boon stays held, and does nothing.
	SecondWindSpent bool `json:"secondWindSpent,omitempty"`
	// Left is a member who walked out of the run. They stay on its roll,
	// and on the leaderboard's line, but fight no more.
	Left bool `json:"left,omitempty"`
	// Offer is the boons offered after the last win, and Picked the one
	// taken from it, until the next floor.
	Offer  []string `json:"offer,omitempty"`
	Picked string   `json:"picked,omitempty"`
	// Pointed is the room a member would like the leader to take; -1 for
	// none.
	Pointed int `json:"pointed"`
}

// Run is one climb.
type Run struct {
	ID   string `json:"id"`
	Seed int64  `json:"seed"`
	// Floor is the floor being chosen or fought; Cleared is the highest the
	// party has beaten.
	Floor   int    `json:"floor"`
	Cleared int    `json:"cleared"`
	Phase   string `json:"phase"`
	// Leader is an index into Members.
	Leader  int       `json:"leader"`
	Members []*Member `json:"members"`
	// StartSize is how many set out: the leaderboard's board.
	StartSize int `json:"startSize"`
	// Offer is the current floor's rooms, and Chosen the one entered.
	Offer  *Offer `json:"offer,omitempty"`
	Chosen int    `json:"chosen"`
	// Turns is every turn fought so far, the leaderboard's tie-breaker.
	Turns int `json:"turns"`
	// MatchIDs are the fights, in order, for the leaderboard to replay.
	MatchIDs     []string  `json:"matchIds"`
	StartedAt    time.Time `json:"startedAt"`
	EndedAt      time.Time `json:"endedAt,omitzero"`
	BoonDeadline time.Time `json:"boonDeadline,omitzero"`
}

// New opens a run with its leader and nobody else.
func New(id string, seed int64, leader Member) *Run {
	leader.Pointed = -1
	return &Run{
		ID:       id,
		Seed:     seed,
		Phase:    PhaseGathering,
		Members:  []*Member{&leader},
		Chosen:   -1,
		MatchIDs: []string{},
	}
}

// Member finds a member by the connection they are on.
func (r *Run) Member(userID string) (*Member, int, bool) {
	for i, m := range r.Members {
		if m.UserID == userID {
			return m, i, true
		}
	}
	return nil, -1, false
}

// ByKey finds a member by their secret.
func (r *Run) ByKey(key string) (*Member, bool) {
	if key == "" {
		return nil, false
	}
	for _, m := range r.Members {
		if m.Key == key {
			return m, true
		}
	}
	return nil, false
}

// Active is everyone still climbing, in seat order.
func (r *Run) Active() []*Member {
	var out []*Member
	for _, m := range r.Members {
		if !m.Left {
			out = append(out, m)
		}
	}
	return out
}

// LeaderID is the leader's connection.
func (r *Run) LeaderID() string {
	if r.Leader < 0 || r.Leader >= len(r.Members) {
		return ""
	}
	return r.Members[r.Leader].UserID
}

// Join adds a player to a party still gathering.
func (r *Run) Join(m Member) error {
	if r.Phase != PhaseGathering {
		return ErrWrongPhase
	}
	if _, _, ok := r.Member(m.UserID); ok {
		return ErrAlreadyInParty
	}
	if len(r.Members) >= content.MaxDreamParty {
		return ErrPartyFull
	}
	m.Pointed = -1
	r.Members = append(r.Members, &m)
	return nil
}

// Leave takes a member out of the run. A party still gathering simply loses
// them; one on its way loses them for good, and the climb ends once nobody
// is left. Leadership passes to the next one still there.
func (r *Run) Leave(userID string, cat content.Catalogue, now time.Time) error {
	m, i, ok := r.Member(userID)
	if !ok {
		return ErrNotInTheRun
	}
	if r.Phase == PhaseGathering {
		r.Members = append(r.Members[:i], r.Members[i+1:]...)
		if len(r.Members) == 0 {
			r.end(now)
			return nil
		}
		if r.Leader >= i && r.Leader > 0 {
			r.Leader--
		}
		return nil
	}
	m.Left = true
	if len(r.Active()) == 0 {
		r.end(now)
		return nil
	}
	if r.Leader == i {
		r.passLeadership()
	}
	// Someone who walks out while boons are being chosen is not waited for.
	if r.Phase == PhaseBoons && r.allPicked() {
		r.nextFloor()
		r.deal(cat)
	}
	return nil
}

func (r *Run) passLeadership() {
	for i, m := range r.Members {
		if !m.Left {
			r.Leader = i
			return
		}
	}
}

// Start sets the party on its way, to the first floor.
func (r *Run) Start(userID string, cat content.Catalogue, now time.Time) error {
	if r.Phase != PhaseGathering {
		return ErrWrongPhase
	}
	if r.LeaderID() != userID {
		return ErrNotTheLeader
	}
	r.StartSize = len(r.Members)
	r.StartedAt = now
	r.Floor = 1
	r.deal(cat)
	return nil
}

// deal opens the current floor's choice of rooms.
func (r *Run) deal(cat content.Catalogue) {
	offer := FloorOffer(cat, r.Seed, r.Floor, len(r.Active()))
	r.Offer = &offer
	r.Chosen = -1
	r.Phase = PhaseRoom
	for _, m := range r.Members {
		m.Pointed = -1
	}
}

// Point says which room a member would take.
func (r *Run) Point(userID string, room int) error {
	m, _, ok := r.Member(userID)
	if !ok || m.Left {
		return ErrNotInTheRun
	}
	if r.Phase != PhaseRoom {
		return ErrWrongPhase
	}
	if room < -1 || r.Offer == nil || room >= len(r.Offer.Rooms) {
		return ErrNoSuchRoom
	}
	m.Pointed = room
	return nil
}

// Enter takes the party into a room: the leader's call.
func (r *Run) Enter(userID string, room int) (Room, error) {
	if r.Phase != PhaseRoom {
		return Room{}, ErrWrongPhase
	}
	if r.LeaderID() != userID {
		return Room{}, ErrNotTheLeader
	}
	if r.Offer == nil || room < 0 || room >= len(r.Offer.Rooms) {
		return Room{}, ErrNoSuchRoom
	}
	r.Chosen = room
	r.Phase = PhaseFighting
	return r.Offer.Rooms[room], nil
}

// Room is the room being fought.
func (r *Run) Room() (Room, bool) {
	if r.Offer == nil || r.Chosen < 0 || r.Chosen >= len(r.Offer.Rooms) {
		return Room{}, false
	}
	return r.Offer.Rooms[r.Chosen], true
}

// Outcome is what a fight's end tells the run.
type Outcome struct {
	Won   bool
	Turns int
	// MatchID is the saved fight, for the leaderboard to replay.
	MatchID string
	// SecondWind is who Second Wind caught in this fight, by connection.
	SecondWind map[string]bool
}

// FightOver closes the floor. A win offers every member still climbing their
// boons; a loss ends the run.
func (r *Run) FightOver(o Outcome, cat content.Catalogue, now time.Time) {
	if r.Phase != PhaseFighting {
		return
	}
	r.Turns += o.Turns
	if o.MatchID != "" {
		r.MatchIDs = append(r.MatchIDs, o.MatchID)
	}
	for _, m := range r.Members {
		if o.SecondWind[m.UserID] {
			m.SecondWindSpent = true
		}
	}
	if !o.Won {
		r.end(now)
		return
	}
	r.Cleared = r.Floor
	room, _ := r.Room()
	party := len(r.Active())
	for seat, m := range r.Members {
		m.Picked = ""
		m.Offer = nil
		if m.Left {
			continue
		}
		kit, err := cat.Kit(m.Look.Loadout)
		if err != nil {
			continue
		}
		m.Offer = BoonOffer(cat, r.Seed, r.Floor, seat, room.Rarities, m.Boons, kit, party)
	}
	r.Phase = PhaseBoons
	r.BoonDeadline = now.Add(BoonSeconds * time.Second)
	if r.allPicked() {
		r.nextFloor()
		r.deal(cat)
	}
}

// PickBoon takes one of the boons offered. Once everyone still climbing has
// chosen, the next floor opens; it reports whether it did.
func (r *Run) PickBoon(userID, boon string, cat content.Catalogue) (bool, error) {
	m, _, ok := r.Member(userID)
	if !ok || m.Left {
		return false, ErrNotInTheRun
	}
	if r.Phase != PhaseBoons {
		return false, ErrWrongPhase
	}
	if m.Picked != "" {
		return false, ErrAlreadyChose
	}
	if !contains(m.Offer, boon) {
		return false, ErrNotOffered
	}
	m.Picked = boon
	if !r.allPicked() {
		return false, nil
	}
	r.nextFloor()
	r.deal(cat)
	return true, nil
}

// ExpireBoons chooses for whoever has not, once the time is up, and opens
// the next floor. It reports whether it did anything.
func (r *Run) ExpireBoons(now time.Time, cat content.Catalogue) bool {
	if r.Phase != PhaseBoons || now.Before(r.BoonDeadline) {
		return false
	}
	for _, m := range r.Active() {
		if m.Picked == "" && len(m.Offer) > 0 {
			m.Picked = m.Offer[0]
		}
	}
	r.nextFloor()
	r.deal(cat)
	return true
}

func (r *Run) allPicked() bool {
	for _, m := range r.Active() {
		if m.Picked == "" && len(m.Offer) > 0 {
			return false
		}
	}
	return true
}

// nextFloor hands every member the boon they took and moves up a floor.
func (r *Run) nextFloor() {
	for _, m := range r.Members {
		if m.Picked != "" {
			m.Boons = append(m.Boons, m.Picked)
		}
		m.Picked = ""
		m.Offer = nil
	}
	r.BoonDeadline = time.Time{}
	r.Floor++
}

func (r *Run) end(now time.Time) {
	r.Phase = PhaseOver
	r.EndedAt = now
	r.Offer = nil
	r.Chosen = -1
}

// Over reports whether the climb has ended.
func (r *Run) Over() bool { return r.Phase == PhaseOver }

// Seat is how a member takes their seat in the room's fight: on the party's
// side, with what they carry, minus a Second Wind already spent.
func (r *Run) Seat(m *Member, cat content.Catalogue) game.Seat {
	boons := make([]string, 0, len(m.Boons))
	for _, id := range m.Boons {
		if b, ok := cat.DreamBoon(id); ok && b.Effect.Kind == types.BoonSecondWind && m.SecondWindSpent {
			continue
		}
		boons = append(boons, id)
	}
	return game.Seat{Team: game.TeamParty, Boons: boons}
}

// Monsters is how a room's other side takes its seats.
func Monsters(room Room) []game.BotSpec {
	var specs []game.BotSpec
	if b := room.Boss; b != nil {
		stats := b.Stats
		specs = append(specs, game.BotSpec{
			Boss: b.Boss, Champion: b.Champion, Mode: game.BotFights, Level: game.BotLevel(b.Level),
			Team: game.TeamDream, Stats: &stats, Boons: b.Boons,
		})
	}
	for _, m := range room.Monsters {
		stats := m.Stats
		specs = append(specs, game.BotSpec{
			Monster: m.Monster, Mode: game.BotFights, Level: game.BotLevel(m.Level),
			Team: game.TeamDream, Stats: &stats, Boons: m.Boons,
		})
	}
	return specs
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}
