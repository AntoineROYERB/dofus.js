// Package dream is Endless Dreams: a party of one to three players climbing
// floor after floor, choosing one of three rooms on each, fighting the
// monsters in it and taking a boon each before the next
// (docs/plans/endless-dream.md).
//
// Everything a floor offers is drawn from the run's seed and the floor's
// number, never from the clock: reloading the page, or the server waking up
// from a sleep, deals the same rooms and the same boons again. The fights
// themselves are ordinary games, between teams, and replay like any other.
package dream

import (
	"math/rand"
	"sort"

	"game-server/internal/content"
	"game-server/internal/game"
	"game-server/internal/types"
)

// Difficulty ids of a boss floor's single room.
const DifficultyBoss = "boss"

// MonsterSeat is one monster of a room, as it will be seated.
type MonsterSeat struct {
	Monster string             `json:"monster"`
	Name    string             `json:"name"`
	Stats   types.FighterStats `json:"stats"`
	Level   string             `json:"level"`
	Color   string             `json:"color"`
	Element string             `json:"element"`
	// Spells are the names of what it casts, for the room's card.
	Spells []string `json:"spells"`
	// Boons are what the floor hands every monster.
	Boons []string `json:"boons"`
}

// BossSeat is a boss floor's ruler, as it will be seated.
type BossSeat struct {
	Boss     string             `json:"boss"`
	Name     string             `json:"name"`
	Champion string             `json:"champion"`
	Tactic   string             `json:"tactic"`
	Stats    types.FighterStats `json:"stats"`
	Level    string             `json:"level"`
	Boons    []string           `json:"boons"`
	Element  string             `json:"element"`
}

// Room is one of a floor's doors: who is behind it, what it bends, and what
// it pays.
type Room struct {
	Index      int    `json:"index"`
	Island     string `json:"island"`
	Difficulty string `json:"difficulty"`
	// Monsters are in seating order.
	Monsters []MonsterSeat `json:"monsters"`
	Boss     *BossSeat     `json:"boss,omitempty"`
	// Twists are ids from dreams.json.
	Twists []string `json:"twists"`
	// Rarities are the rarities of the three boons a win here offers.
	Rarities []string `json:"rarities"`
	// TurnSeconds is the turn length a Short Night twist sets; zero leaves
	// the server's.
	TurnSeconds int `json:"turnSeconds,omitempty"`
}

// FightTwists is a room's twists as the engine takes them.
func FightTwists(cat content.Catalogue, r Room) *game.Twists {
	fight, _, _, _ := resolveTwists(cat, r.Twists)
	return fight
}

// Seats is how many fighters a fight in this room holds with a party of n.
func (r Room) Seats(party int) int {
	n := party + len(r.Monsters)
	if r.Boss != nil {
		n++
	}
	return n
}

// Offer is what a floor offers.
type Offer struct {
	Floor int    `json:"floor"`
	Boss  bool   `json:"boss"`
	Rooms []Room `json:"rooms"`
	// Party is the party size the rooms were dealt for.
	Party int `json:"party"`
}

// source is the random source for one draw of a run, kept apart from every
// other draw so that, say, a boon offer never shifts the rooms of the next
// floor.
func source(seed int64, floor, salt int) *rand.Rand {
	x := uint64(seed) ^ splitmix(uint64(floor)<<8|uint64(salt))
	return rand.New(rand.NewSource(int64(splitmix(x) >> 1)))
}

func splitmix(x uint64) uint64 {
	x += 0x9e3779b97f4a7c15
	x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9
	x = (x ^ (x >> 27)) * 0x94d049bb133111eb
	return x ^ (x >> 31)
}

// Salts, one per kind of draw.
const (
	saltRooms = iota + 1
	saltBoons
)

// IsBossFloor reports whether a floor is fought against a ruler.
func IsBossFloor(cat content.Catalogue, floor int) bool {
	every := cat.Dream.Floors.BossEvery
	return every > 0 && floor%every == 0
}

// FloorOffer deals a floor's rooms for a party of the given size.
func FloorOffer(cat content.Catalogue, seed int64, floor, party int) Offer {
	party = min(max(party, 1), content.MaxDreamParty)
	rng := source(seed, floor, saltRooms)
	offer := Offer{Floor: floor, Party: party}
	if IsBossFloor(cat, floor) {
		offer.Boss = true
		offer.Rooms = []Room{bossRoom(cat, rng, floor, party)}
		return offer
	}

	islands := append([]string(nil), cat.Dream.Islands...)
	rng.Shuffle(len(islands), func(i, j int) { islands[i], islands[j] = islands[j], islands[i] })
	for i, difficulty := range cat.Dream.Floors.Difficulties {
		offer.Rooms = append(offer.Rooms, room(cat, rng, i, islands[i%len(islands)], difficulty, floor, party))
	}
	return offer
}

// level is the opponent level from a floor on.
func level(f types.DreamFloors, floor int) string {
	lvl := string(game.DefaultBotLevel)
	for _, l := range f.Levels {
		if floor >= l.From {
			lvl = l.Level
		}
	}
	return lvl
}

// budget is a room's threat, in whole monsters' worth.
func budget(f types.DreamFloors, floor, party, percent int) int {
	tenths := f.BaseThreat + f.ThreatPerFloor*(floor-1)
	tenths = tenths * f.PartyThreat[party-1] / 100 * percent / 100
	return max(1, (tenths+5)/10)
}

// healthAt is a monster's health on a floor, with any twist's share on top.
func healthAt(f types.DreamFloors, base, floor, extra int) int {
	return max(1, base*(100+f.HealthPerFloor*(floor-1)+extra)/100)
}

func room(cat content.Catalogue, rng *rand.Rand, index int, island string, d types.DreamDifficulty, floor, party int) Room {
	f := cat.Dream.Floors
	r := Room{Index: index, Island: island, Difficulty: d.ID, Rarities: append([]string(nil), d.Rarities...)}

	twists := d.Twists
	if twists > 0 && floor >= f.SecondTwistFrom {
		twists++
	}
	r.Twists = drawTwists(cat, rng, twists)
	_, extraHealth, extraMonsters, seconds := resolveTwists(cat, r.Twists)
	r.TurnSeconds = seconds

	home, _ := cat.Island(island)
	spend := budget(f, floor, party, d.Threat)
	monsters, unspent := drawMonsters(cat, rng, home.Lineage, spend, f.MaxMonsters, extraMonsters)
	r.Monsters = monsters
	// A room too full to seat its whole budget makes up for it in health.
	if spent := spend - unspent; unspent > 0 && spent > 0 {
		extraHealth += min(150, unspent*100/spent)
	}
	lvl := level(f, floor)
	for i := range r.Monsters {
		r.Monsters[i] = dressMonster(cat, r.Monsters[i], floor, extraHealth, lvl)
	}
	return r
}

func bossRoom(cat content.Catalogue, rng *rand.Rand, floor, party int) Room {
	f := cat.Dream.Floors
	bossID := cat.Dream.Bosses[rng.Intn(len(cat.Dream.Bosses))]
	sheet, _ := cat.Monster(bossID)
	island := ""
	for _, is := range cat.Islands {
		if is.Boss == bossID {
			island = is.ID
		}
	}
	champion, _ := cat.Champion(sheet.Champion)
	kit, _ := cat.Kit(champion.Set)

	lvl := level(f, floor)
	if lvl == string(game.BotEasy) {
		lvl = string(game.BotNormal)
	}
	health := kit.Grimoire.Health * f.BossHealth[party-1] / 100
	r := Room{
		Index: 0, Island: island, Difficulty: DifficultyBoss,
		Rarities: []string{types.RarityRare, types.RarityLegendary, types.RarityLegendary},
		Twists:   []string{},
		Boss: &BossSeat{
			Boss: bossID, Name: sheet.Name, Champion: sheet.Champion, Tactic: sheet.Tactic,
			Stats: types.FighterStats{
				Health:         healthAt(f, health, floor, 0),
				ActionPoints:   kit.Grimoire.ActionPoints,
				MovementPoints: kit.Grimoire.MovementPoints,
			},
			Level:   lvl,
			Boons:   append(floorBoons(f.MonsterBoons, floor), floorBoons(f.BossBoons, floor)...),
			Element: kit.Element,
		},
	}
	if home, ok := cat.Island(island); ok && floor >= f.EscortFrom && len(home.Lineage) > 0 {
		escort, _ := drawMonsters(cat, rng, home.Lineage, budget(f, floor, party, 50), min(f.MaxMonsters, content.MaxDreamMonsters-1), 0)
		for _, m := range escort {
			r.Monsters = append(r.Monsters, dressMonster(cat, m, floor, 0, lvl))
		}
	}
	return r
}

// floorBoons are the boons a list hands the dream's side on a floor.
func floorBoons(list []types.DreamFloorBoon, floor int) []string {
	out := []string{}
	for _, b := range list {
		if floor >= b.From {
			out = append(out, b.Boon)
		}
	}
	return out
}

func drawTwists(cat content.Catalogue, rng *rand.Rand, n int) []string {
	ids := make([]string, 0, len(cat.Dream.Twists))
	for _, t := range cat.Dream.Twists {
		ids = append(ids, t.ID)
	}
	rng.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })
	picked := append([]string{}, ids[:min(n, len(ids))]...)
	sort.Strings(picked)
	return picked
}

// resolveTwists turns twist ids into what the engine and the room's
// composition need.
func resolveTwists(cat content.Catalogue, ids []string) (fight *game.Twists, extraHealth, extraMonsters, seconds int) {
	fight = &game.Twists{}
	for _, id := range ids {
		t, ok := cat.DreamTwist(id)
		if !ok {
			continue
		}
		switch t.Kind {
		case types.TwistTerrain:
			fight.Terrain = append(fight.Terrain, game.TerrainTwist{Kind: t.Terrain, Pattern: t.Pattern, Count: t.Value})
		case types.TwistPoints:
			fight.AP += t.AP
			fight.MP += t.MP
		case types.TwistNoCover:
			fight.NoCover = true
		case types.TwistMonsterHealth:
			extraHealth += t.Value
		case types.TwistExtraMonster:
			extraMonsters += t.Value
		case types.TwistTurnSeconds:
			seconds = t.Value
		}
	}
	if fight.IsZero() {
		fight = nil
	}
	return fight, extraHealth, extraMonsters, seconds
}

// drawMonsters spends a room's budget on its island's lineage, until the
// budget or the room runs out. Each pick is at random among the monsters
// that keep the rest of the budget spendable on the seats left, so a large
// budget fills a room with its stronger monsters rather than six of its
// weakest. A room is never empty: with nothing affordable it gets the
// cheapest. A swarm adds the cheapest on top, room permitting. It reports
// the threat it left unspent, which the room's monsters take as health.
func drawMonsters(cat content.Catalogue, rng *rand.Rand, lineage []string, budget, most, extra int) ([]MonsterSeat, int) {
	var sheets []types.DreamMonster
	for _, id := range lineage {
		if m, ok := cat.DreamMonster(id); ok {
			sheets = append(sheets, m)
		}
	}
	if len(sheets) == 0 {
		return nil, 0
	}
	sort.SliceStable(sheets, func(i, j int) bool { return sheets[i].Threat < sheets[j].Threat })
	cheapest := sheets[0]

	var picked []MonsterSeat
	left := budget
	for len(picked) < most {
		var affordable []types.DreamMonster
		for _, m := range sheets {
			if m.Threat <= left {
				affordable = append(affordable, m)
			}
		}
		if len(affordable) == 0 {
			break
		}
		// What each seat left has to carry for the budget to be spent.
		share := (left + most - len(picked) - 1) / (most - len(picked))
		strong := affordable[:0:0]
		for _, m := range affordable {
			if m.Threat >= min(share, affordable[len(affordable)-1].Threat) {
				strong = append(strong, m)
			}
		}
		m := strong[rng.Intn(len(strong))]
		picked = append(picked, MonsterSeat{Monster: m.ID})
		left -= m.Threat
	}
	if len(picked) == 0 {
		picked = append(picked, MonsterSeat{Monster: cheapest.ID})
	}
	for i := 0; i < extra && len(picked) < most; i++ {
		picked = append(picked, MonsterSeat{Monster: cheapest.ID})
	}
	return picked, max(0, left)
}

// dressMonster fills in a monster's numbers for its floor, and what its
// card shows.
func dressMonster(cat content.Catalogue, seat MonsterSeat, floor, extraHealth int, lvl string) MonsterSeat {
	m, _ := cat.DreamMonster(seat.Monster)
	sheet, _ := cat.Monster(seat.Monster)
	kit, _ := cat.Kit(m.Loadout)
	seat.Name = sheet.Name
	seat.Color = m.Color
	seat.Element = kit.Element
	seat.Level = lvl
	seat.Stats = types.FighterStats{
		Health:         healthAt(cat.Dream.Floors, m.Health, floor, extraHealth),
		ActionPoints:   m.ActionPoints,
		MovementPoints: m.MovementPoints,
	}
	seat.Boons = floorBoons(cat.Dream.Floors.MonsterBoons, floor)
	seat.Spells = make([]string, 0, len(m.Bar))
	for _, id := range m.Bar {
		seat.Spells = append(seat.Spells, cat.Spells[id].Name)
	}
	return seat
}
