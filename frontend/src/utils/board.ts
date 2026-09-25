import { Position } from "../types/game";
import { GroundCell, TerrainCell } from "../types/message";
import { isSolidTerrain } from "./terrain";
import { groundBlocksSight, isSolidGround } from "./ground";

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

/** What a step onto a cell costs, in movement points: one, unless the ground says otherwise. */
export type StepCost = (p: Position) => number;
const unitCost: StepCost = () => 1;

/**
 * Every cell reachable with the movement points available, and what the
 * cheapest walk to each one costs. This mirrors Reachable on the server, so
 * the highlighted range is exactly the range the server will accept — a
 * Manhattan radius would promise cells that cover makes unreachable, and a
 * count of steps would promise water it costs two points to wade.
 */
export const reachable = (
  from: Position,
  movementPoints: number,
  blocked: (p: Position) => boolean,
  cost: StepCost = unitCost
): Map<string, number> => {
  const reached = new Map<string, number>([[key(from), 0]]);
  const open: { pos: Position; spent: number }[] = [{ pos: from, spent: 0 }];

  while (open.length > 0) {
    open.sort((a, b) => a.spent - b.spent);
    const { pos: current, spent } = open.shift() as { pos: Position; spent: number };
    if (spent > (reached.get(key(current)) ?? Infinity)) continue;

    for (const next of neighbours(current)) {
      if (blocked(next)) continue;
      const total = spent + cost(next);
      if (total > movementPoints) continue;
      const known = reached.get(key(next));
      if (known !== undefined && known <= total) continue;
      reached.set(key(next), total);
      open.push({ pos: next, spent: total });
    }
  }
  reached.delete(key(from));
  return reached;
};

/** What walking a path costs, step by step. */
export const pathCost = (path: Position[], cost: StepCost = unitCost): number =>
  path.reduce((total, p) => total + cost(p), 0);

/**
 * The cheapest walk from one cell to another around whatever is in the way,
 * or null when there is none. Mirrors FindPath on the server.
 */
export const findPath = (
  from: Position,
  to: Position,
  blocked: (p: Position) => boolean,
  stepCost: StepCost = unitCost
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
      const spent = (cost.get(key(current)) ?? 0) + stepCost(next);
      const known = cost.get(key(next));
      if (known !== undefined && spent >= known) continue;
      cost.set(key(next), spent);
      cameFrom.set(key(next), current);
      open.push({ pos: next, priority: spent + distance(next, to) });
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

/**
 * Builds the "a walker cannot go here" test from the board's contents: cover,
 * craters and fissures, rock and lava, and everyone standing on it.
 */
export const blockedBy = (
  obstacles: Position[] | null | undefined,
  occupied: Position[],
  terrain?: TerrainCell[] | null,
  ground?: GroundCell[] | null
): ((p: Position) => boolean) => {
  const taken = new Set<string>([
    ...(obstacles ?? []).map(key),
    ...occupied.map(key),
    ...(terrain ?? [])
      .filter((cell) => isSolidTerrain(cell.kind))
      .map((cell) => key(cell.position)),
    ...(ground ?? [])
      .filter((cell) => isSolidGround(cell.kind))
      .map((cell) => key(cell.position)),
  ]);
  return (p: Position) => taken.has(key(p));
};

/**
 * Builds the "nothing is seen past this" test: cover, smoke, rock, and
 * everyone standing on the board. Craters, fissures and lava are low, not
 * walls.
 */
export const sightBlockedBy = (
  obstacles: Position[] | null | undefined,
  occupied: Position[],
  terrain?: TerrainCell[] | null,
  ground?: GroundCell[] | null
): ((p: Position) => boolean) => {
  const taken = new Set<string>([
    ...(obstacles ?? []).map(key),
    ...occupied.map(key),
    ...(terrain ?? [])
      .filter((cell) => cell.kind === "smoke")
      .map((cell) => key(cell.position)),
    ...(ground ?? [])
      .filter((cell) => groundBlocksSight(cell.kind))
      .map((cell) => key(cell.position)),
  ]);
  return (p: Position) => taken.has(key(p));
};
