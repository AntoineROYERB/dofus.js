package game

import "game-server/internal/types"

// Burning. A burn is one effect however many spells lit it: its value is how
// many stacks it carries, and each stack does BurnDamagePerStack at the start
// of its victim's turn.
const (
	BurnDamagePerStack = 4
	MaxBurnStacks      = 3
	// BurnDuration is what every new stack resets the burn's clock to.
	BurnDuration = 3
)

// applyEffect puts a status effect on a character. Re-applying the same effect
// from the same source refreshes its duration and keeps the stronger value,
// rather than stacking two copies of the same poison. Burns are the exception:
// they stack, up to MaxBurnStacks, whatever lit them.
func applyEffect(c *types.Character, effect types.Effect) {
	if effect.Kind == types.EffectBurn {
		addBurn(c, effect.Value)
		return
	}
	for i, existing := range c.Effects {
		if existing.Kind == effect.Kind && existing.Source == effect.Source {
			if effect.Value > existing.Value {
				c.Effects[i].Value = effect.Value
			}
			if effect.TurnsLeft > existing.TurnsLeft {
				c.Effects[i].TurnsLeft = effect.TurnsLeft
			}
			return
		}
	}
	c.Effects = append(c.Effects, effect)
}

// addBurn lights stacks on a character and rewinds the burn's clock.
func addBurn(c *types.Character, stacks int) {
	if stacks <= 0 {
		return
	}
	for i, e := range c.Effects {
		if e.Kind == types.EffectBurn {
			c.Effects[i].Value = min(MaxBurnStacks, e.Value+stacks)
			c.Effects[i].TurnsLeft = BurnDuration
			return
		}
	}
	c.Effects = append(c.Effects, types.Effect{
		Kind: types.EffectBurn, Value: min(MaxBurnStacks, stacks),
		TurnsLeft: BurnDuration, Source: "Burn",
	})
}

// takeBurn removes a character's burn and reports what it still had in it:
// the stacks, and how many turns they would have burned for.
func takeBurn(c *types.Character) (stacks, turns int) {
	kept := c.Effects[:0]
	for _, e := range c.Effects {
		if e.Kind == types.EffectBurn {
			stacks, turns = e.Value, e.TurnsLeft
			continue
		}
		kept = append(kept, e)
	}
	c.Effects = kept
	if len(c.Effects) == 0 {
		c.Effects = nil
	}
	return stacks, turns
}

// stripBuffs removes everything helping a character: shields, healing, and
// points added. What hurts it stays.
func stripBuffs(c *types.Character) (removed int) {
	kept := c.Effects[:0]
	for _, e := range c.Effects {
		switch {
		case e.Kind == types.EffectShield, e.Kind == types.EffectRegen,
			(e.Kind == types.EffectAP || e.Kind == types.EffectMP) && e.Value > 0:
			removed++
		default:
			kept = append(kept, e)
		}
	}
	c.Effects = kept
	if len(c.Effects) == 0 {
		c.Effects = nil
	}
	return removed
}

func hasEffect(c types.Character, kind string) bool {
	for _, e := range c.Effects {
		if e.Kind == kind {
			return true
		}
	}
	return false
}

// effectTotal sums the value of every active effect of one kind.
func effectTotal(c types.Character, kind string) int {
	total := 0
	for _, e := range c.Effects {
		if e.Kind == kind {
			total += e.Value
		}
	}
	return total
}

// tickEffects applies what happens at the start of a character's turn: damage
// and healing over time. It reports the health lost and gained so the caller
// can write the combat log and notice a death. Nothing is aged here — the
// turn's points are worked out from the effects first, so an effect lasting
// one turn does get its one turn — and ageEffects runs after.
func tickEffects(c *types.Character) (damage, healing int) {
	for _, e := range c.Effects {
		switch e.Kind {
		case types.EffectPoison:
			damage += e.Value
		case types.EffectBurn:
			damage += e.Value * BurnDamagePerStack
		case types.EffectRegen:
			healing += e.Value
		}
	}

	if damage > 0 {
		c.Health -= damage
		if c.Health <= 0 {
			c.Health = 0
			c.IsAlive = false
		}
	}
	if healing > 0 && c.IsAlive {
		c.Health += healing
		if c.Health > c.MaxHealth {
			healing -= c.Health - c.MaxHealth
			c.Health = c.MaxHealth
		}
	}
	return damage, healing
}

// ageEffects takes a turn off every effect and drops the ones that ran out.
func ageEffects(c *types.Character) {
	remaining := c.Effects[:0]
	for _, e := range c.Effects {
		if e.TurnsLeft--; e.TurnsLeft > 0 {
			remaining = append(remaining, e)
		}
	}
	c.Effects = remaining
	if len(c.Effects) == 0 {
		c.Effects = nil
	}
}

// absorb reduces incoming damage by the character's shielding, never below
// zero, and reports what actually got through.
func absorb(c types.Character, damage int) int {
	shield := effectTotal(c, types.EffectShield)
	if shield <= 0 {
		return damage
	}
	if damage -= shield; damage < 0 {
		return 0
	}
	return damage
}

// turnPoints gives the points a character starts its turn with, once its
// effects have had their say over what its class deals it.
func turnPoints(c types.Character, baseActionPoints, baseMovementPoints int) (actionPoints, movementPoints int) {
	actionPoints = baseActionPoints + effectTotal(c, types.EffectAP)
	movementPoints = baseMovementPoints + effectTotal(c, types.EffectMP)
	if actionPoints < 0 {
		actionPoints = 0
	}
	if movementPoints < 0 || hasEffect(c, types.EffectRoot) {
		movementPoints = 0
	}
	return actionPoints, movementPoints
}
