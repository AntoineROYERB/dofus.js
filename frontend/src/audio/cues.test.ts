import { Player } from "../types/game";
import { GameState, LogEntry } from "../types/message";
import { makeSpell } from "../test/fixtures";
import { fightCues, panOf, surfaceOf } from "./cues";

const fighter = (id: string, overrides: Partial<Player["character"]> = {}, turn = false): Player => ({
  userId: id,
  userName: id,
  isCurrentTurn: turn,
  hasPositioned: true,
  connected: true,
  isBot: false,
  spells: null,
  character: {
    name: id,
    color: "#000000",
    symbol: "*",
    position: id === "me" ? { x: 0, y: 3 } : { x: 0, y: -3 },
    actionPoints: 6,
    movementPoints: 3,
    maxActionPoints: 6,
    maxMovementPoints: 3,
    isCurrentTurn: turn,
    health: 50,
    maxHealth: 50,
    isAlive: true,
    effects: null,
    ...overrides,
  },
});

const state = (players: Player[], log: LogEntry[] = [], status = "playing"): GameState => ({
  type: "game_state",
  players: Object.fromEntries(players.map((p) => [p.userId, p])),
  turnNumber: 1,
  status,
  spells: {
    "1": makeSpell({ id: 1, element: "Fire" }),
    "2": makeSpell({ id: 2, element: "Earth", ultimate: true }),
    "3": makeSpell({ id: 3, element: "Water", push: 2 }),
  },
  turnOrder: players.map((p) => p.userId),
  turnEndsAt: 0,
  log,
  obstacles: null,
});

const cast = (seq: number, spellId: number, extra: Partial<LogEntry> = {}): LogEntry => ({
  seq,
  turn: 1,
  actor: "me",
  kind: "cast",
  text: "casts",
  spellId,
  origin: { x: 0, y: 3 },
  target: { x: 0, y: -3 },
  damage: 12,
  ...extra,
});

describe("fightCues", () => {
  it("stays silent on the first state, so a late joiner hears nothing of the past", () => {
    const now = state([fighter("me"), fighter("foe", { health: 20 })], [cast(4, 1)]);
    expect(fightCues(null, now, "me", null)).toEqual({ cues: [], seen: 4 });
  });

  it("sounds a new cast in its element, and the blow it dealt", () => {
    const before = state([fighter("me", {}, true), fighter("foe")], [cast(1, 1)]);
    const after = state([fighter("me", { actionPoints: 3 }, true), fighter("foe", { health: 38 })], [cast(1, 1), cast(2, 1)]);
    const { cues, seen } = fightCues(before, after, "me", 1);
    expect(seen).toBe(2);
    expect(cues).toEqual([
      expect.objectContaining({ kind: "cast", element: "Fire", heavy: false, damage: 12, moves: false }),
      { kind: "hurt", at: { x: 0, y: -3 }, amount: 12 },
    ]);
  });

  it("does not sound a cast twice", () => {
    const before = state([fighter("me"), fighter("foe")], [cast(1, 1)]);
    const after = state([fighter("me"), fighter("foe")], [cast(1, 1)]);
    expect(fightCues(before, after, "me", 1).cues).toEqual([]);
  });

  it("makes an ultimate heavy and a push a throw", () => {
    const before = state([fighter("me"), fighter("foe")]);
    const after = state([fighter("me"), fighter("foe")], [cast(1, 2), cast(2, 3)]);
    const cues = fightCues(before, after, "me", 0).cues;
    expect(cues[0]).toEqual(expect.objectContaining({ element: "Earth", heavy: true }));
    expect(cues[1]).toEqual(expect.objectContaining({ element: "Water", moves: true }));
  });

  it("takes a rematch's empty log for a fresh start", () => {
    const before = state([fighter("me"), fighter("foe")], [cast(9, 1)]);
    const after = state([fighter("me"), fighter("foe")], [], "position_characters");
    expect(fightCues(before, after, "me", 9)).toEqual({ cues: [], seen: 0 });
  });

  it("hears a fall, not the blow that caused it", () => {
    const before = state([fighter("me"), fighter("foe")]);
    const after = state([fighter("me"), fighter("foe", { health: 0, isAlive: false })]);
    expect(fightCues(before, after, "me", 0).cues).toEqual([{ kind: "death", at: { x: 0, y: -3 } }]);
  });

  it("hears a heal and a shield", () => {
    const before = state([fighter("me", { health: 30 }), fighter("foe")]);
    const after = state([fighter("me", { health: 40 }), fighter("foe")], [cast(1, 1, { target: { x: 0, y: 3 }, damage: 0, shieldChange: 5 })]);
    const kinds = fightCues(before, after, "me", 0).cues.map((c) => c.kind);
    expect(kinds).toEqual(["cast", "shield", "heal"]);
  });

  it("tells a drain from points the acting fighter spent", () => {
    const before = state([fighter("me", {}, true), fighter("foe")]);
    const after = state([fighter("me", { movementPoints: 1 }, true), fighter("foe", { actionPoints: 4 })]);
    expect(fightCues(before, after, "me", 0).cues).toEqual([{ kind: "drain", at: { x: 0, y: -3 } }]);
  });

  it("chimes when the turn comes round to this player, and only then", () => {
    const before = state([fighter("me"), fighter("foe", {}, true)]);
    const mine = state([fighter("me", {}, true), fighter("foe")]);
    expect(fightCues(before, mine, "me", 0).cues).toEqual([{ kind: "turn" }]);
    expect(fightCues(before, mine, "foe", 0).cues).toEqual([]);
  });

  it("calls the start of the fight once placement is over", () => {
    const before = state([fighter("me"), fighter("foe")], [], "position_characters");
    const after = state([fighter("me"), fighter("foe", {}, true)]);
    expect(fightCues(before, after, "me", 0).cues).toEqual([{ kind: "fightStart" }]);
  });
});

describe("panOf", () => {
  it("follows the board's diagonal, and stays on the speakers", () => {
    expect(panOf({ x: 0, y: 0 })).toBe(0);
    expect(panOf({ x: 7, y: -7 })).toBe(1);
    expect(panOf({ x: -3, y: 3 })).toBeCloseTo(-6 / 14);
    expect(panOf({ x: -20, y: 20 })).toBe(-1);
  });
});

describe("surfaceOf", () => {
  const ground = [
    { position: { x: 1, y: 0 }, kind: "shallow_water" },
    { position: { x: 2, y: 0 }, kind: "ice" },
    { position: { x: 3, y: 0 }, kind: "tall_grass" },
    { position: { x: 4, y: 0 }, kind: "air_current" },
  ];

  it("reads the island's ground under each foot", () => {
    expect(surfaceOf(ground, "isle", { x: 1, y: 0 })).toBe("water");
    expect(surfaceOf(ground, "isle", { x: 2, y: 0 })).toBe("ice");
    expect(surfaceOf(ground, "isle", { x: 3, y: 0 })).toBe("grass");
    expect(surfaceOf(ground, "isle", { x: 4, y: 0 })).toBe("dirt");
  });

  it("falls back on turf on an island, and flagstones in the arena", () => {
    expect(surfaceOf(ground, "isle", { x: 0, y: 0 })).toBe("grass");
    expect(surfaceOf(null, undefined, { x: 0, y: 0 })).toBe("stone");
  });
});
