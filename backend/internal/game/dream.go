package game

import (
	"errors"
	"sort"
	"strconv"

	"game-server/internal/types"
)

// What a fight in Endless Dreams adds to an ordinary one, on the engine's
// side: monsters that fight in a set with numbers of their own, players
// carrying the boons they took on the way up, the twists a room lays over
// the board, and a revive. Everything here is an input of the fight, written
// down in its recording, so a dream's fight replays like any other.

var (
	ErrUnknownMonster  = errors.New("unknown monster")
	ErrUnknownBoon     = errors.New("unknown boon")
	ErrNoFallenAlly    = errors.New("nobody of yours lies there")
	ErrSpentThisFight  = errors.New("that spell has already been used this fight")
	ErrSomeoneStanding = errors.New("someone is standing where they fell")
)

// ReviveHealth is the share of their health, in percent, a revive stands a
// fallen ally back up with.
const ReviveHealth = 40

// Twists are a room's changes to a fight, resolved from the content into
// what the engine needs: every number a recording has to carry to replay it.
type Twists struct {
	// AP and MP are added to every fighter's turn.
	AP int `json:"ap,omitempty"`
	MP int `json:"mp,omitempty"`
	// NoCover deals the board no cover.
	NoCover bool `json:"noCover,omitempty"`
	// Terrain is laid before the fight, after the cover and the ground.
	Terrain []TerrainTwist `json:"terrain,omitempty"`
}

// TerrainTwist is so many cells of a terrain, laid in a pattern.
type TerrainTwist struct {
	Kind    string `json:"kind"`
	Pattern string `json:"pattern"`
	Count   int    `json:"count"`
}

// IsZero reports whether the twists change nothing.
func (t *Twists) IsZero() bool {
	return t == nil || (t.AP == 0 && t.MP == 0 && !t.NoCover && len(t.Terrain) == 0)
}

// Seat is everything about a fighter's place in a fight besides who they
// are: their side and the boons they carry into it.
type Seat struct {
	Team  string
	Boons []string
}

// AddPlayerSeated seats a player on a side, carrying boons.
func (g *Game) AddPlayerSeated(userID, userName string, look types.CharacterAppearance, seat Seat) error {
	return g.addPlayerLocked(userID, userName, look, seat)
}

// ---------------------------------------------------------------------------
// Boons
// ---------------------------------------------------------------------------

// boonsOfLocked resolves boon ids, refusing any the content does not know.
func (g *Game) boonsOfLocked(ids []string) ([]types.DreamBoon, error) {
	boons := make([]types.DreamBoon, 0, len(ids))
	for _, id := range ids {
		b, ok := g.catalogue.DreamBoon(id)
		if !ok {
			return nil, ErrUnknownBoon
		}
		boons = append(boons, b)
	}
	return boons, nil
}

// blessLocked hands a freshly seated fighter what its boons give: numbers
// the rules read, and spells of its own where a boon changes one. A spell a
// boon changes becomes a spell of this fighter's alone, with an id of its
// own and the id it came from, so that every preview and every bot that
// reads it reads the spell as it really is.
//
// A fighter seated with a damage bonus in its stats — a monster on a high
// floor — has its spells dealt again the same way.
func (g *Game) blessLocked(p *types.Player, boons []types.DreamBoon) {
	harder := 0
	if p.Character.Base != nil {
		harder = p.Character.Base.Damage
	}
	if len(boons) == 0 && harder <= 0 {
		return
	}
	bar := append([]string(nil), p.SpellBar...)
	spells := make(map[string]types.Spell, len(bar))
	for _, key := range bar {
		spells[key] = g.spells[key]
	}
	b := &p.Character.Blessings
	ids := make([]string, 0, len(boons))
	for _, boon := range boons {
		ids = append(ids, boon.ID)
		e := boon.Effect
		switch e.Kind {
		case types.BoonHealth:
			b.Health += e.Value
		case types.BoonAP:
			b.AP += e.Value
		case types.BoonMP:
			b.MP += e.Value
		case types.BoonGuard:
			b.Guard += e.Value
		case types.BoonOpeningMP:
			b.OpeningMP += e.Value
		case types.BoonPushResist:
			b.PushResist += e.Value
		case types.BoonSharedAP:
			b.SharedAP += e.Value
			b.SharedRange = max(b.SharedRange, e.Range)
		case types.BoonSecondWind:
			b.SecondWind = true
		case types.BoonEarlyUltimate:
			b.EarlyUltimate = true
		case types.BoonPartyShield:
			b.PartyShield = max(b.PartyShield, e.Value)
			b.ShieldTurns = max(b.ShieldTurns, e.Duration)
		case types.BoonOverflow:
			b.Overflow = max(b.Overflow, e.Value)
		case types.BoonGrantSpell:
			if _, ok := spells[e.Spell]; !ok {
				if spell, known := g.spells[e.Spell]; known {
					bar = append(bar, e.Spell)
					spells[e.Spell] = spell
				}
			}
		case types.BoonDamage:
			for key, s := range spells {
				if s.Damage > 0 {
					spells[key] = scaleDamage(s, e.Value)
				}
			}
		case types.BoonRange:
			for key, s := range spells {
				if s.Range >= 2 && s.Targeting != types.TargetSelf {
					s.Range = min(s.Range+e.Value, 2*GridRadius)
					spells[key] = s
				}
			}
		case types.BoonBasicDiscount:
			if len(bar) > 0 {
				s := spells[bar[0]]
				s.APCost = max(1, s.APCost-e.Value)
				spells[bar[0]] = s
			}
		case types.BoonBasicTwice:
			if len(bar) > 0 {
				// A spell on a cooldown is cast once a turn whatever its
				// limit says, so a second cast is only ever a cast without one.
				if s := spells[bar[0]]; s.MaxCastsPerTurn > 0 && s.Cooldown == 0 {
					s.MaxCastsPerTurn += e.Value
					spells[bar[0]] = s
				}
			}
		case types.BoonSpellMod:
			s, ok := spells[e.Spell]
			if !ok {
				break
			}
			s.APCost = max(1, s.APCost+e.APCost)
			s.Range = max(0, min(s.Range+e.SpellRange, 2*GridRadius))
			if e.EffectValue != 0 && s.Effect != nil {
				effect := *s.Effect
				effect.Value += e.EffectValue
				s.Effect = &effect
			}
			spells[e.Spell] = s
		}
	}
	if harder > 0 {
		for key, s := range spells {
			if s.Damage > 0 {
				spells[key] = scaleDamage(s, harder)
			}
		}
	}
	p.Boons = ids

	// Every spell a boon changed is dealt again under an id of its own.
	state := make(map[string]types.SpellState, len(bar))
	for i, key := range bar {
		spell := spells[key]
		if spellsDiffer(spell, g.spells[key]) {
			spell.BaseID = spell.ID
			spell.ID = g.nextSpellIDLocked()
			key = strconv.Itoa(spell.ID)
			g.spells[key] = spell
			bar[i] = key
		}
		state[key] = types.SpellState{}
	}
	p.SpellBar = bar
	p.Spells = state
}

// scaleDamage raises everything a spell deals by a percentage, rounded to
// the nearest point so that a small spell gains something too.
func scaleDamage(s types.Spell, percent int) types.Spell {
	grow := func(n int) int { return (n*(100+percent) + 50) / 100 }
	s.Damage = grow(s.Damage)
	s.CriticalDamage = grow(s.CriticalDamage)
	if len(s.Infusions) > 0 {
		infusions := make(map[string]types.Infusion, len(s.Infusions))
		for element, in := range s.Infusions {
			in.Damage = grow(in.Damage)
			in.CriticalDamage = grow(in.CriticalDamage)
			infusions[element] = in
		}
		s.Infusions = infusions
	}
	return s
}

// spellsDiffer reports whether a boon has changed anything about a spell.
func spellsDiffer(a, b types.Spell) bool {
	if a.APCost != b.APCost || a.Range != b.Range || a.Damage != b.Damage ||
		a.CriticalDamage != b.CriticalDamage || a.MaxCastsPerTurn != b.MaxCastsPerTurn {
		return true
	}
	if (a.Effect == nil) != (b.Effect == nil) || (a.Effect != nil && *a.Effect != *b.Effect) {
		return true
	}
	for element, in := range a.Infusions {
		if other := b.Infusions[element]; in.Damage != other.Damage || in.CriticalDamage != other.CriticalDamage {
			return true
		}
	}
	return false
}

// nextSpellIDLocked is the first id no spell of this fight carries. Players
// are seated in a recorded order, so a replay deals the same ids.
func (g *Game) nextSpellIDLocked() int {
	top := 0
	for _, s := range g.spells {
		top = max(top, s.ID)
	}
	return top + 1
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

// monsterLocked resolves a dream monster into what seats it: its sheet, its
// set and the name the bestiary gives it.
func (g *Game) monsterLocked(id string) (types.DreamMonster, types.Kit, string, error) {
	m, ok := g.catalogue.DreamMonster(id)
	if !ok {
		return types.DreamMonster{}, types.Kit{}, "", ErrUnknownMonster
	}
	kit, err := g.catalogue.Kit(m.Loadout)
	if err != nil {
		return types.DreamMonster{}, types.Kit{}, "", err
	}
	name := m.ID
	if sheet, ok := g.catalogue.Monster(m.ID); ok {
		name = sheet.Name
	}
	return m, kit, name, nil
}

// withStats sets a fighter's numbers from somewhere else than its grimoire,
// and fills it up to them.
func withStats(p *types.Player, stats types.FighterStats) {
	base := stats
	p.Character.Base = &base
	p.Character.Health = stats.Health
	p.Character.MaxHealth = stats.Health
	p.Character.ActionPoints = stats.ActionPoints
	p.Character.MovementPoints = stats.MovementPoints
}

// withBar narrows a fighter's bar to the spells given, in that order.
func withBar(p *types.Player, bar []string) {
	p.SpellBar = append([]string(nil), bar...)
	p.Spells = freshSpellState(bar)
}

// ---------------------------------------------------------------------------
// Twists
// ---------------------------------------------------------------------------

// layTwistsLocked lays a room's terrain over the board once the cover and the
// ground are down, away from the starting blocks. A fight with no twists
// draws nothing here.
func (g *Game) layTwistsLocked(reserved []types.Position) {
	if g.twists.IsZero() {
		return
	}
	off := make(map[types.Position]bool, len(reserved)*5)
	for _, p := range reserved {
		off[p] = true
		for _, n := range Neighbours(p) {
			off[n] = true
		}
	}
	for _, t := range g.twists.Terrain {
		var cells []types.Position
		for _, cell := range boardCells() {
			if off[cell] || g.obstacles[cell] || g.solidGroundLocked(cell) || g.terrain[cell].Kind != "" {
				continue
			}
			switch t.Pattern {
			case types.PatternBand:
				// Across the middle, square to the line between the two
				// starting blocks, which face each other along x = y.
				if cell.X+cell.Y == 0 {
					cells = append(cells, cell)
				}
			case types.PatternEdge:
				if abs(cell.X)+abs(cell.Y) == GridRadius {
					cells = append(cells, cell)
				}
			default:
				cells = append(cells, cell)
			}
		}
		if t.Pattern == types.PatternBand {
			// The middle of the band first, so a short one still cuts across.
			sort.SliceStable(cells, func(i, j int) bool {
				return Distance(cells[i], types.Position{}) < Distance(cells[j], types.Position{})
			})
		} else {
			g.rng.Shuffle(len(cells), func(i, j int) { cells[i], cells[j] = cells[j], cells[i] })
		}
		for i := 0; i < len(cells) && i < t.Count; i++ {
			g.placeTerrainLocked(cells[i], t.Kind, "")
		}
	}
}

// ---------------------------------------------------------------------------
// Rules boons bend
// ---------------------------------------------------------------------------

// secondWindLocked catches a fighter carrying Second Wind as they fall: they
// stay up at one health instead, once. It reports whether it caught them.
func (g *Game) secondWindLocked(id string) bool {
	p, ok := g.players[id]
	if !ok || p.Character.IsAlive || !p.Character.Blessings.SecondWind {
		return false
	}
	p.Character.Blessings.SecondWind = false
	p.Character.IsAlive = true
	p.Character.Health = 1
	p.SecondWindSpent = true
	g.players[id] = p
	g.effectLogLocked(id, "refuses to fall", 0)
	return true
}

// sharedAPLocked is what allies with Shared Strength standing near a fighter
// add to the turn it is starting.
func (g *Game) sharedAPLocked(id string) int {
	p := g.players[id]
	if p.Character.Position == nil || p.Team == "" {
		return 0
	}
	extra := 0
	for _, other := range g.sortedPlayerIDsLocked() {
		q := g.players[other]
		b := q.Character.Blessings
		if other == id || b.SharedAP == 0 || !q.Character.IsAlive || q.Character.Position == nil || !g.sameSideLocked(id, other) {
			continue
		}
		if Distance(*p.Character.Position, *q.Character.Position) <= b.SharedRange {
			extra += b.SharedAP
		}
	}
	return extra
}

// raisePartyShieldsLocked shields every member of a side that has someone
// carrying Dream Shield, as the fight starts.
func (g *Game) raisePartyShieldsLocked() {
	ids := g.sortedPlayerIDsLocked()
	for _, holder := range ids {
		b := g.players[holder].Character.Blessings
		if b.PartyShield == 0 {
			continue
		}
		for _, id := range ids {
			p := g.players[id]
			if !p.Character.IsAlive || !g.sameSideLocked(holder, id) {
				continue
			}
			p.Character.Effects = append(p.Character.Effects, types.Effect{
				Kind: types.EffectShield, Value: b.PartyShield, TurnsLeft: b.ShieldTurns, Source: holder,
			})
			g.players[id] = p
		}
	}
}

// fallenAllyAtLocked finds a fallen fighter of the caster's side lying on a
// cell.
func (g *Game) fallenAllyAtLocked(casterID string, pos types.Position) (string, bool) {
	for _, id := range g.sortedPlayerIDsLocked() {
		p := g.players[id]
		if id == casterID || p.Character.IsAlive || p.Character.Position == nil || *p.Character.Position != pos {
			continue
		}
		if g.sameSideLocked(casterID, id) {
			return id, true
		}
	}
	return "", false
}

// reviveLocked stands a fallen ally back up where they fell, with a share of
// their health and none of what was riding on them.
func (g *Game) reviveLocked(casterID string, target types.Position) {
	id, ok := g.fallenAllyAtLocked(casterID, target)
	if !ok {
		return
	}
	p := g.players[id]
	p.Character.IsAlive = true
	p.Character.Health = max(1, p.Character.MaxHealth*ReviveHealth/100)
	p.Character.Effects = nil
	g.players[id] = p
	g.appendLogLocked(types.LogEntry{
		Actor: g.players[casterID].Character.Name, Kind: types.LogEffect,
		Text: "stands " + p.Character.Name + " back up",
	})
}
