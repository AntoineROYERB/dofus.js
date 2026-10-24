import { sameSide, teamed } from "./sides";
import { Player } from "../types/game";

const player = (userId: string, team?: string): Player =>
  ({ userId, team, character: {} } as unknown as Player);

describe("sides", () => {
  it("makes everyone their own side in a duel", () => {
    const players = { a: player("a"), b: player("b") };
    expect(sameSide(players, "a", "a")).toBe(true);
    expect(sameSide(players, "a", "b")).toBe(false);
    expect(teamed(players)).toBe(false);
  });

  it("puts a team on one side in a fight between teams", () => {
    const players = { a: player("a", "party"), b: player("b", "party"), m: player("m", "dream") };
    expect(sameSide(players, "a", "b")).toBe(true);
    expect(sameSide(players, "a", "m")).toBe(false);
    expect(teamed(players)).toBe(true);
  });
});
