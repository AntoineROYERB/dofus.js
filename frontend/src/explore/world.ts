import { Position } from "../types/game";
import { cellNoise, fbm, smoothstep, valueNoise } from "./noise";

/**
 * The world you walk around in, as opposed to the board you fight on.
 *
 * It is the client's own, with no server behind it: there is nothing here a
 * player could gain by lying about, and a mode whose whole purpose is to find
 * out whether walking somewhere feels like going somewhere does not need a
 * round trip to answer that. When it grows something worth defending — loot,
 * other players, a fight that starts where you were standing — the rules move
 * to the Go server the way the fight's did, and this becomes the drawing of
 * them. Until then, keeping it here is what makes the question cheap to ask.
 *
 * The fight's own board helpers cannot be borrowed for it: board.ts mirrors
 * the server cell for cell, and its GRID_RADIUS is the server's GridRadius.
 * Widening that to fit a world would quietly break the one property that
 * makes the fight's movement preview trustworthy — that it refuses exactly
 * what the server refuses.
 */

/** Half the world's extent, in cells, along each axis. */
export const WORLD_RADIUS = 32;

/** Cells you are guaranteed to arrive in the middle of, rather than inside a rock. */
const CLEARING = 3;

export const inWorld = (p: Position): boolean =>
  Math.abs(p.x) <= WORLD_RADIUS && Math.abs(p.y) <= WORLD_RADIUS;

const inClearing = (p: Position): boolean => Math.abs(p.x) + Math.abs(p.y) <= CLEARING;

/**
 * Scenery, from the cell's own coordinates rather than from a stored map.
 *
 * A world is mostly empty, and an empty world is the one thing that cannot
 * answer the question being asked: with nothing to pass, nothing to round and
 * nothing to lose sight of, a camera holding you in the middle of a blank
 * sheet looks exactly like a camera that is broken. Scenery is what makes the
 * paper move visibly.
 *
 * Deriving it from noise rather than storing it keeps the world free to be
 * any size without shipping a byte per cell, and — because the same cell
 * always hashes the same way — keeps it still: a rock does not wander when
 * the board re-renders, and it is in the same place after a reload, so the
 * place stays a place.
 *
 * Everything the rules need and everything the drawing needs comes from the
 * one record below, so the two cannot disagree: a tree is drawn exactly where
 * walking refuses to go, and a stair is drawn exactly where it lets you climb.
 */
/**
 * What stops you. A thicket is low scrub, drawn flat on the ground: it fills a
 * pocket nothing else could reach without standing tall enough to hide behind
 * a terrace.
 */
export type Obstacle = "rock" | "tree" | "water" | "thicket" | "creature";

/**
 * The world is cut into regions, one for each boss of the bestiary, around a
 * Prairie in the middle where the walk begins. A region decides how its
 * ground is drawn, what its liquid is, and which creatures live there.
 */
export type Region = "prairie" | "earth" | "water" | "ice" | "air" | "acid" | "fire";

/** The ring of boss regions around the Prairie, in order round the compass. */
export const RING: Region[] = ["earth", "water", "ice", "air", "acid", "fire"];

/** Who lives where: sprite sheets of the bestiary, by region. */
export const LINEAGES: Record<Region, string[]> = {
  prairie: ["bouflaine", "bouflaine_2", "souchon", "souchon_2"],
  earth: ["caillou", "caillou_2", "caillou_3"],
  water: ["poulpinet", "poulpinet_2", "poulpinet_3"],
  ice: ["givrelle", "givrelle_2", "givrelle_3"],
  air: ["chauvolet", "chauvolet_2", "chauvolet_3"],
  acid: ["gloop", "gloop_2", "gloop_3"],
  fire: [],
};

/** The boss who rules each region, and where its lair is. */
export const BOSSES: Partial<Record<Region, string>> = {
  earth: "boss_monolithe",
  water: "boss_kraken",
  ice: "boss_coeur_hiver",
  air: "boss_oeil_nuee",
  acid: "boss_mere_gloop",
  fire: "legend_roi_cendre",
};

const PRAIRIE_RADIUS = 11;
const LAIR_RADIUS = 22;

export const regionAt = (p: Position): Region => {
  const d = Math.hypot(p.x, p.y) + (valueNoise(p.x, p.y, 5, 61) - 0.5) * 5;
  if (d < PRAIRIE_RADIUS) return "prairie";
  const a = Math.atan2(p.y, p.x) + (valueNoise(p.x, p.y, 7, 62) - 0.5) * 0.7;
  const k = Math.round(((a + Math.PI) / (2 * Math.PI)) * 6);
  return RING[((k % 6) + 6) % 6];
};

/** The lair of each boss: the middle of its sector of the ring. */
export const lairOf = (r: Region): Position | null => {
  const k = RING.indexOf(r);
  if (k < 0) return null;
  const a = (k / 6) * 2 * Math.PI - Math.PI;
  return { x: Math.round(Math.cos(a) * LAIR_RADIUS), y: Math.round(Math.sin(a) * LAIR_RADIUS) };
};

export type Ground = {
  /** Terrace height, 0 to MAX_LEVEL. */
  level: number;
  obstacle: Obstacle | null;
  /** A shallow crossing: river drawn, stones to step on, and walkable. */
  ford: boolean;
  /**
   * Steps carved down into this cell, from its own level to the neighbour one
   * level below in this direction. The stair is cut into the terrace rather
   * than stood against it, so the cliff keeps its line and the ground below
   * stays ground. A terrace is only ever climbed by its stairs: without them
   * a one-level edge is as much a wall as a two-level one.
   */
  stair: Position | null;
  /** Trodden ground on the way to or from a stair. */
  path: boolean;
  /** How much of the cell is moss and how much sand, each 0 to 1. */
  moss: number;
  sand: number;
  region: Region;
  /** For a creature: the bestiary sheet it is drawn from, and whether it is the region's boss. */
  creature: string | null;
  boss: boolean;
};

export const MAX_LEVEL = 2;

/*
 * The river runs the width of the world, so without a way across it would cut
 * the world in two. Fords are regular rather than random so that there is
 * always one within a few cells of wherever you meet the water — and one of
 * them lines up with the spawn, so the first walk south finds it.
 */
const RIVER_OFFSET = 7.5;
const RIVER_HALF_WIDTH = 0.8;
const FORD_EVERY = 9;

const riverCentre = (x: number): number =>
  RIVER_OFFSET + 2.1 * Math.sin(x * 0.42 + 0.6) + (valueNoise(x, 0, 3, 9) - 0.5) * 1.6;

const riverDistance = (p: Position): number => Math.abs(p.y - riverCentre(p.x));

const isFordColumn = (x: number): boolean => ((x % FORD_EVERY) + FORD_EVERY) % FORD_EVERY === 0;

/**
 * Moss and sand as smooth fields over the plane, fractional coordinates and
 * all, so the wash that paints them can be sampled finer than the grid.
 */
export const biomeAt = (x: number, y: number): { moss: number; sand: number } => {
  const n = fbm(x, y, 11);
  return { moss: smoothstep((n - 0.52) / 0.12), sand: smoothstep((0.44 - n) / 0.12) };
};

/**
 * Where a middle terrace is pushed up to meet the one above it, so that the
 * ground goes from the bottom to the top in one cliff: two levels at once,
 * which no stair climbs. You go round.
 */
const ESCARPMENT = 0.64;

const baseLevel = (p: Position): number => {
  // Flat where you arrive, and flat either side of a ford, so the way across
  // the river never ends at the foot of a wall.
  if (inClearing(p)) return 0;
  const d = riverDistance(p);
  if (d < 3 && (isFordColumn(p.x - 1) || isFordColumn(p.x) || isFordColumn(p.x + 1))) return 0;
  const lift = fbm(p.x, p.y, 3) + Math.min(Math.hypot(p.x, p.y), 9) * 0.03 - 0.08;
  let level = Math.max(0, Math.min(MAX_LEVEL, Math.floor((lift - 0.38) * 6)));
  if (level === 1 && valueNoise(p.x, p.y, 5, 41) > ESCARPMENT) level = MAX_LEVEL;
  // The river runs in a valley: flat along the water, a terrace above it,
  // and the high ground only further out.
  return Math.min(level, Math.floor(d / 2));
};

const ROCK_DENSITY = 0.07;
const TREE_DENSITY = 0.025;
/** How often a terrace gets a second stair, once it is already reachable. */
const EXTRA_STAIRS = 0.12;
/** No two stairs closer than this, counted in steps, unless one is needed. */
const STAIR_SPACING = 6;

const SIDE = WORLD_RADIUS * 2 + 1;
const index = (p: Position): number => (p.x + WORLD_RADIUS) * SIDE + (p.y + WORLD_RADIUS);
const cellAt = (i: number): Position => ({
  x: Math.floor(i / SIDE) - WORLD_RADIUS,
  y: (i % SIDE) - WORLD_RADIUS,
});
const STEPS: Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const plus = (a: Position, b: Position): Position => ({ x: a.x + b.x, y: a.y + b.y });
const minus = (a: Position, b: Position): Position => ({ x: a.x - b.x, y: a.y - b.y });

/**
 * The whole world, surveyed once. It is finite and small, and some of it —
 * where the stairs go — can only be decided by looking at all of it at once.
 */
const survey = (): Ground[] => {
  const count = SIDE * SIDE;
  const all = Array.from({ length: count }, (_, i) => cellAt(i));
  const river = all.map((p) => riverDistance(p) < RIVER_HALF_WIDTH);
  const ford = all.map((p, i) => river[i] && isFordColumn(p.x));
  let level = all.map((p, i) => (river[i] ? 0 : baseLevel(p)));
  const levelAt = (p: Position) => (inWorld(p) ? level[index(p)] : -1);

  /*
   * Terraces are smoothed before anything is built on them: noise leaves
   * single cells and thin strands a level apart, and every one of those
   * would be a terrace of its own, needing its own stair to reach.
   */
  for (let pass = 0; pass < 2; pass++) {
    level = level.map((l, i) => {
      if (river[i]) return 0;
      const votes = new Array(MAX_LEVEL + 1).fill(0);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const n = { x: all[i].x + dx, y: all[i].y + dy };
          if (inWorld(n) && !river[index(n)]) votes[level[index(n)]]++;
        }
      }
      const best = votes.indexOf(Math.max(...votes));
      return votes[best] >= 5 ? best : l;
    });
  }

  /*
   * What smoothing leaves behind — a patch of a few cells a level apart from
   * everything round it — is folded into the largest terrace it touches.
   */
  const SMALLEST_TERRACE = 10;
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Uint8Array(count);
    let changed = false;
    for (let start = 0; start < count; start++) {
      if (seen[start] || river[start]) continue;
      const patch = [start];
      seen[start] = 1;
      const touching = new Map<number, number>();
      for (let k = 0; k < patch.length; k++) {
        for (const step of STEPS) {
          const n = plus(all[patch[k]], step);
          if (!inWorld(n)) continue;
          const j = index(n);
          if (river[j] && !ford[j]) continue;
          if (level[j] !== level[start]) {
            touching.set(level[j], (touching.get(level[j]) ?? 0) + 1);
          } else if (!seen[j]) {
            seen[j] = 1;
            patch.push(j);
          }
        }
      }
      if (patch.length >= SMALLEST_TERRACE || touching.size === 0 || ford[start]) continue;
      const into = [...touching.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (const i of patch) level[i] = into;
      changed = true;
    }
    if (!changed) break;
  }

  /*
   * A plateau walled in by two-level cliffs on every side would be a drawing
   * of somewhere you cannot go. Anything that cannot be reached from the
   * spawn, climbing at most a level at a time, is lowered a level and the
   * question asked again, until nothing is left out.
   */
  const passable = (i: number) => !river[i] || ford[i];
  for (let round = 0; round < MAX_LEVEL + 2; round++) {
    const reached = new Uint8Array(count);
    const queue = [index(SPAWN)];
    reached[queue[0]] = 1;
    while (queue.length > 0) {
      const i = queue.pop() as number;
      for (const step of STEPS) {
        const n = plus(cellAt(i), step);
        if (!inWorld(n)) continue;
        const j = index(n);
        if (reached[j] || !passable(j) || Math.abs(level[j] - level[i]) > 1) continue;
        reached[j] = 1;
        queue.push(j);
      }
    }
    let lowered = false;
    for (let i = 0; i < count; i++) {
      if (!reached[i] && passable(i) && level[i] > 0) {
        level[i]--;
        lowered = true;
      }
    }
    if (!lowered) break;
  }

  /*
   * Nothing stands just behind higher ground. A rock tucked behind a terrace
   * would have the terrace drawn over its foot.
   */
  const behindHigherGround = (p: Position, l: number): boolean => {
    for (let i = 0; i <= 2; i++) {
      for (let j = 0; j <= 2; j++) {
        if ((i || j) && levelAt({ x: p.x + i, y: p.y + j }) > l) return true;
      }
    }
    return false;
  };

  const biome = all.map((p) => biomeAt(p.x, p.y));
  const region = all.map(regionAt);
  const lairs = RING.map((r) => lairOf(r) as Position);
  const nearLair = (p: Position) => lairs.some((l) => Math.abs(l.x - p.x) + Math.abs(l.y - p.y) <= 2);
  const creature: (string | null)[] = new Array(count).fill(null);
  const boss = new Uint8Array(count);
  const obstacle: (Obstacle | null)[] = all.map((p, i) => {
    if (river[i]) return ford[i] ? null : "water";
    const lair = lairs.findIndex((l) => l.x === p.x && l.y === p.y);
    if (lair >= 0) {
      creature[i] = BOSSES[RING[lair]] ?? null;
      boss[i] = 1;
      return "creature";
    }
    if (inClearing(p) || nearLair(p) || behindHigherGround(p, level[i])) return null;
    // Each boss region has its own still liquid: lagoons, acid, lava, ice.
    if (region[i] !== "prairie" && region[i] !== "earth" && region[i] !== "air" && valueNoise(p.x, p.y, 4, 70 + RING.indexOf(region[i])) > 0.72) return "water";
    // Creatures of the region's lineage, here and there, away from the spawn.
    const kin = LINEAGES[region[i]];
    if (kin.length > 0 && Math.hypot(p.x, p.y) > 6 && cellNoise(p.x, p.y, 500) < 0.024) {
      creature[i] = kin[Math.floor(cellNoise(p.x, p.y, 501) * kin.length)];
      return "creature";
    }
    // Rocks gather on the sand and trees in the moss, so a region reads as
    // one kind of place instead of an even sprinkle of both.
    if (cellNoise(p.x, p.y) < ROCK_DENSITY + 0.05 * biome[i].sand) return "rock";
    if (cellNoise(p.x, p.y, 2) < TREE_DENSITY + 0.09 * biome[i].moss) return "tree";
    return null;
  });
  const free = (p: Position) => inWorld(p) && obstacle[index(p)] === null;

  const stair: (Position | null)[] = new Array(count).fill(null);
  const stairs: Position[] = [];

  /** Every cell the spawn can walk to, by the same rule canStep applies. */
  const reachable = (): Uint8Array => {
    const reached = new Uint8Array(count);
    const queue = [index(SPAWN)];
    reached[queue[0]] = 1;
    while (queue.length > 0) {
      const i = queue.pop() as number;
      const here = all[i];
      for (const step of STEPS) {
        const n = plus(here, step);
        if (!free(n)) continue;
        const j = index(n);
        if (reached[j]) continue;
        const up = level[j] - level[i];
        // A stair belongs to the upper cell and points down to the lower one.
        const climbs =
          up === 0 ||
          (up === 1 && stair[j]?.x === -step.x && stair[j]?.y === -step.y) ||
          (up === -1 && stair[i]?.x === step.x && stair[i]?.y === step.y);
        if (!climbs) continue;
        reached[j] = 1;
        queue.push(j);
      }
    }
    return reached;
  };

  /*
   * Stairs. Every place a terrace meets ground one level below is a place a
   * stair could go; they are tried in an order that is random but fixed, and
   * a stair is kept when it joins two terraces not yet joined — which is what
   * guarantees everything can be reached — or, now and then, when it is far
   * from any other, so that a terrace has more than one way up. A stair is
   * carved into the upper cell; one that arrives straight onto flat ground at
   * the top is preferred to one that comes out against a wall.
   */
  const placeStairs = () => {
    stair.fill(null);
    stairs.length = 0;

    // Flat ground you can walk across without climbing, one id per terrace.
    const region = new Int32Array(count).fill(-1);
    let regions = 0;
    for (let start = 0; start < count; start++) {
      if (region[start] !== -1 || obstacle[start] !== null) continue;
      region[start] = regions;
      const queue = [start];
      while (queue.length > 0) {
        const i = queue.pop() as number;
        for (const step of STEPS) {
          const n = plus(all[i], step);
          if (!free(n)) continue;
          const j = index(n);
          if (region[j] !== -1 || level[j] !== level[i]) continue;
          region[j] = regions;
          queue.push(j);
        }
      }
      regions++;
    }
    const joined = Array.from({ length: regions }, (_, r) => r);
    const root = (r: number): number => (joined[r] === r ? r : (joined[r] = root(joined[r])));

    const candidates: { at: Position; dir: Position; order: number }[] = [];
    for (let i = 0; i < count; i++) {
      const at = all[i];
      if (obstacle[i] !== null || ford[i]) continue;
      STEPS.forEach((dir, d) => {
        const up = plus(at, dir);
        if (!free(up) || levelAt(up) !== level[i] + 1) return;
        const landing = plus(up, dir);
        const straight = free(landing) && levelAt(landing) === level[i] + 1;
        candidates.push({ at, dir, order: cellNoise(at.x, at.y, 200 + d) + (straight ? 0 : 1) });
      });
    }
    candidates.sort((a, b) => a.order - b.order);

    const near = (p: Position, gap: number) =>
      stairs.some((s) => Math.abs(s.x - p.x) + Math.abs(s.y - p.y) < gap);
    for (const { at, dir } of candidates) {
      const i = index(at);
      const up = plus(at, dir);
      // One flight per cell, and none running into another.
      if (stair[i] || stair[index(up)] || ford[index(up)]) continue;
      const a = root(region[i]);
      const b = root(region[index(up)]);
      const needed = a !== b;
      if (!needed && !(cellNoise(at.x, at.y, 210) < EXTRA_STAIRS && !near(at, STAIR_SPACING))) continue;
      joined[a] = b;
      stair[index(up)] = minus({ x: 0, y: 0 }, dir);
      stairs.push(up);
    }
  };

  /*
   * Rocks and trees can still close off a pocket of ground that no stair
   * reaches. Each round, a rock or tree standing between the pocket and
   * ground that can be reached, on the same level, is cleared; a pocket with
   * nothing to clear is overgrown with thicket instead. Either way nothing is
   * left drawn as open ground that cannot be walked to.
   */
  for (let round = 0; ; round++) {
    placeStairs();
    const reached = reachable();
    const cut: number[] = [];
    for (let i = 0; i < count; i++) if (obstacle[i] === null && !reached[i]) cut.push(i);
    if (cut.length === 0) break;
    let cleared = false;
    if (round < 8) {
      for (const i of cut) {
        for (const step of STEPS) {
          const wall = plus(all[i], step);
          if (!inWorld(wall)) continue;
          const w = index(wall);
          if (obstacle[w] !== "rock" && obstacle[w] !== "tree" && !(obstacle[w] === "creature" && !boss[w])) continue;
          const beyond = plus(wall, step);
          if (!free(beyond) || !reached[index(beyond)]) continue;
          if (level[w] !== level[i] || level[index(beyond)] !== level[i]) continue;
          obstacle[w] = null;
          creature[w] = null;
          cleared = true;
        }
      }
    }
    if (!cleared) {
      for (const i of cut) obstacle[i] = "thicket";
      placeStairs();
      break;
    }
  }

  // The trodden way on and off each stair: out from its foot, and on from
  // its top.
  const path = new Uint8Array(count);
  for (const at of stairs) {
    const down = stair[index(at)] as Position;
    for (const [from, towards] of [
      [plus(at, down), down],
      [minus(at, down), minus({ x: 0, y: 0 }, down)],
    ] as const) {
      let p = from;
      for (let n = 0; n < 2 && free(p) && !stair[index(p)]; n++) {
        path[index(p)] = 1;
        const next = plus(p, towards);
        if (levelAt(next) !== levelAt(p)) break;
        p = next;
      }
    }
  }

  return all.map((_, i) => ({
    level: level[i],
    obstacle: obstacle[i],
    ford: ford[i],
    stair: stair[i],
    path: path[i] === 1,
    moss: biome[i].moss,
    sand: biome[i].sand,
    region: region[i],
    creature: creature[i],
    boss: boss[i] === 1,
  }));
};

let world: Ground[] | null = null;
const OUTSIDE: Ground = {
  level: 0,
  obstacle: null,
  ford: false,
  stair: null,
  path: false,
  moss: 0,
  sand: 0,
  region: "prairie",
  creature: null,
  boss: false,
};

export const groundAt = (p: Position): Ground =>
  inWorld(p) ? (world ??= survey())[index(p)] : OUTSIDE;

export const levelOf = (p: Position): number => groundAt(p).level;

export const isRock = (p: Position): boolean => groundAt(p).obstacle === "rock";

export const walkable = (p: Position): boolean => inWorld(p) && groundAt(p).obstacle === null;

/**
 * Whether a step between two neighbouring cells is allowed by the ground: on
 * the level, or up and down a stair. A single level without a stair is a wall,
 * and so, always, is a drop of two.
 */
export const canStep = (from: Position, to: Position): boolean => {
  const a = levelOf(from);
  const b = levelOf(to);
  if (a === b) return true;
  if (Math.abs(a - b) !== 1) return false;
  const [low, high] = a < b ? [from, to] : [to, from];
  const flight = groundAt(high).stair;
  return !!flight && high.x + flight.x === low.x && high.y + flight.y === low.y;
};

/** How high someone standing in the middle of a cell stands: halfway down, on a stair. */
export const standingHeight = (p: Position): number => {
  const g = groundAt(p);
  return g.level - (g.stair ? 0.5 : 0);
};

/**
 * How high the ground is under a point that may sit between cells — a walker
 * mid-step. It runs straight between the middles of two cells, so a flight of
 * stairs is climbed at an even pace rather than jumped.
 */
export const heightAt = (p: Position): number => {
  const x0 = Math.floor(p.x);
  const y0 = Math.floor(p.y);
  const tx = p.x - x0;
  const ty = p.y - y0;
  const h = (x: number, y: number) => standingHeight({ x, y });
  return (
    h(x0, y0) * (1 - tx) * (1 - ty) +
    h(x0 + 1, y0) * tx * (1 - ty) +
    h(x0, y0 + 1) * (1 - tx) * ty +
    h(x0 + 1, y0 + 1) * tx * ty
  );
};

/** The four cells you can step to. Movement is never diagonal, as in a fight. */
export const neighbours = (p: Position): Position[] =>
  STEPS.map((s) => plus(p, s)).filter((n) => walkable(n) && canStep(p, n));

const key = (p: Position) => `${p.x},${p.y}`;

/**
 * The walk from one cell to another, or null when there is none — every step
 * after the one you are standing on, so the caller can hand it straight to a
 * walk cycle.
 *
 * A breadth-first search rather than anything cleverer: the world is a few
 * thousand cells and this runs once per click, not once per frame. An A* here
 * would buy nothing measurable and cost the reader the one thing this has
 * going for it, which is that it is obviously correct.
 */
export const findPath = (from: Position, to: Position): Position[] | null => {
  if (!walkable(to) || key(from) === key(to)) return null;

  const cameFrom = new Map<string, Position | null>([[key(from), null]]);
  const queue: Position[] = [from];

  while (queue.length > 0) {
    const current = queue.shift() as Position;
    if (key(current) === key(to)) {
      const path: Position[] = [];
      let step: Position | undefined = current;
      while (step && key(step) !== key(from)) {
        path.unshift(step);
        step = cameFrom.get(key(step)) ?? undefined;
      }
      return path;
    }
    for (const next of neighbours(current)) {
      if (cameFrom.has(key(next))) continue;
      cameFrom.set(key(next), current);
      queue.push(next);
    }
  }

  return null;
};

/** Where you arrive: the middle of the clearing. */
export const SPAWN: Position = { x: 0, y: 0 };
