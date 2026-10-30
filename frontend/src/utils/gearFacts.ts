import { DreamBoon, Grimoire, Rune, Spell, SpellBook } from "../types/message";
import { attackFacts } from "./attacks";
import { RULES } from "./terrain";
import { t, tLoose } from "../i18n/lang";

/*
 * What a piece of gear does, as a few short facts with their numbers in them
 * — "6 dégâts · 3 PA · portée 7" — rather than the server's sentences. The
 * sentences were long, English, and read the same numbers back in prose; the
 * facts are read off the content's own numbers, so they cannot drift from
 * what the fight does, and every word goes through the dictionary.
 */

/** A spell's facts, its damage first and its cost second. */
export const spellFacts = (spell: Spell): string[] => {
  const facts = attackFacts(spell);
  const cost = t("{n} AP", { n: spell.APCost });
  // attackFacts leads with the damage when there is some.
  return spell.damage > 0 ? [facts[0], cost, ...facts.slice(1)] : [cost, ...facts];
};

/** An ultimate's facts: as a spell's, with "anywhere" for a board-wide reach. */
export const ultimateFacts = (spell: Spell, infused: boolean): string[] => {
  const facts = spellFacts(spell).map((fact) =>
    spell.range >= 14 && fact === t("range {n}", { n: spell.range }) ? t("anywhere") : fact
  );
  return infused ? [...facts, t("+ your element's effect")] : facts;
};

/** A grimoire's three numbers. */
export const grimoireStats = (g: Grimoire): string[] => [
  `♥ ${g.health}`,
  t("{n} AP", { n: g.actionPoints }),
  t("{n} MP", { n: g.movementPoints }),
];

/**
 * A grimoire's standing rule, in a few words with its numbers. Each is
 * written from the rules' own constants; a grimoire this does not know yet
 * keeps the server's sentence.
 */
export const grimoireRule = (g: Grimoire): string => {
  switch (g.id) {
    case "pyromancer":
      return t("Burns stack ×3 · {n} dmg a turn each", { n: RULES.burnDamagePerStack });
    case "windwalker":
      return t("+{n}% from your pylon", { n: RULES.relayBonus });
    case "tidecaller":
      return t("Your water: −1 MP to enemies, +{n} HP to you", { n: RULES.waterHealing });
    case "stonewarden":
    case "oathbound":
      return t("+{n}% damage up close", { n: g.meleeBonus ?? 50 });
    default:
      return tLoose(g.passive);
  }
};

/** A rune's effect, from its numbers. */
export const runeFact = (r: Rune): string => {
  const { kind, value, threshold } = r.effect;
  switch (kind) {
    case "finisher":
      return t("+{n}% damage under {m}% HP", { n: value, m: threshold ?? 0 });
    case "openingMP":
      return t("+{n} MP on turn 1", { n: value });
    case "openingShield":
      return t("Shield {n} on turn 1", { n: value });
    case "pushResist":
      return t("Pushed {n} cells less", { n: value });
    default:
      return tLoose(r.description);
  }
};

/**
 * A dream's boon, in a few words with its numbers — "+1 PA par tour",
 * "Combustion · −1 PA" — read off its effect. A boon this does not know yet
 * keeps the server's sentence.
 */
export const boonFact = (boon: DreamBoon, spells?: SpellBook | null): string => {
  const e = boon.effect;
  const n = e.value ?? 0;
  const spellName = (id?: string) => (id && spells?.[id]?.name) || id || "";
  switch (e.kind) {
    case "health":
      return t("+{n} max HP", { n });
    case "mp":
      return t("+{n} MP a turn", { n });
    case "ap":
      return t("+{n} AP a turn", { n });
    case "guard":
      return t("−{n} damage taken per hit", { n });
    case "damage":
      return t("+{n}% damage", { n });
    case "range":
      return t("+{n} range on spells reaching 2+", { n });
    case "basicDiscount":
      return t("Basic attack −{n} AP", { n });
    case "openingMP":
      return t("+{n} MP on turn 1", { n });
    case "grantSpell":
      return t("New spell: {name}", { name: spellName(e.spell) });
    case "sharedAP":
      return t("Allies within {r} cells: +{n} AP", { n, r: e.range ?? 0 });
    case "basicTwice":
      return t("Basic attack: +{n} cast a turn", { n });
    case "spellMod": {
      const changes: string[] = [];
      if ((e.apCost ?? 0) < 0) changes.push(`−${t("{n} AP", { n: -(e.apCost ?? 0) })}`);
      if ((e.spellRange ?? 0) > 0) changes.push(t("+{n} range", { n: e.spellRange ?? 0 }));
      if ((e.effectValue ?? 0) > 0) changes.push(`+${e.effectValue}`);
      return [spellName(e.spell), ...changes].join(" · ");
    }
    case "pushResist":
      return t("Pushed {n} cells less", { n });
    case "secondWind":
      return t("Once a dream: a fatal blow leaves you at 1 HP");
    case "earlyUltimate":
      return t("Ultimate from turn 1");
    case "partyShield":
      return t("Party: shield {n} for {d} turns", { n, d: e.duration ?? 0 });
    case "overflow":
      return t("Keep up to {n} unspent AP", { n });
    default:
      return tLoose(boon.description);
  }
};
