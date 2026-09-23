import { Position } from "../types/game";

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

/** How much of the ground is taken up by something you have to walk around. */
const ROCK_DENSITY = 0.11;

export const inWorld = (p: Position): boolean =>
  Math.abs(p.x) <= WORLD_RADIUS && Math.abs(p.y) <= WORLD_RADIUS;

/**
 * Scenery, from the cell's own coordinates rather than from a stored map.
 *
 * A world is mostly empty, and an empty world is the one thing that cannot
 * answer the question being asked: with nothing to pass, nothing to round and
 * nothing to lose sight of, a camera holding you in the middle of a blank
 * sheet looks exactly like a camera that is broken. Scenery is what makes the
 * paper move visibly.
 *
 * Deriving it from a hash rather than storing it keeps the world free to be
 * any size without shipping a byte per cell, and — because the same cell
 * always hashes the same way — keeps it still: a rock does not wander when
 * the board re-renders, and it is in the same place after a reload, so the
 * place stays a place. It is a scatter, not a design; somewhere to walk
 * around, not somewhere to go.
 */
const hash = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2b3f5c1d);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
};

export const isRock = (p: Position): boolean =>
  inWorld(p) &&
  Math.abs(p.x) + Math.abs(p.y) > CLEARING &&
  hash(p.x, p.y) < ROCK_DENSITY;

export const walkable = (p: Position): boolean => inWorld(p) && !isRock(p);

/** The four cells you can step to. Movement is never diagonal, as in a fight. */
export const neighbours = (p: Position): Position[] =>
  [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].filter(walkable);

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
