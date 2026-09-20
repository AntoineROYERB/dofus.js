import { Position } from "../types/game";

/**
 * The geometry a torn cell is cut along. It lives here rather than in the
 * layer that draws it because one claim in it is load-bearing and not obvious:
 * which side of a diamond is shared with which neighbour. Get it wrong and the
 * seam between two craters is drawn while an outer edge is left open, which
 * looks like a rendering glitch rather than like a mistake in a table.
 */

/** A cell's four corners, clockwise from the top. */
export const diamondCorners = (
  center: Position,
  tileSize: { width: number; height: number }
): Position[] => [
  { x: center.x, y: center.y - tileSize.height / 2 },
  { x: center.x + tileSize.width / 2, y: center.y },
  { x: center.x, y: center.y + tileSize.height / 2 },
  { x: center.x - tileSize.width / 2, y: center.y },
];

/**
 * The four sides, as indices into `diamondCorners`, each with the neighbour it
 * faces. In this projection x+1 lies to the lower right and y+1 to the lower
 * left, so the side running from the right corner to the bottom one is the one
 * shared with x+1 — see tearSides.test.ts, which checks that against the
 * projection itself rather than against this comment.
 */
export const TEAR_SIDES = [
  { from: 0, to: 1, dx: 0, dy: -1 },
  { from: 1, to: 2, dx: 1, dy: 0 },
  { from: 2, to: 3, dx: 0, dy: 1 },
  { from: 3, to: 0, dx: -1, dy: 0 },
] as const;
