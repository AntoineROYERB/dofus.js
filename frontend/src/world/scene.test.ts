import { createHash } from "crypto";
import { GRID_RADIUS } from "../utils/board";
import { shippedWorld } from "../explore/shippedWorld.testing";
import { paintBackdrop } from "./backdrop";
import { onBoard, wallFoot } from "./compose";
import { DECOR_SIZE, decorBox, KNOWN_LOOKS, overlapsBoard, planScene } from "./layout";
import { Mat } from "./materials";
import { newStillLayers, paintStill } from "./paint";
import { sceneSeed } from "./seed";
import { artToCell, CELL_H, CELL_W, cellToArt, glyphGrid, glyphsPerCell, MIN_GLYPH } from "./view";

const world = shippedWorld();
const ground = [
  { position: { x: 1, y: 2 }, kind: "tall_grass" },
  { position: { x: -3, y: 0 }, kind: "rock" },
];

const digest = (palette: string, seed: number) => {
  const layout = planScene(palette, seed);
  const still = newStillLayers();
  paintStill(still, { layout, palette: world.palettes[palette], palettes: world.palettes, ground, obstacles: [{ x: 0, y: 3 }], seed });
  const h = createHash("sha1");
  for (const l of [still.base, still.baseAux, still.foliage, still.foliageAux]) h.update(l.data);
  h.update(paintBackdrop(palette, world.palettes[palette], seed).layer.data);
  return h.digest("hex");
};

describe("the scenery's seed", () => {
  it("is the same for the same fight, whatever order the ground is listed in", () => {
    expect(sceneSeed("prairie", "room-1", ground)).toBe(sceneSeed("prairie", "room-1", [...ground].reverse()));
  });

  it("changes with the room, the island and the deal", () => {
    const base = sceneSeed("prairie", "room-1", ground);
    expect(sceneSeed("prairie", "room-2", ground)).not.toBe(base);
    expect(sceneSeed("earth", "room-1", ground)).not.toBe(base);
    expect(sceneSeed("prairie", "room-1", ground.slice(1))).not.toBe(base);
  });
});

describe("scenery", () => {
  it("is drawn every shipped island's look", () => {
    for (const island of world.islands) expect(KNOWN_LOOKS).toContain(island.palette);
  });

  it.each(KNOWN_LOOKS)("paints the same %s scene twice from the same seed", (look) => {
    expect(digest(look, 1234)).toBe(digest(look, 1234));
  });

  it("paints another clearing from another seed", () => {
    expect(digest("prairie", 1234)).not.toBe(digest("prairie", 99));
  });

  it("keeps the board flat at level 0", () => {
    const layout = planScene("prairie", 7);
    for (let x = -GRID_RADIUS; x <= GRID_RADIUS; x++) {
      for (let y = -GRID_RADIUS; y <= GRID_RADIUS; y++) {
        if (Math.abs(x) + Math.abs(y) <= GRID_RADIUS) expect(layout.levelOf({ x, y })).toBe(0);
      }
    }
  });

  it.each(KNOWN_LOOKS)("never stands anything tall over a playable cell on %s", (look) => {
    for (let seed = 1; seed < 40; seed++) {
      const layout = planScene(look, seed * 7919);
      for (const d of layout.decor) {
        const ring = Math.abs(d.cell.x) + Math.abs(d.cell.y);
        // Nothing at all in the first ring round the board.
        expect(ring).toBeGreaterThan(GRID_RADIUS + 1);
        if (DECOR_SIZE[d.kind].tall) {
          expect(overlapsBoard(decorBox(d, layout.levelOf(d.cell)))).toBe(false);
        }
      }
    }
  });

  it("keeps the land in front of the board low, but for a pond's bank", () => {
    for (let seed = 1; seed < 40; seed++) {
      const layout = planScene("prairie", seed);
      const bank = (p: { x: number; y: number }) =>
        [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([dx, dy]) => layout.ponds.some((pond) => pond.cells.has(`${p.x + dx},${p.y + dy}`)));
      for (const d of layout.decor) {
        if (d.cell.x + d.cell.y > GRID_RADIUS && !bank(d.cell)) expect(DECOR_SIZE[d.kind].tall).toBe(false);
      }
    }
  });

  it("refuses a box that reaches the board, and accepts one clear of it", () => {
    expect(overlapsBoard({ x: -5, y: -5, w: 10, h: 10 })).toBe(true);
    expect(overlapsBoard({ x: -300, y: -40, w: 30, h: 30 })).toBe(false);
  });

  it("paints the board's cover standing on its cell", () => {
    const layout = planScene("earth", 3);
    const still = newStillLayers();
    paintStill(still, { layout, palette: world.palettes.earth, palettes: world.palettes, ground: [], obstacles: [{ x: 2, y: -1 }], seed: 3 });
    const at = cellToArt(2, -1);
    expect([Mat.Rock, Mat.Outline]).toContain(still.base.mat(at.x, at.y - 4));
  });
});

describe("the backdrop", () => {
  it("keeps its foot two rings behind the board's back edges, wherever the view's top is", () => {
    for (const top of [-300, -120, -56, 0]) {
      for (let ax = -220; ax <= 220; ax += 3) {
        const foot = wallFoot(ax, top);
        // Every art pixel at or above the foot is off the board, with a ring to spare.
        expect(onBoard(ax, foot, 1)).toBe(false);
      }
    }
  });
});

describe("the view", () => {
  it("puts a cell's centre back on the same cell", () => {
    for (let x = -7; x <= 7; x++) for (let y = -7; y <= 7; y++) {
      const a = cellToArt(x, y);
      expect(artToCell(a.x, a.y)).toEqual({ x, y });
      expect(artToCell(a.x + CELL_W / 4 - 1, a.y + CELL_H / 4 - 1)).toEqual({ x, y });
    }
  });

  it("draws about twelve glyphs a cell on a phone and twenty on a desk", () => {
    expect(glyphsPerCell(740, 360)).toBe(12);
    expect(glyphsPerCell(1440, 900)).toBe(20);
    const phone = glyphGrid({ width: 740, height: 360, dpr: 3, tile: 77, scale: 1, pan: { x: 0, y: 0 } });
    expect(phone.gw).toBe(Math.round((77 * 3) / 12));
    expect(Number.isInteger(phone.gh)).toBe(true);
  });

  it("never draws a glyph narrower than it can be read", () => {
    const desk = glyphGrid({ width: 1024, height: 768, dpr: 2, tile: 50, scale: 1, pan: { x: 0, y: 0 } });
    expect(desk.gw / 2).toBeGreaterThanOrEqual(MIN_GLYPH);
  });

  it("follows the board's pan and scale exactly", () => {
    const g = glyphGrid({ width: 800, height: 600, dpr: 1, tile: 96, scale: 2, pan: { x: 40, y: -20 } });
    // The container's centre, moved by the pan, is art (0, 0).
    expect(g.left + ((800 / 2 + 40) / g.unit)).toBeCloseTo(0);
    expect(g.top + ((600 / 2 - 20) / g.unit)).toBeCloseTo(0);
    expect(g.unit).toBeCloseTo((96 * 2) / CELL_W);
  });
});
