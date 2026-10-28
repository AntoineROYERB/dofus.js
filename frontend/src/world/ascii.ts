import { Mat, Pick, materialOf, indexOfGlyph, GLYPH_RUNS, materialTable } from "./materials";
import { hash3 } from "./seed";

/**
 * The ASCII pass, written once in plain TypeScript.
 *
 * This is the reference: the Canvas 2D fallback runs it as is, the tests
 * pin it down, and the WebGL shader (gl/shaders.ts) is the same steps in
 * GLSL. A change here is a change there.
 */

export type Rgb = [number, number, number];

/** One point of the scene, as the composite gives it (scene.ts). */
export type Sample = {
  mat: number;
  /** The material's colour, lit. */
  c: Rgb;
  /** The ground under it, lit: what the cell's background is made of. */
  under: Rgb;
};

export type Cell = { glyph: number; fg: Rgb; bg: Rgb };

/**
 * The glyph view loses light to the dark between letters, so it is lifted
 * at display — the glyphs more than the ground behind them. Without it the
 * fight reads as a night with the lights off.
 */
export const LIFT_FG = 1.35;
export const LIFT_BG = 1.7;
const FG_FLOOR: Rgb = [10, 10, 12];
const BG_FLOOR: Rgb = [4, 5, 8];
/** How dark the ground behind a glyph is, against the ground itself. */
export const BG_SHARE = 0.45;

const lift = (c: Rgb, gain: number, floor: Rgb): Rgb => [
  Math.min(255, c[0] * gain + floor[0]),
  Math.min(255, c[1] * gain + floor[1]),
  Math.min(255, c[2] * gain + floor[2]),
];

export const luminance = (c: Rgb): number => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

/**
 * Thin materials — an outline, a mortar joint — are one art pixel wide, and
 * a text cell on a phone covers two or three. Left to priority alone they
 * won every cell they touched and drew the world in `@`. They win only a
 * cell they fill at least half of.
 */
export const isThin = (mat: number): boolean => mat === Mat.Outline || mat === Mat.Mortar;

/** Which material a cell shows: the highest priority, the first on a tie. */
export const winner = (samples: Sample[]): number => {
  let best = -1;
  let mat = Mat.None as number;
  for (const s of samples) {
    const p = materialOf(s.mat).priority;
    if (p <= best) continue;
    if (isThin(s.mat) && samples.filter((o) => o.mat === s.mat).length * 2 < samples.length) continue;
    best = p;
    mat = s.mat;
  }
  return mat;
};

/** How bright a material's glyphs are drawn, against its own colour. */
export const gainOf = (mat: number, gust: boolean): number => {
  switch (mat) {
    case Mat.Grass:
      return gust ? 1.75 : 1.3;
    case Mat.TallGrass:
      return gust ? 1.3 : 1;
    case Mat.Water:
      return 1.5;
    case Mat.Reflection:
      return 1.25;
    case Mat.Brick:
    case Mat.Stone:
    case Mat.Mortar:
    case Mat.Strata:
    case Mat.Lip:
      return 1.25;
    default:
      return materialOf(mat).floor ? 1.2 : 1;
  }
};

const TABLE = materialTable();
const RUNS = [...GLYPH_RUNS].map(indexOfGlyph);

/**
 * The glyph a material shows in a cell. `seed` is the cell's place in the
 * world (so a texture holds still while nothing moves), `lum` its light,
 * `tick` the flicker's clock, and a gust bends grass flat.
 */
export const glyphFor = (mat: number, lum: number, seedX: number, seedY: number, tick: number, gust: boolean): number => {
  if (gust && (mat === Mat.Grass || mat === Mat.TallGrass)) return indexOfGlyph("/");
  const start = TABLE[mat * 4 + 1];
  const count = TABLE[mat * 4 + 2];
  if (count === 0) return 0;
  const pick = TABLE[mat * 4 + 3] & 3;
  let k: number;
  if (pick === Pick.Light) k = Math.min(count - 1, Math.floor(Math.min(0.999, lum * 1.6) * count));
  else if (pick === Pick.Flicker) k = Math.floor(hash3(seedX, seedY, mat + tick * 131) * count);
  else k = Math.floor(hash3(seedX, seedY, mat) * count);
  return RUNS[start + k];
};

/**
 * One text cell from the scene points it covers: the winning material's
 * glyph in that material's colour, over the ground's.
 */
export const cellOf = (
  samples: Sample[],
  seedX: number,
  seedY: number,
  tick: number,
  gust: boolean
): Cell => {
  const mat = winner(samples);
  const fg: Rgb = [0, 0, 0];
  const bg: Rgb = [0, 0, 0];
  let n = 0;
  for (const s of samples) {
    bg[0] += s.under[0];
    bg[1] += s.under[1];
    bg[2] += s.under[2];
    if (s.mat !== mat) continue;
    fg[0] += s.c[0];
    fg[1] += s.c[1];
    fg[2] += s.c[2];
    n++;
  }
  const k = samples.length || 1;
  for (let i = 0; i < 3; i++) {
    fg[i] /= n || 1;
    bg[i] = (bg[i] / k) * BG_SHARE;
  }
  const info = materialOf(mat);
  const gain = gainOf(mat, gust);
  // A quiet material is a texture: its glyph is a brighter shade of the
  // ground it lies on, not a mark of its own.
  const shown: Rgb = info.quiet
    ? [bg[0] * 2.1, bg[1] * 2.1, bg[2] * 2.1]
    : [fg[0] * gain, fg[1] * gain, fg[2] * gain];
  return {
    glyph: glyphFor(mat, luminance(fg), seedX, seedY, tick, gust),
    fg: lift(shown, LIFT_FG, FG_FLOOR),
    bg: lift(bg, LIFT_BG, BG_FLOOR),
  };
};

/* ---------------- light, haze and the frame's edges ---------------- */

export type Light = { x: number; y: number; radius: number; strength: number; color: Rgb };

/**
 * How lit a point is, in quarters: light pools step like the pixel art
 * does, never as a smooth gradient (ART_DIRECTION.md, 5.2).
 */
export const lightAt = (lights: Light[], x: number, y: number): { level: number; color: Rgb } => {
  let level = 0;
  let color: Rgb = [0, 0, 0];
  for (const l of lights) {
    const d = Math.hypot(x - l.x, (y - l.y) * 1.15);
    const v = l.strength * (1 - d / l.radius);
    if (v > level) {
      level = v;
      color = l.color;
    }
  }
  return { level: Math.max(0, Math.min(1, Math.floor(level * 4) / 4)), color };
};

export const lit = (c: Rgb, level: number, color: Rgb): Rgb => [
  c[0] * (1 + 0.6 * level) + color[0] * 0.35 * level,
  c[1] * (1 + 0.6 * level) + color[1] * 0.35 * level,
  c[2] * (1 + 0.6 * level) + color[2] * 0.35 * level,
];

/** The cool haze at the back, in steps: none on the board, thickening behind it. */
export const HAZE: Rgb = [58, 70, 108];
export const hazeAt = (y: number): number => {
  const back = (-48 - y) / 150;
  return back <= 0 ? 0 : Math.min(3, Math.floor(back * 4)) * 0.14;
};

/** The frame's edges darken in steps, never as a smooth vignette. */
export const vignetteAt = (u: number, v: number): number => {
  const e = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5) * 1.15) * 2;
  return e < 0.72 ? 1 : e < 0.86 ? 0.84 : e < 0.96 ? 0.7 : 0.58;
};

/**
 * One wind for the whole scene: gusts that run across it from the left,
 * bending grass flat and shaking leaves as they pass. A function of place
 * and time only, so a tree and the grass at its foot bend together. The
 * shader has the same function.
 */
export const windAt = (x: number, y: number, t: number): number => {
  const a = Math.sin(x * 0.045 - t * 1.6 + Math.sin(y * 0.07 + t * 0.4) * 1.5);
  const b = Math.sin(x * 0.021 - t * 0.9 + y * 0.013);
  return 0.5 + 0.32 * a + 0.18 * b;
};
export const GUST = 0.75;
