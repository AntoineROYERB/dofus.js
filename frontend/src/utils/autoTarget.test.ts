import { autoTarget } from "./autoTarget";
import { Player, Position } from "../types/game";
import { makeSpell } from "../test/fixtures";

const player = (
  userId: string,
  position: Position,
  health = 100,
  team?: string
): Player => ({
  userId,
  userName: userId,
  character: {
    name: userId,
    color: "#000000",
    symbol: "*",
    position,
    actionPoints: 6,
    movementPoints: 3,
    maxActionPoints: 6,
    maxMovementPoints: 3,
    isCurrentTurn: false,
    health,
    maxHealth: 100,
    isAlive: true,
    effects: null,
  },
  isCurrentTurn: false,
  hasPositioned: true,
  connected: true,
  isBot: false,
  spells: null,
  team,
});

const cells = (...ps: Position[]) => new Set(ps.map((p) => `${p.x},${p.y}`));
const me = { x: 0, y: 0 };

describe("autoTarget", () => {
  it("aims a spell cast on yourself at your own cell", () => {
    const spell = makeSpell({ targeting: "self" });
    expect(
      autoTarget({ spell, castable: cells(), caster: me, players: {}, userId: "me" })
    ).toEqual(me);
  });

  it("aims a damaging spell at the enemy it would finish, else the weakest", () => {
    const players = {
      me: player("me", me),
      near: player("near", { x: 1, y: 0 }, 50),
      weak: player("weak", { x: 3, y: 0 }, 20),
      far: player("far", { x: 5, y: 0 }, 5),
    };
    const spell = makeSpell({ damage: 8 });
    const reach = cells({ x: 1, y: 0 }, { x: 3, y: 0 });
    // "far" would die to it, but it is out of reach.
    expect(autoTarget({ spell, castable: reach, caster: me, players, userId: "me" })).toEqual({
      x: 3,
      y: 0,
    });
    const finisher = makeSpell({ damage: 25 });
    expect(
      autoTarget({ spell: finisher, castable: reach, caster: me, players, userId: "me" })
    ).toEqual({ x: 3, y: 0 });
  });

  it("prefers the nearer of two equally hurt enemies", () => {
    const players = {
      me: player("me", me),
      a: player("a", { x: 4, y: 0 }, 40),
      b: player("b", { x: 2, y: 0 }, 40),
    };
    const spell = makeSpell({ damage: 5 });
    expect(
      autoTarget({
        spell,
        castable: cells({ x: 4, y: 0 }, { x: 2, y: 0 }),
        caster: me,
        players,
        userId: "me",
      })
    ).toEqual({ x: 2, y: 0 });
  });

  it("aims a helping spell at the most hurt ally in reach, you included", () => {
    const players = {
      me: player("me", me, 90, "party"),
      ally: player("ally", { x: 2, y: 0 }, 30, "party"),
      foe: player("foe", { x: 1, y: 0 }, 10, "dream"),
    };
    const spell = makeSpell({
      damage: 0,
      effect: { kind: "shield", value: 3, duration: 2, onSelf: false },
    });
    expect(
      autoTarget({
        spell,
        castable: cells(me, { x: 2, y: 0 }, { x: 1, y: 0 }),
        caster: me,
        players,
        userId: "me",
      })
    ).toEqual({ x: 2, y: 0 });
  });

  it("offers no aim when nothing worth hitting is in reach", () => {
    const players = { me: player("me", me), foe: player("foe", { x: 6, y: 0 }) };
    const spell = makeSpell({ damage: 5 });
    expect(
      autoTarget({ spell, castable: cells({ x: 1, y: 0 }), caster: me, players, userId: "me" })
    ).toBeNull();
  });

  it("aims a spell for an empty cell at the reachable cell nearest the closest enemy", () => {
    const players = { me: player("me", me), foe: player("foe", { x: 5, y: 0 }) };
    const spell = makeSpell({ targeting: "empty", damage: 0 });
    expect(
      autoTarget({
        spell,
        castable: cells({ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 2 }),
        caster: me,
        players,
        userId: "me",
      })
    ).toEqual({ x: 3, y: 0 });
  });
});
