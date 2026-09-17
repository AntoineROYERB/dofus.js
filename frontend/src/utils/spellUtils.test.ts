import { spec, unavailableReason } from "./spellUtils";
import { Spell } from "../types/message";

const spell = (overrides: Partial<Spell> = {}): Spell => ({
  id: 1,
  name: "Ember",
  color: "#000",
  icon: "*",
  APCost: 3,
  range: 4,
  damage: 7,
  areaOfEffect: "none",
  element: "Fire",
  description: "",
  needsLineOfSight: true,
  maxCastsPerTurn: 0,
  cooldown: 0,
  criticalChance: 0,
  criticalDamage: 0,
  effect: null,
  ...overrides,
});

describe("spec", () => {
  it("lists cost and range", () => {
    expect(spec(spell())).toBe("3 AP · range 4");
  });

  it("says a zero-range spell is cast on yourself, and names its area", () => {
    expect(spec(spell({ range: 0, areaOfEffect: "circle" }))).toBe(
      "3 AP · on yourself · circle"
    );
  });

  it("prefers the cooldown over the casts per turn", () => {
    expect(spec(spell({ cooldown: 2, maxCastsPerTurn: 1 }))).toBe(
      "3 AP · range 4 · 2 turn cooldown"
    );
    expect(spec(spell({ maxCastsPerTurn: 1 }))).toBe("3 AP · range 4 · once a turn");
    expect(spec(spell({ maxCastsPerTurn: 3 }))).toBe("3 AP · range 4 · 3× a turn");
  });
});

describe("unavailableReason", () => {
  it("is null when the spell can be cast", () => {
    expect(unavailableReason(spell(), undefined, 6)).toBeNull();
  });

  it("reports a recharge first, with the turns left", () => {
    expect(
      unavailableReason(spell(), { cooldownLeft: 2, castsThisTurn: 0 }, 0)
    ).toBe("recharging — 2 turns left");
    expect(
      unavailableReason(spell(), { cooldownLeft: 1, castsThisTurn: 0 }, 6)
    ).toBe("recharging — 1 turn left");
  });

  it("reports a spell used up for the turn", () => {
    expect(
      unavailableReason(
        spell({ maxCastsPerTurn: 1 }),
        { cooldownLeft: 0, castsThisTurn: 1 },
        6
      )
    ).toBe("no casts left this turn");
  });

  it("reports missing action points", () => {
    expect(unavailableReason(spell(), undefined, 2)).toBe(
      "not enough action points"
    );
  });
});
