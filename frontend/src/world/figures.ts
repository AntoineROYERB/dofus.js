import { Rgb } from "./ascii";
import { Mat } from "./materials";
import { hex } from "./raster";

/**
 * Figures: how fighters are drawn in the ASCII view.
 *
 * A figure is a PNG sheet painted at the scene's own resolution (one pixel,
 * one glyph column) in a fixed **material palette**: each exact colour of the
 * palette stands for a material — outline, skin, cloth, eye — and never for
 * a colour. The game gives every material its colour when it draws, so one
 * figure makes every dye, and the ASCII pass knows an eye from a robe without
 * guessing. Any pixel editor will do: load `public/figures/palette.gpl`,
 * paint, export the sheet.
 *
 * The sheet has one column per frame and one row per animation and
 * direction: the animations in ANIMATIONS order, each in the five drawn
 * directions (S, SE, E, NE, N). The other three are the mirror of SE, E and
 * NE. A JSON file beside the sheet says the frame's size, where the feet are,
 * how many frames each animation has and how fast it plays, and the default
 * colour of each material.
 */

/** The material palette: the only colours a figure's sheet may use. */
export const MATERIAL_PALETTE: { name: string; mat: number; key: string }[] = [
  { name: "outline", mat: Mat.Outline, key: "#000000" },
  { name: "skin", mat: Mat.Skin, key: "#f4c7a0" },
  { name: "hair", mat: Mat.Hair, key: "#7a4a1c" },
  { name: "cloth", mat: Mat.Cloth, key: "#2f55d4" },
  { name: "clothDark", mat: Mat.ClothDark, key: "#16286e" },
  { name: "trim", mat: Mat.Trim, key: "#e6c13a" },
  { name: "metal", mat: Mat.Metal, key: "#a8b0c0" },
  { name: "leather", mat: Mat.Leather, key: "#8c5a2c" },
  { name: "eye", mat: Mat.Eye, key: "#ff00ff" },
  { name: "glow", mat: Mat.Glow, key: "#ffff00" },
  { name: "accent", mat: Mat.Accent, key: "#ff2a2a" },
  { name: "wood", mat: Mat.Wood, key: "#b4783a" },
  { name: "fur", mat: Mat.Fur, key: "#f2f0e2" },
  { name: "slime", mat: Mat.Slime, key: "#3ce07a" },
  { name: "shell", mat: Mat.Shell, key: "#6e6e5e" },
  { name: "fire", mat: Mat.Fire, key: "#ff8a00" },
];

const BY_KEY = new Map(MATERIAL_PALETTE.map((p) => [p.key, p]));
const BY_NAME = new Map(MATERIAL_PALETTE.map((p) => [p.name, p]));

export const ANIMATIONS = ["idle", "walk", "melee", "ranged", "hit", "fall"] as const;
export type Animation = (typeof ANIMATIONS)[number];
export const DRAWN = ["S", "SE", "E", "NE", "N"] as const;
export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/** The direction drawn for each of the eight, and whether it is mirrored. */
export const drawnFor = (d: Direction): { row: number; mirror: boolean } => {
  switch (d) {
    case "SW":
      return { row: 1, mirror: true };
    case "W":
      return { row: 2, mirror: true };
    case "NW":
      return { row: 3, mirror: true };
    default:
      return { row: DRAWN.indexOf(d as (typeof DRAWN)[number]), mirror: false };
  }
};

export type FigureSpec = {
  name: string;
  frame: [number, number];
  feet: [number, number];
  animations: Record<Animation, { frames: number; fps: number }>;
  /** A material's colour, by its palette name. */
  colors: Record<string, string>;
};

/** Pixels as any decoder gives them: RGBA, row by row. */
export type Pixels = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

/** One frame, ready to draw: a material and a colour per pixel. */
export type FigureFrame = { w: number; h: number; feetX: number; feetY: number; mats: Uint8Array; rgb: Uint8Array };

export type Figure = {
  spec: FigureSpec;
  frame: (anim: Animation, dir: Direction, index: number) => FigureFrame;
};

const toKey = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/**
 * Everything wrong with a figure, in plain sentences; empty when it is fit to
 * ship. The tests run it over every figure in public/figures.
 */
export const checkFigure = (spec: FigureSpec, sheet: Pixels): string[] => {
  const errors: string[] = [];
  const [fw, fh] = spec.frame ?? [0, 0];
  if (!(fw > 0 && fh > 0)) return [`${spec.name}: the frame has no size`];
  if (sheet.width % fw !== 0) errors.push(`${spec.name}: the sheet's width ${sheet.width} is not a whole number of ${fw}-pixel frames`);
  if (sheet.height !== fh * ANIMATIONS.length * DRAWN.length) {
    errors.push(`${spec.name}: the sheet should be ${fh * ANIMATIONS.length * DRAWN.length} pixels tall (${ANIMATIONS.length} animations × ${DRAWN.length} directions × ${fh}), not ${sheet.height}`);
  }
  const [footX, footY] = spec.feet ?? [-1, -1];
  if (footX < 0 || footY < 0 || footX >= fw || footY >= fh) errors.push(`${spec.name}: the feet (${footX}, ${footY}) are outside the frame`);
  const columns = Math.floor(sheet.width / fw);
  for (const a of ANIMATIONS) {
    const anim = spec.animations?.[a];
    if (!anim) errors.push(`${spec.name}: the "${a}" animation is missing`);
    else if (!(anim.frames >= 1 && anim.frames <= columns)) errors.push(`${spec.name}: "${a}" has ${anim.frames} frames, the sheet has room for ${columns}`);
    else if (!(anim.fps > 0)) errors.push(`${spec.name}: "${a}" needs a frame rate`);
  }
  for (const name of Object.keys(spec.colors ?? {})) {
    if (!BY_NAME.has(name)) errors.push(`${spec.name}: "${name}" is not a material of the palette`);
  }
  const stray = new Set<string>();
  for (let i = 0; i < sheet.width * sheet.height; i++) {
    if (sheet.data[i * 4 + 3] === 0) continue;
    if (sheet.data[i * 4 + 3] !== 255) {
      stray.add("half-transparent pixels");
      continue;
    }
    const k = toKey(sheet.data[i * 4], sheet.data[i * 4 + 1], sheet.data[i * 4 + 2]);
    if (!BY_KEY.has(k)) stray.add(k);
  }
  for (const s of stray) errors.push(`${spec.name}: ${s} is not a colour of the material palette`);
  return errors;
};

/** The colour each material is drawn in: the figure's own, else the palette's key. */
const dyeOf = (spec: FigureSpec): Map<number, Rgb> =>
  new Map(MATERIAL_PALETTE.map((p) => [p.mat, hex(spec.colors[p.name] ?? p.key)]));

/** Turns a checked sheet into frames, cut and coloured once and kept. */
export const loadFigure = (spec: FigureSpec, sheet: Pixels): Figure => {
  const dye = dyeOf(spec);
  const [fw, fh] = spec.frame;
  const cache = new Map<string, FigureFrame>();
  const frame = (anim: Animation, dir: Direction, index: number): FigureFrame => {
    const a = spec.animations[anim];
    const k = Math.max(0, Math.floor(index)) % a.frames;
    const { row, mirror } = drawnFor(dir);
    const id = `${anim}:${dir}:${k}`;
    const hit = cache.get(id);
    if (hit) return hit;
    const mats = new Uint8Array(fw * fh);
    const rgb = new Uint8Array(fw * fh * 3);
    const top = (ANIMATIONS.indexOf(anim) * DRAWN.length + row) * fh;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const sx = k * fw + (mirror ? fw - 1 - x : x);
        const si = ((top + y) * sheet.width + sx) * 4;
        if (sheet.data[si + 3] < 255) continue;
        const p = BY_KEY.get(toKey(sheet.data[si], sheet.data[si + 1], sheet.data[si + 2]));
        if (!p) continue;
        const c = dye.get(p.mat)!;
        mats[y * fw + x] = p.mat;
        rgb.set(c, (y * fw + x) * 3);
      }
    }
    const out = { w: fw, h: fh, feetX: mirror ? fw - 1 - spec.feet[0] : spec.feet[0], feetY: spec.feet[1], mats, rgb };
    cache.set(id, out);
    return out;
  };
  return { spec, frame };
};

/* --------------- the fallback: a figure guessed from an old sheet --------------- */

const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const sat = (r: number, g: number, b: number) => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

/**
 * A fighter with no figure yet is drawn from its old sprite sheet, shrunk to
 * the figure's size and its materials guessed from the pixels: the edge
 * against transparency is the outline, small very bright or saturated spots
 * are eyes and glows, the rest is cloth. It is never as good as a drawn
 * figure — which is the point of drawing them — but nothing is ever missing.
 *
 * `box` is the frame's region of the sheet; `height` the figure's height in
 * scene pixels, feet included.
 */
export const guessFrame = (
  sheet: Pixels,
  box: { x: number; y: number; w: number; h: number; feetX: number; feetY: number },
  height: number,
  mirror = false
): FigureFrame => {
  // Find the ink's bounds, so the figure is scaled by what is drawn, not by
  // the empty frame around it.
  let top = box.h;
  for (let y = 0; y < box.h && top === box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      if (sheet.data[((box.y + y) * sheet.width + box.x + x) * 4 + 3] > 96) {
        top = y;
        break;
      }
    }
  }
  const inkH = Math.max(1, box.feetY - top);
  const k = inkH / height;
  const w = Math.max(1, Math.ceil(box.w / k));
  const h = Math.max(1, Math.ceil(box.h / k));
  const mats = new Uint8Array(w * h);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0, cover = 0, hot = 0;
      const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k));
      const y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.floor((y + 1) * k));
      for (let sy = y0; sy < y1 && sy < box.h; sy++) {
        for (let sx = x0; sx < x1 && sx < box.w; sx++) {
          const si = ((box.y + sy) * sheet.width + box.x + (mirror ? box.w - 1 - sx : sx)) * 4;
          cover++;
          if (sheet.data[si + 3] <= 96) continue;
          const pr = sheet.data[si], pg = sheet.data[si + 1], pb = sheet.data[si + 2];
          r += pr; g += pg; b += pb; n++;
          if (lum(pr, pg, pb) > 0.8 && sat(pr, pg, pb) > 0.35) hot++;
        }
      }
      if (n * 2 < cover) continue;
      const i = y * w + x;
      rgb[i * 3] = r / n;
      rgb[i * 3 + 1] = g / n;
      rgb[i * 3 + 2] = b / n;
      mats[i] = hot * 3 > n ? Mat.Glow : Mat.Cloth;
    }
  }
  // The edge against transparency is the outline.
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mats[i]) continue;
      const empty = (xx: number, yy: number) => xx < 0 || yy < 0 || xx >= w || yy >= h || !mats[yy * w + xx];
      if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) edge[i] = 1;
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (!edge[i] || mats[i] === Mat.Glow) continue;
    mats[i] = Mat.Outline;
    rgb[i * 3] *= 0.35;
    rgb[i * 3 + 1] *= 0.3;
    rgb[i * 3 + 2] *= 0.35;
  }
  // Dark pixels inside read as the cloth's folds.
  for (let i = 0; i < w * h; i++) {
    if (mats[i] === Mat.Cloth && lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) < 0.22) mats[i] = Mat.ClothDark;
  }
  const feetX = Math.round((mirror ? box.w - 1 - box.feetX : box.feetX) / k);
  return { w, h, feetX, feetY: Math.round(box.feetY / k), mats, rgb };
};
