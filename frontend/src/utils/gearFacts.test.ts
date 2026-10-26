import { grimoireRule, grimoireStats, runeFact, spellFacts, ultimateFacts } from "./gearFacts";
import { makeSpell } from "../test/fixtures";
import { Grimoire, Rune } from "../types/message";

const grimoire = (overrides: Partial<Grimoire> = {}): Grimoire => ({
  id: "pyromancer",
  name: "Pyromancer",
  element: "Fire",
  symbol: "*",
  lore: "",
  spells: [],
  passive: "A long sentence from the server.",
  glyph: "",
  health: 90,
  actionPoints: 6,
  movementPoints: 4,
  ...overrides,
});

const rune = (effect: Rune["effect"]): Rune => ({
  id: "r",
  name: "R",
  description: "A long sentence from the server.",
  effect,
});

describe("spellFacts", () => {
  it("leads with the damage, then the cost, then the reach", () => {
    const spell = makeSpell({ damage: 6, APCost: 3, range: 7, maxCastsPerTurn: 0 });
    expect(spellFacts(spell).slice(0, 3)).toEqual(["6 dmg", "3 AP", "range 7"]);
  });

  it("starts with the cost for a spell that does no damage", () => {
    const spell = makeSpell({ damage: 0, APCost: 2, range: 3, maxCastsPerTurn: 0 });
    expect(spellFacts(spell)[0]).toBe("2 AP");
  });
});

describe("ultimateFacts", () => {
  it("says anywhere for a board-wide reach, and marks an infused one", () => {
    const spell = makeSpell({ damage: 22, APCost: 6, range: 14, maxCastsPerTurn: 0 });
    const facts = ultimateFacts(spell, true);
    expect(facts).toContain("anywhere");
    expect(facts).not.toContain("range 14");
    expect(facts[facts.length - 1]).toBe("+ your element's effect");
  });
});

describe("grimoire facts", () => {
  it("gives the three numbers", () => {
    expect(grimoireStats(grimoire())).toEqual(["♥ 90", "6 AP", "4 MP"]);
  });

  it("writes a known rule short, and keeps the server's for one it does not know", () => {
    expect(grimoireRule(grimoire())).toBe("Burns stack ×3 · 4 dmg a turn each");
    expect(grimoireRule(grimoire({ id: "stonewarden", meleeBonus: 50 }))).toBe(
      "+50% damage up close"
    );
    expect(grimoireRule(grimoire({ id: "new-one" }))).toBe("A long sentence from the server.");
  });
});

describe("runeFact", () => {
  it("reads each effect off its numbers", () => {
    expect(runeFact(rune({ kind: "finisher", value: 20, threshold: 30 }))).toBe(
      "+20% damage under 30% HP"
    );
    expect(runeFact(rune({ kind: "openingMP", value: 2 }))).toBe("+2 MP on turn 1");
    expect(runeFact(rune({ kind: "openingShield", value: 3, duration: 1 }))).toBe("Shield 3 on turn 1");
    expect(runeFact(rune({ kind: "pushResist", value: 2 }))).toBe("Pushed 2 cells less");
  });
});
