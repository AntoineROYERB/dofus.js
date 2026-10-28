import { GroundCell } from "../types/message";

/**
 * The scenery's own randomness.
 *
 * The fight's rolls belong to the server (`g.rng`), and the scenery must
 * never borrow from them: a replay applies its recorded commands without
 * drawing anything new. So the scenery is seeded on the client, from what
 * both players already share — the island, the room and the ground the fight
 * was dealt. Two players in the same fight see the same trees, a reload
 * changes nothing, and a new deal of the ground gives a new clearing.
 */

/** FNV-1a over a string: stable across devices and runs. */
export const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/**
 * The seed of a fight's scenery. The ground is read sorted, so the order the
 * server happens to list it in cannot change the trees.
 */
export const sceneSeed = (
  island: string | undefined,
  roomId: string,
  ground: GroundCell[] | null | undefined
): number => {
  const cells = (ground ?? [])
    .map((c) => `${c.position.x},${c.position.y}:${c.kind}`)
    .sort()
    .join(";");
  return hashString(`${island ?? "arena"}|${roomId}|${cells}`);
};

/** A small, fast generator: the same seed always gives the same sequence. */
export const generator = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * A stable number in [0, 1) for an integer point and a salt. The same
 * function is written out in the shaders (see gl/shaders.ts): what the CPU
 * and the GPU scatter must land on the same pixels.
 */
export const hash3 = (x: number, y: number, s = 0): number => {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
