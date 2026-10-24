package dream

import "game-server/internal/types"

// MemberView is a member as the party sees them.
type MemberView struct {
	UserID  string        `json:"userId"`
	Name    string        `json:"name"`
	Color   string        `json:"color"`
	Loadout types.Loadout `json:"loadout"`
	Boons   []string      `json:"boons"`
	Left    bool          `json:"left"`
	// Connected is whether they are here right now.
	Connected bool `json:"connected"`
	Leader    bool `json:"leader"`
	// Pointed is the room they would take, -1 for none.
	Pointed int `json:"pointed"`
	// Chose says they have taken their boon; what they took stays theirs
	// until the next floor.
	Chose bool `json:"chose"`
}

// View is a run as one of its members is shown it: everything the party
// shares, and what is theirs alone — their key and the boons offered to
// them.
type View struct {
	ID        string       `json:"id"`
	Phase     string       `json:"phase"`
	Floor     int          `json:"floor"`
	Cleared   int          `json:"cleared"`
	StartSize int          `json:"startSize"`
	Members   []MemberView `json:"members"`
	Offer     *Offer       `json:"offer"`
	Chosen    int          `json:"chosen"`
	// BoonDeadline is a Unix time in milliseconds, 0 outside the boons.
	BoonDeadline int64    `json:"boonDeadline"`
	Turns        int      `json:"turns"`
	MatchIDs     []string `json:"matchIds"`
	// You is the viewer's place in Members.
	You int `json:"you"`
	// Key lets the viewer back into the run. It is theirs: nobody else's
	// view carries it.
	Key string `json:"key"`
	// BoonOffer is what the viewer is offered after the last win.
	BoonOffer []string `json:"boonOffer"`
}

// ViewFor is the run as a member sees it.
func (r *Run) ViewFor(userID string, connected func(string) bool) View {
	v := View{
		ID: r.ID, Phase: r.Phase, Floor: r.Floor, Cleared: r.Cleared, StartSize: r.StartSize,
		Offer: r.Offer, Chosen: r.Chosen, Turns: r.Turns, You: -1,
		MatchIDs: append([]string{}, r.MatchIDs...), BoonOffer: []string{},
	}
	if !r.BoonDeadline.IsZero() {
		v.BoonDeadline = r.BoonDeadline.UnixMilli()
	}
	for i, m := range r.Members {
		mv := MemberView{
			UserID: m.UserID, Name: m.Look.Name, Color: m.Look.Color, Loadout: m.Look.Loadout,
			Boons: append([]string{}, m.Boons...), Left: m.Left, Connected: connected(m.UserID),
			Leader: i == r.Leader, Pointed: m.Pointed, Chose: m.Picked != "",
		}
		v.Members = append(v.Members, mv)
		if m.UserID == userID {
			v.You = i
			v.Key = m.Key
			v.BoonOffer = append([]string{}, m.Offer...)
		}
	}
	return v
}
