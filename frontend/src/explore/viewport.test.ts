import { isoToScreen } from "../utils/isoUtils";
import { visibleBounds, visibleCells } from "./viewport";
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
