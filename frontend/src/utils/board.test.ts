import { blockedBy, findPath, hasLineOfSight, sightBlockedBy } from "./board";
import { TerrainCell } from "../types/message";

const cell = (x: number, y: number, kind: TerrainCell["kind"]): TerrainCell => ({
  position: { x, y },
  kind,
  owner: "someone",
});

describe("terrain on the board", () => {
  const terrain = [cell(1, 0, "fissure"), cell(0, 2, "smoke"), cell(2, 2, "water")];

  it("will not walk through a fissure, but will through smoke and water", () => {
    const blocked = blockedBy([], [], terrain);
    expect(blocked({ x: 1, y: 0 })).toBe(true);
    expect(blocked({ x: 0, y: 2 })).toBe(false);
    expect(blocked({ x: 2, y: 2 })).toBe(false);
    expect(findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, blocked)).toHaveLength(4);
  });

  it("cannot see through smoke, but can across a fissure", () => {
    const sight = sightBlockedBy([], [], terrain);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 0, y: 4 }, sight)).toBe(false);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 3, y: 0 }, sight)).toBe(true);
  });
});
