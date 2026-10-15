package dream

import (
	"reflect"
	"testing"
	"time"

	"game-server/internal/config"
	"game-server/internal/content"
	"game-server/internal/game"
	"game-server/internal/types"
)

func shipped(t *testing.T) content.Catalogue {
	t.Helper()
	cat, err := content.Load(content.Paths{
		Spells:    "../../config/spells.json",
		Islands:   "../../config/islands.json",
		Outfits:   "../../config/outfits.json",
		Grimoires: "../../config/grimoires.json",
		Runes:     "../../config/runes.json",
		Talismans: "../../config/talismans.json",
		Champions: "../../config/champions.json",
		Cosmetics: "../../config/cosmetics.json",
		Dreams:    "../../config/dreams.json",
	}, config.LoadBalance("../../config/balance.json"), game.ContentBounds())
	if err != nil {
		t.Fatalf("the shipped content does not load:\n%v", err)
	}
	return cat
}

func look(name, champion string, cat content.Catalogue) types.CharacterAppearance {
	c, _ := cat.Champion(champion)
	return types.CharacterAppearance{Name: name, Color: "#336699", Loadout: c.Set}
}

func TestAFloorIsTheSameFloorTwice(t *testing.T) {
	cat := shipped(t)
	for floor := 1; floor <= 12; floor++ {
		a := FloorOffer(cat, 42, floor, 2)
		b := FloorOffer(cat, 42, floor, 2)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("floor %d was dealt twice from the same seed, differently", floor)
		}
	}
	if reflect.DeepEqual(FloorOffer(cat, 42, 3, 1), FloorOffer(cat, 43, 3, 1)) {
		t.Fatal("two runs were dealt the same third floor")
	}
}

func TestAFloorOffersThreeRoomsAndABossEveryFifth(t *testing.T) {
	cat := shipped(t)
	every := cat.Dream.Floors.BossEvery
	for floor := 1; floor <= 3*every; floor++ {
		offer := FloorOffer(cat, 7, floor, 1)
		if floor%every == 0 {
			if !offer.Boss || len(offer.Rooms) != 1 || offer.Rooms[0].Boss == nil {
				t.Fatalf("floor %d: %d rooms, boss %v; want one room with a ruler", floor, len(offer.Rooms), offer.Boss)
			}
			if want := floor >= 10; contains(offer.Rooms[0].Boss.Boons, "early-ultimate") != want {
				t.Errorf("floor %d: the ruler carries %v; its ultimate comes from the first turn from floor 10", floor, offer.Rooms[0].Boss.Boons)
			}
			continue
		}
		if len(offer.Rooms) != 3 {
			t.Fatalf("floor %d: %d rooms, want three", floor, len(offer.Rooms))
		}
		islands := map[string]bool{}
		for i, room := range offer.Rooms {
			islands[room.Island] = true
			if room.Difficulty != cat.Dream.Floors.Difficulties[i].ID {
				t.Errorf("floor %d room %d is %s, want the difficulties in order", floor, i, room.Difficulty)
			}
			if len(room.Monsters) == 0 || len(room.Monsters) > cat.Dream.Floors.MaxMonsters {
				t.Errorf("floor %d room %d holds %d monsters", floor, i, len(room.Monsters))
			}
			if room.Seats(3) > game.MaxSeats {
				t.Errorf("floor %d room %d seats %d with a party of three", floor, i, room.Seats(3))
			}
		}
		if len(islands) != 3 {
			t.Errorf("floor %d: rooms on %d islands, want three different ones", floor, len(islands))
		}
	}
}

func threat(cat content.Catalogue, room Room) int {
	n := 0
	for _, m := range room.Monsters {
		sheet, _ := cat.DreamMonster(m.Monster)
		n += sheet.Threat
	}
	return n
}

func TestRoomsGrowWithTheFloorAndTheParty(t *testing.T) {
	cat := shipped(t)
	total := func(floor, party int) int {
		n := 0
		for seed := int64(1); seed <= 40; seed++ {
			for _, room := range FloorOffer(cat, seed, floor, party).Rooms {
				n += threat(cat, room)
			}
		}
		return n
	}
	if a, b := total(1, 1), total(9, 1); b <= a {
		t.Errorf("floor 9 holds %d threat over 40 runs, floor 1 %d: the climb has to climb", b, a)
	}
	if a, b := total(3, 1), total(3, 3); b <= a {
		t.Errorf("a party of three faces %d threat, one player %d: a bigger party, a bigger room", b, a)
	}
	later := FloorOffer(cat, 1, 14, 1).Rooms[0].Monsters
	for _, m := range later {
		sheet, _ := cat.DreamMonster(m.Monster)
		if m.Stats.Health <= sheet.Health {
			t.Errorf("a %s on floor 14 has %d health, its sheet %d: monsters grow every floor", m.Name, m.Stats.Health, sheet.Health)
		}
	}
}

func TestABoonOfferFitsWhoItIsFor(t *testing.T) {
	cat := shipped(t)
	ashka, _ := cat.Champion("ashka")
	kit, _ := cat.Kit(ashka.Set)
	rarities := []string{types.RarityRare, types.RarityRare, types.RarityRare}
	for seed := int64(1); seed <= 200; seed++ {
		offer := BoonOffer(cat, seed, 1, 0, rarities, []string{"focus"}, kit, 1)
		if len(offer) != 3 {
			t.Fatalf("seed %d: offered %v, want three", seed, offer)
		}
		seen := map[string]bool{}
		for _, id := range offer {
			b, _ := cat.DreamBoon(id)
			switch {
			case seen[id]:
				t.Fatalf("seed %d: %s offered twice", seed, id)
			case id == "focus":
				t.Fatalf("seed %d: Focus offered again, and it does not stack", seed)
			case b.Grimoire != "" && b.Grimoire != kit.Grimoire.ID:
				t.Fatalf("seed %d: %s offered to a %s", seed, id, kit.Grimoire.ID)
			case id == "wake-up" || id == "shared-strength":
				t.Fatalf("seed %d: %s offered to someone climbing alone", seed, id)
			}
			seen[id] = true
		}
	}
}

func TestARunClimbs(t *testing.T) {
	cat := shipped(t)
	now := time.Unix(1_000, 0)
	r := New("run1", 99, Member{Key: "k1", UserID: "u1", Look: look("Ann", "ashka", cat)})
	if err := r.Join(Member{Key: "k2", UserID: "u2", Look: look("Bea", "sef", cat)}); err != nil {
		t.Fatal(err)
	}
	if err := r.Start("u2", cat, now); err != ErrNotTheLeader {
		t.Fatalf("a member started the run: %v", err)
	}
	if err := r.Start("u1", cat, now); err != nil {
		t.Fatal(err)
	}
	if r.Phase != PhaseRoom || r.Floor != 1 || r.Offer == nil || r.Offer.Party != 2 || r.StartSize != 2 {
		t.Fatalf("after starting: phase %s floor %d offer %+v", r.Phase, r.Floor, r.Offer)
	}
	if err := r.Join(Member{Key: "k3", UserID: "u3"}); err != ErrWrongPhase {
		t.Fatalf("someone joined a run under way: %v", err)
	}
	if err := r.Point("u2", 2); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Enter("u2", 2); err != ErrNotTheLeader {
		t.Fatalf("a member chose the room: %v", err)
	}
	room, err := r.Enter("u1", 1)
	if err != nil || room.Index != 1 || r.Phase != PhaseFighting {
		t.Fatalf("Enter: room %d, %v, phase %s", room.Index, err, r.Phase)
	}

	r.FightOver(Outcome{Won: true, Turns: 5, MatchID: "m1"}, cat, now)
	if r.Phase != PhaseBoons || r.Cleared != 1 || len(r.Members[0].Offer) != 3 || len(r.Members[1].Offer) != 3 {
		t.Fatalf("after a win: phase %s cleared %d offers %v / %v", r.Phase, r.Cleared, r.Members[0].Offer, r.Members[1].Offer)
	}
	if _, err := r.PickBoon("u1", "not-offered", cat); err != ErrNotOffered {
		t.Fatalf("picked a boon nobody offered: %v", err)
	}
	pick := r.Members[0].Offer[1]
	if next, err := r.PickBoon("u1", pick, cat); err != nil || next {
		t.Fatalf("first pick: next floor %v, %v; want to wait for the other", next, err)
	}
	if !r.ExpireBoons(now.Add(BoonSeconds*time.Second), cat) {
		t.Fatal("the boon clock ran out and nothing happened")
	}
	if r.Floor != 2 || r.Phase != PhaseRoom || !contains(r.Members[0].Boons, pick) || len(r.Members[1].Boons) != 1 {
		t.Fatalf("after the boons: floor %d phase %s boons %v / %v", r.Floor, r.Phase, r.Members[0].Boons, r.Members[1].Boons)
	}

	if err := r.Leave("u1", cat, now); err != nil {
		t.Fatal(err)
	}
	if r.LeaderID() != "u2" {
		t.Fatalf("the leader left and %q leads, want the one still climbing", r.LeaderID())
	}
	if _, err := r.Enter("u2", 0); err != nil {
		t.Fatal(err)
	}
	r.FightOver(Outcome{Won: false, Turns: 3, MatchID: "m2"}, cat, now.Add(time.Minute))
	if !r.Over() || r.Cleared != 1 || r.Turns != 8 || len(r.MatchIDs) != 2 {
		t.Fatalf("after a loss: over %v cleared %d turns %d matches %v", r.Over(), r.Cleared, r.Turns, r.MatchIDs)
	}
}

func TestSecondWindIsOnceARun(t *testing.T) {
	cat := shipped(t)
	r := New("run", 1, Member{Key: "k", UserID: "u", Look: look("Ann", "ashka", cat), Boons: []string{"second-wind", "vigor"}})
	if seat := r.Seat(r.Members[0], cat); !reflect.DeepEqual(seat.Boons, []string{"second-wind", "vigor"}) {
		t.Fatalf("seated with %v", seat.Boons)
	}
	r.Phase = PhaseFighting
	r.FightOver(Outcome{Won: true, SecondWind: map[string]bool{"u": true}}, cat, time.Now())
	if seat := r.Seat(r.Members[0], cat); !reflect.DeepEqual(seat.Boons, []string{"vigor"}) {
		t.Fatalf("after Second Wind caught them, seated with %v", seat.Boons)
	}
}
