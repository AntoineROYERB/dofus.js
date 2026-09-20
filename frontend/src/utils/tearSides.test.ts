import { TEAR_SIDES, diamondCorners } from "./tearSides";
import { isoToScreen } from "./isoUtils";

const TILE = { width: 84, height: 42 };
const CENTER = { x: 400, y: 300 };

const cornersOf = (x: number, y: number) =>
  diamondCorners(isoToScreen(x, y, TILE, CENTER.x, CENTER.y), TILE);

const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

describe("the sides a tear is cut along", () => {
  /*
   * Each side claims a neighbour. The claim is true only if that side is the
   * very edge the two cells share, which the projection can be asked about
   * directly: the midpoint of the side must be the midpoint of the segment
   * between the two cell centres.
   */
  it.each(TEAR_SIDES.map((side) => [`${side.dx},${side.dy}`, side] as const))(
    "the side facing %s is the one shared with that neighbour",
    (_label, side) => {
      for (const [x, y] of [
        [0, 0],
        [2, -3],
        [-4, 1],
      ]) {
        const corners = cornersOf(x, y);
        const edge = midpoint(corners[side.from], corners[side.to]);
        const between = midpoint(
          isoToScreen(x, y, TILE, CENTER.x, CENTER.y),
          isoToScreen(x + side.dx, y + side.dy, TILE, CENTER.x, CENTER.y)
        );
        expect(edge.x).toBeCloseTo(between.x);
        expect(edge.y).toBeCloseTo(between.y);
      }
    }
  );

  it("walks the whole outline, each side starting where the last one ended", () => {
    TEAR_SIDES.forEach((side, i) => {
      expect(side.from).toBe(i);
      expect(side.to).toBe((i + 1) % 4);
    });
  });

  it("faces four different neighbours", () => {
    const facing = new Set(TEAR_SIDES.map((side) => `${side.dx},${side.dy}`));
    expect(facing.size).toBe(4);
  });
});
