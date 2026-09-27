import { Spell } from "../types/message";
import { areaPattern } from "./spellUtils";

/*
 * What an outfit's attack does, reduced to what the wardrobe shows of it:
 * where it strikes and the few facts that tell it from the others. Kept out
 * of AttackShape.tsx so that file only exports a component.
 */

/** How far the strip reaches before it stops counting cells and says so. */
const SHOWN_RANGE = 4;

/** Where the fighter strikes, a few cells along the strip, and what that covers. */
export const strikeOf = (spell: Spell) => {
  const self = spell.targeting === "self" || spell.range === 0;
  const reach = self ? 0 : Math.min(spell.range, SHOWN_RANGE);
  const { pattern } = areaPattern(spell.areaOfEffect);
  return {
    self,
    reach,
    cells: pattern.map((p) => ({ x: p.x, y: reach + p.y })),
  };
};

/** The few facts that tell one attack from another, in the order they matter. */
export const attackFacts = (spell: Spell): string[] => {
  const facts: string[] = [];
  const hits = spell.hits && spell.hits > 1 ? spell.hits : 1;
  if (spell.damage > 0)
    facts.push(
      hits > 1 ? `${hits} × ${spell.damage} dmg` : `${spell.damage} dmg`,
    );
  if (spell.targeting === "self" || spell.range === 0)
    facts.push("all round you");
  else if (spell.range === 1) facts.push("next to you");
  else facts.push(`range ${spell.range}`);
  if (spell.areaOfEffect === "line") facts.push("3 in a line");
  if (spell.areaOfEffect === "cross" && spell.targeting !== "self")
    facts.push("a cross");
  if (spell.areaOfEffect === "circle") facts.push("wide area");
  if ((spell.push ?? 0) > 0) facts.push(`pushes ${spell.push}`);
  if ((spell.push ?? 0) < 0) facts.push(`pulls ${-(spell.push ?? 0)}`);
  if (spell.effect?.kind === "burn") facts.push("+1 burn");
  if (spell.effect?.kind === "mp") facts.push(`${spell.effect.value} MP`);
  if (spell.terrain)
    facts.push(
      `${spell.terrain} ${spell.terrainTurns ? `for ${spell.terrainTurns} turn${spell.terrainTurns > 1 ? "s" : ""}` : "for good"}`,
    );
  if (spell.needsLineOfSight === false && spell.range > 1)
    facts.push("over cover");
  if (spell.relayed) facts.push("from your pylon");
  if (spell.cooldown > 0) facts.push(`every ${spell.cooldown + 1} turns`);
  else if (spell.maxCastsPerTurn === 1) facts.push("once a turn");
  return facts;
};
