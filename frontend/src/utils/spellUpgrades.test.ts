import { upgradesOf } from "./spellUpgrades";
import { Spell, SpellBook } from "../types/message";
import { makeSpell } from "../test/fixtures";

const base = makeSpell({
  id: 3,
  name: "Combustion",
  APCost: 4,
  range: 3,
  damage: 10,
  criticalDamage: 14,
  maxCastsPerTurn: 1,
});

const bookWith = (...spells: Spell[]): SpellBook =>
  Object.fromEntries(spells.map((s) => [String(s.id), s]));

describe("upgradesOf", () => {
  it("finds nothing on a catalogue spell", () => {
    expect(upgradesOf(base, bookWith(base))).toEqual([]);
  });

  it("finds nothing when the spell it was made from is missing", () => {
    const own = { ...base, id: 40, baseId: 3, APCost: 3 };
    expect(upgradesOf(own, bookWith(own))).toEqual([]);
  });

  it("reads a cheaper, longer, harder spell off its base", () => {
    const own = { ...base, id: 40, baseId: 3, APCost: 3, range: 4, damage: 11 };
    expect(upgradesOf(own, bookWith(base, own))).toEqual([
      { kind: "damage", label: "+10% damage" },
      { kind: "range", label: "+1 range" },
      { kind: "cost", label: "−1 AP" },
    ]);
  });

  it("counts an extra cast only on a spell that had a limit", () => {
    const own = { ...base, id: 40, baseId: 3, maxCastsPerTurn: 2 };
    expect(upgradesOf(own, bookWith(base, own))).toEqual([
      { kind: "casts", label: "2× a turn" },
    ]);
  });

  it("reads a stronger effect", () => {
    const effect = { kind: "burn" as const, value: 2, duration: 2, onSelf: false };
    const withEffect = { ...base, effect };
    const own = { ...withEffect, id: 40, baseId: 3, effect: { ...effect, value: 3 } };
    expect(upgradesOf(own, bookWith(withEffect, own))).toEqual([
      { kind: "effect", label: "+1 burn" },
    ]);
  });
});
