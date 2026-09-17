import {
  areaPattern,
  calculateImpactedCells,
  castOrigin,
  spec,
  unavailableReason,
} from "./spellUtils";
import { Spell } from "../types/message";
import { Position } from "../types/game";
import { makeSpell } from "../test/fixtures";

const spell = (overrides: Partial<Spell> = {}): Spell =>
  makeSpell({
    name: "Ember",
    APCost: 3,
    range: 4,
    damage: 7,
    maxCastsPerTurn: 0,
    criticalDamage: 7,
    ...overrides,
  });

describe("spec", () => {
  it("lists cost and range", () => {
    expect(spec(spell())).toBe("3 AP · range 4");
  });

  it("says a zero-range spell is cast on yourself, and names its area", () => {
    expect(spec(spell({ range: 0, targeting: "self", areaOfEffect: "circle" }))).toBe(
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
    expect(unavailableReason(spell(), undefined, 6, 1)).toBeNull();
  });

  it("reports a recharge first, with the turns left", () => {
    expect(
      unavailableReason(spell(), { cooldownLeft: 2, castsThisTurn: 0 }, 0, 1)
    ).toBe("recharging — 2 turns left");
    expect(
      unavailableReason(spell(), { cooldownLeft: 1, castsThisTurn: 0 }, 6, 1)
    ).toBe("recharging — 1 turn left");
  });

  it("reports a spell used up for the turn", () => {
    expect(
      unavailableReason(
        spell({ maxCastsPerTurn: 1 }),
        { cooldownLeft: 0, castsThisTurn: 1 },
        6,
        1
      )
    ).toBe("no casts left this turn");
  });

  it("reports missing action points", () => {
    expect(unavailableReason(spell(), undefined, 2, 1)).toBe(
      "not enough action points"
    );
  });
});

const open = () => false;
const has = (cells: Position[], x: number, y: number) =>
  cells.some((c) => c.x === x && c.y === y);

describe("areaPattern", () => {
  it("covers every cell within two steps for a circle, centre and neighbours included", () => {
    const { pattern } = areaPattern("circle");
    expect(pattern).toHaveLength(13);
    for (const [x, y] of [[0, 0], [1, 0], [0, -1], [2, 0], [1, 1], [-1, -1]]) {
      expect(has(pattern, x, y)).toBe(true);
    }
    expect(has(pattern, 2, 1)).toBe(false);
  });
});

describe("wall", () => {
  it("lies straight across the cast, even on a slant", () => {
    const spell = makeSpell({ areaOfEffect: "wall" });
    const across = calculateImpactedCells(spell, { x: 0, y: 3 }, { x: 0, y: 0 });
    expect(across.map((c) => c.y)).toEqual([3, 3, 3, 3, 3]);
    const slant = calculateImpactedCells(spell, { x: 3, y: 1 }, { x: 0, y: 0 });
    expect(slant.map((c) => c.x)).toEqual([3, 3, 3, 3, 3]);
  });
});

describe("castOrigin", () => {
  const caster = { x: -4, y: 0 };

  it("prefers the relay whenever it reaches, for a relayed spell", () => {
    const spell = makeSpell({ range: 5, relayed: true });
    const relay = { x: -2, y: 1 };
    expect(castOrigin(spell, { x: 0, y: 0 }, caster, open, relay)).toEqual(relay);
  });

  it("casts from where the caster stands when that reaches", () => {
    const spell = makeSpell({ range: 5 });
    expect(castOrigin(spell, { x: 0, y: 0 }, caster, open, null)).toEqual(caster);
  });

  it("falls back to the relay for a relayed spell, and only for one", () => {
    const relay = { x: 1, y: 0 };
    const target = { x: 5, y: 0 };
    expect(castOrigin(makeSpell({ range: 5 }), target, caster, open, relay)).toBeNull();
    expect(
      castOrigin(makeSpell({ range: 5, relayed: true }), target, caster, open, relay)
    ).toEqual(relay);
  });

  it("respects line of sight from wherever it casts", () => {
    const wall = (p: Position) => p.x === -2 && p.y === 0;
    const spell = makeSpell({ range: 5 });
    expect(castOrigin(spell, { x: 0, y: 0 }, caster, wall, null)).toBeNull();
    expect(
      castOrigin({ ...spell, needsLineOfSight: false }, { x: 0, y: 0 }, caster, wall, null)
    ).toEqual(caster);
  });

  it("only offers the caster's own cell to a spell cast on itself", () => {
    const spell = makeSpell({ range: 0, targeting: "self" });
    expect(castOrigin(spell, caster, caster, open, null)).toEqual(caster);
    expect(castOrigin(spell, { x: -3, y: 0 }, caster, open, null)).toBeNull();
  });
});

describe("calculateImpactedCells", () => {
  it("shakes the cells around where a leap lands", () => {
    const cells = calculateImpactedCells(
      makeSpell({ special: "leap", targeting: "empty", range: 5 }),
      { x: 2, y: 2 },
      { x: 0, y: 0 }
    );
    expect(cells).toHaveLength(4);
    expect(has(cells, 2, 2)).toBe(false);
    expect(has(cells, 3, 2)).toBe(true);
  });

  it("centres a spell cast on yourself on yourself, wherever the pointer is", () => {
    const cells = calculateImpactedCells(
      makeSpell({ targeting: "self", range: 0, areaOfEffect: "circle" }),
      { x: 6, y: 0 },
      { x: 0, y: 0 }
    );
    expect(has(cells, 1, 0)).toBe(true);
    expect(has(cells, 6, 0)).toBe(false);
  });
});

describe("unavailableReason for ultimates", () => {
  const ultimate = makeSpell({ ultimate: true, APCost: 6 });

  it("keeps an ultimate locked on the first turn", () => {
    expect(unavailableReason(ultimate, undefined, 6, 1)).toBe("unlocks on turn 2");
    expect(unavailableReason(ultimate, undefined, 6, 2)).toBeNull();
  });

  it("says an ultimate is spent before anything else", () => {
    const state = { castsThisTurn: 0, cooldownLeft: 0, spent: true };
    expect(unavailableReason(ultimate, state, 0, 5)).toBe("already used this fight");
  });

  it("still reports action points for an ordinary spell", () => {
    expect(unavailableReason(makeSpell({ APCost: 4 }), undefined, 3, 1)).toBe(
      "not enough action points"
    );
  });
});

describe("spec for the new targeting", () => {
  it("says where a spell can be aimed", () => {
    expect(spec(makeSpell({ targeting: "self", range: 0 }))).toContain("on yourself");
    expect(spec(makeSpell({ targeting: "empty", range: 5 }))).toContain("a free cell within 5");
    expect(spec(makeSpell({ relayed: true }))).toContain("or from your relay");
    expect(spec(makeSpell({ ultimate: true }))).toContain("once a fight, from turn 2");
  });
});
