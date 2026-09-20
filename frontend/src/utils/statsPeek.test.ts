import { peekedFighter } from "./statsPeek";
import { Player, Position } from "../types/game";

const player = (
  userId: string,
  position: Position | undefined,
  isAlive = true
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
    health: 100,
    maxHealth: 100,
    isAlive,
    effects: null,
  },
  isCurrentTurn: false,
  hasPositioned: true,
  connected: true,
  isBot: false,
  spells: null,
});

const players = {
  me: player("me", { x: 1, y: 2 }),
  ghost: player("ghost", { x: 3, y: 3 }, false),
  waiting: player("waiting", undefined),
};

describe("peekedFighter", () => {
  it("finds whoever stands on the cell under the pointer", () => {
    expect(peekedFighter(players, { x: 1, y: 2 })?.[0]).toBe("me");
  });

  it("shows nothing once the pointer has left the board", () => {
    expect(peekedFighter(players, null)).toBeNull();
  });

  it("shows nothing on an empty cell", () => {
    expect(peekedFighter(players, { x: 9, y: 9 })).toBeNull();
  });

  it("leaves the dead out of it", () => {
    expect(peekedFighter(players, { x: 3, y: 3 })).toBeNull();
  });

  it("copes with a board that has not arrived yet", () => {
    expect(peekedFighter(undefined, { x: 1, y: 2 })).toBeNull();
  });
});
