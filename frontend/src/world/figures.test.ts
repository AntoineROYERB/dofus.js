import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { readPng } from "../test/png";
import { ANIMATIONS, DRAWN, FigureSpec, MATERIAL_PALETTE, checkFigure, drawnFor, guessFrame, loadFigure, Pixels } from "./figures";
import { Mat } from "./materials";

const DIR = resolve("public/figures");

const sheetOf = (w: number, h: number, paint: (x: number, y: number) => [number, number, number, number] | null): Pixels => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = paint(x, y);
    if (p) data.set(p, (y * w + x) * 4);
  }
  return { width: w, height: h, data };
};

const spec = (over: Partial<FigureSpec> = {}): FigureSpec => ({
  name: "test",
  frame: [4, 4],
  feet: [2, 3],
  animations: Object.fromEntries(ANIMATIONS.map((a) => [a, { frames: 1, fps: 4 }])) as FigureSpec["animations"],
  colors: { cloth: "#336699" },
  ...over,
});
const clothKey = [0x2f, 0x55, 0xd4, 255] as [number, number, number, number];
const okSheet = () => sheetOf(4, 4 * ANIMATIONS.length * DRAWN.length, (x, y) => (x === 1 && y % 4 === 2 ? clothKey : null));

describe("every shipped figure", () => {
  const index = JSON.parse(readFileSync(resolve(DIR, "index.json"), "utf8")) as { figures: Record<string, string> };
  const names = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.replace(/\.json$/, ""));

  it("is listed under a fighter, and every listed figure exists", () => {
    for (const name of Object.values(index.figures)) expect(names).toContain(name);
  });

  it.each(names)("%s passes the check", (name) => {
    const s = JSON.parse(readFileSync(resolve(DIR, `${name}.json`), "utf8")) as FigureSpec;
    expect(checkFigure(s, readPng(resolve(DIR, `${name}.png`)))).toEqual([]);
  });
});

describe("the material palette", () => {
  it("gives every material one colour, and every colour one material", () => {
    expect(new Set(MATERIAL_PALETTE.map((p) => p.key)).size).toBe(MATERIAL_PALETTE.length);
    expect(new Set(MATERIAL_PALETTE.map((p) => p.mat)).size).toBe(MATERIAL_PALETTE.length);
  });

  it("ships as the palette file pixel editors load", () => {
    const gpl = readFileSync(resolve(DIR, "palette.gpl"), "utf8");
    for (const p of MATERIAL_PALETTE) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(p.key.slice(i, i + 2), 16));
      expect(gpl).toMatch(new RegExp(`^\\s*${r}\\s+${g}\\s+${b}\\s+${p.name}$`, "m"));
    }
  });
});

describe("the figure check", () => {
  it("accepts a sheet in the palette", () => {
    expect(checkFigure(spec(), okSheet())).toEqual([]);
  });

  it("refuses a colour outside the palette", () => {
    const sheet = okSheet();
    sheet.data.set([1, 2, 3, 255], 0);
    expect(checkFigure(spec(), sheet).join()).toMatch(/#010203 is not a colour of the material palette/);
  });

  it("refuses half-transparent pixels", () => {
    const sheet = okSheet();
    sheet.data.set([0x2f, 0x55, 0xd4, 128], 0);
    expect(checkFigure(spec(), sheet).join()).toMatch(/half-transparent/);
  });

  it("refuses a sheet that does not divide into frames", () => {
    expect(checkFigure(spec({ frame: [3, 4] }), okSheet()).join()).toMatch(/not a whole number/);
    expect(checkFigure(spec({ frame: [4, 5] }), okSheet()).join()).toMatch(/should be/);
  });

  it("refuses feet outside the frame", () => {
    expect(checkFigure(spec({ feet: [9, 1] }), okSheet()).join()).toMatch(/outside the frame/);
  });

  it("refuses a missing animation, or more frames than the sheet holds", () => {
    const anims = { ...spec().animations } as Partial<FigureSpec["animations"]>;
    delete anims.fall;
    expect(checkFigure(spec({ animations: anims as FigureSpec["animations"] }), okSheet()).join()).toMatch(/"fall" animation is missing/);
    expect(checkFigure(spec({ animations: { ...spec().animations, walk: { frames: 3, fps: 8 } } }), okSheet()).join()).toMatch(/"walk" has 3 frames/);
  });

  it("refuses a colour for a material the palette does not have", () => {
    expect(checkFigure(spec({ colors: { cape: "#ffffff" } }), okSheet()).join()).toMatch(/"cape" is not a material/);
  });
});

describe("loading a figure", () => {
  it("colours each material as the figure asks", () => {
    const f = loadFigure(spec(), okSheet()).frame("idle", "S", 0);
    expect(f.mats[2 * 4 + 1]).toBe(Mat.Cloth);
    expect([...f.rgb.slice((2 * 4 + 1) * 3, (2 * 4 + 1) * 3 + 3)]).toEqual([0x33, 0x66, 0x99]);
  });

  it("mirrors the three directions it does not draw", () => {
    expect(drawnFor("SW")).toEqual({ row: 1, mirror: true });
    expect(drawnFor("W")).toEqual({ row: 2, mirror: true });
    expect(drawnFor("NW")).toEqual({ row: 3, mirror: true });
    const fig = loadFigure(spec(), okSheet());
    expect(fig.frame("idle", "W", 0).mats[2 * 4 + 2]).toBe(Mat.Cloth);
  });
});

describe("the fallback from an old sheet", () => {
  // A 16 px square figure: a dark body, a bright yellow spot for an eye.
  const old = sheetOf(16, 16, (x, y) => {
    if (x < 4 || x > 11 || y < 2 || y > 13) return null;
    if (x >= 6 && x <= 7 && y >= 5 && y <= 6) return [255, 240, 60, 255];
    return [120, 60, 80, 255];
  });
  const f = guessFrame(old, { x: 0, y: 0, w: 16, h: 16, feetX: 8, feetY: 13 }, 6);

  it("shrinks it to the figure's height", () => {
    expect(f.h).toBeLessThan(16);
    expect(f.mats.some(Boolean)).toBe(true);
  });

  it("outlines its edge against transparency", () => {
    let first = -1;
    for (let x = 0; x < f.w && first < 0; x++) if (f.mats[Math.floor(f.h / 2) * f.w + x]) first = x;
    expect(f.mats[Math.floor(f.h / 2) * f.w + first]).toBe(Mat.Outline);
  });

  it("reads a small, very bright, saturated spot as a glow", () => {
    expect([...f.mats]).toContain(Mat.Glow);
  });
});
