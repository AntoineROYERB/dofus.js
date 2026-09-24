import { Position } from "../types/game";
import { BOARD } from "../constants";
import { Direction } from "../components/Game/SpriteAnimation";
import { cellNoise, clamp01 } from "./noise";
import { inFrontOf } from "./viewport";
import { Ground, groundAt, heightAt, inWorld, MAX_LEVEL, Region } from "./world";
import { artOf, creatureSheet, CREATURE_FEET, FRAMES, HERO_FEET, HERO_FRAME, heroSheet, ROWS } from "./sprites";

/**
 * The world, in pixel art.
 *
 * The bestiary's creatures and the hero are pixel art: 64-pixel frames, a
 * one-pixel dark outline, short palettes, light from the upper left. The
 * world is drawn the same way so that they live in it rather than on it. It
 * is painted into a canvas at the art's own resolution — a cell is 64 pixels
 * wide, exactly the width of a creature — then shown enlarged by a whole
 * number without smoothing, so every pixel is a visible square.
 *
 * Shapes are drawn with ordinary canvas paths and then snapped to the
 * palette, which is what removes the blended edges a canvas would otherwise
 * leave and gives the hard stair-stepped edges of hand-made pixel art. What
 * stands on the ground — trees, rocks, obelisks, crystals — is drawn once
 * per cell, snapped and outlined, and reused on every frame.
 *
 * Each region of the world is a boss's domain and takes its look from that
 * boss: see world.ts for which region is whose.
 */

/** A cell's width in pixels of art; its height is half that. */
export const ART_TILE = 64;

/** How far one terrace level lifts the ground, as a share of a tile's height. */
export const LEVEL_RISE = 0.6;

export type Phase = "day" | "dusk" | "night";

/** The time of day at a given hour, for a world that follows the clock. */
export const phaseAt = (hour: number): Phase =>
  hour >= 7 && hour < 18 ? "day" : (hour >= 18 && hour < 21) || (hour >= 5 && hour < 7) ? "dusk" : "night";

export type Scene = {
  /** The canvas's size in screen pixels. */
  width: number;
  height: number;
  /** How many screen pixels one pixel of art takes. */
  px: number;
  /** Where cell (0, 0) lands on screen at ground level, the camera's pan included. */
  origin: Position;
  /** The cells worth drawing, back to front. */
  cells: Position[];
  /** The walker, in cells, fractions and all. */
  walker: Position;
  hovered: Position | null;
  /** Cells the hovered walk would take, as "x,y". */
  route: Set<string>;
  /** Seconds, for what moves on its own. */
  time: number;
  phase: Phase;
  hero: { pose: "idle" | "walk"; direction: Direction; color?: string };
};

/* ---------- palettes, one per region, taken from its boss ---------- */

type Palette = {
  ground: string[];
  path: string;
  stone: string[];
  wood: string[];
  leaves: string[];
  pine: string[];
  grass: string;
  flowers: string[];
  shadow: string;
  earth: string[];
  outline: string;
  liquid: string[];
  /** The region's own glow: magma, runes, crystals. */
  accent: string;
};

const PALETTES: Record<Region, Palette> = {
  prairie: {
    ground: ["#6ea552", "#80b85e", "#94c96c"], path: "#c2a676", stone: ["#7f7a72", "#9b958b", "#b8b1a4", "#d6cfc0"],
    wood: ["#5e412a", "#86603e"], leaves: ["#3b7236", "#5a9e46", "#80c25a", "#a8dc78"], pine: ["#2c5a44", "#3e7a58", "#5d9c6c"],
    grass: "#3f6e34", flowers: ["#e0564a", "#f2c94c", "#ffffff"], shadow: "#4f7e40", earth: ["#6a4a3a", "#8a6048"],
    outline: "#1b201c", liquid: ["#2a6aa0", "#3a8ac0", "#5aaad8", "#b4e2f4"], accent: "#f2c94c",
  },
  earth: {
    ground: ["#5a5654", "#666260", "#726e6a"], path: "#8a7a6a", stone: ["#2e2c30", "#45424a", "#5e5a62", "#7a7680"],
    wood: ["#3a3230", "#544a44"], leaves: ["#4a5a3a", "#5e7044", "#76884e", "#92a05a"], pine: ["#34443a", "#44584a", "#5a705e"],
    grass: "#4a5a40", flowers: ["#f0a040", "#e06a2a", "#ffd070"], shadow: "#403c3c", earth: ["#2a2628", "#3a3436"],
    outline: "#120e10", liquid: ["#2a4a6a", "#36607e", "#4a7a96", "#9ab8c8"], accent: "#e2701e",
  },
  water: {
    ground: ["#3a4656", "#445264", "#506072"], path: "#6a7a86", stone: ["#1e2a3e", "#2c3c54", "#3e526c", "#566e88"],
    wood: ["#3a3a44", "#50505a"], leaves: ["#1e4a4a", "#28605c", "#347a70", "#4a9486"], pine: ["#1a3a44", "#244c56", "#306270"],
    grass: "#2e5a5a", flowers: ["#5ae0e0", "#9af0f0", "#e0f8f8"], shadow: "#2a3444", earth: ["#1a2230", "#242e40"],
    outline: "#070c14", liquid: ["#0c1e36", "#12304e", "#1c4a6a", "#5ae0e0"], accent: "#5ae0e0",
  },
  ice: {
    ground: ["#e6eef6", "#eef4fa", "#f8fbfe"], path: "#c8d4e6", stone: ["#7a90b8", "#94aad0", "#b4c6e4", "#d4e0f2"],
    wood: ["#5a5a6a", "#7a7a8a"], leaves: ["#8aa8d8", "#a8c2e8", "#c8daf4", "#eef4fc"], pine: ["#3a5a86", "#4e70a0", "#6a8cbc"],
    grass: "#a8bcd8", flowers: ["#8ab4f0", "#ffffff", "#c6dcfa"], shadow: "#c0cee4", earth: ["#4a5a7a", "#627496"],
    outline: "#16223a", liquid: ["#8ab4e0", "#a8ccee", "#c6e0f6", "#eef6fe"], accent: "#8ab4f0",
  },
  air: {
    ground: ["#4a3a52", "#56445e", "#62506a"], path: "#7a6a82", stone: ["#2e2436", "#42344c", "#584866", "#72607e"],
    wood: ["#2a1e28", "#3e2c38"], leaves: ["#3a2a44", "#4a3656", "#5c4468", "#72567e"], pine: ["#2a2234", "#3a2e46", "#4c3e5a"],
    grass: "#6a5474", flowers: ["#e0306a", "#ff6a9a", "#c38ff0"], shadow: "#2e2436", earth: ["#241a2a", "#342638"],
    outline: "#0c0810", liquid: ["#2a2a5a", "#3a3a72", "#4e4e8a", "#a0a0e0"], accent: "#e03aa0",
  },
  acid: {
    ground: ["#2e4a2a", "#385632", "#42623a"], path: "#5a5a32", stone: ["#2a3426", "#3a4834", "#4e5e44", "#667a58"],
    wood: ["#2a2418", "#403624"], leaves: ["#2a4a22", "#38602a", "#4a7a34", "#62943e"], pine: ["#1e3a26", "#284a30", "#365e3c"],
    grass: "#1e3a1a", flowers: ["#e6c040", "#9ce04a", "#c4f26a"], shadow: "#22361e", earth: ["#22261a", "#2e3424"],
    outline: "#0a100a", liquid: ["#2e6a14", "#4e9a1e", "#7ec82e", "#c4f26a"], accent: "#9ce04a",
  },
  fire: {
    ground: ["#3a3238", "#463c42", "#52464c"], path: "#5a4a4a", stone: ["#2e2a32", "#423c46", "#58505c", "#706874"],
    wood: ["#2a2226", "#403438"], leaves: ["#3a3036", "#4a3c40", "#5a4a4e", "#6a585a"], pine: ["#2a2e30", "#383e40", "#4a5254"],
    grass: "#6a5a50", flowers: ["#e2521d", "#ffb03a", "#8c2d4c"], shadow: "#241e24", earth: ["#2a2024", "#3a2c30"],
    outline: "#0e0b10", liquid: ["#8a1e10", "#c8401a", "#e2701e", "#ffc04a"], accent: "#ffb03a",
  },
};

/** Liquids that give their own light keep their colour at any hour. */
const GLOWING_LIQUID: Partial<Record<Region, boolean>> = { fire: true, acid: true };

const SKY: Record<Phase, string[]> = {
  day: ["#7fb8e6", "#95c6ec", "#aad3f0", "#c0def2", "#d6e9f4", "#e8f2f6"],
  dusk: ["#2c2455", "#4a2f6c", "#8a4478", "#c8607a", "#f09a6a", "#f6c46a"],
  night: ["#0a0c1e", "#0e1228", "#141a34", "#1a2240", "#222b4c", "#2a3456"],
};
const CLOUD: Record<Phase, string[]> = { day: ["#ffffff", "#e8f2f8"], dusk: ["#f4c4b8", "#fbe0d4"], night: ["#2e3858", "#3a4668"] };

const hex = (h: string): number[] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c: number[]) =>
  "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a: number[], b: number[], u: number) => a.map((v, i) => v + (b[i] - v) * u);

/**
 * Dusk and night are worked out from the day, the same way for every region,
 * so the whole world changes hour together and each region stays itself.
 */
const shift = (c: string, phase: Phase): string => {
  if (phase === "day") return c;
  const v = hex(c);
  if (phase === "dusk") return toHex(mix([v[0] * 0.92, v[1] * 0.82, v[2] * 0.88], [214, 120, 110], 0.08));
  return toHex(mix([v[0] * 0.5, v[1] * 0.55, v[2] * 0.7], [22, 26, 62], 0.2));
};

const phased = new Map<string, Palette>();
const paletteOf = (region: Region, phase: Phase): Palette => {
  const key = `${region}:${phase}`;
  let p = phased.get(key);
  if (!p) {
    const base = PALETTES[region];
    const s = (c: string) => shift(c, phase);
    p = {
      ground: base.ground.map(s), path: s(base.path), stone: base.stone.map(s), wood: base.wood.map(s),
      leaves: base.leaves.map(s), pine: base.pine.map(s), grass: s(base.grass), flowers: base.flowers.map(s),
      shadow: s(base.shadow), earth: base.earth.map(s),
      liquid: GLOWING_LIQUID[region] ? base.liquid : base.liquid.map(s),
      accent: base.accent, outline: base.outline,
    };
    phased.set(key, p);
  }
  return p;
};

/** Every colour the world may use at an hour: what the snapping snaps to. */
const EXTRA = ["#ece4d6", "#c38ff0", "#9ce04a", "#f6f8fc", "#e6c040", "#ff2a2a", "#4a78d0", "#8ab4f0", "#c6dcfa", "#fff0a8"];
const snapPalettes = new Map<Phase, { colours: number[][]; memo: Int16Array }>();
const snapPaletteOf = (phase: Phase) => {
  let s = snapPalettes.get(phase);
  if (!s) {
    const all = new Set<string>([...SKY[phase], ...CLOUD[phase], ...EXTRA]);
    for (const r of Object.keys(PALETTES) as Region[]) {
      const p = paletteOf(r, phase);
      [...p.ground, p.path, ...p.stone, ...p.wood, ...p.leaves, ...p.pine, p.grass, ...p.flowers, p.shadow, ...p.earth, p.outline, ...p.liquid, p.accent].forEach((c) => all.add(c));
    }
    // A colour, at 6 bits a channel, remembers which palette entry it snapped to.
    s = { colours: [...all].map(hex), memo: new Int16Array(1 << 18).fill(-1) };
    snapPalettes.set(phase, s);
  }
  return s;
};

/** Snap every pixel to the palette: no blend survives, as in hand-made pixel art. */
const snap = (ctx: CanvasRenderingContext2D, w: number, h: number, phase: Phase, x = 0, y = 0) => {
  const { colours, memo } = snapPaletteOf(phase);
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  w = Math.min(ctx.canvas.width - x, Math.ceil(w));
  h = Math.min(ctx.canvas.height - y, Math.ceil(h));
  if (w <= 0 || h <= 0) return;
  const img = ctx.getImageData(x, y, w, h);
  // Read four channels at once, and reuse the answer across runs of one
  // colour, which is most of any row: the ground is flat colour with edges.
  const px32 = new Uint32Array(img.data.buffer);
  let lastIn = -1;
  let lastOut = 0;
  for (let i = 0; i < px32.length; i++) {
    const v = px32[i];
    if (v === lastIn) {
      px32[i] = lastOut;
      continue;
    }
    lastIn = v;
    const a = v >>> 24;
    if (a < 110) {
      lastOut = 0;
      px32[i] = 0;
      continue;
    }
    const r = v & 255, gg = (v >>> 8) & 255, b = (v >>> 16) & 255;
    const key = ((r >> 2) << 12) | ((gg >> 2) << 6) | (b >> 2);
    let best = memo[key];
    if (best < 0) {
      let bd = Infinity;
      best = 0;
      for (let k = 0; k < colours.length; k++) {
        const c = colours[k];
        const dr = c[0] - r, dg = c[1] - gg, db = c[2] - b;
        const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (dd < bd) {
          bd = dd;
          best = k;
        }
      }
      memo[key] = best;
    }
    const c = colours[best];
    lastOut = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
    px32[i] = lastOut;
  }
  ctx.putImageData(img, x, y);
};

/** A one-pixel dark outline around whatever is drawn on a canvas. */
const outlined = (source: HTMLCanvasElement, colour: string): HTMLCanvasElement => {
  const w = source.width, h = source.height;
  const sil = document.createElement("canvas");
  sil.width = w;
  sil.height = h;
  const s = sil.getContext("2d") as CanvasRenderingContext2D;
  s.drawImage(source, 0, 0);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = colour;
  s.fillRect(0, 0, w, h);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const o = out.getContext("2d") as CanvasRenderingContext2D;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(sil, dx, dy);
  o.drawImage(source, 0, 0);
  return out;
};

/* ---------- drawing helpers, in pixels of art ---------- */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const LIGHT = -Math.PI * 0.75;
const TW = ART_TILE;
const TH = ART_TILE / 2;
const RISE = TH * LEVEL_RISE;

const poly = (g: Ctx, pts: Position[]) => {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
};
const fill = (g: Ctx, pts: Position[], colour: string, stroke?: string) => {
  poly(g, pts);
  g.fillStyle = colour;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1;
    g.stroke();
  }
};
const lerp = (a: Position, b: Position, u: number): Position => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
const quad = (q: Position[], u: number, v: number) => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);

/** The level a cell's ground is drawn at: a stair's floor is the level below. */
const floorOf = (p: Position): number => {
  if (!inWorld(p)) return -99;
  const g = groundAt(p);
  return g.level - (g.stair ? 1 : 0);
};

/* ---------- what stands on the ground, drawn once per cell ---------- */

type Standing = { canvas: HTMLCanvasElement; ax: number; ay: number; glow: { x: number; y: number; c: string }[] };
const standingCache = new Map<string, Standing>();
const BOX_W = 112;
const BOX_H = 176;

const gem = (g: Ctx, cx: number, cy: number, r: number, seed: number, tones: string[]) => {
  const n = 8, a0 = cellNoise(seed, 1, 3) * 0.6, outer: { x: number; y: number; a: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, k = 0.86 + 0.24 * cellNoise(seed, i, 4);
    outer.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k * 0.92, a });
  }
  const apex = { x: cx - r * 0.22, y: cy - r * 0.28 };
  for (let i = 0; i < n; i++) {
    const t = clamp01(0.5 + 0.5 * Math.cos(outer[i].a + Math.PI / n - LIGHT));
    fill(g, [apex, outer[i], outer[(i + 1) % n]], tones[Math.min(3, Math.floor(t * 3.99))]);
  }
};
const trunk = (g: Ctx, s: Position, topY: number, w: number, P: Palette) => {
  fill(g, [{ x: s.x - w, y: s.y }, { x: s.x + w, y: s.y }, { x: s.x + w * 0.6, y: topY }, { x: s.x - w * 0.6, y: topY }], P.wood[1]);
  fill(g, [{ x: s.x, y: s.y }, { x: s.x + w, y: s.y }, { x: s.x + w * 0.6, y: topY }, { x: s.x, y: topY }], P.wood[0]);
};
const tiers = (g: Ctx, s: Position, P: Palette, snow: boolean) => {
  trunk(g, s, s.y - TH * 0.45, TW * 0.03, P);
  const w0 = TW * 0.27, h0 = TH * 0.95;
  for (let t = 0; t < 3; t++) {
    const by = s.y - TH * 0.35 - t * h0 * 0.5, ww = w0 * (1 - t * 0.24), top = by - h0 * 0.55;
    fill(g, [{ x: s.x - ww, y: by }, { x: s.x, y: by + ww * 0.35 }, { x: s.x, y: top + ww * 0.16 }, { x: s.x - ww * 0.45, y: top }], P.pine[2]);
    fill(g, [{ x: s.x, y: by + ww * 0.35 }, { x: s.x + ww, y: by }, { x: s.x + ww * 0.45, y: top }, { x: s.x, y: top + ww * 0.16 }], P.pine[0]);
    fill(g, [{ x: s.x - ww * 0.45, y: top }, { x: s.x, y: top - ww * 0.16 }, { x: s.x + ww * 0.45, y: top }, { x: s.x, y: top + ww * 0.16 }], snow ? "#f6f8fc" : P.pine[1]);
  }
};
const boulder = (g: Ctx, s: Position, seed: number, P: Palette) => {
  const n = 7, rx = TW * 0.3, ry = rx * 0.52, hh = TH * (0.45 + cellNoise(seed, 2, 12) * 0.35), a0 = cellNoise(seed, 3, 13) * TAU;
  const base: Position[] = [], crown: Position[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, r = 1 + (cellNoise(seed, i, 20) - 0.5) * 0.3;
    base.push({ x: s.x + Math.cos(a) * rx * r, y: s.y + Math.sin(a) * ry * r });
    crown.push({ x: s.x + Math.cos(a) * rx * r * 0.6, y: s.y - hh + Math.sin(a) * ry * r * 0.6 });
  }
  const facets: { i: number; j: number; am: number }[] = [];
  for (let i = 0; i < n; i++) {
    const am = a0 + ((i + 0.5) / n) * TAU;
    if (Math.sin(am) >= -0.35) facets.push({ i, j: (i + 1) % n, am });
  }
  facets.sort((a, b) => Math.sin(a.am) - Math.sin(b.am));
  for (const f of facets) {
    const t = clamp01(0.5 - 0.55 * Math.cos(f.am + 0.5));
    fill(g, [base[f.i], base[f.j], crown[f.j], crown[f.i]], P.stone[Math.min(3, Math.floor(t * 3.2))]);
  }
  fill(g, crown, P.stone[3]);
};
const branches = (g: Ctx, s: Position, P: Palette, bend: number, thorns: boolean) => {
  const branch = (x0: number, y0: number, a: number, len: number, w: number, d: number) => {
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    g.strokeStyle = d ? P.wood[1] : P.wood[0];
    g.lineWidth = Math.max(1, w);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    if (thorns) {
      g.fillStyle = P.wood[1];
      g.fillRect(Math.round((x0 + x1) / 2) + 1, Math.round((y0 + y1) / 2) - 1, 2, 1);
    }
    if (d < 3) for (let k = 0; k < 2; k++) branch(x1, y1, a + (k ? 0.6 : -0.65) + bend, len * 0.64, w * 0.6, d + 1);
  };
  branch(s.x, s.y, -Math.PI / 2 + bend, TH * 0.95, TW * 0.055, 0);
};
const pillar = (g: Ctx, s: Position, hh: number, r: number, lit: string, dark: string) => {
  fill(g, [{ x: s.x - r, y: s.y }, { x: s.x, y: s.y + r * 0.5 }, { x: s.x, y: s.y - hh }, { x: s.x - r * 0.7, y: s.y - hh * 0.9 }], lit);
  fill(g, [{ x: s.x, y: s.y + r * 0.5 }, { x: s.x + r, y: s.y }, { x: s.x + r * 0.7, y: s.y - hh * 0.9 }, { x: s.x, y: s.y - hh }], dark);
};

/**
 * One cell's standing thing — its tree, its rock — in the look of its region:
 * a prairie tree is a crown of faceted leaves, the Monolith's is an obelisk
 * veined with magma, the Winter Heart's a cluster of crystals.
 */
const standingOf = (c: Position, gr: Ground, phase: Phase): Standing => {
  const key = `${c.x},${c.y}:${phase}`;
  const hit = standingCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = BOX_W;
  canvas.height = BOX_H;
  const g = canvas.getContext("2d", { willReadFrequently: true }) as Ctx;
  g.lineCap = "round";
  g.lineJoin = "round";
  const s = { x: BOX_W / 2, y: BOX_H - 24 };
  const P = paletteOf(gr.region, phase);
  const seed = c.x * 131 + c.y * 17;
  const alt = cellNoise(c.x, c.y, 15) >= 0.55;
  const glow: Standing["glow"] = [];

  if (gr.obstacle === "rock") {
    if (gr.region === "acid" && cellNoise(c.x, c.y, 16) < 0.4) {
      // A sword of someone who faced the Mother Gloop, rusting where it fell.
      const tilt = (cellNoise(c.x, c.y, 2) - 0.5) * 6;
      g.fillStyle = P.stone[3];
      for (let t = 0; t < 18; t++) g.fillRect(Math.round(s.x + (tilt * t) / 18), s.y - t, 2, 1);
      g.fillStyle = P.wood[1];
      g.fillRect(Math.round(s.x + tilt) - 4, s.y - 19, 10, 2);
      g.fillStyle = "#e6c040";
      g.fillRect(Math.round(s.x + tilt), s.y - 24, 2, 5);
    } else {
      boulder(g, s, seed, P);
      if (gr.region === "earth") {
        g.fillStyle = P.accent;
        for (let t = 0; t < 5; t++) g.fillRect(s.x - 4 + t, s.y - 8 - (t % 2), 1, 1);
        glow.push({ x: s.x, y: s.y - 8, c: P.accent });
      }
    }
  } else if (gr.obstacle === "tree") {
    switch (gr.region) {
      case "prairie":
        if (alt) tiers(g, s, P, false);
        else {
          const r = TW * 0.34, cy = s.y - TH * 1.3;
          trunk(g, s, cy + r * 0.4, TW * 0.05, P);
          const lobes = [[-0.52, -0.42, 0.56], [0.5, -0.46, 0.54], [0, -0.78, 0.52], [0, -0.12, 0.72], [-0.62, 0.14, 0.5], [0.62, 0.18, 0.48], [0.02, 0.36, 0.5]];
          lobes.forEach(([dx, dy, k], i) => gem(g, s.x + dx * r, cy + dy * r, k * r, seed + i, P.leaves));
        }
        break;
      case "earth": {
        // The Monolith's obelisks, veined with its magma.
        const hh = TH * 2 * (0.85 + cellNoise(c.x, c.y, 9) * 0.3);
        pillar(g, s, hh, TW * 0.13, P.stone[2], P.stone[0]);
        g.fillStyle = P.accent;
        for (let t = 0; t < 6; t++) g.fillRect(Math.round(s.x + 2 + (t % 2)), Math.round(s.y - hh * 0.2 - (t * hh) / 10), 1, 2);
        glow.push({ x: s.x + 2, y: s.y - hh * 0.4, c: P.accent });
        break;
      }
      case "water":
        if (alt) {
          // A rune stone of the Kraken's, lit cyan.
          const hh = TH * 1.3;
          pillar(g, s, hh, TW * 0.13, P.stone[2], P.stone[0]);
          g.fillStyle = P.accent;
          g.fillRect(s.x - 5, Math.round(s.y - hh * 0.6), 3, 1);
          g.fillRect(s.x - 4, Math.round(s.y - hh * 0.6), 1, 4);
          g.fillRect(s.x - 6, Math.round(s.y - hh * 0.4), 4, 1);
          glow.push({ x: s.x - 3, y: s.y - hh * 0.5, c: P.accent });
        } else {
          g.fillStyle = P.leaves[2];
          for (let k = 0; k < 5; k++) for (let t = 0; t < 16 + k * 3; t++) g.fillRect(s.x - 8 + k * 4 + Math.round(Math.sin(t * 0.5 + k) * 1.5), s.y - t, 1, 1);
        }
        break;
      case "ice":
        if (alt) tiers(g, s, P, true);
        else {
          for (let k = 0; k < 5; k++) {
            const x0 = s.x + (k - 2) * 5, hh = 10 + cellNoise(seed, k, 4) * 16, lean = (k - 2) * 2;
            fill(g, [{ x: x0 - 3, y: s.y }, { x: x0, y: s.y }, { x: x0 + lean, y: s.y - hh }, { x: x0 - 3 + lean, y: s.y - hh + 4 }], "#c6dcfa");
            fill(g, [{ x: x0, y: s.y }, { x: x0 + 3, y: s.y }, { x: x0 + 3 + lean, y: s.y - hh + 4 }, { x: x0 + lean, y: s.y - hh }], "#4a78d0");
          }
          glow.push({ x: s.x, y: s.y - 12, c: "#8ab4f0" });
        }
        break;
      case "air":
        if (alt) pillar(g, s, TH * 2.6, TW * 0.12, P.stone[2], P.stone[0]);
        else {
          branches(g, s, P, 0, true);
          glow.push({ x: s.x + 4, y: s.y - TH * 0.6, c: "#ff2a2a" });
        }
        break;
      case "acid":
        if (alt) {
          for (let k = 0; k < 3; k++) {
            const x0 = s.x + (k - 1) * 7, hh = 6 + Math.round(cellNoise(c.x, k, 2) * 5), r = 5 + Math.round(cellNoise(c.y, k, 3) * 2);
            g.fillStyle = "#ece4d6";
            g.fillRect(x0 - 1, s.y - hh, 2, hh);
            g.fillStyle = k % 2 ? "#c38ff0" : "#9ce04a";
            g.beginPath();
            g.ellipse(x0, s.y - hh, r, r * 0.6, 0, Math.PI, TAU);
            g.closePath();
            g.fill();
          }
          glow.push({ x: s.x, y: s.y - 8, c: "#9ce04a" });
        } else {
          branches(g, s, P, 0.25, false);
          g.fillStyle = P.leaves[1];
          for (let k = 0; k < 8; k++) g.fillRect(Math.round(s.x - 14 + cellNoise(k, c.x, 5) * 30), Math.round(s.y - TH * 1.3 + cellNoise(k, c.y, 6) * 14), 2, 5 + Math.round(cellNoise(k, 3, 5) * 5));
        }
        break;
      case "fire":
        if (alt) pillar(g, s, TH * 1.5, TW * 0.14, P.stone[1], P.stone[0]);
        else branches(g, s, P, 0, false);
        break;
    }
  }

  snap(g, BOX_W, BOX_H, phase);
  const standing = { canvas: outlined(canvas, P.outline), ax: s.x, ay: s.y, glow };
  standingCache.set(key, standing);
  return standing;
};

/* ---------- the painter ---------- */

const begin = (canvas: HTMLCanvasElement, w: number, h: number) => {
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  // Read back every frame to be snapped: kept in memory rather than on the GPU.
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as Ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return ctx;
};

/** Each frame of the hero, shrunk to the art's grid and outlined, made once. */
const heroFrames = new Map<string, HTMLCanvasElement>();
const heroFrame = (sheet: CanvasImageSource, key: string, frame: number, row: number, outline: string) => {
  const k = `${key}:${frame}:${row}:${outline}`;
  let c = heroFrames.get(k);
  if (!c) {
    const buffer = document.createElement("canvas");
    buffer.width = 64;
    buffer.height = 64;
    const b = buffer.getContext("2d") as Ctx;
    b.imageSmoothingEnabled = false;
    b.drawImage(sheet, frame * HERO_FRAME, row * HERO_FRAME, HERO_FRAME, HERO_FRAME, 0, 0, 64, 64);
    c = outlined(buffer, outline);
    heroFrames.set(k, c);
  }
  return c;
};

/**
 * The world in two sheets: the sky, the ground, everything behind the walker
 * and the walker itself on the first; on the second, whatever stands in front
 * — trees, creatures, and the edge of any terrace high enough to hide the
 * walker's feet — and the dark, at night.
 */
export const paintWorld = (behind: HTMLCanvasElement, front: HTMLCanvasElement, scene: Scene) => {
  const { px, phase, time, walker } = scene;
  const w = Math.max(1, Math.ceil(scene.width / px));
  const h = Math.max(1, Math.ceil(scene.height / px));
  const ox = Math.round(scene.origin.x / px);
  const oy = Math.round(scene.origin.y / px);
  const at = (c: Position, level: number): Position => ({
    x: ox + ((c.x - c.y) * TW) / 2,
    y: oy + ((c.x + c.y) * TH) / 2 - level * RISE,
  });
  const cornersOf = (s: Position) => ({
    T: { x: s.x, y: s.y - TH / 2 },
    R: { x: s.x + TW / 2, y: s.y },
    B: { x: s.x, y: s.y + TH / 2 },
    L: { x: s.x - TW / 2, y: s.y },
  });
  type Corners = ReturnType<typeof cornersOf>;

  const cells = scene.cells.filter((c) => {
    const s = at(c, groundAt(c).level);
    return s.x > -TW && s.x < w + TW && s.y > -TH * 3 && s.y < h + TH * 5;
  });
  const here = groundAt({ x: Math.round(walker.x), y: Math.round(walker.y) });
  const heroFeet = at(walker, heightAt(walker));

  const g = begin(behind, w, h);
  const f = begin(front, w, h);

  /* sky: the world is an island, and around it is sky */
  const sky = SKY[phase];
  for (let k = 0; k < sky.length; k++) {
    g.fillStyle = sky[k];
    g.fillRect(0, Math.floor((h * k) / sky.length), w, Math.ceil(h / sky.length) + 1);
  }
  const cl = CLOUD[phase];
  for (let k = 0; k < 8; k++) {
    const cx = ((((k * w * 0.19 + time * 3 + ox * 0.3) % (w * 1.4)) + w * 1.4) % (w * 1.4)) - w * 0.2;
    g.fillStyle = cl[k % 2];
    g.beginPath();
    g.ellipse(cx, h * (0.12 + (k % 4) * 0.24), w * 0.09, h * 0.04, 0, 0, TAU);
    g.fill();
  }

  const glows: { x: number; y: number; c: string; r: number }[] = [];
  const liquids: { x: number; y: number; region: Region }[] = [];

  /** A wall of coursed stone under a coping, in the region's stone. */
  const face = (ctx: Ctx, q: Position[], side: "R" | "L", c: Position, drop: number, P: Palette, region: Region, salt = 0) => {
    const tone = side === "R" ? 1 : 2;
    const hx = (k: number) => cellNoise(c.x * 7 + k, c.y * 13 + salt, 11 + (side === "R" ? 0 : 50));
    const cap = Math.min(0.22, 0.18 / Math.max(drop, 0.25));
    const rows = Math.max(1, Math.round(drop * 2.5));
    for (let r = 0; r < rows; r++) {
      const v0 = cap + ((1 - cap) * r) / rows, v1 = cap + ((1 - cap) * (r + 1)) / rows;
      const cuts = [0, ...(r % 2 ? [0.5] : [0.28, 0.72]), 1];
      for (let k = 0; k < cuts.length - 1; k++) {
        fill(ctx, [quad(q, cuts[k], v0), quad(q, cuts[k + 1], v0), quad(q, cuts[k + 1], v1), quad(q, cuts[k], v1)], P.stone[Math.min(3, tone + (hx(r * 9 + k) < 0.3 ? -1 : 0))], P.outline);
      }
    }
    const caps = [0, 0.36 + hx(1) * 0.1, 0.7 + hx(2) * 0.1, 1];
    for (let k = 0; k < caps.length - 1; k++) {
      fill(ctx, [quad(q, caps[k], -0.04), quad(q, caps[k + 1], -0.04), quad(q, caps[k + 1], cap), quad(q, caps[k], cap)], P.stone[3], P.outline);
    }
    if (region === "earth" && hx(40) < 0.6 && drop >= 0.5) {
      // The Monolith's magma shows in the walls too.
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1;
      const a0 = quad(q, 0.2 + hx(41) * 0.3, 0.3), a1 = quad(q, 0.5 + hx(42) * 0.3, 0.9);
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo((a0.x + a1.x) / 2 + 2, (a0.y + a1.y) / 2);
      ctx.lineTo(a1.x, a1.y);
      ctx.stroke();
      glows.push({ x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2, c: P.accent, r: 18 });
    }
  };

  /** The world's edge: earth and roots hanging down into the sky. */
  const underside = (ctx: Ctx, q: Position[], c: Position, P: Palette) => {
    const depth = TH * (2.2 + cellNoise(c.x, c.y, 9) * 1.4);
    const pts = [q[0], q[1]];
    for (let k = 4; k >= 0; k--) {
      const top = lerp(q[0], q[1], k / 4);
      pts.push({ x: top.x, y: top.y + depth * (k % 2 ? 1 : 0.5) });
    }
    fill(ctx, pts, P.earth[0], P.outline);
    fill(ctx, [q[0], q[1], lerp(q[1], { x: q[1].x, y: q[1].y + depth }, 0.3), lerp(q[0], { x: q[0].x, y: q[0].y + depth }, 0.3)], P.earth[1]);
  };

  /** One cell's ground: its top, the cliffs below it, its stair, its ink. */
  const groundCell = (ctx: Ctx, c: Position, redraw: boolean): { s: Position; k: Corners; gr: Ground } => {
    const gr = groundAt(c);
    const P = paletteOf(gr.region, phase);
    const lv = floorOf(c);
    const s = at(c, lv);
    const k = cornersOf(s);
    const liquid = gr.obstacle === "water" || gr.ford;
    const m = clamp01(gr.moss * 0.8 + cellNoise(c.x, c.y, 5) * 0.5);

    if (liquid) {
      // One colour across a whole pool, deeper away from its banks, and a
      // bank line wherever it meets the ground.
      const wet = (dx: number, dy: number) => {
        const n = groundAt({ x: c.x + dx, y: c.y + dy });
        return n.obstacle === "water" || n.ford;
      };
      const inland = wet(1, 0) && wet(-1, 0) && wet(0, 1) && wet(0, -1) && wet(1, 1) && wet(-1, -1) && wet(1, -1) && wet(-1, 1);
      fill(ctx, [k.T, k.R, k.B, k.L], inland ? P.liquid[0] : P.liquid[1]);
      ctx.strokeStyle = P.liquid[2];
      ctx.lineWidth = 1;
      for (const [dx, dy, a, b] of [[1, 0, k.R, k.B], [0, 1, k.L, k.B], [-1, 0, k.L, k.T], [0, -1, k.T, k.R]] as const) {
        if (wet(dx, dy)) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      if (!redraw) {
        liquids.push({ x: s.x, y: s.y, region: gr.region });
        if (GLOWING_LIQUID[gr.region]) glows.push({ x: s.x, y: s.y, c: P.liquid[2], r: 36 });
      }
      if (gr.ford) {
        for (let i = 0; i < 3; i++) {
          const p = lerp(k.T, k.B, (i + 0.5) / 3);
          ctx.fillStyle = P.stone[3];
          ctx.beginPath();
          ctx.ellipse(p.x + (cellNoise(c.x, c.y, 55 + i) - 0.5) * 8, p.y, 6, 3, 0, 0, TAU);
          ctx.fill();
        }
      }
    } else {
      fill(ctx, [k.T, k.R, k.B, k.L], P.ground[Math.min(2, Math.floor(m * 2.4))]);
      if (gr.path) fill(ctx, [lerp(k.T, s, 0.25), lerp(k.R, s, 0.25), lerp(k.B, s, 0.25), lerp(k.L, s, 0.25)], P.path);
    }

    const right = floorOf({ x: c.x + 1, y: c.y });
    const left = floorOf({ x: c.x, y: c.y + 1 });
    const qR = [k.R, k.B, { x: k.B.x, y: k.B.y + (lv - right) * RISE }, { x: k.R.x, y: k.R.y + (lv - right) * RISE }];
    const qL = [k.L, k.B, { x: k.B.x, y: k.B.y + (lv - left) * RISE }, { x: k.L.x, y: k.L.y + (lv - left) * RISE }];
    if (right === -99) underside(ctx, qR, c, P);
    else if (right < lv) face(ctx, qR, "R", c, lv - right, P, gr.region);
    if (left === -99) underside(ctx, qL, c, P);
    else if (left < lv) face(ctx, qL, "L", c, lv - left, P, gr.region);

    // Contours at the back edges; the front ones are the walls' own crests.
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 1;
    for (const [dx, dy, a, b] of [[-1, 0, k.L, k.T], [0, -1, k.T, k.R]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      const flight = groundAt(n).stair;
      const arriving = !!flight && flight.x === -dx && flight.y === -dy;
      const nf = floorOf(n);
      if (nf < lv && nf !== -99 && !arriving) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // A stair, carved into its terrace in the same stone as the walls.
    if (gr.stair) {
      const up = { x: -gr.stair.x, y: -gr.stair.y };
      const across = { x: Math.abs(up.y), y: Math.abs(up.x) };
      const floor = gr.level - 1;
      const blocks = [];
      for (let i = 0; i < 4; i++) {
        const t0 = -0.5 + i / 4, t1 = t0 + 0.25;
        const xs = [c.x + up.x * t0 - across.x * 0.5, c.x + up.x * t1 + across.x * 0.5];
        const ys = [c.y + up.y * t0 - across.y * 0.5, c.y + up.y * t1 + across.y * 0.5];
        blocks.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), top: floor + (i + 1) / 4 });
      }
      blocks.sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0));
      const project = (X: number, Y: number, hgt: number) => ({ x: ox + ((X - Y) * TW) / 2, y: oy + ((X + Y) * TH) / 2 - hgt * RISE });
      for (const bl of blocks) {
        face(ctx, [project(bl.x1, bl.y0, bl.top), project(bl.x1, bl.y1, bl.top), project(bl.x1, bl.y1, floor), project(bl.x1, bl.y0, floor)], "R", c, bl.top - floor, P, "prairie", 3);
        face(ctx, [project(bl.x0, bl.y1, bl.top), project(bl.x1, bl.y1, bl.top), project(bl.x1, bl.y1, floor), project(bl.x0, bl.y1, floor)], "L", c, bl.top - floor, P, "prairie", 5);
        fill(ctx, [project(bl.x0, bl.y0, bl.top), project(bl.x1, bl.y0, bl.top), project(bl.x1, bl.y1, bl.top), project(bl.x0, bl.y1, bl.top)], P.stone[3], P.outline);
      }
    }

    // Grass, flowers, and each region's own marks on free ground.
    if (!gr.obstacle && !gr.ford && !gr.stair && !gr.path) {
      const lean = Math.sin(time * 1.3 - (c.x + c.y) * 0.35) > 0.4 ? 1 : 0;
      ctx.fillStyle = P.grass;
      if (cellNoise(c.x, c.y, 60) < (gr.region === "ice" ? 0.25 : 0.6)) {
        for (let t = 0; t < 4; t++) {
          const gx = Math.round(s.x + (cellNoise(c.x, c.y, 62 + t) - 0.5) * TW * 0.5);
          const gy = Math.round(s.y + (cellNoise(c.x, c.y, 64 + t) - 0.5) * TH * 0.45);
          ctx.fillRect(gx + lean, gy - 3, 1, 3);
          ctx.fillRect(gx - 2 + lean, gy - 2, 1, 2);
          ctx.fillRect(gx + 2 + lean, gy - 2, 1, 2);
        }
      }
      if (cellNoise(c.x, c.y, 90) < 0.12) {
        ctx.fillStyle = P.flowers[Math.floor(cellNoise(c.x, c.y, 91) * P.flowers.length)];
        for (let t = 0; t < 3; t++) {
          ctx.fillRect(Math.round(s.x + (cellNoise(c.x, c.y, 92 + t) - 0.5) * TW * 0.4), Math.round(s.y + (cellNoise(c.x, c.y, 95 + t) - 0.5) * TH * 0.3) - 2, 2, 2);
        }
      }
      if (gr.region === "earth" && cellNoise(c.x, c.y, 30) < 0.3) {
        // Magma running through the Monolith's ground.
        ctx.fillStyle = P.accent;
        let vx = Math.round(s.x - 10 + cellNoise(c.x, c.y, 31) * 6), vy = Math.round(s.y - 2);
        for (let t = 0; t < 10; t++) {
          ctx.fillRect(vx, vy, 2, 1);
          vx += 2;
          vy += cellNoise(c.x + t, c.y, 32) < 0.5 ? 1 : -1;
        }
        if (!redraw) glows.push({ x: s.x, y: s.y, c: P.accent, r: 22 });
      }
      if (gr.region === "air" && cellNoise(c.x, c.y, 33) < 0.035) {
        // A rune circle traced on the Swarm's ground.
        ctx.strokeStyle = P.accent;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, TW * 0.34, TH * 0.34, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = P.accent;
        for (let t = 0; t < 8; t++) {
          const a = (t / 8) * TAU;
          ctx.fillRect(Math.round(s.x + Math.cos(a) * TW * 0.25), Math.round(s.y + Math.sin(a) * TH * 0.25), 2, 1);
        }
        if (!redraw) glows.push({ x: s.x, y: s.y, c: P.accent, r: 30 });
      }
    }
    if (gr.obstacle === "thicket") {
      ctx.fillStyle = P.grass;
      for (let t = 0; t < 12; t++) {
        const gx = Math.round(s.x + (cellNoise(c.x, c.y, 130 + t) - 0.5) * TW * 0.6);
        const gy = Math.round(s.y + (cellNoise(c.x, c.y, 140 + t) - 0.5) * TH * 0.5);
        ctx.fillRect(gx, gy - 5, 1, 5);
        ctx.fillRect(gx - 2, gy - 3, 1, 3);
        ctx.fillRect(gx + 2, gy - 4, 1, 4);
      }
    }
    return { s, k, gr };
  };

  /* ---------- the ground, back to front, then snapped ---------- */
  const marks: { k: Corners; s: Position; route: boolean; hover: boolean }[] = [];
  for (const c of cells) {
    const { s, k, gr } = groundCell(g, c, false);
    const hover = !!scene.hovered && scene.hovered.x === c.x && scene.hovered.y === c.y;
    const route = scene.route.has(`${c.x},${c.y}`);
    if (hover || route) {
      const m = gr.stair ? at(c, gr.level - 0.5) : s;
      marks.push({ k: gr.stair ? cornersOf(m) : k, s: m, route, hover });
    }
  }
  snap(g, w, h, phase);

  // Liquids move: a highlight crossing each cell, bubbles in the acid.
  for (const l of liquids) {
    const P = paletteOf(l.region, phase);
    const t = (time * (l.region === "ice" ? 0.2 : 1.2) + cellNoise(l.x, l.y, 3) * 5) % 5;
    if (t < 1.4) {
      g.fillStyle = P.liquid[3];
      g.fillRect(Math.round(l.x - 6 + t * 6), Math.round(l.y - 2 + cellNoise(l.x, 1, 4) * 4), 3, 1);
    }
    if (l.region === "acid" && cellNoise(l.x, l.y, 8) < 0.5) {
      const b = (time * 0.8 + cellNoise(l.x, l.y, 9)) % 1;
      g.fillStyle = P.liquid[3];
      g.fillRect(Math.round(l.x + (cellNoise(l.x, 2, 1) - 0.5) * 20), Math.round(l.y - b * 6), 2, 2);
    }
  }

  // The walk the pointer offers, and the cell under it, in crisp pixels.
  for (const m of marks) {
    if (m.route) {
      g.fillStyle = BOARD.move;
      g.fillRect(Math.round(m.s.x) - 1, Math.round(m.s.y) - 1, 3, 2);
    }
    if (m.hover) {
      g.strokeStyle = BOARD.move;
      g.lineWidth = 1;
      poly(g, [m.k.T, m.k.R, m.k.B, m.k.L]);
      g.stroke();
    }
  }

  /* ---------- what stands, the creatures and the walker, back to front ---------- */
  const frame = Math.floor(time * 12);
  const drawStanding = (ctx: Ctx, c: Position) => {
    const gr = groundAt(c);
    const s = at(c, gr.level);
    const P = paletteOf(gr.region, phase);
    if (gr.obstacle === "creature" && gr.creature) {
      const sheet = creatureSheet(gr.creature);
      const a = artOf(gr.creature);
      ctx.fillStyle = P.shadow;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 2, a * 0.22, a * 0.08, 0, 0, TAU);
      ctx.fill();
      if (sheet) {
        const row = gr.creature.startsWith("legend") ? ROWS.S : ROWS.SE;
        ctx.drawImage(sheet, (frame % FRAMES) * a, row * a, a, a, Math.round(s.x - a / 2), Math.round(s.y - a * CREATURE_FEET), a, a);
      }
      if (gr.boss) glows.push({ x: s.x, y: s.y - a * 0.4, c: P.accent, r: a * 0.6 });
      return;
    }
    if (gr.obstacle !== "rock" && gr.obstacle !== "tree") return;
    const st = standingOf(c, gr, phase);
    ctx.fillStyle = P.shadow;
    ctx.beginPath();
    ctx.ellipse(s.x + 6, s.y + 2, TW * 0.28, TH * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.drawImage(st.canvas, Math.round(s.x - st.ax), Math.round(s.y - st.ay));
    for (const gl of st.glow) glows.push({ x: s.x - st.ax + gl.x, y: s.y - st.ay + gl.y, c: gl.c, r: 22 });
  };

  for (const c of cells) if (!inFrontOf(c, walker)) drawStanding(g, c);

  // The walker: the hero's own sheet at a quarter of its size, outlined like the creatures.
  const hero = heroSheet(scene.hero.pose, scene.hero.color);
  if (hero) {
    const fr = Math.floor(time * (scene.hero.pose === "walk" ? 10 : 12)) % hero.frames;
    const P = paletteOf(here.region, phase);
    g.fillStyle = P.shadow;
    g.beginPath();
    g.ellipse(heroFeet.x, heroFeet.y + 1, 10, 4, 0, 0, TAU);
    g.fill();
    const sprite = heroFrame(hero.sheet, `${scene.hero.pose}:${scene.hero.color ?? ""}`, fr, ROWS[scene.hero.direction], P.outline);
    g.drawImage(sprite, Math.round(heroFeet.x - 32), Math.round(heroFeet.y - 64 * HERO_FEET));
  }

  /*
   * In front of the walker: the ground of any cell high enough to hide the
   * walker's feet, redrawn inside a box around the sprite and snapped, then
   * everything that stands in front.
   */
  const box = { x: heroFeet.x - 40, y: heroFeet.y - 64, w: 80, h: 84 };
  const standingHeight = heightAt(walker);
  f.save();
  f.beginPath();
  f.rect(box.x, box.y, box.w, box.h);
  f.clip();
  for (const c of cells) {
    if (!inFrontOf(c, walker)) continue;
    const gr = groundAt(c);
    const s = at(c, gr.level);
    if (Math.abs(s.x - heroFeet.x) > box.w / 2 + TW / 2 || s.y - TH / 2 > box.y + box.h || s.y + TH / 2 + MAX_LEVEL * RISE < box.y) continue;
    if (gr.level <= standingHeight + 0.01) continue;
    groundCell(f, c, true);
  }
  f.restore();
  snap(f, box.w, box.h, phase, box.x, box.y);
  for (const c of cells) if (inFrontOf(c, walker)) drawStanding(f, c);

  /* ---------- the hour: fireflies at dusk and night, darkness at night ---------- */
  if (phase !== "day") {
    f.fillStyle = "#fff0a8";
    for (let k = 0; k < 18; k++) {
      if (Math.sin(time * 2.4 + k * 2.1) < 0) continue;
      const life = (time * 0.15 + cellNoise(k, 1, 40)) % 1;
      f.fillRect(Math.round(cellNoise(k, 2, 40) * w + Math.sin(time * 0.7 + k) * 8), Math.round(h * 0.85 - life * h * 0.6), 1, 1);
    }
  }
  if (phase === "night") {
    const dark = document.createElement("canvas");
    dark.width = w;
    dark.height = h;
    const d = dark.getContext("2d") as Ctx;
    d.fillStyle = here.region === "fire" ? "rgba(6,4,8,.78)" : "rgba(6,10,26,.62)";
    d.fillRect(0, 0, w, h);
    d.globalCompositeOperation = "destination-out";
    const hole = (x: number, y: number, r: number) => {
      const grd = d.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(0,0,0,1)");
      grd.addColorStop(0.5, "rgba(0,0,0,.7)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = grd;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // The walker carries a light; what glows lights itself.
    hole(heroFeet.x, heroFeet.y - 20, 80 * (1 + 0.03 * Math.sin(time * 7)));
    for (const gl of glows) hole(gl.x, gl.y, gl.r * 1.4);
    f.drawImage(dark, 0, 0);
    for (const gl of glows) {
      f.fillStyle = gl.c;
      for (let k = 0; k < 6; k++) {
        if (Math.sin(time * 2 + k + gl.x) < 0.2) continue;
        const a = cellNoise(k, gl.x | 0, 1) * TAU, r = cellNoise(k, gl.y | 0, 2) * gl.r * 0.6;
        f.fillRect(Math.round(gl.x + Math.cos(a) * r), Math.round(gl.y + Math.sin(a) * r * 0.6), 1, 1);
      }
    }
  }
};
