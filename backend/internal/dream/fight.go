package dream

import (
	"time"

	"game-server/internal/content"
	"game-server/internal/game"
)

// FightOptions are the inputs of a room's fight for a party of the given
// size: its seats, its island, its twists and its turn length.
func FightOptions(cat content.Catalogue, room Room, party int, seed int64, turn time.Duration) game.Options {
	if room.TurnSeconds > 0 {
		turn = time.Duration(room.TurnSeconds) * time.Second
	}
	return game.Options{
		Seed:         seed,
		TurnDuration: turn,
		Island:       room.Island,
		Seats:        room.Seats(party),
		Twists:       FightTwists(cat, room),
	}
}

// SeatMonsters seats a room's other side. The party is seated by whoever
// holds the connections; the fight starts once the last seat is taken,
// whichever side takes it.
func SeatMonsters(g *game.Game, room Room) error {
	for _, spec := range Monsters(room) {
		if _, err := g.AddBotOf(spec); err != nil {
			return err
		}
	}
	return nil
}
