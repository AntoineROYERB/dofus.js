import { Position } from "../types/game";
import { isoToScreen } from "../utils/isoUtils";
import {
  inFrontOf,
  resolveWorldZoom,
  visibleBounds,
  visibleCells,
  WORLD_ZOOM,
} from "./viewport";
import { WORLD_RADIUS } from "./world";

const size = { width: 800, height: 500 };
const tile = { width: 120, height: 60 };

describe("visibleCells", () => {
  it("draws a screenful, not a world", () => {
    const cells = visibleCells(size, tile, { x: 0, y: 0 });
    const whole = (WORLD_RADIUS * 2 + 1) ** 2;
    expect(cells.length).toBeLessThan(whole / 4);
    expect(cells.length).toBeGreaterThan(50);
  });

  /*
   * The claim the culling rests on: the box over-covers. Every cell whose
   * drawn diamond touches the viewport has to be in the list, or the player
   * watches the ground appear at the edge of the screen as they walk.
   */
  it("keeps every cell that is actually on screen", () => {
    for (const pan of [
      { x: 0, y: 0 },
      { x: -340, y: 220 },
      { x: 500, y: -180 },
    ]) {
      const kept = new Set(
        visibleCells(size, tile, pan).map((c) => `${c.x},${c.y}`)
      );
      for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
        for (let y = -WORLD_RADIUS; y <= WORLD_RADIUS; y++) {
          const at = isoToScreen(x, y, tile, size.width / 2, size.height / 2);
          const onScreen =
            at.x + pan.x > -tile.width / 2 &&
            at.x + pan.x < size.width + tile.width / 2 &&
            at.y + pan.y > -tile.height / 2 &&
            at.y + pan.y < size.height + tile.height / 2;
          if (onScreen) expect(kept.has(`${x},${y}`)).toBe(true);
        }
      }
    }
  });

  it("never leaves the world", () => {
    const cells = visibleCells(size, tile, { x: 4000, y: 4000 });
    for (const c of cells) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(WORLD_RADIUS);
      expect(Math.abs(c.y)).toBeLessThanOrEqual(WORLD_RADIUS);
    }
  });

  it("is ordered back to front", () => {
    const cells = visibleCells(size, tile, { x: 0, y: 0 });
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].x + cells[i].y).toBeGreaterThanOrEqual(
        cells[i - 1].x + cells[i - 1].y
      );
    }
  });

  it("has nothing to draw before the container has been measured", () => {
    expect(visibleCells({ width: 0, height: 0 }, tile, { x: 0, y: 0 })).toEqual([]);
  });

  it("follows the pan", () => {
    const still = visibleBounds(size, tile, { x: 0, y: 0 });
    const panned = visibleBounds(size, tile, { x: -600, y: 0 });
    // Paper pulled to the left brings cells further along x and y into view.
    expect(panned.maxX).toBeGreaterThan(still.maxX);
    expect(panned.minY).toBeLessThan(still.minY);
  });
});

describe("inFrontOf", () => {
  it("puts the row behind you behind, and the row ahead ahead", () => {
    const at = { x: 0, y: 0 };
    expect(inFrontOf({ x: -1, y: 0 }, at)).toBe(false);
    expect(inFrontOf({ x: 1, y: -1 }, at)).toBe(false); // same depth, beside you
    expect(inFrontOf({ x: 1, y: 0 }, at)).toBe(true);
    expect(inFrontOf({ x: 0, y: 1 }, at)).toBe(true);
  });

  /*
   * The property the rounding exists for. A cell's ground is opaque, so a cell
   * drawn after the walker paints over whatever of the walker it covers — and
   * the walker's feet sit at its own projected point. So at no moment of a
   * step may a cell be both drawn in front AND have the feet inside it.
   */
  it("never draws ground over the feet standing on it", () => {
    const tile = { width: 160, height: 80 };
    const steps: [Position, Position][] = [
      [{ x: 0, y: 0 }, { x: 0, y: 1 }],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 3, y: -2 }, { x: 2, y: -2 }],
      [{ x: -4, y: 5 }, { x: -4, y: 4 }],
    ];

    for (const [from, to] of steps) {
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const at = {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        };
        const feet = isoToScreen(at.x, at.y, tile, 0, 0);
        for (const cell of [from, to]) {
          const centre = isoToScreen(cell.x, cell.y, tile, 0, 0);
          const insideDiamond =
            Math.abs(feet.x - centre.x) / (tile.width / 2) +
              Math.abs(feet.y - centre.y) / (tile.height / 2) <
            0.999;
          if (insideDiamond) expect(inFrontOf(cell, at)).toBe(false);
        }
      }
    }
  });
});

describe("resolveWorldZoom", () => {
  it("draws the world at a fight's own scale unless asked otherwise", () => {
    expect(resolveWorldZoom("")).toBe(WORLD_ZOOM);
    expect(resolveWorldZoom("?camera=1.6")).toBe(WORLD_ZOOM);
  });

  it("opens out or pulls in on request", () => {
    expect(resolveWorldZoom("?zoom=0.8")).toBe(0.8);
    expect(resolveWorldZoom("?zoom=2")).toBe(2);
  });

  it("ignores a zoom nobody could play at", () => {
    expect(resolveWorldZoom("?zoom=0.01")).toBe(WORLD_ZOOM);
    expect(resolveWorldZoom("?zoom=40")).toBe(WORLD_ZOOM);
    expect(resolveWorldZoom("?zoom=wide")).toBe(WORLD_ZOOM);
  });
});
