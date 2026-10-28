import { GRID_RADIUS } from "../utils/board";
import { GUST, HAZE, Light, Rgb, Sample, hazeAt, lightAt, lit, windAt } from "./ascii";
import { Backdrop } from "./backdrop";
import { Mat, materialOf } from "./materials";
import { BACKDROP, FOREGROUND, Layer } from "./raster";
import { hash3 } from "./seed";
import { StillLayers } from "./paint";
import { CELL_H, CELL_W } from "./view";

/**
 * What the scene shows at one art pixel, every layer considered: the
 * foreground's ferns over the fighters, the fighters over what sways, what
 * sways over the land, and the island's backdrop behind the land. Then
 * light, darkness and haze. The shader does the same, in the same order
 * (gl/shaders.ts).
 */

export type Frame = {
  still: StillLayers;
  /** Fighters and what they cast: repainted every frame. */
  dyn: Layer;
  backdrop: Backdrop;
  fore: Layer;
  look: string;
  /** The daylight that reaches the scene, 0 to 1. */
  ambient: number;
  lights: Light[];
  /** The art pixels at the view's edges. */
  view: { left: number; top: number; right: number; bottom: number };
  time: number;
};

/** How far below the view's top the backdrop's foot sits, where nothing else decides. */
const FOOT_DROP = 46;
/** How far behind the board's back edges the backdrop's foot stays: two rings. */
const FOOT_GAP = 30;

/**
 * Where the backdrop's foot runs, in art y, for a column. It follows the
 * board's back edges, two rings behind them, so on a screen the board fills
 * it shows in the upper corners; on a taller one it stands across the top.
 */
export const wallFoot = (ax: number, viewTop: number): number =>
  Math.min(viewTop + FOOT_DROP, -(GRID_RADIUS + 1) * (CELL_H / 2) + Math.abs(ax) / 2 - FOOT_GAP);

/** Whether an art pixel lies on the board, or within `margin` cells of it. */
export const onBoard = (ax: number, ay: number, margin = 0): boolean =>
  Math.abs(ax) / (CELL_W / 2) + Math.abs(ay) / (CELL_H / 2) <= GRID_RADIUS + 1 + margin;

const NIGHT: Rgb = [6, 8, 20];

/**
 * The clearing is lit a little more than the land round it. With no grid at
 * rest, it is light rather than a line that says where the board is.
 */
export const CLEARING_LIGHT = 1.22;
/** How much of their own colour fighters keep at night. */
export const FIGURE_LIGHT = 0.95;
/** The materials figures are painted in (figures.ts). */
export const isFigure = (mat: number): boolean => mat >= Mat.Outline && mat <= Mat.Shell;

const rgbAt = (layer: Layer, i: number): Rgb => [layer.data[i], layer.data[i + 1], layer.data[i + 2]];

/** How far what sways is pushed by the wind at a point, by its height above its foot. */
export const swayOf = (ax: number, ay: number, height: number, t: number): number => {
  const w = windAt(ax, ay, t);
  const k = Math.min(1, height / 40);
  return Math.round((Math.sin(t * 1.3 + ax * 0.05) * 0.6 + (w - 0.5) * 2.4) * k * 2.2);
};

const sky = (f: Frame, ax: number, v: number, top: number): [number, Rgb] => {
  const k = Math.min(3, Math.floor(Math.max(0, v - top) / 18)) / 3;
  const s = hash3(Math.floor(ax), Math.floor(v), 77);
  if (s > 0.986) {
    const tw = 0.6 + 0.4 * Math.sin(f.time * 2 + s * 400);
    return [Mat.Star, [200 * tw, 210 * tw, 255 * tw]];
  }
  return [Mat.Sky, [HAZE[0] * 0.5 + (NIGHT[0] - HAZE[0] * 0.5) * k, HAZE[1] * 0.5 + (NIGHT[1] - HAZE[1] * 0.5) * k, HAZE[2] * 0.5 + (NIGHT[2] - HAZE[2] * 0.5) * k]];
};

/** Darkness and light on a colour: emissive things keep their own. */
const shade = (f: Frame, mat: number, c: Rgb, ax: number, ay: number, hazed: boolean): Rgb => {
  if (materialOf(mat).emissive) return c;
  // Fighters stand out from their ground: the night takes less of them
  // (ART_DIRECTION.md, 5.3 — creatures brighter than their island).
  const amb = isFigure(mat)
    ? Math.max(f.ambient, FIGURE_LIGHT)
    : !hazed && onBoard(ax, ay)
      ? Math.min(1, f.ambient * CLEARING_LIGHT)
      : f.ambient;
  let out: Rgb = [c[0] * amb + NIGHT[0] * 0.5, c[1] * amb + NIGHT[1] * 0.5, c[2] * amb + NIGHT[2] * 0.5];
  const l = lightAt(f.lights, ax, ay);
  if (l.level > 0) out = lit(out, l.level, l.color);
  if (hazed) {
    const h = hazeAt(ay);
    if (h > 0) out = [out[0] + (HAZE[0] - out[0]) * h, out[1] + (HAZE[1] - out[1]) * h, out[2] + (HAZE[2] - out[2]) * h];
  }
  return out;
};

export const sampleAt = (f: Frame, ax: number, ay: number): Sample => {
  ax = Math.floor(ax);
  ay = Math.floor(ay);
  const { still, dyn, backdrop, fore } = f;

  // What is under everything: the land, or the island's back and its sky.
  const foot = wallFoot(ax, f.view.top);
  const bi = still.base.index(ax, ay);
  let under: [number, Rgb];
  let behindWall = false;
  const baseMat = bi >= 0 ? still.base.data[bi + 3] : 0;
  if (ay < foot || baseMat === 0) {
    behindWall = true;
    const v = foot - ay;
    const wi = backdrop.layer.index(ax, v);
    const wm = v >= 0 && v < BACKDROP.h && wi >= 0 ? backdrop.layer.data[wi + 3] : 0;
    if (wm) under = [wm, rgbAt(backdrop.layer, wi)];
    else {
      const k = ax - backdrop.layer.x0;
      const top = k >= 0 && k < backdrop.tops.length ? backdrop.tops[k] : 0;
      under = sky(f, ax, Math.max(0, v), top);
    }
  } else {
    under = [baseMat, rgbAt(still.base, bi)];
    // Liquid mirrors its bank: read the scene above the far rim, flipped.
    const d = still.baseAux.data[bi];
    if (d > 0) {
      const ripple = Math.round(Math.sin(f.time * 2.2 + ay * 0.9) * 1.2);
      const ri = still.foliage.index(ax + ripple, ay - 2 * d + 2);
      if (ri >= 0 && still.foliage.data[ri + 3] && still.foliage.data[ri + 3] !== Mat.Outline) {
        const r = rgbAt(still.foliage, ri);
        under = [Mat.Reflection, [under[1][0] * 0.55 + r[0] * 0.4, under[1][1] * 0.55 + r[1] * 0.4, under[1][2] * 0.55 + r[2] * 0.4]];
      }
    }
  }

  let top: [number, Rgb] = under;

  // What sways, pushed by the wind, unless it stands behind the backdrop.
  const guess = swayOf(ax, ay, 40, f.time);
  const ai = still.foliageAux.index(ax - guess, ay);
  const height = ai >= 0 ? still.foliageAux.data[ai] : 0;
  const sway = height ? swayOf(ax, ay, height, f.time) : 0;
  const fi = still.foliage.index(ax - sway, ay);
  if (fi >= 0 && still.foliage.data[fi + 3]) {
    const fy = still.foliageAux.data[fi + 2] * 2 + still.base.y0;
    if (!behindWall || fy >= foot) top = [still.foliage.data[fi + 3], rgbAt(still.foliage, fi)];
  }

  // Fighters and what they cast.
  const di = dyn.index(ax, ay);
  if (di >= 0 && dyn.data[di + 3]) {
    const m = dyn.data[di + 3];
    if (m === Mat.Shadow) {
      under = [under[0], [under[1][0] * 0.5, under[1][1] * 0.5, under[1][2] * 0.6]];
      if (top[0] === under[0]) top = under;
    } else top = [m, rgbAt(dyn, di)];
  }

  // The ferns of the foreground, never over a playable cell.
  const u = ax - Math.floor(f.view.left);
  const v = Math.floor(f.view.bottom) - ay;
  if (v >= 0 && v < FOREGROUND.h) {
    const gi = fore.index(u, v);
    if (gi >= 0 && fore.data[gi + 3] && !onBoard(ax, ay, 0.5)) {
      const c = rgbAt(fore, gi);
      return { mat: fore.data[gi + 3], c, under: [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6] };
    }
  }

  const hazed = behindWall || !onBoard(ax, ay);
  return {
    mat: top[0],
    c: shade(f, top[0], top[1], ax, ay, hazed),
    under: shade(f, under[0], under[1], ax, ay, hazed),
  };
};

/** Whether a gust is passing over a point: grass lies flat and brightens. */
export const gustAt = (ax: number, ay: number, t: number): boolean => windAt(ax, ay, t) > GUST;
