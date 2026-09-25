import { ContentResponse, Island, IslandPalette } from "../types/message";

/**
 * The islands the world is made of, as the server's catalogue describes them.
 *
 * The world's shape — terraces, the river, where each region sits on the
 * compass — is still the client's own, derived from noise. What lives in each
 * region, what colours it is painted in and whether it holds still water is
 * not: that comes from config/islands.json, so adding an island is a change to
 * that file and to nothing here.
 */
export type WorldContent = Pick<ContentResponse, "islands" | "palettes" | "terrains">;

export type Atlas = {
  /** The first island of the campaign, in the middle, where the walk begins. */
  hub: Island;
  /** Every other island, round the compass in campaign order. */
  ring: Island[];
  palettes: { [id: string]: IslandPalette };
  /** Bumped on every change, so what is derived from an atlas knows when to redo it. */
  version: number;
  byId: Map<string, Island>;
  /** Islands with a liquid terrain: they get pools of it. */
  liquid: Set<string>;
};

let current: Atlas | null = null;
let loadedFrom: WorldContent | null = null;

/**
 * Hand the world its islands. Call it before anything asks for the ground;
 * giving the same content again is free, and different content rebuilds the
 * world the next time it is asked for.
 */
export const setWorldContent = (content: WorldContent): void => {
  if (content === loadedFrom) return;
  const [hub, ...ring] = content.islands;
  if (!hub) throw new Error("the world has no islands");
  const liquidTerrain = new Set(content.terrains.filter((t) => t.liquid).map((t) => t.id));
  current = {
    hub,
    ring,
    palettes: content.palettes,
    version: (current?.version ?? 0) + 1,
    byId: new Map(content.islands.map((i) => [i.id, i])),
    liquid: new Set(content.islands.filter((i) => i.terrains.some((t) => liquidTerrain.has(t))).map((i) => i.id)),
  };
  loadedFrom = content;
};

export const atlas = (): Atlas => {
  if (!current) throw new Error("the world's islands are not loaded: call setWorldContent first");
  return current;
};

/** The island a region id names, or the hub for anything unknown. */
export const islandOf = (id: string): Island => atlas().byId.get(id) ?? atlas().hub;
