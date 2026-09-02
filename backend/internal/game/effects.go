package game

import "game-server/internal/types"

// applyEffect puts a status effect on a character. Re-applying the same effect
// from the same source refreshes its duration and keeps the stronger value,
// rather than stacking two copies of the same poison.
func applyEffect(c *types.Character, effect types.Effect) {
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

// tickEffects applies what happens at the start of a character's turn — damage
// and healing over time — then ages every effect by one turn and drops the
// expired ones. It reports the health lost and gained so the caller can write
// the combat log and notice a death.
func tickEffects(c *types.Character) (damage, healing int) {
	for _, e := range c.Effects {
		switch e.Kind {
		case types.EffectPoison:
			damage += e.Value
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
	return damage, healing
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
// effects have had their say.
func turnPoints(c types.Character) (actionPoints, movementPoints int) {
	actionPoints = StartingActionPoints + effectTotal(c, types.EffectAP)
	movementPoints = StartingMovementPoints + effectTotal(c, types.EffectMP)
	if actionPoints < 0 {
		actionPoints = 0
	}
	if movementPoints < 0 {
		movementPoints = 0
	}
	return actionPoints, movementPoints
}
