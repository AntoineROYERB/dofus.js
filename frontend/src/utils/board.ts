import { Position } from "../types/game";

/** Matches GridRadius on the server: the board is a diamond of this radius. */
export const GRID_RADIUS = 7;

export const inGrid = (p: Position): boolean =>
  Math.abs(p.x) + Math.abs(p.y) <= GRID_RADIUS;

export const distance = (a: Position, b: Position): number =>
  Math.abs(b.x - a.x) + Math.abs(b.y - a.y);

const key = (p: Position) => `${p.x},${p.y}`;

/** The four orthogonal cells on the board. Movement is never diagonal. */
export const neighbours = (p: Position): Position[] =>
  [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].filter(inGrid);

/**
 * Every cell reachable with the movement points available, and what each one
 * costs. This mirrors Reachable on the server, so the highlighted range is
 * exactly the range the server will accept — a Manhattan radius would promise
 * cells that cover makes unreachable.
 */
export const reachable = (
  from: Position,
  movementPoints: number,
  blocked: (p: Position) => boolean
): Map<string, number> => {
  const reached = new Map<string, number>([[key(from), 0]]);
  const queue: Position[] = [from];

  while (queue.length > 0) {
    const current = queue.shift() as Position;
    const cost = reached.get(key(current)) ?? 0;
    if (cost === movementPoints) continue;

    for (const next of neighbours(current)) {
      if (blocked(next) || reached.has(key(next))) continue;
      reached.set(key(next), cost + 1);
      queue.push(next);
    }
  }
  reached.delete(key(from));
  return reached;
};

/**
 * The walk from one cell to another around whatever is in the way, or null
 * when there is none. Mirrors FindPath on the server.
 */
export const findPath = (
  from: Position,
  to: Position,
  blocked: (p: Position) => boolean
): Position[] | null => {
  if (key(from) === key(to)) return [];
  if (!inGrid(to) || blocked(to)) return null;

  const cameFrom = new Map<string, Position>();
  const cost = new Map<string, number>([[key(from), 0]]);
  // Small boards: a sorted array is a perfectly good priority queue here.
  const open: { pos: Position; priority: number }[] = [
    { pos: from, priority: distance(from, to) },
  ];

  while (open.length > 0) {
    open.sort((a, b) => a.priority - b.priority);
    const current = (open.shift() as { pos: Position }).pos;

    if (key(current) === key(to)) {
      const path: Position[] = [];
      let at = current;
      while (key(at) !== key(from)) {
        path.push(at);
        at = cameFrom.get(key(at)) as Position;
      }
      return path.reverse();
    }

    for (const next of neighbours(current)) {
      if (blocked(next)) continue;
      const stepCost = (cost.get(key(current)) ?? 0) + 1;
      const known = cost.get(key(next));
      if (known !== undefined && stepCost >= known) continue;
      cost.set(key(next), stepCost);
      cameFrom.set(key(next), current);
      open.push({ pos: next, priority: stepCost + distance(next, to) });
    }
  }
  return null;
};

/**
 * Whether the straight line between two cells is clear. Mirrors
 * HasLineOfSight on the server, endpoints included: a caster is not stopped by
 * its own square and a target does not shield itself.
 */
export const hasLineOfSight = (
  from: Position,
  to: Position,
  blocked: (p: Position) => boolean
): boolean => {
  if (key(from) === key(to)) return true;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  const seen = new Set<string>();

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cell = {
      x: from.x + Math.sign(dx) * Math.round(Math.abs(dx) * t),
      y: from.y + Math.sign(dy) * Math.round(Math.abs(dy) * t),
    };
    const k = key(cell);
    if (k === key(from) || k === key(to) || seen.has(k)) continue;
    seen.add(k);
    if (blocked(cell)) return false;
  }
  return true;
};

/** Builds the "this cell is in the way" test from the board's contents. */
export const blockedBy = (
  obstacles: Position[] | null | undefined,
  occupied: Position[]
): ((p: Position) => boolean) => {
  const taken = new Set<string>([
    ...(obstacles ?? []).map(key),
    ...occupied.map(key),
  ]);
  return (p: Position) => taken.has(key(p));
};
