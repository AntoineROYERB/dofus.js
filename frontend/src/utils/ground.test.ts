import { readFileSync } from "fs";
import { resolve } from "path";
import { blockedBy, findPath, hasLineOfSight, pathCost, reachable, sightBlockedBy } from "./board";
import { GROUND_KINDS, groundBlocksSight, isSolidGround, stepCostOf } from "./ground";
import { GroundCell, Terrain } from "../types/message";

const at = (x: number, y: number, kind: string): GroundCell => ({ position: { x, y }, kind });

describe("an island's ground on the board", () => {
  it("knows every terrain the server ships", () => {
    // Jest runs from frontend/; the catalogue is the server's own file.
    const { terrains } = JSON.parse(
      readFileSync(resolve("../backend/config/islands.json"), "utf8")
    ) as { terrains: Terrain[] };
    expect(terrains.map((t) => t.id).sort()).toEqual(GROUND_KINDS);
    expect(isSolidGround("rock")).toBe(true);
    expect(isSolidGround("lava")).toBe(true);
    expect(isSolidGround("tall_grass")).toBe(false);
    expect(groundBlocksSight("rock")).toBe(true);
    expect(groundBlocksSight("lava")).toBe(false);
  });

  it("will not walk onto rock or lava, and sees past lava but not rock", () => {
    const ground = [at(1, 0, "rock"), at(0, 2, "lava")];
    const blocked = blockedBy([], [], [], ground);
    expect(blocked({ x: 1, y: 0 })).toBe(true);
    expect(blocked({ x: 0, y: 2 })).toBe(true);
    const sight = sightBlockedBy([], [], [], ground);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 3, y: 0 }, sight)).toBe(false);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 0, y: 4 }, sight)).toBe(true);
  });

  it("charges two points for a step into shallow water, like the server", () => {
    const cost = stepCostOf([at(1, 0, "shallow_water")]);
    const reach = reachable({ x: 0, y: 0 }, 2, () => false, cost);
    expect(reach.get("1,0")).toBe(2);
    // Past the water is out of reach straight on, but not round it.
    expect(reach.has("2,0")).toBe(false);

    const path = findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, () => false, cost) ?? [];
    expect(pathCost(path, cost)).toBe(3);
  });

  it("walks round water when that is cheaper", () => {
    // A wide pool: through it is 2+2+1, round it 1+1+1+1+1... equal at best,
    // so a deeper pool is gone round.
    const pool = [at(1, 0, "shallow_water"), at(2, 0, "shallow_water"), at(3, 0, "shallow_water")];
    const cost = stepCostOf(pool);
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, () => false, cost) ?? [];
    expect(pathCost(path, cost)).toBe(6);
    expect(path.some((p) => p.y === 0 && p.x > 0 && p.x < 4)).toBe(false);
  });
});
