/*
 * Sef's relay, a copper pylon, and the lightning that bounces off it, drawn
 * in the armour grimoire's pixel art: every pixel is one cell of the
 * grimoire's 4px grid, which is a 64th of a tile's width on the board.
 *
 * They are drawn by code rather than from a sheet so that the bolt can run
 * between any two cells, however far apart.
 */

type Point = [number, number];

const C = {
  white: "#ffffff",
  bolt: "#3b3ec2",
  boltMid: "#9aa2ff",
  boltHi: "#e7e9ff",
  spark: "#bfe8ff",
  air: "#8fd3ff",
  airDeep: "#2a5a8a",
  copperD: "#3b2314",
  copper: "#b8672e",
  copperM: "#7a4520",
  copperH: "#e8a15a",
  stoneO: "#2e3338",
  stone: "#7d858c",
  stoneH: "#a9b2ba",
  dust: "#b9b4a8",
  shadow: "rgba(23,24,26,.14)",
};

/** How tall the pylon stands, in grid pixels, from its cell's centre to its orb. */
const ORB = 44;
/** How long the pylon takes to come up out of the ground, in ms. */
export const PYLON_RISE = 900;

const hash = (a: number, b = 0, c = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

/** One grid pixel's side on screen, for a tile of this width. */
export const gridPixel = (tileWidth: number) => tileWidth / 64;

/** Paints grid pixels at offsets from a point on screen. */
const painter = (ctx: CanvasRenderingContext2D, x: number, y: number, u: number) => {
  const ox = Math.round(x);
  const oy = Math.round(y);
  const px = (lx: number, ly: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + Math.round(lx) * u, oy + Math.round(ly) * u, u, u);
  };
  const row = (lx: number, ly: number, w: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + Math.round(lx) * u, oy + Math.round(ly) * u, w * u, u);
  };
  return { px, row };
};

/** Where lightning strikes the pylon: its orb. */
export const pylonTop = (x: number, y: number, u: number): Point => [x + 0.5 * u, y - ORB * u];

/**
 * The pylon on its cell (x, y at the cell's centre): a stone slab, a copper
 * mast ringed with coils, and an orb of air crackling on top. `rise` is how
 * far it has come up out of the ground, `lit` how bright a strike left it.
 */
export const drawPylon = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  t: number,
  rise = 1,
  lit = 0
) => {
  const { px, row } = painter(ctx, x, y, u);
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Its shadow and the slab it stands on.
  ctx.fillStyle = C.shadow;
  for (let dy = -2; dy <= 2; dy++) {
    const h = Math.round(8 * Math.sqrt(1 - (dy * dy) / 9));
    ctx.fillRect(Math.round(x) - h * u, Math.round(y) + (dy + 1) * u, h * 2 * u, u);
  }
  for (let dy = -2; dy <= 2; dy++) {
    const h = 7 - Math.abs(dy);
    row(-h, dy, h * 2, dy < 0 ? C.stoneH : C.stone);
    px(-h, dy, C.stoneO);
    px(h - 1, dy, C.stoneO);
  }

  // The mast rises with the summon; what is still underground is not drawn.
  const top = -3 - Math.round((ORB - 3) * ease(rise));
  for (let ly = -3; ly >= top; ly--) {
    px(-1, ly, C.copperD);
    px(0, ly, C.copper);
    px(1, ly, C.copperM);
    px(2, ly, C.copperD);
  }
  for (const k of [10, 17, 24, 31]) {
    if (-k < top) continue;
    row(-3, -k, 7, C.copperH);
    px(-4, -k, C.copperD);
    px(4, -k, C.copperD);
    row(-2, -k + 1, 5, C.copperM);
  }

  if (rise < 1) {
    // Dust thrown up round its foot while it comes out of the ground.
    ctx.globalAlpha = 1 - rise;
    for (let i = 0; i < 8; i++) {
      const a = hash(i, 2) * Math.PI * 2;
      const r = 4 + 10 * rise;
      px(Math.cos(a) * r * 1.4, Math.sin(a) * r * 0.5, C.dust);
    }
    ctx.restore();
    return;
  }

  // The orb, pulsing, and the sparks it gives off.
  const r = 3 + (Math.floor(t * 3) % 2);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d > r * r) continue;
      px(dx, -ORB + dy, d >= (r - 1) * (r - 1) ? C.airDeep : d <= 2 ? C.white : C.air);
    }
  }
  const frame = Math.floor(t * 12);
  const sparks = lit > 0 ? 7 : 2;
  for (let i = 0; i < sparks; i++) {
    const a = hash(frame, i, x) * Math.PI * 2;
    const d = 4 + hash(i, frame, y) * (lit > 0 ? 6 : 3);
    px(Math.cos(a) * d, -ORB + Math.sin(a) * d, i % 2 ? C.white : C.spark);
  }
  if (lit > 0) {
    ctx.globalAlpha = lit;
    for (let ly = -40; ly < -3; ly += 2) px(0, ly, C.white);
  }
  ctx.restore();
};

/** A jagged path between two points on screen, in grid pixels. */
const boltPath = (a: Point, b: Point, seed: number, rough: number): Point[] => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(d / 5));
  const nx = -(b[1] - a[1]) / (d || 1);
  const ny = (b[0] - a[0]) / (d || 1);
  const out: Point[] = [a];
  for (let i = 1; i < n; i++) {
    const v = i / n;
    const o = (hash(seed, i) - 0.5) * 2 * rough * Math.sqrt(Math.sin(Math.PI * v));
    out.push([a[0] + (b[0] - a[0]) * v + nx * o, a[1] + (b[1] - a[1]) * v + ny * o]);
  }
  out.push(b);
  return out;
};

/** The grid pixels a straight line crosses. */
const cells = (x0: number, y0: number, x1: number, y1: number): Point[] => {
  const out: Point[] = [];
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y0 += sy;
    }
  }
  return out;
};

/**
 * A bolt from one point on screen to another: a white core in a violet rim,
 * as the grimoire draws lightning, with a fork. `seed` picks its zigzag; a
 * new seed every few frames makes it flicker.
 */
export const drawBolt = (
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  u: number,
  seed: number,
  alpha = 1,
  rough = 3.2
) => {
  // Everything in grid pixels, so the bolt lands on the same grid as the art.
  const g = (p: Point): Point => [p[0] / u, p[1] / u];
  const pts = boltPath(g(a), g(b), seed, rough);
  let all: Point[] = [];
  for (let i = 1; i < pts.length; i++) {
    all = all.concat(cells(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  }
  if (pts.length > 4) {
    const k = 1 + Math.floor(hash(seed, 9) * (pts.length - 3));
    const p = pts[k];
    all = all.concat(cells(p[0], p[1], p[0] + (hash(seed, 3) - 0.5) * 12, p[1] + 4 + hash(seed, 4) * 6));
  }
  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x * u, y * u, u, u);
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [x, y] of all) {
    dot(x - 1, y, C.bolt);
    dot(x + 1, y, C.bolt);
    dot(x, y - 1, C.bolt);
    dot(x, y + 1, C.bolt);
  }
  for (const [x, y] of all) dot(x, y, C.boltMid);
  all.forEach(([x, y], i) => i % 3 !== 1 && dot(x, y, C.boltHi));
  ctx.restore();
};

/** A ring of sparks thrown out from a point, `v` from 0 to 1 over its life. */
export const drawBurst = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  v: number,
  reach = 10
) => {
  if (v <= 0 || v >= 1) return;
  const { px } = painter(ctx, x, y, u);
  const d = 2 + reach * ease(v);
  ctx.save();
  ctx.globalAlpha = 1 - v;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + hash(i) * 0.3;
    px(Math.cos(a) * d, Math.sin(a) * d * 0.6, i % 3 ? C.spark : C.white);
  }
  // The flash at its heart, for the first moments.
  if (v < 0.3) {
    const r = Math.round(1 + 3 * (1 - v / 0.3));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) px(dx, dy, dx * dx + dy * dy <= 1 ? C.white : C.boltHi);
      }
    }
  }
  ctx.restore();
};

/**
 * The charge running down a struck pylon: its mast lit white, and a knot of
 * sparks travelling from the orb to the slab, `v` from 0 to 1 on the way.
 */
export const drawPylonCharge = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  v: number
) => {
  const { px } = painter(ctx, x, y, u);
  ctx.save();
  ctx.globalAlpha = 1 - 0.5 * v;
  for (let ly = -ORB + 3; ly < -3; ly++) {
    px(0, ly, C.white);
    if (ly % 2 === 0) px(1, ly, C.boltHi);
  }
  ctx.globalAlpha = 1;
  const at = Math.round(-ORB + (ORB - 4) * ease(v));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) px(dx, at + dy, Math.abs(dy) + Math.abs(dx - 0.5) < 1.5 ? C.white : C.boltHi);
  const frame = Math.floor(v * 20);
  for (let i = 0; i < 4; i++) {
    const a = hash(frame, i) * Math.PI * 2;
    px(0.5 + Math.cos(a) * 4, at + Math.sin(a) * 3, i % 2 ? C.white : C.spark);
  }
  ctx.restore();
};

/**
 * What a pylon has left, over its orb: shown once it has been hit, so a
 * whole pylon stays a clean silhouette.
 */
export const drawPylonHealth = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  health: number,
  max: number,
  colour: string
) => {
  if (health >= max) return;
  const { row } = painter(ctx, x, y, u);
  const w = 14;
  const left = -w / 2;
  const top = -ORB - 9;
  ctx.save();
  row(left - 1, top - 1, w + 2, C.stoneO);
  row(left - 1, top, w + 2, C.stoneO);
  row(left - 1, top + 1, w + 2, C.stoneO);
  row(left, top, w, "#3a2a2a");
  row(left, top, Math.max(1, Math.round((w * health) / max)), colour);
  ctx.restore();
};

/**
 * A pylon going off as it breaks, `v` from 0 to 1: a flash at the orb, the
 * mast torn into copper shards thrown out and falling, and a ring of sparks
 * over the ground round it.
 */
export const drawPylonShatter = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  v: number
) => {
  if (v <= 0 || v >= 1) return;
  const { px } = painter(ctx, x, y, u);
  ctx.save();
  // Shards of the mast and its coils, each on its own arc.
  for (let i = 0; i < 16; i++) {
    const a = hash(i, 5) * Math.PI * 2;
    const speed = 10 + hash(i, 6) * 18;
    const h0 = -8 - hash(i, 7) * (ORB - 8);
    const dx = Math.cos(a) * speed * v;
    const dy = h0 + Math.sin(a) * speed * 0.5 * v - 30 * v + 60 * v * v;
    const ly = Math.min(dy, 2);
    ctx.globalAlpha = v < 0.7 ? 1 : (1 - v) / 0.3;
    const c = i % 4 === 0 ? C.copperH : i % 4 === 1 ? C.copperD : i % 4 === 2 ? C.copperM : C.copper;
    px(dx, ly, c);
    if (i % 3 === 0) px(dx + 1, ly, c);
  }
  ctx.restore();
  // The charge it held, let go at once.
  drawBurst(ctx, x, y - ORB * u, u, v, 16);
  drawBurst(ctx, x, y, u, Math.min(0.99, v * 1.3), 20);
};
