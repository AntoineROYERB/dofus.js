import { atlas, setWorldContent } from "./islands";
import { groundAt, lairOf, regionAt, ringOf, WORLD_RADIUS } from "./world";
import { shippedWorld } from "./shippedWorld.testing";
import { Position } from "../types/game";

const everyCell = (): Position[] => {
  const cells: Position[] = [];
  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
    for (let y = -WORLD_RADIUS; y <= WORLD_RADIUS; y++) cells.push({ x, y });
  }
  return cells;
};

describe("the world's islands, from the catalogue", () => {
  beforeEach(() => setWorldContent(shippedWorld()));

  it("put the first island in the middle and the others round it", () => {
    const { islands } = shippedWorld();
    expect(regionAt({ x: 0, y: 0 })).toBe(islands[0].id);
    expect(ringOf()).toEqual(islands.slice(1).map((i) => i.id));
  });

  it("give pools only to islands with a liquid terrain", () => {
    const pooled = new Set<string>();
    for (const c of everyCell()) {
      const g = groundAt(c);
      // The river crosses every region; pools are the water away from it.
      if (g.obstacle === "water" && Math.abs(c.y - 7.5) > 5) pooled.add(g.region);
    }
    for (const r of pooled) expect(atlas().liquid.has(r)).toBe(true);
    expect(atlas().liquid.has("prairie")).toBe(false);
  });

  it("paint every region in its island's palette", () => {
    const { islands } = shippedWorld();
    const paletteOf = new Map(islands.map((i) => [i.id, i.palette]));
    for (const c of everyCell()) {
      const g = groundAt(c);
      expect(g.look).toBe(paletteOf.get(g.region));
    }
  });

  // The point of islands as data: one more entry in the file, and the world
  // has one more region, with its boss in a lair and its people around it.
  it("grow a region for an island added to the file, with no code", () => {
    const shipped = shippedWorld();
    const lagoon = {
      id: "lagoon", name: "Lagoon", element: "Water", terrains: ["shallow_water"], palette: "water",
      lineage: ["poulpinet"], boss: "boss_kraken", armour: "tidewalker", fights: 3,
    };
    setWorldContent({ ...shipped, islands: [...shipped.islands, lagoon] });

    expect(ringOf()).toContain("lagoon");
    const lair = lairOf("lagoon") as Position;
    expect(groundAt(lair).region).toBe("lagoon");
    expect(groundAt(lair).creature).toBe("boss_kraken");
    const regions = new Set(everyCell().map((c) => groundAt(c).region));
    expect(regions.size).toBe(shipped.islands.length + 1);
  });
});
