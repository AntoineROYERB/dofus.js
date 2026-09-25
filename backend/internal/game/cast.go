package game

import (
	"strconv"

	"game-server/internal/types"
)

// CastSpell checks a cast against the rules, charges for it, and resolves it:
// damage and effects on everyone it covers, then what it leaves on the board,
// then whoever it throws around, then what it digs or raises.
func (g *Game) CastSpell(userID string, spellID int, target types.Position) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	caster, err := g.requireActingPlayerLocked(userID)
	if err != nil {
		return err
	}
	key := strconv.Itoa(spellID)
	spell, ok := g.spells[key]
	if !ok {
		return ErrUnknownSpell
	}
	if !InGrid(target) {
		return ErrOffGrid
	}
	standing := *caster.Character.Position
	if spell.Targeting == types.TargetSelf {
		// Whatever cell was clicked, a spell on yourself lands on yourself.
		target = standing
	}
	// The catalogue holds every class's spells; a caster may only use the ones
	// on their own bar.
	state, onBar := caster.Spells[key]
	if !onBar {
		return ErrSpellNotOnBar
	}
	if caster.Character.ActionPoints < spell.APCost {
		return ErrNotEnoughAP
	}
	if spell.Ultimate {
		if state.Spent {
			return ErrUltimateSpent
		}
		if g.turnNumber < UltimateFromTurn {
			return ErrUltimateNotReady
		}
	}
	if state.CooldownLeft > 0 {
		return ErrSpellOnCooldown
	}
	if spell.MaxCastsPerTurn > 0 && state.CastsThisTurn >= spell.MaxCastsPerTurn {
		return ErrTooManyCasts
	}
	origin, via, err := g.castOriginLocked(userID, standing, target, spell)
	if err != nil {
		return err
	}
	if spell.Targeting == types.TargetEmpty && !g.freeLocked(target) {
		return ErrCellNotFree
	}
	if spell.Special == types.SpecialPillar && !g.staysConnectedLocked(target) {
		return ErrWouldWallIn
	}
	g.recordLocked(userID, CmdCast, castPayload{SpellID: spellID, Target: target})

	// A critical replaces the damage outright rather than adding to it, which
	// is how the numbers in the catalogue were always written.
	damage, crit := spell.Damage, false
	if spell.CriticalChance > 0 && g.rng.Intn(100) < spell.CriticalChance {
		damage, crit = spell.CriticalDamage, true
	}

	caster.Character.ActionPoints -= spell.APCost
	caster.Character.MovementPoints += spell.GrantMP
	state.CastsThisTurn++
	state.CooldownLeft = spell.Cooldown
	if spell.Ultimate {
		state.Spent = true
	}
	caster.Spells[key] = state
	g.players[userID] = caster

	before := g.aliveLocked()
	// What the cast sets off is logged after the cast itself, which is the
	// order it happened in.
	g.deferLog = true
	if spell.Special == types.SpecialLeap {
		g.setPositionLocked(userID, target)
		g.arriveLocked(userID, types.Position{})
	}

	affected := g.coveredCellsLocked(spell, target, origin)
	if via != nil {
		damage = damage * (100 + RelayBonus) / 100
	}
	hits, dealt, victims := g.strikeLocked(userID, spell, affected, damage)

	var apChange, mpChange, shieldChange int
	if spell.Effect != nil && spell.Effect.OnSelf {
		self := g.players[userID]
		applyEffect(&self.Character, types.Effect{
			Kind:      spell.Effect.Kind,
			Value:     spell.Effect.Value,
			TurnsLeft: spell.Effect.Duration,
			Source:    spell.Name,
		})
		g.players[userID] = self
	}
	if spell.Effect != nil && (spell.Effect.OnSelf || hits > 0) {
		switch spell.Effect.Kind {
		case types.EffectAP:
			apChange = spell.Effect.Value
		case types.EffectMP:
			mpChange = spell.Effect.Value
		case types.EffectShield:
			shieldChange = spell.Effect.Value
		}
	}
	if spell.GrantMP > 0 {
		mpChange += spell.GrantMP
	}

	g.reshapeBoardLocked(userID, spell, target, origin, affected, victims)

	castOrigin, castTarget := standing, target
	entry := types.LogEntry{
		Actor:        caster.Character.Name,
		Kind:         types.LogCast,
		Text:         castSummary(spell.Name, hits, crit, spell.Damage == 0),
		Damage:       dealt,
		Crit:         crit,
		APChange:     apChange,
		MPChange:     mpChange,
		ShieldChange: shieldChange,
		SpellID:      spell.ID,
		Origin:       &castOrigin,
		Target:       &castTarget,
	}
	if via != nil {
		relay := *via
		entry.Via = &relay
	}
	g.deferLog = false
	g.appendLogLocked(entry)
	for _, pending := range g.deferred {
		g.appendLogLocked(pending)
	}
	g.deferred = nil
	g.logDeathsSinceLocked(before)

	if g.checkGameOverLocked() {
		return nil
	}
	// A caster who killed themselves in their own blast cannot end their turn,
	// so move play along rather than deadlocking the game.
	if !g.players[userID].Character.IsAlive {
		g.advanceTurnLocked()
	}
	return nil
}

// castOriginLocked works out where a spell is cast from. A spell that can go
// through its caster's relay always does when the relay reaches the target —
// that is where it hits hardest — and otherwise goes out from where its
// caster stands. The error is always the one the caster's own cell got, since
// that is the cast the player was thinking of.
func (g *Game) castOriginLocked(userID string, standing, target types.Position, spell types.Spell) (types.Position, *types.Position, error) {
	reach := func(from types.Position) error {
		if Distance(from, target) > spell.Range {
			return ErrOutOfRange
		}
		if spell.NeedsLineOfSight && !HasLineOfSight(from, target, g.blocksSightLocked) {
			return ErrNoLineOfSight
		}
		return nil
	}
	if spell.Relayed {
		if relay, ok := g.relayOfLocked(userID); ok && reach(relay) == nil {
			return relay, &relay, nil
		}
	}
	if err := reach(standing); err != nil {
		return types.Position{}, nil, err
	}
	return standing, nil, nil
}

// coveredCellsLocked lists the cells a cast acts on. A leap shakes the cells
// around where its caster lands; everything else uses its area of effect.
func (g *Game) coveredCellsLocked(spell types.Spell, target, origin types.Position) []types.Position {
	if spell.Special == types.SpecialLeap {
		return Neighbours(target)
	}
	return AffectedPositions(spell, target, origin)
}

// strikeLocked deals a cast's damage and effects to every living character on
// the covered cells and reports who it hit, in cell order.
func (g *Game) strikeLocked(userID string, spell types.Spell, cells []types.Position, damage int) (hits, dealt int, victims []string) {
	// A spell cast on yourself, or one you land in the middle of, is aimed
	// around you rather than at you.
	spareCaster := spell.Targeting == types.TargetSelf || spell.Special == types.SpecialLeap
	bonus := 0
	if class, ok := g.catalogue.Class(g.players[userID].Character.Class); ok {
		bonus = class.MeleeBonus
	}

	for _, cell := range cells {
		id, ok := g.playerAtLocked(cell)
		if !ok || (spareCaster && id == userID) {
			continue
		}
		hit := g.players[id]
		if !hit.Character.IsAlive {
			continue
		}

		// A maelstrom tears the shield away before it hits, not after.
		if spell.Zone != nil && spell.Zone.Kind == types.ZoneMaelstrom {
			stripBuffs(&hit.Character)
		}
		amount := damage
		if spell.Special == types.SpecialDetonate {
			stacks, turns := takeBurn(&hit.Character)
			amount += stacks * turns * BurnDamagePerStack
		}
		if spell.Conducts && g.terrainKindLocked(cell) == types.TerrainWater {
			amount = amount * (100 + ConductBonus) / 100
		}
		if bonus > 0 && id != userID && Distance(*g.players[userID].Character.Position, cell) == 1 {
			amount = amount * (100 + bonus) / 100
		}
		if _, rule, ok := g.groundAtLocked(cell); ok {
			amount = rule.DamageTaken(spell.Element, amount)
		}
		g.players[id] = hit

		dealt += g.damageLocked(id, amount)
		hits++
		victims = append(victims, id)

		hit = g.players[id]
		if !hit.Character.IsAlive {
			continue
		}
		if spell.Effect != nil && !spell.Effect.OnSelf {
			applyEffect(&hit.Character, types.Effect{
				Kind:      spell.Effect.Kind,
				Value:     spell.Effect.Value,
				TurnsLeft: spell.Effect.Duration,
				Source:    spell.Name,
			})
		}
		g.players[id] = hit
	}
	return hits, dealt, victims
}

// reshapeBoardLocked is everything a cast changes about the board once its
// damage is dealt: the terrain it spreads, the characters it moves, the
// ground it digs or raises, and the zone it leaves.
func (g *Game) reshapeBoardLocked(userID string, spell types.Spell, target, origin types.Position, cells []types.Position, victims []string) {
	if spell.Terrain != "" {
		for _, cell := range cells {
			if spell.Special == types.SpecialCrater && cell == target {
				continue // the crater goes here
			}
			g.placeTerrainLocked(cell, spell.Terrain, userID)
		}
	}

	if spell.Push != 0 {
		for _, id := range victims {
			hit := g.players[id]
			if id == userID || !hit.Character.IsAlive {
				continue
			}
			at := *hit.Character.Position
			if spell.Push > 0 {
				g.shoveLocked(id, stepTowards(origin, at), spell.Push, nil)
			} else {
				caster := *g.players[userID].Character.Position
				g.shoveLocked(id, stepTowards(at, caster), -spell.Push, &caster)
			}
		}
	}

	switch spell.Special {
	case types.SpecialRelay:
		if old, ok := g.relayOfLocked(userID); ok {
			delete(g.terrain, old)
		}
		g.placeTerrainLocked(target, types.TerrainRelay, userID)
	case types.SpecialPillar:
		if g.obstacles == nil {
			g.obstacles = make(map[types.Position]bool)
		}
		g.obstacles[target] = true
		if g.terrain == nil {
			g.terrain = make(map[types.Position]types.TerrainCell)
		}
		g.terrain[target] = types.TerrainCell{Position: target, Kind: types.TerrainPillar, Owner: userID}
	case types.SpecialCrater:
		// Whoever was standing there has been thrown out of it by now, unless
		// something stopped them; a crater is never dug under someone.
		if g.freeLocked(target) && g.staysConnectedLocked(target) {
			g.terrain[target] = types.TerrainCell{Position: target, Kind: types.TerrainCrater, Owner: userID}
		}
	case types.SpecialQuake:
		for _, offset := range quakeFissures {
			cell := types.Position{X: origin.X + offset.X, Y: origin.Y + offset.Y}
			if g.freeLocked(cell) && g.staysConnectedLocked(cell) {
				if g.terrain == nil {
					g.terrain = make(map[types.Position]types.TerrainCell)
				}
				g.terrain[cell] = types.TerrainCell{Position: cell, Kind: types.TerrainFissure, Owner: userID}
			}
		}
	}

	if spell.Zone != nil {
		g.zones = append(g.zones, types.Zone{
			Kind:      spell.Zone.Kind,
			Owner:     userID,
			Center:    target,
			Cells:     append([]types.Position(nil), cells...),
			TurnsLeft: spell.Zone.Duration,
		})
	}
}
