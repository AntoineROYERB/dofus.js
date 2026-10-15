package game

import (
	"sort"

	"game-server/internal/types"
)

// How a server-played opponent thinks: how well (its level), and, for the
// rulers of the islands, how differently (a boss's profile). Both are knobs
// on the one planner in bot_plan.go rather than planners of their own, so an
// easy opponent and a boss are the same code reading the board through
// different eyes.

// BotLevel is how well a server-played opponent plays.
type BotLevel string

const (
	// BotEasy casts whatever lands without thinking about the rest of its
	// turn, misjudges its options, walks into acid and never backs off.
	BotEasy BotLevel = "easy"
	// BotNormal plans its turn, reads the island's ground and finishes a
	// fight it can finish, but hardly minds what the enemy can do back.
	BotNormal BotLevel = "normal"
	// BotHard does all of that and ends its turns where the enemy's answer
	// hurts least: out of reach, behind rock, in the grass, under cover it
	// raises itself.
	BotHard BotLevel = "hard"
)

// ParseBotLevel reads a level off the wire. Empty is accepted and means "the
// island decides": it is resolved when the opponent is seated.
func ParseBotLevel(s string) (BotLevel, bool) {
	switch BotLevel(s) {
	case "", BotEasy, BotNormal, BotHard:
		return BotLevel(s), true
	}
	return "", false
}

// levelTraits are what a level changes in how the planner reads the board.
// Values are in tenths of a hit point, like everything the planner scores.
type levelTraits struct {
	// depth is how many casts ahead it plans: one is the strongest cast now,
	// two lets it see that a burn before a detonation, or a leap before a
	// hammer, beats the bigger hit first. With six action points and spells
	// of two to four, a third cast almost never fits, and looking for one
	// doubled what a decision cost.
	depth int
	// readsGround is whether it sees what the island's ground and the
	// terrain spells left will do: where ice carries it, what acid and lava
	// cost at the end of a turn, where a push would leave the enemy.
	readsGround bool
	// caution is how much of the damage the enemy can deal it next turn it
	// weighs against where it ends its own, in percent.
	caution int
	// aggression is how much of what it could deal the enemy next turn it
	// weighs in favour of a cell, in percent. Above caution, it comes to the
	// fight; below, it waits for the fight to come to it.
	aggression int
	// noise bends the value of every option by up to this many percent, from
	// the decision's own roll: the misjudgements of an opponent meant to be
	// beaten.
	noise int
	// idles is the chance, in percent, that it calls its turn done once it
	// has done something with it, points left or not: the opponent who has
	// not yet learnt to spend a whole turn.
	idles int
	// finishes values a kill over the hit points it takes.
	finishes bool
	// covers raises smoke or a pillar in the enemy's line of fire when the
	// turn has nothing better to spend its points on.
	covers bool
}

var levelTraitsOf = map[BotLevel]levelTraits{
	BotEasy:   {depth: 1, noise: 60, idles: 12},
	BotNormal: {depth: 2, readsGround: true, finishes: true},
	BotHard:   {depth: 2, readsGround: true, caution: 150, aggression: 60, finishes: true, covers: true},
}

// DefaultBotLevel is the level of an opponent in a room that names none and is
// fought on no island: the one the balance is measured with.
const DefaultBotLevel = BotNormal

// bossProfile is what makes a boss play like itself: a pattern a player can
// see coming by the third turn and learn to break. The sentence that tells
// them is its tactic in islands.json; a test holds the two lists together.
type bossProfile struct {
	// wantsGround and wantsTerrain are where the boss wants its enemy
	// standing — on the island's ground, or on what spells left — and what a
	// cast that leaves them there is worth on top of its damage. Lava means
	// beside it, since nobody stands in lava. They are two maps because the
	// two libraries share names: ice is both.
	wantsGround  map[string]int
	wantsTerrain map[string]int
	// restsBy is ground the boss likes to end its turns beside.
	restsBy map[string]int
	// keepAway is the distance it never ends a turn inside of.
	keepAway int
	// detonateAt is how many burns it waits for before setting them off.
	detonateAt int
	// caution replaces the level's when higher: a boss that turtles.
	caution int
	// covers raises cover whatever its level.
	covers bool
}

// bossProfiles are keyed by bestiary id.
var bossProfiles = map[string]bossProfile{
	// Monolithe walls itself in and waits for you to come to it.
	"boss_monolithe": {caution: 160, covers: true, restsBy: map[string]int{GroundRock: 30}},
	// The Kraken throws you into the shallows and fights you there.
	"boss_kraken": {wantsGround: map[string]int{GroundShallowWater: 90}, wantsTerrain: map[string]int{types.TerrainWater: 60}},
	// The Heart of Winter freezes the ground under you, then blasts you
	// across it.
	"boss_coeur_hiver": {wantsTerrain: map[string]int{types.TerrainIce: 90}, wantsGround: map[string]int{GroundIce: 60}},
	// The Eye of the Swarm is never where you can reach it.
	"boss_oeil_nuee": {keepAway: 5, caution: 120},
	// Mother Gloop drags you into her acid and keeps you there.
	"boss_mere_gloop": {wantsGround: map[string]int{GroundAcidPool: 120}, restsBy: map[string]int{GroundAcidPool: 40}},
	// The Ash King lets three burns pile up before he sets them off, and
	// throws you against the lava.
	"legend_roi_cendre": {detonateAt: MaxBurnStacks, wantsGround: map[string]int{GroundLava: 80}},
}

// BossProfileIDs lists the bosses the server knows how to play, sorted.
func BossProfileIDs() []string {
	ids := make([]string, 0, len(bossProfiles))
	for id := range bossProfiles {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// botMind is everything a bot decides with besides the board.
type botMind struct {
	levelTraits
	boss bossProfile
	// roll is this decision's share of the match's randomness. It never
	// comes from the game's own source: a replay applies the bot's recorded
	// commands without asking the bot again, so a draw taken here would put
	// every roll after it out of step.
	roll uint64
}

func mindOf(p types.Player, roll uint64) botMind {
	traits, ok := levelTraitsOf[BotLevel(p.BotLevel)]
	if !ok {
		traits = levelTraitsOf[DefaultBotLevel]
	}
	m := botMind{levelTraits: traits, roll: roll}
	if boss, ok := bossProfiles[p.Boss]; ok {
		m.boss = boss
		m.caution = max(m.caution, boss.caution)
		m.covers = m.covers || boss.covers
		// A boss always sees the ground it is built around, whatever the
		// island's level: a signature the boss cannot see is no signature.
		m.readsGround = true
		m.depth = max(m.depth, 2)
	}
	return m
}

// bend applies the mind's noise to one option's value, the nth it weighed.
func (m botMind) bend(value, nth int) int {
	if m.noise == 0 || value == 0 {
		return value
	}
	r := splitmix(m.roll + uint64(nth)*0x9e3779b97f4a7c15)
	swing := int(r%uint64(2*m.noise+1)) - m.noise
	return value * (100 + swing) / 100
}

// botRoll is the roll for one decision: the match's seed and how far into the
// match the decision is. Both are recorded, so a replay could ask again and
// hear the same answer.
func botRoll(seed int64, step int64) uint64 {
	return splitmix(uint64(seed) ^ splitmix(uint64(step)))
}

func splitmix(x uint64) uint64 {
	x += 0x9e3779b97f4a7c15
	x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9
	x = (x ^ (x >> 27)) * 0x94d049bb133111eb
	return x ^ (x >> 31)
}
