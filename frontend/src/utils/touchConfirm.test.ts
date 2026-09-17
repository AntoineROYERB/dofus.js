import { bubblePlacement, confirmActionFor } from "./touchConfirm";
import { Player } from "../types/game";
import { Spell } from "../types/message";
import { makeSpell } from "../test/fixtures";

const spell = (overrides: Partial<Spell> = {}): Spell =>
  makeSpell({
    name: "Ember",
    color: "#d8ae31",
    range: 4,
    damage: 7,
    maxCastsPerTurn: 2,
    criticalDamage: 7,
    ...overrides,
  });

describe("confirmActionFor with the new spells", () => {
  const input = {
    touchMode: true,
    previewed: { x: 2, y: 0 },
    isPositioningPhase: false,
    isMyTurn: true,
    castable: new Set(["2,0"]),
    walkable: new Map([["2,0", 2]]),
    characterPosition: { x: 0, y: 0 },
    standing: undefined,
    userId: "me",
  };

  it("shows the damage the cast will really do, and why", () => {
    const action = confirmActionFor({
      ...input,
      selectedSpell: spell({ damage: 10 }),
      expectedDamage: 13,
      damageNote: "via relay",
    });
    expect(action?.detail).toBe("−13 via relay");
  });

  it("says what lies on the cell, for a move and for a cast", () => {
    expect(confirmActionFor({ ...input, selectedSpell: undefined, ground: "Fire" })?.ground).toBe("Fire");
    expect(confirmActionFor({ ...input, selectedSpell: spell(), ground: "Ice" })?.ground).toBe("Ice");
  });
});

const fighter = (userId: string, name: string, health: number): Player =>
  ({ userId, character: { name, health } } as unknown as Player);

const base = {
  touchMode: true,
  previewed: { x: 2, y: 0 },
  isPositioningPhase: false,
  isMyTurn: true,
  selectedSpell: undefined,
  castable: new Set<string>(),
  walkable: new Map<string, number>([["2,0", 2]]),
  characterPosition: { x: 0, y: 0 },
  standing: undefined,
  userId: "me",
};

describe("confirmActionFor", () => {
  it("offers a move with its cost", () => {
    expect(confirmActionFor(base)).toEqual({
      kind: "move",
      label: "Move",
      detail: "2 MP",
    });
  });

  it("offers nothing for a mouse, which already previewed on hover", () => {
    expect(confirmActionFor({ ...base, touchMode: false })).toBeNull();
  });

  it("offers nothing outside the player's own turn or while placing", () => {
    expect(confirmActionFor({ ...base, isMyTurn: false })).toBeNull();
    expect(confirmActionFor({ ...base, isPositioningPhase: true })).toBeNull();
    expect(confirmActionFor({ ...base, previewed: null })).toBeNull();
  });

  it("offers no move to an unreachable cell or the fighter's own cell", () => {
    expect(confirmActionFor({ ...base, previewed: { x: 5, y: 5 } })).toBeNull();
    expect(
      confirmActionFor({
        ...base,
        previewed: { x: 0, y: 0 },
        walkable: new Map([["0,0", 0]]),
      })
    ).toBeNull();
  });

  it("offers a cast only where the spell can land", () => {
    const selectedSpell = spell();
    expect(confirmActionFor({ ...base, selectedSpell })).toBeNull();
    expect(
      confirmActionFor({ ...base, selectedSpell, castable: new Set(["2,0"]) })
    ).toEqual({ kind: "cast", label: "Cast", detail: "−7", target: undefined });
  });

  it("names the target and what the hit would leave it with", () => {
    const action = confirmActionFor({
      ...base,
      selectedSpell: spell(),
      castable: new Set(["2,0"]),
      standing: fighter("bot", "Ashka", 95),
    });
    expect(action?.target).toBe("Ashka · 95 → 88 hp");
  });

  it("never predicts health below zero", () => {
    const action = confirmActionFor({
      ...base,
      selectedSpell: spell({ damage: 30 }),
      castable: new Set(["2,0"]),
      standing: fighter("bot", "Ashka", 12),
    });
    expect(action?.target).toBe("Ashka · 12 → 0 hp");
  });

  it("says a spell cast on the player's own cell lands on them", () => {
    const action = confirmActionFor({
      ...base,
      selectedSpell: spell({ damage: 0, range: 0 }),
      castable: new Set(["2,0"]),
      standing: fighter("me", "Antoine", 80),
    });
    expect(action).toEqual({
      kind: "cast",
      label: "Cast",
      detail: "2 AP",
      target: "on yourself",
    });
  });
});

describe("bubblePlacement", () => {
  const tile = { width: 80, height: 40 };
  const board = { width: 844, height: 370 };
  const offset = tile.width / 2 + 10;

  it("opens to the right of a cell on the left half", () => {
    const place = bubblePlacement({ x: 200, y: 200 }, tile, board);
    expect(place.toLeft).toBe(false);
    expect(place.left).toBe(200 + offset);
  });

  it("opens to the left of a cell on the right half, away from the arc", () => {
    const place = bubblePlacement({ x: 600, y: 200 }, tile, board);
    expect(place.toLeft).toBe(true);
    expect(place.left).toBe(600 - offset);
  });

  it("always opens towards the side with more room", () => {
    for (const x of [10, 300, 421, 423, 700, 834]) {
      const place = bubblePlacement({ x, y: 200 }, tile, board);
      const room = place.toLeft ? x : board.width - x;
      expect(room).toBeGreaterThanOrEqual(board.width / 2);
    }
  });

  it("stays within the board's height", () => {
    expect(bubblePlacement({ x: 200, y: 0 }, tile, board).top).toBe(34);
    expect(bubblePlacement({ x: 200, y: 999 }, tile, board).top).toBe(370 - 34);
  });
});
