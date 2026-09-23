import { Position } from "../types/game";
import { screenToIso } from "../utils/isoUtils";
import { WORLD_RADIUS } from "./world";

/**
 * Which cells are worth drawing.
 *
 * The fight's board draws all of itself, and can: it is a hundred-odd cells
 * sized to fit the screen, so every one of them is on it. A world is the
 * other way round — it is deliberately larger than the screen, and drawing it
 * whole would put a few thousand elements in the document to look at a few
 * dozen. The camera is what makes this necessary and also what makes it easy:
 * the pan says exactly which part of the paper is under the viewport.
 *
 * The four corners are enough. In this projection a screen rectangle maps to
 * a diamond in cell space, and the bounding box of the corners' cells
 * contains that diamond — so the box over-covers, never under-covers, which
 * is the only direction that is safe to be wrong in. The margin is for the
 * rest: a cell is drawn from its centre, so one straddling the edge belongs
 * on screen while its centre is off it, and scenery stands taller than the
 * cell it sits on.
 */
const MARGIN = 3;

export const visibleBounds = (
  size: { width: number; height: number },
  tile: { width: number; height: number },
  pan: Position
): { minX: number; maxX: number; minY: number; maxY: number } => {
  const centreX = size.width / 2;
  const centreY = size.height / 2;
  const corners: Position[] = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: 0, y: size.height },
    { x: size.width, y: size.height },
  ].map((c) =>
    // The layer is translated by the pan, so the paper under a screen point
    // is that point taken back the other way.
    screenToIso(c.x - pan.x, c.y - pan.y, tile, centreX, centreY)
  );

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    minX: Math.max(-WORLD_RADIUS, Math.min(...xs) - MARGIN),
    maxX: Math.min(WORLD_RADIUS, Math.max(...xs) + MARGIN),
    minY: Math.max(-WORLD_RADIUS, Math.min(...ys) - MARGIN),
    maxY: Math.min(WORLD_RADIUS, Math.max(...ys) + MARGIN),
  };
};

/**
 * The visible cells, back to front. Nothing in this projection overlaps
 * anything with a smaller x + y, so that sum is the whole of the draw order —
 * the same one the fight's board sorts by.
 */
export const visibleCells = (
  size: { width: number; height: number },
  tile: { width: number; height: number },
  pan: Position
): Position[] => {
  if (!size.width || !size.height) return [];
  const { minX, maxX, minY, maxY } = visibleBounds(size, tile, pan);
  const cells: Position[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) cells.push({ x, y });
  }
  return cells.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x || a.y - b.y);
};
