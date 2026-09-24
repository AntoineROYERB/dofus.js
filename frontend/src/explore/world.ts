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
export const WORLD_RADIUS = 24;

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
 * walking refuses to go, and a slope is drawn exactly where it lets you climb.
 */
export type Obstacle = "rock" | "tree" | "water";

export type Ground = {
  /** Terrace height, 0 to MAX_LEVEL. One level is a step; two is a cliff. */
  level: number;
  obstacle: Obstacle | null;
  /** A shallow crossing: river drawn, stones to step on, and walkable. */
  ford: boolean;
  /** How much of the cell is moss and how much sand, each 0 to 1. */
  moss: number;
  sand: number;
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

/**
 * Moss and sand as smooth fields over the plane, fractional coordinates and
 * all, so the wash that paints them can be sampled finer than the grid.
 */
export const biomeAt = (x: number, y: number): { moss: number; sand: number } => {
  const n = fbm(x, y, 11);
  return { moss: smoothstep((n - 0.52) / 0.12), sand: smoothstep((0.44 - n) / 0.12) };
};

const rawLevel = (p: Position): number => {
  if (inClearing(p)) return 0;
  const lift = fbm(p.x, p.y, 3) + Math.min(Math.hypot(p.x, p.y), 9) * 0.03 - 0.08;
  const level = Math.max(0, Math.min(MAX_LEVEL, Math.floor((lift - 0.38) * 6)));
  // The banks come down to the water gently: a cliff straight into the river
  // would leave the fords with no way down to them.
  return Math.min(level, Math.floor(riverDistance(p)));
};

/*
 * Nothing stands just behind higher ground. A rock tucked behind a terrace
 * would have the terrace drawn over its foot, and working out that overlap
 * every frame is a price paid for scenery nobody would miss.
 */
const behindHigherGround = (p: Position, level: number): boolean => {
  for (let i = 0; i <= 2; i++) {
    for (let j = 0; j <= 2; j++) {
      if ((i || j) && rawLevel({ x: p.x + i, y: p.y + j }) > level) return true;
    }
  }
  return false;
};

const ROCK_DENSITY = 0.07;
const TREE_DENSITY = 0.025;

const survey = (p: Position): Ground => {
  const { moss, sand } = biomeAt(p.x, p.y);
  const river = riverDistance(p) < RIVER_HALF_WIDTH;
  const ford = river && (((p.x % FORD_EVERY) + FORD_EVERY) % FORD_EVERY) === 0;
  const level = river ? 0 : rawLevel(p);

  let obstacle: Obstacle | null = null;
  if (river) {
    if (!ford) obstacle = "water";
  } else if (!inClearing(p) && !behindHigherGround(p, level)) {
    // Rocks gather on the sand and trees in the moss, so a region reads as
    // one kind of place instead of an even sprinkle of both.
    if (cellNoise(p.x, p.y) < ROCK_DENSITY + 0.05 * sand) obstacle = "rock";
    else if (cellNoise(p.x, p.y, 2) < TREE_DENSITY + 0.09 * moss) obstacle = "tree";
  }
  return { level, obstacle, ford, moss, sand };
};

/*
 * The world is finite and small, so every cell is surveyed once and kept:
 * the drawing asks about a thousand cells a frame, and the path search asks
 * about the same cells over and over.
 */
const SIDE = WORLD_RADIUS * 2 + 1;
const surveyed: (Ground | undefined)[] = new Array(SIDE * SIDE);
const OUTSIDE: Ground = { level: 0, obstacle: null, ford: false, moss: 0, sand: 0 };

export const groundAt = (p: Position): Ground => {
  if (!inWorld(p)) return OUTSIDE;
  const i = (p.x + WORLD_RADIUS) * SIDE + (p.y + WORLD_RADIUS);
  return (surveyed[i] ??= survey(p));
};

export const levelOf = (p: Position): number => groundAt(p).level;

export const isRock = (p: Position): boolean => groundAt(p).obstacle === "rock";

export const walkable = (p: Position): boolean => inWorld(p) && groundAt(p).obstacle === null;

/**
 * How high the ground is under a point that may sit between cells — a walker
 * mid-step. It holds the level of the cell being left and climbs near the
 * edge, so a step up reads as a step and not as a slow float.
 */
export const heightAt = (p: Position): number => {
  const x0 = Math.floor(p.x);
  const y0 = Math.floor(p.y);
  const tx = smoothstep(p.x - x0);
  const ty = smoothstep(p.y - y0);
  const l = (x: number, y: number) => levelOf({ x, y });
  return (
    l(x0, y0) * (1 - tx) * (1 - ty) +
    l(x0 + 1, y0) * tx * (1 - ty) +
    l(x0, y0 + 1) * (1 - tx) * ty +
    l(x0 + 1, y0 + 1) * tx * ty
  );
};

/**
 * The four cells you can step to. Movement is never diagonal, as in a fight,
 * and a terrace can be climbed one level at a time but not two.
 */
export const neighbours = (p: Position): Position[] => {
  const here = levelOf(p);
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].filter((n) => walkable(n) && Math.abs(levelOf(n) - here) <= 1);
};

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
