/*
 * Old Grund's rampart, in the armour grimoire's pixel art: every pixel is
 * one cell of the grimoire's 4px grid, a 64th of a tile's width on the board.
 *
 * The cairn is five stones floating one above the other. It soaks up 15 for
 * the Stonewarden, 3 a stone, so what is left reads as the stones still up.
 * When it takes a blow, a wall of rock rises in front of him, takes it, and
 * bursts.
 */

const C = {
  white: "#ffffff",
  stoneO: "#2b2622",
  stoneD: "#5a5048",
  stone: "#7f7266",
  stoneH: "#a89a8b",
  stoneHH: "#cfc3b5",
  amber: "#e08a1e",
  amberH: "#ffd27a",
  dust: "#b9b0a2",
  fireW: "#fff1c9",
  shadow: "rgba(23,24,26,.16)",
};

/** How much a stone of the cairn holds. */
export const STONE_HEALTH = 3;
/** The stones, bottom up: width and height in grid pixels. */
const STONES: [number, number][] = [
  [16, 5],
  [14, 5],
  [13, 4],
  [11, 4],
  [9, 4],
];
/** How long a stone takes to tumble down, and the cairn to rise, in ms. */
export const STONE_FALL = 550;
export const CAIRN_RISE = 700;

const hash = (a: number, b = 0, c = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

/** Paints grid pixels at offsets from a point on screen. */
const painter = (ctx: CanvasRenderingContext2D, x: number, y: number, u: number) => {
  const ox = Math.round(x);
  const oy = Math.round(y);
  const rect = (lx: number, ly: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + Math.round(lx) * u, oy + Math.round(ly) * u, w * u, h * u);
  };
  const px = (lx: number, ly: number, c: string) => rect(lx, ly, 1, 1, c);
  return { px, rect };
};

/** How many stones a cairn with this much health still holds up. */
export const stonesLeft = (health: number) =>
  Math.max(0, Math.min(STONES.length, Math.ceil(health / STONE_HEALTH)));

/**
 * The cairn on its cell (x, y at the cell's centre). `left` stones float,
 * the rest lie at its foot; `fall` runs from 0 to 1 while the last one to go
 * tumbles down; `rise` is how far it has come up; `hit` flashes it.
 */
export const drawCairn = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  t: number,
  left: number,
  fall = 1,
  rise = 1,
  hit = 0
) => {
  const { px, rect } = painter(ctx, x, y, u);
  const block = (bx: number, by: number, w: number, h: number) => {
    rect(bx, by, w, h, C.stoneH);
    rect(bx, by, 2, h, C.stone);
    rect(bx + w - 2, by, 1, h, C.stoneHH);
    rect(bx, by, w, 1, C.stoneHH);
    rect(bx - 1, by, 1, h, C.stoneO);
    rect(bx + w, by, 1, h, C.stoneO);
    rect(bx - 1, by + h, w + 2, 1, C.stoneO);
    rect(bx - 1, by - 1, w + 2, 1, C.stoneO);
  };
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Its shadow, and the ground glowing faintly under the magic that holds it.
  ctx.fillStyle = C.shadow;
  for (let dy = -2; dy <= 2; dy++) {
    const h = Math.round(9 * Math.sqrt(1 - (dy * dy) / 9));
    ctx.fillRect(Math.round(x) - h * u, Math.round(y) + (dy + 1) * u, h * 2 * u, u);
  }

  // Where each stone floats: a little higher each, bobbing out of step.
  const seats: [number, number, number, number][] = [];
  let lift = 0;
  STONES.forEach(([w, h], i) => {
    const bob = rise >= 1 ? Math.round(Math.sin(t * 2 + i * 1.7)) : 0;
    seats.push([-w / 2, -lift - h - 2 - i + bob, w, h]);
    lift += h + 2;
  });
  const foot = (i: number, k: number): [number, number, number, number] => {
    const [w, h] = STONES[i];
    return [8 + k * 3 - w / 4, 3 - k - h / 3, Math.max(4, Math.round(w / 2)), Math.max(2, Math.round(h * 0.6))];
  };

  // The fallen, at its foot; the one still tumbling is drawn below.
  for (let i = left; i < STONES.length; i++) {
    if (i === left && fall < 1) continue;
    const [fx, fy, fw, fh] = foot(i, i - left);
    block(fx, fy, fw, fh);
  }

  // The stones still up, coming up one after the other as it is raised.
  for (let i = 0; i < left; i++) {
    const up = ease((rise - i / STONES.length) * 3);
    if (up <= 0) continue;
    const [sx, sy, w, h] = seats[i];
    const drop = Math.round((1 - up) * 20);
    const wob = hit > 0 ? Math.round(Math.sin(t * 60 + i) * hit) : 0;
    block(sx + wob, sy + drop, w, h);
    // the light that holds it up, under each stone
    if (rise >= 1) {
      ctx.globalAlpha = hit > 0 ? 0.9 : 0.35 + 0.2 * Math.sin(t * 3 + i);
      rect(sx + 2, sy + h + 1, w - 4, 1, hit > 0 ? C.white : C.amberH);
      ctx.globalAlpha = 1;
    }
  }

  // The stone that has just come down, on an arc from its seat to its foot.
  if (left < STONES.length && fall < 1) {
    const [sx, sy, w, h] = seats[left];
    const [fx, fy, fw, fh] = foot(left, 0);
    const v = ease(fall);
    block(
      sx + (fx - sx) * v,
      sy + (fy - sy) * v - Math.sin(Math.PI * v) * 10,
      Math.round(w + (fw - w) * v),
      Math.round(h + (fh - h) * v)
    );
    if (v > 0.85) {
      ctx.globalAlpha = (1 - v) / 0.15;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        px(fx + fw / 2 + Math.cos(a) * 5, fy + fh + Math.sin(a) * 2, C.dust);
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
};

/** A crack running down from a point: a zigzag, the same for the same seed. */
const crack = (
  px: (x: number, y: number, c: string) => void,
  x: number,
  y: number,
  len: number,
  seed: number,
  c: string
) => {
  let cx = x;
  for (let i = 0; i < len; i++) {
    cx += Math.round((hash(seed, i) - 0.5) * 2.4);
    px(cx, y + i, c);
  }
};

/** When the wall bursts, as a share of its whole life. */
const BURST = 0.45;
/** How long the wall lives, from rising to the last shard landing, in ms. */
export const WALL_LIFE = 1300;

/**
 * The wall of rock that takes a blow for the Stonewarden, `v` from 0 to 1 over
 * its life: it bursts out of the ground, shakes and splits as the blow lands,
 * then explodes into shards and dust.
 */
export const drawRampartWall = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  v: number
) => {
  if (v <= 0 || v >= 1) return;
  const { px, rect } = painter(ctx, x, y, u);
  ctx.save();
  if (v < BURST) {
    const up = ease(v / 0.2);
    const h = Math.round(20 * up);
    const k = clamp((v - 0.22) / (BURST - 0.22));
    const shake = k > 0 ? Math.round(Math.sin(v * 200)) : 0;
    for (let i = 0; i < 14; i++) {
      const top = -h + Math.round(Math.abs(i - 6) * 0.4);
      rect(-7 + i + shake, top, 1, h, i < 2 ? C.stone : i > 11 ? C.stoneHH : C.stoneH);
      px(-7 + i + shake, top, C.stoneHH);
      px(-7 + i + shake, top - 1, C.stoneO);
    }
    rect(-8 + shake, -h, 1, h, C.stoneO);
    rect(7 + shake, -h + 2, 1, Math.max(0, h - 2), C.stoneO);
    // dust thrown up as it bursts out of the ground
    if (v < 0.2) {
      ctx.globalAlpha = 1 - v / 0.2;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const d = 4 + 10 * (v / 0.2);
        px(Math.cos(a) * d * 1.5, Math.sin(a) * d * 0.5, C.dust);
      }
      ctx.globalAlpha = 1;
    }
    // it splits where the blow landed, a seam of light opening in it
    if (k > 0) {
      crack(px, shake, -h + 2, Math.round(6 + 10 * k), 17, C.stoneO);
      crack(px, -4 + shake, -h + 6, Math.round(4 + 8 * k), 29, C.stoneO);
      ctx.globalAlpha = k;
      crack(px, 1 + shake, -h + 3, Math.round(6 + 10 * k), 17, C.amberH);
      ctx.globalAlpha = 1;
    }
  } else {
    // The burst: a flash, shards thrown every way under gravity, and dust.
    const w = (v - BURST) / (1 - BURST);
    if (w < 0.3) {
      const r = Math.round(2 + 6 * (1 - w / 0.3));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = dx * dx + dy * dy;
          if (d <= r * r) px(dx, -10 + dy, d <= 2 ? C.white : d <= r * r * 0.5 ? C.fireW : C.amberH);
        }
      }
    }
    for (let i = 0; i < 24; i++) {
      const a = -Math.PI * hash(i, 41) * 1.1;
      const dir = hash(i, 43) > 0.5 ? 1 : -1;
      const sp = 10 + 22 * hash(i, 42);
      const sx = Math.cos(a) * sp * w * dir;
      const sy = -10 + Math.sin(a) * sp * w + 34 * w * w;
      ctx.globalAlpha = w < 0.75 ? 1 : (1 - w) / 0.25;
      const c = i % 4 === 0 ? C.stoneHH : i % 4 === 1 ? C.stoneO : C.stoneH;
      const size = i % 3 === 0 ? 2 : 1;
      rect(sx, sy, size, size, c);
    }
    ctx.globalAlpha = 1 - w;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const d = 4 + 16 * ease(w);
      px(Math.cos(a) * d * 1.5, Math.sin(a) * d * 0.5, i % 2 ? C.dust : C.stoneHH);
    }
  }
  ctx.restore();
};

/** How far into its life the wall bursts: when the blow's damage shows. */
export const WALL_BURSTS_AT = BURST * WALL_LIFE;
