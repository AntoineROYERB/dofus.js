import { Spell, SpellBook } from "../types/message";

/**
 * What a dream's boons did to one of a fighter's spells, read off the spell
 * itself. The server deals a changed spell under an id of its own and points
 * `baseId` back at the catalogue spell it was made from (game/dream.go), so
 * the difference between the two is the upgrade — nothing else has to say so.
 */
export type SpellUpgrade = {
  kind: "damage" | "range" | "cost" | "casts" | "effect";
  /** A few words, with the number in them: "+1 range", "−1 AP". */
  label: string;
};

export const upgradesOf = (
  spell: Spell,
  book: SpellBook | null | undefined
): SpellUpgrade[] => {
  if (spell.baseId === undefined || !book) return [];
  const base = book[String(spell.baseId)];
  if (!base) return [];

  const out: SpellUpgrade[] = [];
  // A spell that does no damage of its own can still crit harder.
  const before = base.damage || base.criticalDamage;
  const after = spell.damage || spell.criticalDamage;
  if (before > 0 && after > before) {
    out.push({
      kind: "damage",
      label: `+${Math.round(((after - before) / before) * 100)}% damage`,
    });
  }
  if (spell.range > base.range) {
    out.push({ kind: "range", label: `+${spell.range - base.range} range` });
  }
  if (spell.APCost < base.APCost) {
    out.push({ kind: "cost", label: `−${base.APCost - spell.APCost} AP` });
  }
  if (spell.maxCastsPerTurn > base.maxCastsPerTurn && base.maxCastsPerTurn > 0) {
    out.push({ kind: "casts", label: `${spell.maxCastsPerTurn}× a turn` });
  }
  if (spell.effect && base.effect && spell.effect.value > base.effect.value) {
    out.push({
      kind: "effect",
      label: `+${spell.effect.value - base.effect.value} ${spell.effect.kind}`,
    });
  }
  return out;
};
