import { cellOf, glyphFor, lightAt, LIFT_BG, LIFT_FG, Sample, winner } from "./ascii";
import { GLYPHS, Mat, indexOfGlyph, materialOf, materialTable, runIndices, GLYPH_RUNS } from "./materials";

const s = (mat: number, c: [number, number, number] = [100, 100, 100]): Sample => ({ mat, c, under: [40, 40, 40] });

describe("material priority", () => {
  it("keeps the most important material of a cell: the eye over the hood over the grass", () => {
    expect(winner([s(Mat.Grass), s(Mat.ClothDark), s(Mat.Eye), s(Mat.Grass)])).toBe(Mat.Eye);
    expect(winner([s(Mat.Grass), s(Mat.Cloth), s(Mat.Grass)])).toBe(Mat.Cloth);
  });

  it("lets a thin outline win only a cell it half fills", () => {
    const cloth = [s(Mat.Cloth), s(Mat.Cloth), s(Mat.Cloth), s(Mat.Cloth)];
    expect(winner([...cloth, s(Mat.Outline), s(Mat.Grass)])).toBe(Mat.Cloth);
    expect(winner([s(Mat.Outline), s(Mat.Outline), s(Mat.Outline), s(Mat.Cloth), s(Mat.Grass), s(Mat.Grass)])).toBe(Mat.Outline);
  });

  it("never lets a shadow win a cell: it only darkens", () => {
    expect(materialOf(Mat.Shadow).priority).toBe(0);
  });

  it("keeps the first of two equal materials", () => {
    expect(winner([s(Mat.Leaf), s(Mat.Pine)])).toBe(Mat.Leaf);
  });
});

describe("glyphs", () => {
  it("lists every material's glyphs once in the atlas, the blank first", () => {
    expect(GLYPHS[0]).toBe(" ");
    expect(new Set(GLYPHS).size).toBe(GLYPHS.length);
    for (let m = 0; m < 64; m++) for (const ch of materialOf(m).glyphs) expect(GLYPHS).toContain(ch);
    expect(GLYPHS.length).toBeLessThan(256);
  });

  it("gives the GPU the same glyph runs the CPU reads", () => {
    const table = materialTable();
    const runs = runIndices();
    for (let m = 0; m < 64; m++) {
      const start = table[m * 4 + 1];
      const count = table[m * 4 + 2];
      expect([...runs.slice(start, start + count)].map((i) => GLYPHS[i]).join("")).toBe(materialOf(m).glyphs);
    }
    expect(runs.length).toBe(GLYPH_RUNS.length);
  });

  it("picks a lit material's glyph by its light, darkest first", () => {
    const dark = glyphFor(Mat.Leaf, 0.05, 0, 0, 0, false);
    const bright = glyphFor(Mat.Leaf, 0.9, 0, 0, 0, false);
    expect(GLYPHS[dark]).toBe("#");
    expect(GLYPHS[bright]).toBe("*");
  });

  it("holds a scattered texture still for a given place, whatever the clock", () => {
    expect(glyphFor(Mat.Grass, 0.5, 12, 7, 1, false)).toBe(glyphFor(Mat.Grass, 0.5, 12, 7, 9, false));
  });

  it("lays grass flat under a gust", () => {
    expect(glyphFor(Mat.Grass, 0.5, 3, 3, 0, true)).toBe(indexOfGlyph("/"));
  });
});

describe("a cell", () => {
  it("draws the winner in its own colour over the ground, both lifted", () => {
    const cell = cellOf([s(Mat.Cloth, [100, 50, 20]), s(Mat.Grass, [0, 90, 0])], 0, 0, 0, false);
    expect(cell.fg[0]).toBeCloseTo(100 * LIFT_FG + 10);
    expect(cell.bg[0]).toBeCloseTo(40 * 0.45 * LIFT_BG + 4);
    expect(GLYPHS[cell.glyph]).toMatch(/[%#&]/);
  });

  it("never lights past white", () => {
    const cell = cellOf([s(Mat.Fire, [255, 255, 255])], 0, 0, 0, false);
    expect(Math.max(...cell.fg)).toBeLessThanOrEqual(255);
  });
});

describe("light", () => {
  it("steps in quarters, never as a smooth gradient", () => {
    const lights = [{ x: 0, y: 0, radius: 100, strength: 1, color: [255, 200, 100] as [number, number, number] }];
    for (let d = 0; d < 100; d += 3) expect((lightAt(lights, d, 0).level * 4) % 1).toBe(0);
    expect(lightAt(lights, 0, 0).level).toBe(1);
    expect(lightAt(lights, 200, 0).level).toBe(0);
  });
});
