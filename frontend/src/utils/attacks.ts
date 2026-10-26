import { Spell } from "../types/message";
import { areaPattern } from "./spellUtils";
import { t, tn } from "../i18n/lang";
import { TERRAIN_INFO } from "./terrain";

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
      hits > 1 ? t("{hits} × {n} dmg", { hits, n: spell.damage }) : t("{n} dmg", { n: spell.damage }),
    );
  if (spell.targeting === "self" || spell.range === 0)
    facts.push(t("all round you"));
  else if (spell.range === 1) facts.push(t("next to you"));
  else facts.push(t("range {n}", { n: spell.range }));
  if (spell.areaOfEffect === "line") facts.push(t("3 in a line"));
  if (spell.areaOfEffect === "cross" && spell.targeting !== "self")
    facts.push(t("a cross"));
  if (spell.areaOfEffect === "circle") facts.push(t("wide area"));
  if ((spell.push ?? 0) > 0) facts.push(t("pushes {n}", { n: spell.push ?? 0 }));
  if ((spell.push ?? 0) < 0) facts.push(t("pulls {n}", { n: -(spell.push ?? 0) }));
  if (spell.effect?.kind === "burn") facts.push(t("+1 burn"));
  if (spell.effect?.kind === "mp") facts.push(t("{n} MP", { n: spell.effect.value }));
  if (spell.terrain) {
    const ground = (TERRAIN_INFO[spell.terrain]?.name ?? spell.terrain).toLowerCase();
    facts.push(
      spell.terrainTurns
        ? tn("{ground} for {n} turn", "{ground} for {n} turns", spell.terrainTurns, { ground })
        : t("{ground} for good", { ground }),
    );
  }
  if (spell.needsLineOfSight === false && spell.range > 1)
    facts.push(t("over cover"));
  if (spell.relayed) facts.push(t("from your pylon"));
  if (spell.cooldown > 0) facts.push(t("every {n} turns", { n: spell.cooldown + 1 }));
  else if (spell.maxCastsPerTurn === 1) facts.push(t("once a turn"));
  return facts;
};
