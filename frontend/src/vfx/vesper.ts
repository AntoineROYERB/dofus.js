/*
 * Ser Vesper, drawn in code rather than from sheets.
 *
 * He is a knight with no head, only a soul burning where it was, and he is
 * not a sprite: he is a skeleton posed every frame (the knees and elbows
 * solved by IK from where the feet and hands should be), a cape and a tabard
 * simulated as cloth, and a head that is a noise field. Every gesture is a
 * function of real time, so he is drawn at the screen's own rate instead of
 * stepping through a sheet at 12 frames a second (ART_DIRECTION.md, 8).
 *
 * The picture is still the world's pixel art: he is painted at art
 * resolution, one pixel a 64th of a cell like every hero, in short stepped
 * palettes, with a 1 px dark outline, lit from the upper left, and the
 * caller scales the canvas up by a whole number with no smoothing.
 *
 * Three souls, one per outfit, share the body and every gesture: a blue
 * flame with a skull in it, a pale smoke out of a slit helm, a stag's skull.
 *
 * Nothing here touches the DOM, so it is tested in node. Its particles roll
 * their own seeded dice: they are decoration, never a fight's outcome.
 */

export type Soul = "ablaze" | "mist" | "antlers";
export type Gesture = "idle" | "walk" | "attack" | "cast" | "die";
type Rgb = readonly [number, number, number];

/** The canvas he is painted in, in art pixels, and where his feet stand in it. */
export const VESPER_ART = { w: 112, h: 120, feetX: 56, feetY: 92 } as const;

/** Art pixels to one of the skeleton's units: his body stands as tall as a hero's. */
const U = 0.36;

/** The soul an outfit's sprite name stands for, or null for a sheet outfit. */
export const soulOf = (sprite: string | undefined): Soul | null => {
  const s = sprite?.startsWith("vesper-") ? sprite.slice("vesper-".length) : "";
  return s === "ablaze" || s === "mist" || s === "antlers" ? s : null;
};

/* ------------------------------- palettes -------------------------------- */

interface Palette {
  head: "flame" | "smoke" | "antler";
  metal: Rgb[];
  gold: Rgb[];
  cloth: Rgb[];
  leather: Rgb;
  grip: Rgb;
  bone: Rgb;
  socket: Rgb;
  blade: Rgb[];
  soul: Rgb[];
  smoke: Rgb[];
  light: Rgb;
  cape: number;
  skirt: number;
  robe: boolean;
  emblem: "skull" | "rivet" | "moss";
}

const SOULS: Record<Soul, Palette> = {
  ablaze: {
    head: "flame",
    metal: [[30, 36, 58], [62, 74, 110], [108, 126, 168], [206, 220, 250]],
    gold: [[112, 70, 28], [196, 140, 54], [248, 208, 110]],
    cloth: [[18, 18, 32], [34, 32, 54], [58, 54, 86]],
    leather: [64, 40, 28], grip: [58, 34, 24], bone: [236, 220, 176], socket: [10, 22, 60],
    blade: [[96, 108, 132], [184, 198, 220], [236, 244, 255]],
    soul: [[28, 64, 184], [58, 146, 255], [126, 222, 255], [236, 252, 255]],
    smoke: [[26, 36, 74], [44, 62, 112], [70, 96, 150]],
    light: [70, 160, 255], cape: 40, skirt: 15, robe: false, emblem: "skull",
  },
  mist: {
    head: "smoke",
    metal: [[40, 56, 66], [80, 108, 116], [136, 168, 166], [222, 244, 232]],
    gold: [[70, 70, 66], [126, 128, 118], [190, 196, 180]],
    cloth: [[38, 30, 52], [70, 58, 90], [108, 94, 130]],
    leather: [52, 44, 54], grip: [40, 50, 52], bone: [220, 230, 210], socket: [8, 12, 14],
    blade: [[86, 132, 132], [168, 220, 214], [226, 255, 246]],
    soul: [[60, 140, 110], [120, 210, 170], [180, 246, 210], [236, 255, 244]],
    smoke: [[96, 140, 120], [160, 214, 184], [214, 246, 222]],
    light: [140, 240, 190], cape: 34, skirt: 33, robe: true, emblem: "rivet",
  },
  antlers: {
    head: "antler",
    metal: [[28, 24, 18], [62, 52, 34], [106, 88, 54], [206, 180, 124]],
    gold: [[104, 70, 24], [186, 136, 48], [250, 206, 100]],
    cloth: [[22, 26, 18], [42, 48, 28], [70, 76, 42]],
    leather: [60, 40, 22], grip: [70, 46, 24], bone: [232, 222, 176], socket: [26, 18, 8],
    blade: [[92, 80, 64], [176, 160, 128], [240, 226, 190]],
    soul: [[150, 86, 20], [230, 156, 40], [255, 214, 110], [255, 248, 214]],
    smoke: [[60, 50, 30], [96, 82, 50], [140, 120, 76]],
    light: [255, 186, 86], cape: 44, skirt: 19, robe: false, emblem: "moss",
  },
};

/* --------------------------------- maths --------------------------------- */

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (k: number) => {
  k = clamp(k, 0, 1);
  return k * k * (3 - 2 * k);
};
const easeOut = (k: number) => 1 - (1 - clamp(k, 0, 1)) ** 3;
const easeIn = (k: number) => clamp(k, 0, 1) ** 2.4;

const hash = (x: number, y: number, s = 0) => {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
// Value noise from a small table: the head reads it hundreds of times a
// frame, and hashing every corner was the cost.
const NOISE = new Float32Array(64 * 64);
for (let i = 0; i < NOISE.length; i++) NOISE[i] = hash(i & 63, i >> 6, 99);
const noise = (x: number, y: number) => {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const a = NOISE[((y0 & 63) << 6) | (x0 & 63)], b = NOISE[((y0 & 63) << 6) | ((x0 + 1) & 63)];
  const c = NOISE[(((y0 + 1) & 63) << 6) | (x0 & 63)], d = NOISE[(((y0 + 1) & 63) << 6) | ((x0 + 1) & 63)];
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 + noise(x * 4.3 + 9.1, y * 4.3) * 0.1;
const wind = (x: number, t: number) => Math.sin(x * 0.05 - t * 1.7) + 0.5 * Math.sin(x * 0.13 - t * 2.6);
const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ------------------------------- the pose -------------------------------- */

// Units: feet at (0, 0), facing +x, y down. A pose says where the hip, the
// feet and the hands go and how the sword is held; the joints are solved.
const THIGH = 20, SHIN = 19, ANKLE = 3, UPPER = 15, FORE = 14, BLADE = 50, HILT = 10;
const STAND = -(THIGH + SHIN) * 0.97 - ANKLE;

interface Pose {
  hx: number; hy: number; lean: number;
  fFx: number; fFy: number; fBx: number; fBy: number;
  hFx: number; hFy: number; hBx: number; hBy: number;
  sw: number; grip: number; two: number; flame: number; glow: number;
  /** A curve the near hand travels along to get here: a blow comes over the head. */
  via?: readonly [number, number];
}
const KEYS = ["hx", "hy", "lean", "fFx", "fFy", "fBx", "fBy", "hFx", "hFy", "hBx", "hBy", "sw", "grip", "two", "flame", "glow"] as const;

/** Where the near hand must be for the point to rest in the ground at x. */
const planted = (tipX: number, sw: number, grip: number) => {
  const L = HILT + BLADE - grip;
  return { hFx: tipX - Math.cos(sw) * L, hFy: 1 - Math.sin(sw) * L, sw, grip };
};
const IDLE: Pose = {
  hx: 0, hy: STAND + 0.5, lean: 0.03, fFx: 7, fFy: -ANKLE, fBx: -6, fBy: -ANKLE,
  ...planted(15, Math.PI / 2 + 0.06, 1), hBx: -4, hBy: -38, two: 1, flame: 1, glow: 0,
};
const pose = (o: Partial<Pose>): Pose => ({ ...IDLE, ...o });

const lerpPose = (a: Pose, b: Pose, k: number, shortest = false): Pose => {
  const o = { ...a, via: undefined };
  for (const key of KEYS) {
    let d = b[key] - a[key];
    // Blending between gestures turns the blade the short way round.
    if (shortest && key === "sw") d = (((d + Math.PI) % TAU) + TAU) % TAU - Math.PI;
    o[key] = a[key] + d * k;
  }
  if (b.via && !shortest) {
    const u = 1 - k;
    o.hFx = u * u * a.hFx + 2 * u * k * b.via[0] + k * k * b.hFx;
    o.hFy = u * u * a.hFy + 2 * u * k * b.via[1] + k * k * b.hFy;
  }
  return o;
};

type Key = readonly [number, Pose, ((k: number) => number)?];
const keyed = (keys: readonly Key[], s: number): Pose => {
  if (s <= keys[0][0]) return keys[0][1];
  for (let n = 1; n < keys.length; n++)
    if (s <= keys[n][0]) {
      const [t0, a] = keys[n - 1], [t1, b, e = smooth] = keys[n];
      return lerpPose(a, b, e((s - t0) / (t1 - t0)));
    }
  return keys[keys.length - 1][1];
};
/** The same gesture played faster: a fight waits on nobody's flourish. */
const quicker = (keys: readonly Key[], k: number): Key[] => keys.map(([t, p, e]) => [t * k, p, e]);

const READY = pose({ hx: -1, hy: STAND + 1.5, lean: 0, fFx: 9, fBx: -8, hFx: 10, hFy: -58, sw: -1.15, grip: 5 });
// A two-handed blow: the blade goes up behind, comes over the head and
// down in front, and is planted again.
const SLASH: Key[] = quicker([
  [0, READY],
  [0.3, pose({ hx: -3, hy: STAND + 2.5, lean: -0.18, fFx: 10, fBx: -10, hFx: -3, hFy: -77, sw: -2.55, grip: 5, flame: 1.15 }), easeOut],
  [0.42, pose({ hx: 5, hy: STAND + 6, lean: 0.38, fFx: 17, fBx: -11, hFx: 22, hFy: -46, sw: 0.45, grip: 5, flame: 1.35, glow: 1, via: [14, -90] }), easeIn],
  [0.62, pose({ hx: 6, hy: STAND + 6.5, lean: 0.42, fFx: 17, fBx: -11, hFx: 16, hFy: -30, sw: 1.15, grip: 5, flame: 1.1, glow: 0.4 }), easeOut],
  [1, IDLE],
], 0.62);
// The oath: the blade raised straight up, then driven into the ground.
const RAISED = pose({ hx: 0, hy: STAND - 1.5, lean: -0.1, fFx: 6, fFy: -ANKLE - 1, fBx: -5, fBy: -ANKLE - 1, hFx: 4, hFy: -87, sw: -Math.PI / 2, grip: 5, flame: 1.55, glow: 1 });
const OATH: Key[] = quicker([
  [0, READY],
  [0.45, RAISED, easeOut],
  [0.66, pose({ ...RAISED, hFy: -89, flame: 1.7 })],
  [0.76, pose({ hx: 3, hy: STAND + 7, lean: 0.3, fFx: 12, fBx: -9, ...planted(17, 1.66, 3), flame: 1.4, glow: 1 }), easeIn],
  [1.7, IDLE],
], 0.6);
const RECOIL = pose({ hx: -6, hy: STAND + 2, lean: -0.32, fFx: 5, fBx: -11, hFx: 6, hFy: -50, sw: -0.9, grip: 5, two: 0.6, flame: 0.55 });
// He falls to one knee on his planted blade, and the soul gutters.
const KNEEL = pose({ hx: 2, hy: -21, lean: 0.5, fFx: 11, fBx: -13, ...planted(17, 1.7, 1), flame: 0.1 });
const FALL: Key[] = [[0, READY], [0.2, RECOIL, easeOut], [0.85, KNEEL], [9, pose({ ...KNEEL, lean: 0.56, hy: -20.5, flame: 0.08 })]];

const GESTURES: Record<"attack" | "cast" | "die", { keys: Key[]; dur: number; impact: number }> = {
  attack: { keys: SLASH, dur: 0.62, impact: 0.42 * 0.62 },
  cast: { keys: OATH, dur: 1.7 * 0.6, impact: 0.76 * 0.6 },
  die: { keys: FALL, dur: Infinity, impact: 0.8 },
};

/* ------------------------------ the skeleton ----------------------------- */

interface Bone { jx: number; jy: number; ex: number; ey: number }
const ik = (px: number, py: number, tx: number, ty: number, a: number, b: number, bend: number): Bone => {
  const d = clamp(Math.hypot(tx - px, ty - py), Math.abs(a - b) + 0.01, a + b - 0.01);
  const th = Math.atan2(ty - py, tx - px), al = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const jx = px + Math.cos(th + bend * al) * a, jy = py + Math.sin(th + bend * al) * a;
  const ex = tx - jx, ey = ty - jy, el = Math.hypot(ex, ey) || 1;
  return { jx, jy, ex: jx + (ex / el) * b, ey: jy + (ey / el) * b };
};
type Pt = [number, number];
interface Skeleton {
  at: (a: number, b: number) => Pt;
  hipF: Pt; hipB: Pt; shF: Pt; shB: Pt; neck: Pt;
  legF: Bone; legB: Bone; armF: Bone; armB: Bone;
  dx: number; dy: number;
}
const skeleton = (P: Pose): Skeleton => {
  const ux = Math.sin(P.lean), uy = -Math.cos(P.lean), fx = Math.cos(P.lean), fy = Math.sin(P.lean);
  const at = (a: number, b: number): Pt => [P.hx + fx * a + ux * b, P.hy + fy * a + uy * b];
  const hipF = at(2, 0), hipB = at(-2, 0), shF = at(3, 22.5), shB = at(-4, 22.5);
  const dx = Math.cos(P.sw), dy = Math.sin(P.sw);
  // The far hand closes on the grip below the near one when both hold it.
  const hBx = lerp(P.hBx, P.hFx + dx * 3, P.two), hBy = lerp(P.hBy, P.hFy + dy * 3, P.two);
  return {
    at, hipF, hipB, shF, shB, dx, dy, neck: at(0.5, 27),
    legF: ik(hipF[0], hipF[1], P.fFx, P.fFy, THIGH, SHIN, -1),
    legB: ik(hipB[0], hipB[1], P.fBx, P.fBy, THIGH, SHIN, -1),
    armF: ik(shF[0], shF[1], P.hFx, P.hFy, UPPER, FORE, 1),
    armB: ik(shB[0], shB[1], hBx, hBy, UPPER, FORE, 1),
  };
};

/* ------------------------------- materials ------------------------------- */

// A material per pixel says what it is, so the outline knows the body from
// the smoke and the light knows the steel from the flame.
const M_OUTLINE = 1, M_BODY = 2, M_GLOW = 3, M_SMOKE = 4;
const OUTLINE: Rgb = [10, 9, 16];
// Light comes from the upper left, in screen space: facing left, he is
// still lit from the left.
const LX = -0.5, LY = -0.62, LZ = 0.6;
const lit = (nx: number, ny: number) => 0.5 + 0.5 * (nx * LX + ny * LY + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * LZ);
const metalTier = (v: number) => (v > 0.93 ? 3 : v > 0.74 ? 2 : v > 0.5 ? 1 : 0);
const goldTier = (v: number) => (v > 0.8 ? 2 : v > 0.5 ? 1 : 0);

interface Strand { n: number; seg: number; cut: number; x: Float32Array; y: Float32Array; px: Float32Array; py: Float32Array; init: boolean }
const cloth = (strands: number, len: number, pts: number): Strand[] =>
  Array.from({ length: strands }, (_, s) => ({
    n: pts,
    seg: len / (pts - 1),
    // Each strand its own length, so the hem is torn.
    cut: pts - (hash(s, 7, len | 0) < 0.45 ? 1 : 0) - (hash(s, 9) < 0.2 ? 1 : 0),
    x: new Float32Array(pts), y: new Float32Array(pts), px: new Float32Array(pts), py: new Float32Array(pts), init: false,
  }));

const SPARK = 0, EMBER = 1, SMOKE = 2, DUST = 3, LEAF = 4;
interface Particle { k: number; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number }

const CLOTH_STEP = 1 / 240;

/* --------------------------------- him ----------------------------------- */

export class Vesper {
  readonly w = VESPER_ART.w;
  readonly h = VESPER_ART.h;
  private pal: Palette;
  private t = 0;
  private gesture: Gesture = "idle";
  private st = 0;
  private from: Pose | null = null;
  private bt = -9;
  private pose: Pose = IDLE;
  private sk: Skeleton = skeleton(IDLE);
  private face: 1 | -1 = 1;
  private dist = 0;
  private fl = 0;
  private flash = 0;
  /** The last step, for what the heads give off as they are drawn. */
  private dt = 1 / 60;
  private cape: Strand[] = [];
  private skirt: Strand[] = [];
  private clothAcc = 0;
  private parts: Particle[] = [];
  private rings: { x: number; y: number; t0: number; dur: number; max: number }[] = [];
  private trail: { t: number; ax: number; ay: number; bx: number; by: number }[] = [];
  private tip: Pt = [0, 0];
  private head: Pt = [0, 0];
  private lights: { x: number; y: number; rad: number; str: number }[] = [];
  private rnd: () => number;
  // The picture: a material, a colour and whether it shines, per pixel.
  private M: Uint8Array;
  private R: Float32Array;
  private G: Float32Array;
  private B: Float32Array;
  private EM: Uint8Array;

  constructor(soul: Soul, seed = 1) {
    this.pal = SOULS[soul];
    this.rnd = mulberry(seed);
    const n = this.w * this.h;
    this.M = new Uint8Array(n);
    this.R = new Float32Array(n);
    this.G = new Float32Array(n);
    this.B = new Float32Array(n);
    this.EM = new Uint8Array(n);
    this.resetCloth();
    // Two breaths apart, so two of him never stand in step.
    this.t = seed * 1.37;
  }

  setSoul(soul: Soul) {
    if (this.pal === SOULS[soul]) return;
    this.pal = SOULS[soul];
    this.resetCloth();
  }

  /** What he is doing and which way he faces. A new gesture starts from wherever he was. */
  play(gesture: Gesture, face: 1 | -1) {
    if (face !== this.face) this.turn(face);
    if (gesture === this.gesture) return;
    this.from = this.pose;
    this.bt = this.t;
    this.gesture = gesture;
    this.st = this.t;
  }

  get playing(): Gesture {
    return this.gesture;
  }

  /** Moves him on by dt seconds of real time. */
  step(dt: number) {
    dt = clamp(dt, 0, 0.05);
    this.dt = dt;
    this.t += dt;
    const s = this.t - this.st;
    let P: Pose;
    if (this.gesture === "idle") P = this.idle();
    else if (this.gesture === "walk") {
      this.dist += 46 * dt;
      P = this.walk();
      if (this.rnd() < 5 * dt) this.emit(DUST, this.fx(-4), VESPER_ART.feetY, -this.face * 10 * U * this.rnd(), -8 * U * this.rnd(), 0.5);
    } else {
      const g = GESTURES[this.gesture];
      P = keyed(g.keys, s);
      if (s - dt < g.impact && s >= g.impact) this.impact();
      // A blow or an oath, once played, is a guard again until told otherwise.
      if (s >= g.dur) {
        this.from = P;
        this.bt = this.t;
        this.gesture = "idle";
        this.st = this.t;
      }
    }
    if (this.from && this.t - this.bt < 0.18) P = lerpPose(this.from, P, smooth((this.t - this.bt) / 0.18), true);
    this.pose = P;
    this.sk = skeleton(P);
    const a = this.sk.armF, L = HILT + BLADE - P.grip;
    this.tip = [this.fx(a.ex + Math.cos(P.sw) * L), this.fy(a.ey + Math.sin(P.sw) * L)];

    // The soul leans back from where he goes, and with the wind.
    const want = (this.gesture === "walk" ? -this.face * 0.55 : 0) + wind(this.t * 3, this.t) * 0.09 + Math.sin(this.t * 1.7) * 0.06;
    this.fl += (want - this.fl) * Math.min(1, dt * 6);

    // Cloth at a fixed step, so it hangs the same at 30 and 144 frames.
    this.clothAcc += dt;
    while (this.clothAcc >= CLOTH_STEP) {
      this.stepCloth(this.cape, (n, of) => this.sk.at(-8 + (n / (of - 1)) * 9, 24 - n * 0.2), true);
      this.stepCloth(this.skirt, (n, of) => this.sk.at(6 - (n / (of - 1)) * 12, 1.6), false);
      this.clothAcc -= CLOTH_STEP;
    }
    this.stepParticles(dt);
    this.flash = Math.max(0, this.flash - dt * 6);
  }

  /** Paints him into an RGBA buffer of VESPER_ART's size; empty pixels are clear. */
  render(out: Uint8ClampedArray) {
    this.M.fill(0);
    this.EM.fill(0);
    this.lights.length = 0;
    this.drawBody();
    this.drawTrail();
    this.drawParticles();
    this.outline();
    this.light();
    const { M, R, G, B } = this;
    for (let i = 0, o = 0; i < M.length; i++, o += 4) {
      if (!M[i]) {
        out[o + 3] = 0;
        continue;
      }
      out[o] = R[i];
      out[o + 1] = G[i];
      out[o + 2] = B[i];
      out[o + 3] = 255;
    }
  }

  /* ------------------------------ gestures ------------------------------ */

  private idle(): Pose {
    const T = this.t;
    const br = 0.5 - 0.5 * Math.cos((T * TAU) / 3.2), sway = Math.sin((T * TAU) / 6.1);
    const P = pose({});
    P.hx += sway * 0.5;
    P.lean += sway * 0.015 - br * 0.02;
    P.hy += br * 0.5;
    P.hFy -= br * 0.7;
    P.hFx += sway * 0.2;
    P.flame = 1 + 0.07 * Math.sin(T * 2.2) + 0.05 * br;
    // Now and then he lifts the blade a hand's breadth and drives it back in.
    const p = T % 8.7;
    if (p < 1.5) {
      const bump = Math.sin((p / 1.5) * Math.PI) ** 2;
      P.hFy -= 9 * bump;
      P.hFx += 2 * bump;
      P.flame += 0.35 * bump;
      P.glow = bump * 0.6;
      P.lean -= 0.05 * bump;
    }
    return P;
  }

  private walk(): Pose {
    const a = (this.dist / 20) * Math.PI;
    const foot = (ph: number): Pt => {
      const u = (((ph / TAU) % 1) + 1) % 1;
      if (u < 0.5) return [10 - 20 * (u / 0.5), -ANKLE];
      const k = (u - 0.5) / 0.5;
      return [-10 + 20 * smooth(k), -ANKLE - Math.sin(k * Math.PI) * 7];
    };
    const [fFx, fFy] = foot(a), [fBx, fBy] = foot(a + Math.PI);
    return pose({
      hx: 1, hy: STAND + 1.4 + Math.cos(2 * a) * 1.1, lean: 0.1 + Math.cos(2 * a) * 0.02,
      fFx, fFy, fBx, fBy,
      // The blade rests on his shoulder as he goes.
      hFx: 7 + Math.sin(a) * 0.8, hFy: -55 + Math.cos(2 * a) * 0.8, sw: -2.3 + Math.sin(a) * 0.05, grip: 7, two: 0,
      hBx: -2 + 7 * Math.sin(a), hBy: -37, flame: 1.05,
    });
  }

  private impact() {
    const [tx, ty] = this.tip, gy = VESPER_ART.feetY;
    if (this.gesture === "attack") {
      this.burst(tx, ty, 14, 90 * U, SPARK);
      if (ty > gy - 14 * U) this.burst(tx, gy, 6, 30 * U, DUST, 10 * U);
    } else if (this.gesture === "cast") {
      this.rings.push({ x: tx, y: gy, t0: this.t, dur: 0.8, max: 70 * U }, { x: tx, y: gy, t0: this.t + 0.1, dur: 0.7, max: 44 * U });
      this.burst(tx, gy - 2 * U, 26, 120 * U, SPARK, 60 * U);
      for (let k = 0; k < 16; k++) this.emit(EMBER, tx + (this.rnd() - 0.5) * 8 * U, gy - this.rnd() * 6 * U, (this.rnd() - 0.5) * 20 * U, -(40 + this.rnd() * 80) * U, 0.8 + this.rnd() * 0.6);
    } else if (this.gesture === "die") {
      this.burst(this.fx(14), gy, 8, 30 * U, DUST, 8 * U);
      for (let k = 0; k < 4; k++) this.emit(SMOKE, this.head[0], this.head[1], (this.rnd() - 0.5) * 6 * U, -12 * U, 2 + this.rnd(), 2 * U);
    }
    this.flash = 0;
  }

  private turn(face: 1 | -1) {
    // Mirror the cloth about him, or it would whip across his body.
    const cx = VESPER_ART.feetX * 2;
    for (const st of [...this.cape, ...this.skirt])
      for (let j = 0; j < st.n; j++) {
        st.x[j] = cx - st.x[j];
        st.px[j] = cx - st.px[j];
      }
    this.trail.length = 0;
    this.face = face;
  }

  /* -------------------------------- cloth ------------------------------- */

  private resetCloth() {
    this.cape = cloth(7, this.pal.cape, 9);
    this.skirt = cloth(3, this.pal.skirt, 6);
  }

  private fx(x: number) {
    return VESPER_ART.feetX + this.face * x * U;
  }
  private fy(y: number) {
    return VESPER_ART.feetY + y * U;
  }

  private stepCloth(strands: Strand[], anchor: (n: number, of: number) => Pt, isCape: boolean) {
    const P = this.pose, f = this.face, dt = CLOTH_STEP, g = 420 * U, T = this.t;
    const walking = this.gesture === "walk" ? 1 : 0;
    strands.forEach((st, s) => {
      const [axL, ayL] = anchor(s, strands.length);
      const ax = this.fx(axL), ay = this.fy(ayL);
      if (!st.init) {
        for (let j = 0; j < st.n; j++) {
          st.x[j] = st.px[j] = ax - f * j * 0.3 * U;
          st.y[j] = st.py[j] = ay + j * st.seg * U;
        }
        st.init = true;
      }
      st.x[0] = st.px[0] = ax;
      st.y[0] = st.py[0] = ay;
      const fan = isCape ? (strands.length - 1 - s) / (strands.length - 1) : 0;
      for (let j = 1; j < st.n; j++) {
        const depth = j / st.n;
        // The cape fans out behind him, more so when he walks; the tabard
        // only stirs.
        const push = isCape ? 26 + 110 * fan * depth + 140 * walking * depth : 6 + 30 * walking;
        const fx = (-f * push + wind(st.x[j] * 4, T) * (isCape ? 46 : 14) + Math.sin(T * 5.3 + s * 1.7 + j * 0.6) * 30 * depth) * U;
        const vx = (st.x[j] - st.px[j]) * 0.985, vy = (st.y[j] - st.py[j]) * 0.985;
        st.px[j] = st.x[j];
        st.py[j] = st.y[j];
        st.x[j] += vx + fx * dt * dt;
        st.y[j] += vy + g * dt * dt;
      }
      for (let j = 1; j < st.n; j++) {
        const dx = st.x[j] - st.x[j - 1], dy = st.y[j] - st.y[j - 1], d = Math.hypot(dx, dy) || 1e-6, L = st.seg * U;
        st.x[j] = st.x[j - 1] + (dx / d) * L;
        st.y[j] = st.y[j - 1] + (dy / d) * L;
        // It may swing out, never through him nor through the ground.
        let lx = (f * (st.x[j] - VESPER_ART.feetX)) / U;
        const ly = (st.y[j] - VESPER_ART.feetY) / U;
        const lim = isCape ? (ly < P.hy ? P.hx - 7.5 + Math.sin(P.lean) * (P.hy - ly) : P.hx - 4.5) : P.hx + 11;
        if (lx > lim) lx = lim;
        if (!isCape && lx < P.hx - 9) lx = P.hx - 9;
        st.x[j] = VESPER_ART.feetX + f * lx * U;
        if (ly > -0.6) st.y[j] = VESPER_ART.feetY - 0.6 * U;
      }
    });
  }

  /* ------------------------------ particles ----------------------------- */

  private emit(k: number, x: number, y: number, vx: number, vy: number, life: number, size = 1) {
    if (this.parts.length < 300) this.parts.push({ k, x, y, vx, vy, life, max: life, size });
  }
  private burst(x: number, y: number, n: number, speed: number, k: number, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * TAU, v = speed * (0.3 + this.rnd() * 0.7);
      this.emit(k, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.7 - up, 0.35 + this.rnd() * 0.5);
    }
  }
  private stepParticles(dt: number) {
    const T = this.t, f = this.face;
    this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
    for (const p of this.parts) {
      if (p.k === SPARK) {
        p.vy += 150 * U * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
      } else if (p.k === EMBER) {
        p.vy -= 22 * U * dt;
        p.vx += (wind(p.x * 4, T) * 14 - f * 6) * U * dt;
      } else if (p.k === SMOKE) {
        p.vy -= 6 * U * dt;
        p.vx += (wind(p.x * 4, T) * 6 - f * 5) * U * dt;
        p.size += 3.2 * U * dt;
      } else if (p.k === DUST) {
        p.vy += 40 * U * dt;
        p.vx *= 0.95;
        p.vy *= 0.95;
      } else if (p.k === LEAF) {
        p.vy = 9 * U;
        p.vx = (Math.sin(T * 2.3 + p.max * 7) * 12 + wind(p.x * 4, T) * 8) * U;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === DUST && p.y > VESPER_ART.feetY) p.vy = 0;
    }
    this.rings = this.rings.filter((r) => T - r.t0 <= r.dur);
  }

  /* ------------------------------- brushes ------------------------------ */

  private put(i: number, m: number, c: Rgb, k = 1, emit = false) {
    let r = c[0] * k, g = c[1] * k, b = c[2] * k;
    const fl = this.flash;
    if (fl > 0 && m === M_BODY) {
      r += (255 - r) * fl;
      g += (255 - g) * fl;
      b += (255 - b) * fl;
    }
    this.M[i] = m;
    this.R[i] = Math.min(255, r);
    this.G[i] = Math.min(255, g);
    this.B[i] = Math.min(255, b);
    this.EM[i] = emit ? 1 : 0;
  }
  private metal(i: number, v: number, k: number) {
    this.put(i, M_BODY, this.pal.metal[metalTier(v)], k);
  }
  private gold(i: number, v: number, k: number) {
    this.put(i, M_BODY, this.pal.gold[goldTier(v)], k);
  }
  private metalFn(k: number) {
    return (i: number, nx: number, ny: number) => this.metal(i, lit(nx, ny), k);
  }
  private goldFn(k: number) {
    return (i: number, nx: number, ny: number) => this.gold(i, lit(nx, ny), k);
  }

  // A segment with a radius at each end; the shader gets the pixel's offset
  // from the axis over the radius, which is the normal of a round limb.
  private capsule(ax: number, ay: number, bx: number, by: number, ra: number, rb: number, fn: (i: number, nx: number, ny: number, h: number) => void) {
    ra = Math.max(ra, 0.55);
    rb = Math.max(rb, 0.55);
    const x0 = Math.max(0, Math.floor(Math.min(ax - ra, bx - rb))), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax + ra, bx + rb)));
    const y0 = Math.max(0, Math.floor(Math.min(ay - ra, by - rb))), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay + ra, by + rb)));
    const dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy || 1e-6;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax, py = y + 0.5 - ay;
        const h = clamp((px * dx + py * dy) / ll, 0, 1);
        const qx = px - dx * h, qy = py - dy * h, r = ra + (rb - ra) * h;
        if (qx * qx + qy * qy > r * r) continue;
        fn(y * this.w + x, qx / r, qy / r, h);
      }
  }
  private disc(cx: number, cy: number, rx: number, ry: number, fn: (i: number, nx: number, ny: number, x: number, y: number) => void) {
    rx = Math.max(rx, 0.6);
    ry = Math.max(ry, 0.6);
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, cy + ry); y++)
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.w - 1, cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) fn(y * this.w + x, nx, ny, x, y);
      }
  }
  // Any polygon, concave too, by scanline and even-odd spans.
  private poly(pts: number[], fn: (i: number, x: number, y: number) => void) {
    let y0 = Infinity, y1 = -Infinity;
    for (let k = 1; k < pts.length; k += 2) {
      y0 = Math.min(y0, pts[k]);
      y1 = Math.max(y1, pts[k]);
    }
    const n = pts.length >> 1, xs: number[] = [];
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let k = 0; k < n; k++) {
        const ax = pts[2 * k], ay = pts[2 * k + 1], bx = pts[(2 * k + 2) % pts.length], by = pts[(2 * k + 3) % pts.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5)); x++) fn(y * this.w + x, x, y);
    }
  }

  /* -------------------------------- body -------------------------------- */

  private drawBody() {
    const Sk = this.sk, P = this.pose;
    const X = (p: Pt) => this.fx(p[0]), Y = (p: Pt) => this.fy(p[1]);
    this.drawCloth(this.cape, 0.82, false);
    // The far arm, shoulder and leg, in the shade of the body.
    const D = 0.6;
    this.arm(Sk.shB, Sk.armB, D);
    this.disc(X(Sk.shB), Y(Sk.shB) - 1 * U, 8.5 * U, 7 * U, this.metalFn(D));
    this.leg(Sk.hipB, Sk.legB, D);
    if (!this.pal.robe) this.drawCloth(this.skirt, 0.9, true);
    this.torso();
    this.leg(Sk.hipF, Sk.legF, 1);
    if (this.pal.robe) this.drawCloth(this.skirt, 1, true);
    // The soul rises from inside the collar, behind the near shoulder.
    this.drawHead();
    this.collar();
    // The sword, then the hand that grips it, then the pauldron over the arm.
    this.sword(X([Sk.armF.ex, Sk.armF.ey]), Y([Sk.armF.ex, Sk.armF.ey]), this.face * Sk.dx, Sk.dy, P);
    this.arm(Sk.shF, Sk.armF, 1);
    this.pauldron();
  }

  private drawCloth(strands: Strand[], k: number, front: boolean) {
    const C = this.pal.cloth;
    for (let s = 0; s + 1 < strands.length; s++) {
      const A = strands[s], Bs = strands[s + 1], nn = Math.min(A.cut, Bs.cut);
      for (let j = 0; j + 1 < nn; j++) {
        // Folds: strands alternate in and out of the light, and a fold that
        // swings towards the light catches it.
        const dx = A.x[j + 1] - A.x[j], dy = A.y[j + 1] - A.y[j];
        const fold = 0.5 + 0.5 * Math.cos(s * 2.2 + j * 0.35) + (-dx / (Math.hypot(dx, dy) || 1)) * 0.35 * this.face;
        const v = fold * 0.8 - (j === 0 && !front ? 0.3 : 0);
        const c = C[v > 0.7 ? 2 : v > 0.35 ? 1 : 0];
        this.poly([A.x[j], A.y[j], Bs.x[j], Bs.y[j], Bs.x[j + 1], Bs.y[j + 1], A.x[j + 1], A.y[j + 1]], (i) => this.put(i, M_BODY, c, k));
      }
      // Torn ends: whichever strand runs longer leaves a point.
      const L = A.cut > Bs.cut ? A : Bs.cut > A.cut ? Bs : null;
      if (L) {
        const O = L === A ? Bs : A, j = nn - 1;
        this.poly([O.x[j], O.y[j], L.x[j], L.y[j], L.x[j + 1], L.y[j + 1]], (i) => this.put(i, M_BODY, C[0], k));
      }
    }
  }

  private arm(sh: Pt, a: Bone, k: number) {
    const X = (x: number) => this.fx(x), Y = (y: number) => this.fy(y);
    const sx = X(sh[0]), sy = Y(sh[1]), ex = X(a.jx), ey = Y(a.jy), hx = X(a.ex), hy = Y(a.ey);
    // A dark sleeve shows between the plates, as on the first reference.
    this.capsule(sx, sy, ex, ey, 3.4 * U, 3 * U, (i, nx, ny) => this.put(i, M_BODY, this.pal.cloth[lit(nx, ny) > 0.72 ? 2 : 1], k));
    this.capsule(lerp(ex, hx, 0.15), lerp(ey, hy, 0.15), hx, hy, 3.3 * U, 2.8 * U, this.metalFn(k));
    this.disc(ex, ey, 2.7 * U, 2.7 * U, this.metalFn(k));
    this.disc(lerp(ex, hx, 0.8), lerp(ey, hy, 0.8), 3.3 * U, 3.3 * U, this.goldFn(k));
    this.disc(hx, hy, 3 * U, 3 * U, this.metalFn(k * 0.85));
  }

  private leg(hip: Pt, l: Bone, k: number) {
    const hx = this.fx(hip[0]), hy = this.fy(hip[1]), kx = this.fx(l.jx), ky = this.fy(l.jy), ax = this.fx(l.ex), ay = this.fy(l.ey);
    this.capsule(hx, hy, kx, ky, 5.4 * U, 4.2 * U, this.metalFn(k));
    this.capsule(kx, ky, ax, ay, 4.1 * U, 3 * U, this.metalFn(k));
    this.disc(kx, ky, 3.8 * U, 3.5 * U, (i, nx, ny) => (nx * nx + ny * ny > 0.55 ? this.gold(i, lit(nx, ny), k) : this.metal(i, lit(nx, ny), k)));
    // A sabaton, flat on the ground whatever the shin does.
    const pts = [[-3.2, -1], [4, -0.6], [8.6, 2.2], [8.8, 3], [-3.6, 3]];
    this.poly(pts.flatMap(([a, b]) => [ax + this.face * a * U, ay + b * U]), (i, _x, y) => this.metal(i, lit(0, (y - ay) / (3 * U) - 0.4), k));
  }

  private T2(a: number, b: number): Pt {
    const p = this.sk.at(a, b);
    return [this.fx(p[0]), this.fy(p[1])];
  }

  private torso() {
    const plate = [[-7, 3], [7.4, 3], [9.6, 12], [9.2, 20], [4.5, 25.5], [-5.5, 25.5], [-8.6, 19], [-8, 9]];
    const c = this.T2(1.5, 14), rx = 9.5 * U, ry = 13 * U;
    this.poly(plate.flatMap(([a, b]) => this.T2(a, b)), (i, x, y) => {
      const nx = clamp((x + 0.5 - c[0]) / rx, -1, 1), ny = clamp((y + 0.5 - c[1]) / ry, -1, 1);
      this.metal(i, lit(nx * 0.9, ny * 0.7), 1);
    });
    // Three lames below the waist, each lit along its top edge.
    for (let n = 2; n >= 0; n--) {
      const b = 3 - 3.3 * n;
      const pts = [[-7.4, b], [7.8, b], [8.6 + n * 0.5, b - 4.4], [-8 - n * 0.4, b - 4.4]];
      const top = this.T2(0, b)[1], bot = this.T2(0, b - 4.4)[1];
      this.poly(pts.flatMap(([a, q]) => this.T2(a, q)), (i, _x, y) => this.metal(i, lit(0, ((y + 0.5 - top) / (bot - top || 1)) * 1.6 - 0.9), 0.95));
    }
    this.poly([[-7.4, 1.4], [7.8, 1.4], [7.8, 3.8], [-7.4, 3.8]].flatMap(([a, b]) => this.T2(a, b)), (i) => this.put(i, M_BODY, this.pal.leather));
    const bk = this.T2(7.4, 2.6);
    this.disc(bk[0], bk[1], 1.6 * U, 1.6 * U, this.goldFn(1));
    this.poly([[-5.6, 23.4], [4.8, 23.4], [4.2, 25.6], [-5.4, 25.6]].flatMap(([a, b]) => this.T2(a, b)), (i) => this.gold(i, 0.6, 1));
  }

  private collar() {
    // A dark cowl round the neck, ragged at the top, that the soul rises out of.
    const hi = this.pal.robe ? 29 : 27.5;
    const pts = [[-8, 21], [7, 21], [6.4, 25.5], [4, hi], [1, hi - 1.6], [-1.5, hi + 0.4], [-4.5, hi - 1.2], [-7.4, 26]];
    this.poly(pts.flatMap(([a, b]) => this.T2(a, b)), (i, x, y) => this.put(i, M_BODY, this.pal.cloth[hash(x, y, 5) < 0.3 ? 0 : 1]));
  }

  private pauldron() {
    const f = this.face;
    const [cx, cy] = this.T2(3.5, 19.5), rx = 10 * U, ry = 7 * U;
    for (let n = 2; n >= 1; n--)
      this.disc(cx - f * 0.5 * U, cy + n * 2.6 * U, rx * (1 - n * 0.06), ry * 0.62, (i, nx, ny) => {
        if (ny > -0.1) this.metal(i, lit(nx, ny) - 0.08 * n, 1);
      });
    this.disc(cx, cy, rx, ry, (i, nx, ny) => {
      const v = lit(nx * 0.8, ny * 0.8) + 0.08;
      // A gold rim, and a raised ridge from front to back.
      if (nx * nx + ny * ny > 0.66 || Math.abs(ny + 0.35 - nx * 0.1) < 0.09) return this.gold(i, v, 1);
      this.metal(i, v, 1);
    });
    const ex = cx + f * 0.8 * U, ey = cy - 0.2 * U;
    if (this.pal.emblem === "skull") {
      this.disc(ex, ey - 0.4 * U, 3.2 * U, 2.8 * U, (i, nx, ny) => this.put(i, M_BODY, this.pal.bone, lit(nx, ny) > 0.5 ? 1 : 0.8));
      for (const s of [-1, 1]) this.disc(ex + s * 1.25 * U, ey - 0.2 * U, 0.85 * U, 1 * U, (i) => this.put(i, M_BODY, [30, 20, 14]));
    } else if (this.pal.emblem === "moss") {
      // Leaves and moss grow on the shoulder, as on the stag knight.
      this.disc(cx - f * 1.5 * U, cy - 4 * U, 6 * U, 3 * U, (i, _nx, ny, x, y) => {
        if (ny > 0.2 || hash(x, y, 3) < 0.35) return;
        this.put(i, M_BODY, hash(x, y, 4) < 0.4 ? ([[214, 110, 30], [190, 74, 24], [240, 160, 50]] as Rgb[])[(x + y) % 3] : [60, 72, 34]);
      });
    } else {
      this.disc(ex, ey, 1.2 * U, 1.2 * U, this.goldFn(1));
    }
  }

  private sword(hx: number, hy: number, dx: number, dy: number, P: Pose) {
    const BL = this.pal.blade;
    const px = hx - dx * P.grip * U, py = hy - dy * P.grip * U;
    const gx = px + dx * HILT * U, gy = py + dy * HILT * U;
    const tx = gx + dx * BLADE * U, ty = gy + dy * BLADE * U;
    const nx = -dy, ny = dx, w0 = 2.1 * U, w1 = 1.6 * U;
    const mx = gx + dx * BLADE * 0.82 * U, my = gy + dy * BLADE * 0.82 * U;
    this.poly([gx + nx * w0, gy + ny * w0, mx + nx * w1, my + ny * w1, tx, ty, mx - nx * w1, my - ny * w1, gx - nx * w0, gy - ny * w0], (i, x, y) => {
      // The edge towards the light is bright, the other dull.
      const s = (x + 0.5 - gx) * nx + (y + 0.5 - gy) * ny;
      this.put(i, M_BODY, s * (nx * LX + ny * LY) > 0 ? BL[2] : BL[1]);
    });
    this.capsule(px, py, gx, gy, 1.2 * U, 1.1 * U, (i, _a, _b, h) => this.put(i, M_BODY, this.pal.grip, Math.floor(h * 8) & 1 ? 0.7 : 1));
    // The cross: a bar with round ends and a block at its heart that holds
    // a gem of the soul.
    this.capsule(gx - nx * 7.5 * U, gy - ny * 7.5 * U, gx + nx * 7.5 * U, gy + ny * 7.5 * U, 1.15 * U, 1.15 * U, this.goldFn(1));
    for (const s of [-1, 1]) this.disc(gx + nx * s * 8 * U, gy + ny * s * 8 * U, 1.7 * U, 1.7 * U, this.goldFn(1));
    const gem = 0.6 + 0.4 * Math.sin(this.t * 3) + P.glow * 0.6;
    this.disc(gx + dx * 0.6 * U, gy + dy * 0.6 * U, 0.9 * U, 0.9 * U, (i) => this.put(i, M_GLOW, this.pal.soul[gem > 1 ? 3 : 2], 1, true));
    this.disc(px, py, 2 * U, 2 * U, this.goldFn(1));
    // The last fifth of a second of the blow's path, for the smear.
    const s = this.t - this.st;
    if ((this.gesture === "attack" && s > 0.18 && s < 0.38) || (this.gesture === "cast" && s > 0.38 && s < 0.48))
      this.trail.push({ t: this.t, ax: gx + dx * 30 * U, ay: gy + dy * 30 * U, bx: tx, by: ty });
    while (this.trail.length && this.t - this.trail[0].t > 0.2) this.trail.shift();
    if (P.glow > 0.05) this.lights.push({ x: (gx + tx) / 2, y: (gy + ty) / 2, rad: 26 * U + 4, str: P.glow * 0.6 });
  }

  private drawTrail() {
    const tr = this.trail;
    for (let n = 1; n < tr.length; n++) {
      // A crescent that cools as it ages and breaks up as it goes.
      const a = tr[n - 1], b = tr[n], age = (this.t - b.t) / 0.2;
      const c = this.pal.soul[age < 0.2 ? 2 : age < 0.5 ? 1 : 0];
      if ((b.bx - a.bx) ** 2 + (b.by - a.by) ** 2 < 1) continue;
      this.poly([a.ax, a.ay, a.bx, a.by, b.bx, b.by, b.ax, b.ay], (i, x, y) => {
        if (hash(x, y, Math.floor(this.t * 30)) < age * 1.1 - 0.1) return;
        this.put(i, M_GLOW, c, 1, true);
      });
    }
  }

  private drawParticles() {
    const S = this.pal.soul, SM = this.pal.smoke, w = this.w;
    for (const p of this.parts) {
      const age = p.life / p.max, x = Math.round(p.x), y = Math.round(p.y);
      if (x < 0 || y < 0 || x >= w || y >= this.h) continue;
      const i = y * w + x;
      if (p.k === SPARK || p.k === EMBER) this.put(i, M_GLOW, S[Math.min(3, Math.floor(age * 4))], 1, true);
      else if (p.k === SMOKE) {
        const c = SM[age > 0.66 ? 2 : age > 0.33 ? 1 : 0];
        this.disc(p.x, p.y, p.size, p.size * 0.8, (j) => {
          if (this.M[j] !== M_BODY) this.put(j, M_SMOKE, c, 1, this.pal.head === "smoke");
        });
      } else if (p.k === DUST) this.put(i, M_SMOKE, [120, 104, 82]);
      else if (p.k === LEAF) this.put(i, M_BODY, ([[230, 120, 30], [196, 70, 26], [250, 176, 60]] as Rgb[])[Math.floor(p.max * 10) % 3]);
    }
    for (const r of this.rings) {
      const k = (this.t - r.t0) / r.dur;
      if (k < 0) continue;
      const rad = r.max * easeOut(k), c = this.pal.soul[k < 0.3 ? 3 : k < 0.6 ? 2 : 1];
      for (let a = 0; a < TAU; a += 1 / Math.max(8, rad)) {
        if (hash(Math.floor(a * 40), 3, Math.floor(this.t * 12)) < k * 0.7) continue;
        const x = Math.round(r.x + Math.cos(a) * rad), y = Math.round(r.y + Math.sin(a) * rad * 0.42);
        if (x >= 0 && y >= 0 && x < w && y < this.h) this.put(y * w + x, M_GLOW, c, 1, true);
      }
    }
  }

  /* -------------------------------- heads ------------------------------- */

  private drawHead() {
    const [nx, ny] = this.T2(0.5, 27);
    if (this.pal.head === "flame") this.flameHead(nx, ny);
    else if (this.pal.head === "smoke") this.smokeHead(nx, ny);
    else this.antlerHead(nx, ny);
  }

  // The soul as a field: a teardrop leaning away from where he goes, eaten
  // from the top by noise that scrolls up, with a skull in its core.
  private flameField(bx: number, by: number, scale: number, skull: boolean) {
    const S = this.pal.soul, T = this.t, f = this.face, w = this.w;
    const H = 42 * U * scale, W = 12.5 * U * Math.sqrt(Math.max(scale, 0.1));
    const lean = this.fl - f * 0.22;
    const ss = clamp(scale, 0.25, 1.15), fcx = bx + f * 1.6 * U * ss, fcy = by - 11 * U * ss;
    for (let y = Math.max(0, Math.floor(by - H * 1.15)); y <= Math.min(this.h - 1, Math.ceil(by + 3 * U)); y++) {
      const v = (by - y) / H;
      if (v < -0.12) continue;
      const cx = bx + lean * H * v * v + Math.sin(T * 3.1 + v * 5) * W * 0.3 * v + Math.sin(T * 5.7 - v * 9) * W * 0.18 * v;
      const wd = W * Math.pow(Math.max(0, 1 - v * 0.92), 0.6) * Math.min(1, (v + 0.14) * 4) + 0.5;
      for (let x = Math.max(0, Math.floor(cx - wd * 1.6)); x <= Math.min(w - 1, Math.ceil(cx + wd * 1.6)); x++) {
        // Tongues: the edge is pushed in and out by a noise of its own, so
        // the flame splits into licks instead of reading as a candle.
        const lick = (noise((y - by) / (3 * U) + T * 5, x > cx ? 3 : 9) - 0.5) * 0.9 * v;
        const d = (x + 0.5 - cx) / wd + lick, I = 1 - d * d;
        if (I < -1.2) continue;
        // Two scrolls, slow tongues and a fast flicker, so the edge never
        // holds still from one frame to the next.
        const n = fbm((x - bx) / (5 * U) + 7, (y - by) / (5.5 * U) + T * 2.8) * 0.8 + noise((x - bx) / (2.2 * U), (y - by) / (2.6 * U) + T * 6.5) * 0.35;
        let e = I * 1.15 - (1.1 - n) * (0.42 + v * 1.25) + 0.32;
        if (skull) {
          const ex = (x + 0.5 - fcx) / (6 * U * ss), ey = (y + 0.5 - fcy) / (7.2 * U * ss), q = ex * ex + ey * ey;
          if (q < 1) e += 0.42 * (1 - q) + 0.12;
        }
        if (e <= 0) continue;
        this.put(y * w + x, M_GLOW, S[e > 1.02 ? 3 : e > 0.66 ? 2 : e > 0.36 ? 1 : 0], 1, true);
      }
    }
    if (skull && scale > 0.3) {
      // Two sockets and a nose, dark in the white core. At a hero's size a
      // socket is a pixel or two: that is all a skull needs.
      for (const [ex, ey] of [[-1.1, -0.6], [3.1, -0.6]])
        this.disc(fcx + f * ex * U * ss, fcy + ey * U * ss, 1.55 * U * ss, 1.95 * U * ss, (i) => this.put(i, M_GLOW, this.pal.socket, 1, true));
      this.disc(fcx + f * 1.3 * U * ss, fcy + 2.4 * U * ss, 0.7 * U * ss, 0.9 * U * ss, (i) => this.put(i, M_GLOW, this.pal.socket, 1, true));
    }
    return H;
  }

  private flameHead(nx: number, ny: number) {
    const P = this.pose, T = this.t;
    const s = P.flame * (1 + 0.06 * Math.sin(T * 9.3) + 0.04 * Math.sin(T * 13.7));
    const H = this.flameField(nx, ny + 3 * U, s, true);
    // Tongues come loose at the top as embers, and smoke above them.
    const dt = this.dt;
    if (this.rnd() < 22 * s * dt) this.emit(EMBER, nx + (this.rnd() - 0.5) * 6 * U + this.fl * H * 0.8, ny - H * (0.7 + this.rnd() * 0.3), (this.rnd() - 0.5) * 10 * U, -18 * U * (0.6 + this.rnd()), 0.5 + this.rnd() * 0.6);
    if (this.rnd() < 6 * dt && s > 0.3) this.emit(SMOKE, nx + this.fl * H, ny - H * 0.95, (this.rnd() - 0.5) * 4 * U, -10 * U, 1.4 + this.rnd(), 1.2 * U);
    this.head = [nx, ny - 12 * U * Math.min(1, s)];
    this.lights.push({ x: nx, y: ny - 12 * U, rad: (58 * U + 8) * (0.55 + 0.45 * Math.min(1.6, s)), str: 0.85 * Math.min(1, s * 1.6) + P.glow * 0.3 });
  }

  private smokeHead(nx: number, ny: number) {
    // A narrow helm with three slits; from its crown the soul pours out as a
    // pale smoke, as on the second reference.
    const P = this.pose, f = this.face, T = this.t, s = P.flame, w = this.w;
    ny -= 2.5 * U;
    const hp = [[-4.8, 1], [5.4, 1], [6, -11], [3.6, -14.4], [-3.2, -14.4], [-5.2, -11.5]];
    this.poly(hp.flatMap(([a, b]) => [nx + f * a * U, ny + b * U]), (i, x, y) => this.metal(i, lit((x - nx) / (5 * U), (y - ny + 6 * U) / (8 * U)), 1));
    for (const a of [1.6, 2.9, 4.2]) this.capsule(nx + f * a * U, ny - 9.5 * U, nx + f * a * U, ny - 4 * U, 0.45 * U, 0.45 * U, (i) => this.put(i, M_BODY, [6, 10, 12]));
    const bx = nx - f * 0.3 * U, by = ny - 13 * U, H = 56 * U * s, W = 10 * U, SM = this.pal.smoke;
    for (let y = Math.max(0, Math.floor(by - H * 1.1)); y <= by + 2 * U && y < this.h; y++) {
      const v = (by - y) / H;
      if (v < -0.05) continue;
      const cx = bx - f * v * v * 16 * U * (1 + 0.4 * Math.sin(T * 0.7)) + Math.sin(T * 0.9 + v * 3.4) * 5 * U * v + this.fl * H * 0.5 * v;
      const wd = W * (0.55 + v * 1.5) * Math.min(1, (v + 0.08) * 6);
      for (let x = Math.max(0, Math.floor(cx - wd * 1.5)); x <= Math.min(w - 1, cx + wd * 1.5); x++) {
        const d = (x + 0.5 - cx) / wd, I = 1 - d * d;
        const n = fbm((x - bx) / (8 * U) + 3, (y - by) / (8 * U) + T * 0.9);
        const e = I * 0.9 + (n - 0.5) * 1.5 - v * 0.75 + 0.15;
        if (e <= 0) continue;
        // The plume is outlined like a body, as the reference inks its cloud.
        this.put(y * w + x, M_BODY, SM[e > 0.55 ? 2 : e > 0.25 ? 1 : 0], 1, true);
      }
    }
    if (this.rnd() < 6 * this.dt) this.emit(SMOKE, bx - f * 18 * U * s, by - H * 0.9, -f * 6 * U, -8 * U, 1.6 + this.rnd(), 2.2 * U);
    this.head = [bx, by];
    this.lights.push({ x: bx, y: by - 8 * U, rad: (52 * U + 8) * (0.6 + 0.4 * s), str: 0.6 * Math.min(1, s * 1.6) + P.glow * 0.3 });
  }

  private antlerHead(nx: number, ny: number) {
    // The stag's skull of the third reference: a hood behind, a long bone
    // muzzle, antlers up and back, gold light in the socket. Drawn a size
    // up and lifted clear of the pauldron: it is this soul's whole silhouette.
    const P = this.pose, f = this.face, s = P.flame, k = clamp(s, 0, 1), Z = 1.3;
    ny -= 3 * U;
    const L = (a: number, b: number): Pt => [nx + f * a * Z * U, ny + b * Z * U];
    const hood = [[-7.5, 1], [-8.5, -8], [-5, -14.5], [1, -15], [-1, -8], [3, 1]];
    this.poly(hood.flatMap(([a, b]) => L(a, b)), (i, x, y) => this.put(i, M_BODY, this.pal.cloth[hash(x, y, 2) < 0.3 ? 0 : 1]));
    const sw = Math.sin(this.t * 1.1) * 0.6;
    const ANT = [
      [-1, -13, -3.5, -20, 1.5], [-3.5, -20, -2.6 + sw * 0.3, -28, 1.3], [-2.6 + sw * 0.3, -28, 1 + sw * 0.6, -35, 1.1], [1 + sw * 0.6, -35, 5 + sw, -40, 0.9],
      [-3.5, -20, 3, -24.5, 0.9], [-2.6 + sw * 0.3, -28, 4 + sw * 0.5, -31, 0.85], [-2.6 + sw * 0.3, -28, -8, -33, 0.85], [-8, -33, -11 + sw, -38.5, 0.7],
      [1 + sw * 0.6, -35, -0.5 + sw * 0.8, -42, 0.7],
    ];
    const branch = (o: number, dim: number) => {
      for (const [a0, b0, a1, b1, wd] of ANT) {
        const [x0, y0] = L(a0 + o, b0), [x1, y1] = L(a1 + o, b1);
        this.capsule(x0, y0, x1, y1, wd * Z * U, wd * 0.8 * Z * U, (i, qx, qy) => this.put(i, M_BODY, this.pal.bone, (lit(qx, qy) > 0.55 ? 1 : 0.78) * dim));
      }
    };
    branch(-2.2, 0.62);
    const skull = [[-4, -2.5], [-5, -9], [-3, -13.2], [2, -13.4], [5, -10.4], [9.4, -7.4], [10.2, -5.2], [7, -3.8], [3, -2.6]];
    this.poly(skull.flatMap(([a, b]) => L(a, b)), (i, x, y) => {
      const v = lit((x - nx) / (9 * U), (y - ny + 10 * U) / (8 * U));
      this.put(i, M_BODY, this.pal.bone, v > 0.62 ? 1 : v > 0.4 ? 0.82 : 0.62);
    });
    branch(0, 1);
    const [ex, ey] = L(2.2, -9);
    this.disc(ex, ey, 1.9 * U, 1.8 * U, (i) => this.put(i, M_BODY, this.pal.socket));
    if (k > 0.05) {
      this.disc(ex + f * 0.2 * U, ey, 0.9 * U * (0.6 + 0.4 * k), 0.9 * U * (0.6 + 0.4 * k), (i) => this.put(i, M_GLOW, this.pal.soul[3], 1, true));
      this.flameField(ex, ey - 1 * U, 0.26 * s, false);
    }
    if (this.rnd() < 10 * k * this.dt) this.emit(EMBER, ex + (this.rnd() - 0.5) * 4 * U, ey - 4 * U, (this.rnd() - 0.5) * 6 * U, -16 * U, 0.9 + this.rnd() * 0.8);
    if (this.rnd() < 2.2 * this.dt) this.emit(LEAF, nx + (this.rnd() - 0.5) * 26 * U, ny - (8 + this.rnd() * 26) * U, 0, 0, 3 + this.rnd() * 2);
    this.head = [ex, ey];
    this.lights.push({ x: ex, y: ey, rad: (44 * U + 8) * (0.5 + 0.5 * Math.min(1.6, s)), str: 0.7 * Math.min(1, s * 1.8) + P.glow * 0.35 });
  }

  /* ------------------------------ finishing ----------------------------- */

  // Everything that stands has a 1 px dark outline (ART_DIRECTION.md, 5.2);
  // the soul's own light has none.
  private outline() {
    const { M, w, h } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (M[i]) continue;
        if ((x > 0 && M[i - 1] === M_BODY) || (x < w - 1 && M[i + 1] === M_BODY) || (y > 0 && M[i - w] === M_BODY) || (y < h - 1 && M[i + w] === M_BODY))
          this.put(i, M_OUTLINE, OUTLINE);
      }
  }

  // His soul lights his own armour, in bands, never a smooth gradient.
  private light() {
    const { M, R, G, B, EM, w } = this, c = this.pal.light;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (M[i] !== M_BODY || EM[i]) continue;
        let l = 0;
        for (const s of this.lights) l = Math.max(l, Math.floor(s.str * (1 - Math.hypot(x - s.x, (y - s.y) * 1.15) / s.rad) * 4) / 4);
        if (l <= 0) continue;
        R[i] = Math.min(255, R[i] * (1 + 0.2 * l) + c[0] * 0.3 * l);
        G[i] = Math.min(255, G[i] * (1 + 0.2 * l) + c[1] * 0.26 * l);
        B[i] = Math.min(255, B[i] * (1 + 0.2 * l) + c[2] * 0.24 * l);
      }
  }
}
