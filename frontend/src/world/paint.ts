import { Position } from "../types/game";
import { GroundCell, IslandPalette } from "../types/message";
import { GRID_RADIUS } from "../utils/board";
import { valueNoise } from "../explore/noise";
import { Rgb } from "./ascii";
import { Decor, Layout, LAND_RADIUS, Look } from "./layout";
import { Mat } from "./materials";
import { Layer, WORLD, hex, mix, mul } from "./raster";
import { hash3 } from "./seed";
import { CELL_H, CELL_W, RISE, cellToArt } from "./view";

/**
 * Paints the still part of a fight's scene: the land, the board on its
 * plinth, the ponds, the scenery, the island's terrains and the board's
 * cover. Done once per fight (and again if the ground or the cover change);
 * everything that moves — wind, water, light, fighters — is the frame's job.
 *
 * Painted back to front, cell by cell, so nearer land covers what is behind
 * it, exactly like the exploration's renderer (explore/paint.ts).
 */

export type StillLayers = {
  /** Ground, faces, rocks: rgb and material. */
  base: Layer;
  /** Reflection distance (r), flags (b: 1 board, 2 lit by the liquid), wind direction (a). */
  baseAux: Layer;
  /** What sways: trees, bushes, tall grass, banners. */
  foliage: Layer;
  /** How far above its foot a swaying pixel is (r), its phase (g), its foot's depth (b). */
  foliageAux: Layer;
};

export type Palettes = { [id: string]: IslandPalette };

/** Every terrain kind, drawn in the colours of the island it comes from. */
const KIND_PALETTE: Record<string, string> = {
  shallow_water: "water",
  ice: "ice",
  acid_pool: "acid",
  lava: "fire",
  air_current: "air",
  tall_grass: "prairie",
  rock: "earth",
};

export const newStillLayers = (): StillLayers => ({
  base: new Layer(WORLD.w, WORLD.h, WORLD.x0, WORLD.y0),
  baseAux: new Layer(WORLD.w, WORLD.h, WORLD.x0, WORLD.y0),
  foliage: new Layer(WORLD.w, WORLD.h, WORLD.x0, WORLD.y0),
  foliageAux: new Layer(WORLD.w, WORLD.h, WORLD.x0, WORLD.y0),
});

type Ctx = {
  L: StillLayers;
  P: { [k in keyof IslandPalette]: k extends "glow" ? boolean : k extends "path" | "grass" | "shadow" | "outline" | "accent" ? Rgb : Rgb[] };
  look: Look;
  salt: number;
};

const palette = (p: IslandPalette): Ctx["P"] => ({
  ground: p.ground.map(hex),
  path: hex(p.path),
  stone: p.stone.map(hex),
  wood: p.wood.map(hex),
  leaves: p.leaves.map(hex),
  pine: p.pine.map(hex),
  grass: hex(p.grass),
  flowers: p.flowers.map(hex),
  shadow: hex(p.shadow),
  earth: p.earth.map(hex),
  outline: hex(p.outline),
  liquid: p.liquid.map(hex),
  accent: hex(p.accent),
  glow: p.glow,
});

/** Base pixels cover what is behind them, including anything swaying there. */
const ground = (c: Ctx, ax: number, ay: number, mat: number, col: Rgb) => {
  const i = c.L.base.put(ax, ay, mat, col);
  if (i >= 0) {
    c.L.foliage.data[i + 3] = 0;
    c.L.baseAux.data[i] = 0;
  }
};

/** Every pixel of a cell's top, a diamond around (cx, cy). */
const diamond = (cx: number, cy: number, f: (ax: number, ay: number, u: number, v: number) => void, inset = 0) => {
  const hw = CELL_W / 2 - inset;
  const hh = CELL_H / 2 - inset / 2;
  for (let dy = -hh; dy < hh; dy++) {
    for (let dx = -hw; dx < hw; dx++) {
      const u = (Math.abs(dx + 0.5) / hw) + (Math.abs(dy + 0.5) / hh);
      if (u > 1) continue;
      f(cx + dx, cy + dy, u, dy / hh);
    }
  }
};

/* ------------------------------ the land ------------------------------ */

/** The colour of a bare patch of ground: three tones in soft patches, and worn earth. */
const soilAt = (c: Ctx, ax: number, ay: number): Rgb => {
  const n = valueNoise(ax, ay, 22, c.salt);
  const tone = n < 0.38 ? 0 : n < 0.7 ? 1 : 2;
  const base = c.P.ground[Math.min(tone, c.P.ground.length - 1)];
  const worn = valueNoise(ax, ay, 34, c.salt + 5);
  return worn > 0.74 ? mix(base, c.P.path, 0.6) : base;
};

const topPixel = (c: Ctx, ax: number, ay: number, onBoard: boolean): [number, Rgb] => {
  const h = hash3(ax, ay, c.salt);
  const g = hash3(ax, ay, c.salt + 1);
  const soil = soilAt(c, ax, ay);
  const look = c.look;
  if (look.liquid === "ice") {
    // A frozen island: snow, with a crust of ice catching the light here and there.
    if (h < 0.05) return [Mat.Ice, c.P.stone[3]];
    return [Mat.Snow, soil];
  }
  if (look.liquid === "lava" && !onBoard && valueNoise(ax, ay, 9, c.salt + 9) > 0.82 && h < 0.5) {
    return [Mat.Magma, c.P.accent];
  }
  // The board is a clearing: short, sparse grass on worn ground, so a cell
  // reads at a glance against the meadow round it.
  const density = look.grass * (onBoard ? 0.16 : 0.7);
  if (!onBoard && h < 0.012 * look.grass + 0.002) return [Mat.Flower, c.P.flowers[Math.floor(g * c.P.flowers.length)]];
  if (h > 0.988) return [Mat.Pebble, c.P.stone[2]];
  if (g < density) {
    const shade = c.P.leaves[1 + Math.floor(h * (c.P.leaves.length - 1))];
    return [Mat.Grass, mix(c.P.grass, shade, 0.5)];
  }
  return [Mat.Soil, onBoard ? mix(soil, c.P.path, 0.22) : soil];
};

/** The face a raised cell shows towards the front: brick for the board, strata elsewhere. */
const face = (c: Ctx, cx: number, cy: number, side: "L" | "R", drop: number, plinth: boolean) => {
  if (drop <= 0) return;
  for (let k = 0; k < CELL_W / 2; k++) {
    const u = k / (CELL_W / 2);
    const ax = side === "L" ? cx - CELL_W / 2 + k : cx + k;
    const top = side === "L" ? cy + u * (CELL_H / 2) : cy + CELL_H / 2 - u * (CELL_H / 2);
    // Light from the upper left: the left faces lit, the right ones in shade.
    const light = side === "L" ? 1.12 : 0.72;
    for (let v = 0; v < drop; v++) {
      const ay = Math.floor(top) + v;
      if (plinth) {
        const row = Math.floor(v / 3);
        const joint = v % 3 === 2 || (k + (row % 2) * 3) % 6 === 0;
        const tone = c.P.stone[1 + Math.floor(hash3(Math.floor((k + (row % 2) * 3) / 6), row, cx) * 2)];
        ground(c, ax, ay, joint ? Mat.Mortar : Mat.Brick, mul(joint ? c.P.stone[0] : tone, light));
      } else if (v < 2 && c.look.grass > 0) {
        ground(c, ax, ay, Mat.Lip, mul(mix(c.P.grass, c.P.leaves[2], 0.4), light));
      } else {
        const band = Math.floor((v + hash3(ax >> 2, 0, c.salt) * 2) / 3) % 3;
        const col = band === 0 ? c.P.earth[1] : band === 1 ? c.P.earth[0] : c.P.stone[1];
        ground(c, ax, ay, Mat.Strata, mul(col, light));
      }
    }
  }
};

/* ------------------------------ scenery ------------------------------ */

const outlinePass = (c: Ctx, layer: Layer, pts: [number, number][]) => {
  // A one-pixel outline round everything that stands (ART_DIRECTION.md, 5.2).
  const filled = new Set(pts.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of pts) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (filled.has(k)) continue;
      filled.add(k);
      if (layer === c.L.base) ground(c, x + dx, y + dy, Mat.Outline, c.P.outline);
      else layer.put(x + dx, y + dy, Mat.Outline, c.P.outline);
    }
  }
};

type Stamp = (x: number, y: number, mat: number, col: Rgb, sway?: number) => void;

/** Draws onto the base (still) or the foliage (swaying) layer, outlined either way. */
const piece = (c: Ctx, sways: boolean, footX: number, footY: number, draw: (put: Stamp) => void) => {
  const pts: [number, number][] = [];
  const layer = sways ? c.L.foliage : c.L.base;
  const put: Stamp = (x, y, mat, col, sway) => {
    x = Math.round(x);
    y = Math.round(y);
    if (sways) {
      const i = layer.put(x, y, mat, col);
      if (i < 0) return;
      const height = Math.max(0, Math.min(255, sway ?? footY - y));
      c.L.foliageAux.data[i] = height;
      c.L.foliageAux.data[i + 1] = Math.floor(hash3(footX, footY, 3) * 255);
      c.L.foliageAux.data[i + 2] = Math.max(0, Math.min(255, (footY - WORLD.y0) / 2));
    } else ground(c, x, y, mat, col);
    pts.push([x, y]);
  };
  draw(put);
  outlinePass(c, layer, pts);
  if (sways) {
    // The outline sways with what it outlines.
    for (const [x, y] of pts) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = layer.index(x + dx, y + dy);
        if (i >= 0 && layer.data[i + 3] === Mat.Outline && c.L.foliageAux.data[i + 2] === 0) {
          c.L.foliageAux.data[i] = Math.max(0, footY - (y + dy));
          c.L.foliageAux.data[i + 1] = Math.floor(hash3(footX, footY, 3) * 255);
          c.L.foliageAux.data[i + 2] = Math.max(0, Math.min(255, (footY - WORLD.y0) / 2));
        }
      }
    }
  }
};

/** A cast shadow, down and to the right of what stands: light comes from the upper left. */
const castShadow = (c: Ctx, x: number, y: number, rx: number, ry: number) => {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
      const i = c.L.base.index(x + dx + rx * 0.4, y + dy + 1);
      if (i < 0) continue;
      const d = c.L.base.data;
      // A darker colour of the same palette, never black (5.2).
      d[i] = d[i] * 0.55;
      d[i + 1] = d[i + 1] * 0.55;
      d[i + 2] = d[i + 2] * 0.62;
    }
  }
};

const blob = (put: Stamp, cx: number, cy: number, rx: number, ry: number, mat: number, tone: (lit: number) => Rgb, foot: number) => {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (d > 1) continue;
      // Lit from the upper left, in steps.
      const l = -(dx / rx) * 0.5 - (dy / ry) * 0.6 + (1 - d) * 0.4;
      put(cx + dx, cy + dy, mat, tone(l), foot - (cy + dy));
    }
  }
};

const steps = (tones: Rgb[], l: number): Rgb => tones[Math.max(0, Math.min(tones.length - 1, Math.floor((l + 0.6) * tones.length * 0.7)))];

export const paintDecor = (c: Ctx, d: Decor, level: number) => {
  const foot = cellToArt(d.cell.x, d.cell.y);
  const fx = Math.round(foot.x + (hash3(d.seed, 1) - 0.5) * 6);
  const fy = Math.round(foot.y - level * RISE + (hash3(d.seed, 2) - 0.5) * 3);
  const s = d.size;
  const r = (k: number) => hash3(d.seed, k);
  switch (d.kind) {
    case "tree": {
      castShadow(c, fx, fy, 14 * s, 4 * s);
      piece(c, true, fx, fy, (put) => {
        for (let y = 0; y < 16 * s; y++) for (let x = -2; x <= 1; x++) put(fx + x, fy - y, Mat.Trunk, x < 0 ? c.P.wood[1] : c.P.wood[0]);
        const n = 4 + Math.floor(r(3) * 3);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + r(k + 9);
          const bx = fx + Math.cos(a) * 8 * s;
          const by = fy - 32 * s + Math.sin(a) * 7 * s;
          blob(put, bx, by, 9 * s, 8 * s, Mat.Leaf, (l) => steps(c.P.leaves, l), fy);
        }
        blob(put, fx - 1, fy - 34 * s, 11 * s, 10 * s, Mat.Leaf, (l) => steps(c.P.leaves, l + 0.15), fy);
      });
      break;
    }
    case "pine": {
      castShadow(c, fx, fy, 9 * s, 3 * s);
      piece(c, true, fx, fy, (put) => {
        for (let y = 0; y < 8 * s; y++) put(fx, fy - y, Mat.Trunk, c.P.wood[0]);
        const tiers = 4;
        for (let t = 0; t < tiers; t++) {
          const base = fy - 6 * s - t * 9 * s;
          const half = (10 - t * 2) * s;
          for (let y = 0; y < 13 * s; y++) {
            const w = half * (1 - y / (13 * s));
            for (let x = -w; x <= w; x++) {
              const l = -x / (half + 1) * 0.6 + 0.2 - y / (13 * s) * 0.2;
              const snow = c.look.liquid === "ice" && y > 9 * s && x < 0;
              put(fx + x, base - y, snow ? Mat.Snow : Mat.Pine, snow ? c.P.stone[3] : steps(c.P.pine, l));
            }
          }
        }
      });
      break;
    }
    case "deadtree": {
      castShadow(c, fx, fy, 8 * s, 3 * s);
      piece(c, true, fx, fy, (put) => {
        for (let y = 0; y < 30 * s; y++) put(fx + Math.round(Math.sin(y * 0.15) * 1.5), fy - y, Mat.Trunk, c.P.wood[y % 5 === 0 ? 1 : 0]);
        for (let k = 0; k < 4; k++) {
          const by = fy - (12 + k * 5) * s;
          const dir = k % 2 ? 1 : -1;
          for (let j = 0; j < (9 - k) * s; j++) put(fx + dir * j, by - j * 0.6, Mat.Trunk, c.P.wood[1]);
        }
      });
      break;
    }
    case "bush": {
      castShadow(c, fx, fy, 9 * s, 3 * s);
      piece(c, true, fx, fy, (put) => {
        blob(put, fx - 4 * s, fy - 5 * s, 6 * s, 5 * s, Mat.Bush, (l) => steps(c.P.leaves, l - 0.1), fy);
        blob(put, fx + 4 * s, fy - 5 * s, 6 * s, 5 * s, Mat.Bush, (l) => steps(c.P.leaves, l - 0.2), fy);
        blob(put, fx, fy - 8 * s, 6 * s, 5 * s, Mat.Bush, (l) => steps(c.P.leaves, l), fy);
        if (r(5) < 0.5) put(fx + 2, fy - 9 * s, Mat.Flower, c.P.flowers[0]);
      });
      break;
    }
    case "reeds": {
      piece(c, true, fx, fy, (put) => {
        for (let k = 0; k < 6; k++) {
          const x = fx - 6 + k * 2 + Math.round(r(k) * 2);
          const h = (8 + r(k + 7) * 8) * s;
          for (let y = 0; y < h; y++) put(x, fy - y, Mat.Reed, y > h - 3 ? c.P.wood[1] : c.P.leaves[1 + (k % 2)]);
        }
      });
      break;
    }
    case "boulder": {
      castShadow(c, fx, fy, 10 * s, 3 * s);
      piece(c, false, fx, fy, (put) => {
        blob(put, fx, fy - 5 * s, 9 * s, 6 * s, Mat.Rock, (l) => steps(c.P.stone, l), fy);
        if (c.look.grass > 0 && r(4) < 0.6) for (let x = -6; x < 2; x++) put(fx + x, fy - 10 * s - (x % 2 ? 0 : 1), Mat.Lip, c.P.leaves[2]);
      });
      break;
    }
    case "column": {
      castShadow(c, fx, fy, 7 * s, 3 * s);
      piece(c, false, fx, fy, (put) => {
        const h = Math.round((26 + r(3) * 14) * s);
        for (let y = 0; y < h; y++) {
          for (let x = -5; x <= 5; x++) {
            const tone = x < -2 ? c.P.stone[3] : x < 2 ? c.P.stone[2] : c.P.stone[1];
            const crack = c.look.liquid === "lava" && x === Math.round(Math.sin(y * 0.4) * 2) && y % 7 < 4;
            put(fx + x, fy - y, crack ? Mat.Magma : Mat.Basalt, crack ? c.P.accent : tone);
          }
        }
      });
      break;
    }
    case "crystal": {
      castShadow(c, fx, fy, 7 * s, 3 * s);
      piece(c, false, fx, fy, (put) => {
        for (let k = 0; k < 3; k++) {
          const ox = (k - 1) * 5;
          const h = (k === 1 ? 26 : 16) * s;
          for (let y = 0; y < h; y++) {
            const w = Math.max(0, Math.round(3 * (1 - y / h) + (y < 3 ? 0 : 0.5)));
            for (let x = -w; x <= w; x++) put(fx + ox + x, fy - y, Mat.Crystal, x < 0 ? c.P.flowers[2] : c.P.flowers[k % c.P.flowers.length]);
          }
        }
      });
      break;
    }
    case "mushroom": {
      castShadow(c, fx, fy, 12 * s, 3 * s);
      piece(c, true, fx, fy, (put) => {
        for (let y = 0; y < 20 * s; y++) for (let x = -2; x <= 2; x++) put(fx + x, fy - y, Mat.Trunk, x < 0 ? c.P.stone[3] : c.P.stone[2]);
        blob(put, fx, fy - 24 * s, 14 * s, 7 * s, Mat.Mushroom, (l) => (l > 0.3 ? c.P.flowers[2] : l > -0.1 ? c.P.flowers[1] : c.P.leaves[2]), fy);
        for (let k = 0; k < 5; k++) put(fx - 9 + k * 4, fy - 25 * s + (k % 2), Mat.Glow, c.P.flowers[1]);
      });
      break;
    }
    case "coral": {
      castShadow(c, fx, fy, 8 * s, 3 * s);
      piece(c, true, fx, fy, (put) => {
        for (let k = 0; k < 5; k++) {
          let x = fx - 4 + k * 2;
          for (let y = 0; y < (10 + r(k) * 10) * s; y++) {
            if (r(k * 40 + y) < 0.25) x += r(k + y) < 0.5 ? -1 : 1;
            put(x, fy - y, Mat.Coral, c.P.flowers[k % c.P.flowers.length]);
          }
        }
      });
      break;
    }
  }
};

/* --------------------------- the board's ground --------------------------- */

const paintGroundKind = (c: Ctx, cell: GroundCell, cx: number, cy: number, palettes: Palettes) => {
  const kp = palettes[KIND_PALETTE[cell.kind] ?? ""] ?? null;
  const liquid = (kp?.liquid ?? []).map(hex);
  const ink = liquid.length ? liquid : c.P.liquid;
  switch (cell.kind) {
    case "shallow_water":
    case "ice":
    case "acid_pool":
    case "lava": {
      const mat = cell.kind === "shallow_water" ? Mat.Water : cell.kind === "ice" ? Mat.Ice : cell.kind === "lava" ? Mat.Lava : Mat.Acid;
      diamond(cx, cy, (ax, ay, u) => {
        const edge = u > 0.82;
        const tone = ink[Math.min(ink.length - 1, Math.floor(hash3(ax, ay, 4) * 2) + (edge ? 2 : 1))];
        ground(c, ax, ay, edge && mat === Mat.Water ? Mat.Foam : mat, tone);
        if (mat === Mat.Lava || mat === Mat.Acid) c.L.baseAux.data[c.L.base.index(ax, ay) + 2] |= 2;
      }, 1);
      break;
    }
    case "air_current": {
      const w = cell.wind ?? { x: 1, y: 0 };
      // The current's direction on screen, for the glyph that points along it.
      const sx = w.x - w.y;
      const dir = sx > 0 ? 1 : sx < 0 ? 2 : w.x + w.y > 0 ? 3 : 4;
      diamond(cx, cy, (ax, ay) => {
        const streak = (ax + ay * 2 + 64) % 5 === 0;
        if (streak) {
          ground(c, ax, ay, Mat.Wind, ink[3] ?? c.P.flowers[2]);
          c.L.baseAux.data[c.L.base.index(ax, ay) + 3] = dir;
        }
      }, 2);
      break;
    }
    case "tall_grass": {
      piece(c, true, cx, cy + CELL_H / 2, (put) => {
        diamond(cx, cy, (ax, ay) => {
          if (hash3(ax, ay, 21) > 0.42) return;
          const h = 3 + Math.floor(hash3(ax, ay, 22) * 5);
          for (let k = 0; k < h; k++) put(ax, ay - k, Mat.TallGrass, k > h - 2 ? c.P.leaves[3] : mix(c.P.grass, c.P.leaves[2], 0.6), k + 1);
        }, 1);
      });
      break;
    }
    case "rock": {
      const stone = (kp?.stone ?? []).map(hex);
      const tones = stone.length ? stone : c.P.stone;
      castShadow(c, cx, cy + 2, 10, 3);
      piece(c, false, cx, cy + 3, (put) => blob(put, cx, cy - 4, 9, 7, Mat.Rock, (l) => steps(tones, l), cy + 3));
      break;
    }
  }
};

/** Cover, in the island's own material: it stands and is outlined, so it reads as something to walk around. */
const paintCover = (c: Ctx, cx: number, cy: number, seed: number) => {
  const r = (k: number) => hash3(seed, k);
  castShadow(c, cx, cy + 2, 10, 3);
  switch (c.look.cover) {
    case "stump":
      piece(c, false, cx, cy + 3, (put) => {
        for (let y = 0; y < 10; y++) for (let x = -6; x <= 6; x++) put(cx + x, cy + 2 - y, Mat.Trunk, x < -2 ? c.P.wood[1] : c.P.wood[0]);
        blob(put, cx, cy - 8, 7, 3, Mat.Wood, () => c.P.path, cy + 3);
        blob(put, cx - 5, cy - 1, 4, 3, Mat.Bush, (l) => steps(c.P.leaves, l), cy + 3);
      });
      break;
    case "iceblock":
      piece(c, false, cx, cy + 3, (put) => {
        for (let y = 0; y < 13; y++) for (let x = -8; x <= 8; x++) {
          if (Math.abs(x) + Math.max(0, y - 9) * 2 > 8) continue;
          put(cx + x, cy + 2 - y, Mat.Frost, x < -3 ? c.P.stone[3] : x < 3 ? c.P.stone[2] : c.P.stone[1]);
        }
      });
      break;
    case "crystal":
    case "basalt":
    case "coral":
    case "boulder":
    default: {
      // A rock in the island's stone; coral grows out of it rather than
      // being one: a whole block of branches read as noise.
      const mat = c.look.cover === "crystal" ? Mat.Crystal : c.look.cover === "basalt" ? Mat.Basalt : Mat.Rock;
      piece(c, false, cx, cy + 3, (put) => {
        blob(put, cx - 1, cy - 4, 9 + Math.round(r(1) * 2), 7, mat, (l) => steps(c.P.stone, l), cy + 3);
        if (mat === Mat.Crystal) for (let y = 0; y < 8; y++) put(cx + 2, cy - 10 - y, Mat.Crystal, c.P.flowers[2]);
        if (c.look.cover === "coral") {
          for (let k = 0; k < 3; k++) {
            const x = cx - 5 + k * 5;
            for (let y = 0; y < 4 + Math.round(r(k + 4) * 3); y++) put(x + (y > 2 ? (k % 2 ? 1 : -1) : 0), cy - 10 - y, Mat.Coral, c.P.flowers[k % c.P.flowers.length]);
          }
        }
      });
    }
  }
};

/* ------------------------------ the whole ------------------------------ */

export type StillInput = {
  layout: Layout;
  palette: IslandPalette;
  palettes: Palettes;
  ground: GroundCell[];
  obstacles: Position[];
  seed: number;
};

export type Ponds = { top: number; liquid: Mat }[];

export const paintStill = (L: StillLayers, input: StillInput): void => {
  for (const layer of [L.base, L.baseAux, L.foliage, L.foliageAux]) layer.clear();
  const c: Ctx = { L, P: palette(input.palette), look: input.layout.look, salt: input.seed % 9973 };
  const { layout } = input;
  const groundAt = new Map(input.ground.map((g) => [`${g.position.x},${g.position.y}`, g]));
  const cover = new Set(input.obstacles.map((o) => `${o.x},${o.y}`));
  const decorAt = new Map<string, Decor[]>();
  for (const d of layout.decor) {
    const k = `${d.cell.x},${d.cell.y}`;
    decorAt.set(k, [...(decorAt.get(k) ?? []), d]);
  }
  const liquidMat =
    layout.look.liquid === "lava" ? Mat.Lava : layout.look.liquid === "acid" ? Mat.Acid : layout.look.liquid === "ice" ? Mat.Ice : Mat.Water;
  const pondTop = layout.ponds.map(() => Infinity);
  const R = LAND_RADIUS;

  for (let s = -2 * R; s <= 2 * R; s++) {
    for (let x = -R; x <= R; x++) {
      const y = s - x;
      if (y < -R || y > R) continue;
      const cell = { x, y };
      const level = layout.levelOf(cell);
      const art = cellToArt(x, y);
      const cx = art.x;
      const cy = art.y - level * RISE;
      const onBoard = Math.abs(x) + Math.abs(y) <= GRID_RADIUS;
      const pond = layout.ponds.findIndex((p) => p.cells.has(`${x},${y}`));

      diamond(cx, cy, (ax, ay) => {
        if (pond >= 0) {
          const tone = c.P.liquid[hash3(ax, ay, 8) < 0.3 ? 0 : 1];
          ground(c, ax, ay, liquidMat, tone);
          pondTop[pond] = Math.min(pondTop[pond], ay);
          return;
        }
        const [mat, col] = topPixel(c, ax, ay, onBoard);
        ground(c, ax, ay, mat, col);
        if (onBoard) c.L.baseAux.data[c.L.base.index(ax, ay) + 2] |= 1;
      });

      // Faces where the land falls away in front: brick under the board.
      const down = layout.levelOf({ x, y: y + 1 });
      const right = layout.levelOf({ x: x + 1, y });
      const plinth = onBoard;
      face(c, cx, cy, "L", (level - down) * RISE, plinth);
      face(c, cx, cy, "R", (level - right) * RISE, plinth);

      const g = groundAt.get(`${x},${y}`);
      if (onBoard && g) paintGroundKind(c, g, cx, cy, input.palettes);
      if (onBoard && cover.has(`${x},${y}`)) paintCover(c, cx, cy, (x * 31 + y * 17) ^ input.seed);
      for (const d of decorAt.get(`${x},${y}`) ?? []) paintDecor(c, d, level);
    }
  }

  // The ponds mirror their banks: each liquid pixel knows how far below the
  // pond's far rim it lies, which is where its reflection is read from.
  layout.ponds.forEach((p, k) => {
    const top = pondTop[k];
    if (!Number.isFinite(top)) return;
    for (let ay = top; ay < top + 80; ay++) {
      for (let ax = p.centre.x - p.a - 24; ax < p.centre.x + p.a + 24; ax++) {
        const i = L.base.index(ax, ay);
        if (i < 0 || L.base.data[i + 3] !== liquidMat) continue;
        L.baseAux.data[i] = Math.min(255, ay - top + 1);
        if (liquidMat === Mat.Lava || liquidMat === Mat.Acid) L.baseAux.data[i + 2] |= 2;
      }
    }
  });
};
