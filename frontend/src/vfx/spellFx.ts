import { Position } from "../types/game";
import { isoToScreen } from "../utils/isoUtils";

/**
 * The spell effects layer.
 *
 * The board is white paper, which rules out the usual recipe for a spectacular
 * hit — clouds of additively blended light. Glow does not glow on paper, it
 * only greys it. So nothing here lights the board up: each element damages it
 * instead. Fire chars the sheet, water soaks it, air tears it, earth cracks it.
 *
 * Two kinds of drawing come out of that:
 *
 *   - Scars, which are permanent. They are kept in grid coordinates rather
 *     than pixels so that resizing the board — or rejoining the match — puts
 *     them back exactly where the spell landed.
 *   - Everything alive: projectiles, debris, dust. Those are pixels, and they
 *     are gone within a second.
 */

export type Element = "Fire" | "Air" | "Water" | "Earth";

/** What a cast needs to be drawn, independent of where the log came from. */
export type CastEvent = {
  seq: number;
  element: Element;
  origin: Position;
  target: Position;
  crit: boolean;
  damage: number;
};

export type Geometry = {
  tileSize: { width: number; height: number };
  centerX: number;
  centerY: number;
};

/*
 * Pigments, not UI colours. The catalogue's `spell.color` names a hue for the
 * spellbar; these name what the spell does to the paper, which is a different
 * question — charring is not "fire red".
 */
const CHAR = "#241a13";
const EMBER = "#e2521d";
const EMBER_HOT = "#ffb03a";
const RIM = "#ff7a18";
const INK = "#2f5fa8";
const INK_DEEP = "#16346f";
const FROST = "rgba(147,183,240,.85)";
const SOIL = "#8a6a3a";
const SOIL_DARK = "rgba(60,42,22,.55)";
const DUST = "#9c8769";
const TEAR_EDGE = "rgba(23,24,26,.6)";
const BOLT_WHITE = "#ffffff";
const BOLT_BLUE = "#4fb8ff";
const BOLT_YELLOW = "#ffe066";
const BLAST_CHAR = "#141a2a";

/** A blob outline, in grid space, that is clearly not a circle. */
type Blob = { gx: number; gy: number; rTiles: number; verts: number[] };
/** A run of grid-space points: tears and fractures are both this. */
type Poly = { pts: Position[]; width: number };

type Scar =
  | ({ kind: "scorch" } & Blob)
  | ({ kind: "stain" } & Blob)
  | ({ kind: "blast" } & Blob)
  | ({ kind: "tear" } & Poly)
  | ({ kind: "fracture" } & Poly)
  | ({ kind: "arc" } & Poly);

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g?: number;
  drag?: number;
  born: number;
  life: number;
  size: number;
  type: "ember" | "spark" | "dot" | "smoke" | "chunk" | "crystal";
  color: string;
  rot?: number;
  vrot?: number;
  /** Follows an arc to a fixed point instead of free physics. */
  path?: { x: number; y: number; fromX: number; fromY: number; arc: number };
  trail?: boolean;
};

type Ring = {
  x: number;
  y: number;
  r0: number;
  rMax: number;
  born: number;
  dur: number;
  color: string;
  width: number;
};

/** A hole burning outwards: charred behind the rim, incandescent on it. */
type Burn = {
  x: number;
  y: number;
  gx: number;
  gy: number;
  rMax: number;
  rTiles: number;
  born: number;
  dur: number;
  verts: number[];
};

/** A scar that is still being written across the board, one segment at a time. */
type Writing = {
  scar: Scar & { kind: "tear" | "fracture" };
  born: number;
  perSegment: number;
  emitted: number;
  onSegment?: (p: Position) => void;
};

type Timer = { due: number; run: () => void };

/** A lightning bolt, falling from off the top of the board. Never a scar — it's gone before it can mark anything. */
type Bolt = {
  pts: Position[];
  forks: Position[][];
  born: number;
  dur: number;
};

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (p: number) => 1 - Math.pow(1 - p, 3);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function makeBlob(points: number, jitter: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < points; i++) v.push(1 - jitter / 2 + Math.random() * jitter);
  return v;
}

function blobPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  verts: number[],
  squash: number
) {
  ctx.beginPath();
  for (let i = 0; i <= verts.length; i++) {
    const a = ((i % verts.length) / verts.length) * TAU;
    const rr = r * verts[i % verts.length];
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * squash;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** A ragged run between two grid points. */
function jagged(from: Position, to: Position, steps: number, amp: number): Position[] {
  const pts: Position[] = [];
  const nx = -(to.y - from.y);
  const ny = to.x - from.x;
  const len = Math.hypot(nx, ny) || 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = i === 0 || i === steps ? 0 : rand(-amp, amp);
    pts.push({
      x: from.x + (to.x - from.x) * t + (nx / len) * off,
      y: from.y + (to.y - from.y) * t + (ny / len) * off,
    });
  }
  return pts;
}

export class SpellFx {
  /** The ground layer: scars, the burning rim, shockwaves. */
  private ctx: CanvasRenderingContext2D;
  /** The layer above the characters: debris, embers, dust, the impact flash. */
  private airCtx: CanvasRenderingContext2D;
  private decal: HTMLCanvasElement;
  private decalCtx: CanvasRenderingContext2D;

  private geometry: Geometry = {
    tileSize: { width: 0, height: 0 },
    centerX: 0,
    centerY: 0,
  };
  private width = 0;
  private height = 0;
  private dpr = 1;

  /** Permanent, and deliberately never cleared while a match is running. */
  private scars: Scar[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private burns: Burn[] = [];
  private writings: Writing[] = [];
  private bolts: Bolt[] = [];
  private timers: Timer[] = [];

  private shakeMag = 0;
  private shakeEnd = 0;
  private flash: { color: string; alpha: number; born: number; dur: number } | null = null;

  private reduced: boolean;

  /**
   * Two layers, because a scar and a spark belong on opposite sides of a
   * character: scorch marks lie on the floor and must pass under whoever is
   * standing there, while embers and debris fly in front of them.
   */
  constructor(
    private ground: HTMLCanvasElement,
    private air: HTMLCanvasElement
  ) {
    const gctx = ground.getContext("2d");
    const actx = air.getContext("2d");
    if (!gctx || !actx) throw new Error("2d canvas context unavailable");
    this.ctx = gctx;
    this.airCtx = actx;
    this.decal = document.createElement("canvas");
    const dctx = this.decal.getContext("2d");
    if (!dctx) throw new Error("2d canvas context unavailable");
    this.decalCtx = dctx;
    this.reduced =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /**
   * Resizing repaints every scar from grid coordinates. Without that, a window
   * resize would leave the whole history of the fight lying in the wrong
   * cells — which is exactly what "the marks stay" must not mean.
   */
  resize(width: number, height: number, geometry: Geometry) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.geometry = geometry;
    for (const c of [this.ground, this.air, this.decal]) {
      c.width = Math.max(1, Math.round(width * this.dpr));
      c.height = Math.max(1, Math.round(height * this.dpr));
    }
    for (const c of [this.ground, this.air]) {
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;
    }
    for (const c of [this.ctx, this.airCtx, this.decalCtx]) {
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    this.renderScars();
    /*
     * Show them straight away. Setting a canvas's width blanks it, so without
     * this the marks would be missing until something else happened to ask for
     * a frame — on a board that is otherwise idle, that could be a long time.
     */
    this.blitScars();
  }

  private screen(p: Position) {
    const { tileSize, centerX, centerY } = this.geometry;
    return isoToScreen(p.x, p.y, tileSize, centerX, centerY);
  }

  /** Ground-plane circles are ellipses: the board is seen at an angle. */
  private get squash() {
    const { width, height } = this.geometry.tileSize;
    return width > 0 ? height / width : 0.5;
  }

  /** Puts the accumulated scars on screen, with nothing alive over them. */
  private blitScars() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.airCtx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.decal, 0, 0);
    this.ctx.restore();
  }

  private renderScars() {
    const d = this.decalCtx;
    d.save();
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.clearRect(0, 0, this.decal.width, this.decal.height);
    d.restore();
    for (const scar of this.scars) this.paintScar(d, scar);
  }

  private paintScar(d: CanvasRenderingContext2D, scar: Scar) {
    const tw = this.geometry.tileSize.width;
    if (scar.kind === "scorch" || scar.kind === "stain" || scar.kind === "blast") {
      const c = this.screen({ x: scar.gx, y: scar.gy });
      const r = scar.rTiles * tw;
      d.save();
      if (scar.kind === "blast") {
        // The crater a strike leaves: a jagged, star-shaped burn rather than
        // fire's round one — this one was punched in, not spread from a point.
        d.globalAlpha = 0.82;
        blobPath(d, c.x, c.y, r, scar.verts, this.squash);
        d.fillStyle = BLAST_CHAR;
        d.fill();
        d.globalAlpha = 0.55;
        d.lineWidth = 2;
        d.strokeStyle = "#080b14";
        d.stroke();
      } else if (scar.kind === "scorch") {
        d.globalAlpha = 0.82;
        blobPath(d, c.x, c.y, r, scar.verts, this.squash);
        d.fillStyle = CHAR;
        d.fill();
        d.globalAlpha = 0.5;
        d.lineWidth = 2;
        d.strokeStyle = "#0f0b08";
        d.stroke();
      } else {
        // Wet paper: a pale halo, the pooled centre, then the tide line where
        // the fibre stopped drinking.
        d.globalAlpha = 0.1;
        blobPath(d, c.x, c.y, r * 1.5, scar.verts, this.squash);
        d.fillStyle = INK;
        d.fill();
        d.globalAlpha = 0.34;
        blobPath(d, c.x, c.y, r, scar.verts, this.squash);
        d.fillStyle = INK;
        d.fill();
        d.globalAlpha = 0.5;
        d.lineWidth = 3;
        d.strokeStyle = "#1a3f86";
        d.stroke();
        d.globalAlpha = 0.22;
        blobPath(d, c.x, c.y, r * 0.55, scar.verts, this.squash);
        d.fillStyle = INK_DEEP;
        d.fill();
      }
      d.restore();
      return;
    }

    const pts = scar.pts.map((p) => this.screen(p));
    if (pts.length < 2) return;
    d.save();
    d.lineCap = "round";
    if (scar.kind === "tear") {
      // The gash reads as an opening with a bruised edge either side.
      this.strokeRun(d, pts, "rgba(23,24,26,.42)", scar.width * 1.9);
      this.strokeRun(d, pts, "rgba(255,255,255,.95)", scar.width);
      this.strokeRun(d, pts, TEAR_EDGE, 1.1, -scar.width * 0.9);
      this.strokeRun(d, pts, TEAR_EDGE, 1.1, scar.width * 0.9);
    } else if (scar.kind === "arc") {
      // A branch of the strike's scar: charred dark, with a thread of blue
      // still visible down its centre — the one trace of colour any scar
      // here permanently keeps.
      this.strokeRun(d, pts, "rgba(16,22,36,.62)", scar.width);
      this.strokeRun(d, pts, "rgba(130,190,255,.3)", Math.max(0.6, scar.width * 0.4));
    } else {
      this.strokeRun(d, pts, SOIL_DARK, scar.width);
    }
    d.restore();
  }

  private strokeRun(
    d: CanvasRenderingContext2D,
    pts: Position[],
    color: string,
    width: number,
    offsetY = 0
  ) {
    d.strokeStyle = color;
    d.lineWidth = width;
    d.beginPath();
    d.moveTo(pts[0].x, pts[0].y + offsetY);
    for (let i = 1; i < pts.length; i++) d.lineTo(pts[i].x, pts[i].y + offsetY);
    d.stroke();
  }

  private commit(scar: Scar) {
    this.scars.push(scar);
    this.paintScar(this.decalCtx, scar);
  }

  private spawn(p: Omit<Particle, "born">) {
    this.particles.push({ ...p, born: performance.now() } as Particle);
  }

  private at(ms: number, run: () => void) {
    this.timers.push({ due: performance.now() + ms, run });
  }

  private shake(mag: number, dur: number) {
    if (this.reduced) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeEnd = Math.max(this.shakeEnd, performance.now() + dur);
  }

  private ring(x: number, y: number, r: Omit<Ring, "x" | "y" | "born">) {
    this.rings.push({ ...r, x, y, born: performance.now() });
  }

  /** How far the board should be pushed this frame, for the caller to apply. */
  shakeOffset(now: number): { x: number; y: number } {
    if (now >= this.shakeEnd || this.shakeMag <= 0) {
      this.shakeMag = 0;
      return { x: 0, y: 0 };
    }
    const left = Math.min(1, (this.shakeEnd - now) / 260);
    const m = this.shakeMag * left;
    return { x: rand(-m, m), y: rand(-m, m) };
  }

  /** Whether anything still needs frames. Scars alone do not: they just sit. */
  get busy() {
    return (
      this.particles.length > 0 ||
      this.rings.length > 0 ||
      this.burns.length > 0 ||
      this.writings.length > 0 ||
      this.bolts.length > 0 ||
      this.timers.length > 0 ||
      this.flash !== null ||
      performance.now() < this.shakeEnd
    );
  }

  /** Replays a cast's permanent mark without any of its animation. */
  restore(event: CastEvent) {
    const plans = this.plan(event);
    for (const scar of plans.scars) this.commit(scar);
    this.blitScars();
  }

  play(event: CastEvent) {
    const plans = this.plan(event);
    switch (event.element) {
      case "Fire":
        this.playFire(event, plans);
        break;
      case "Water":
        this.playWater(event, plans);
        break;
      case "Air":
        this.playAir(event, plans);
        break;
      case "Earth":
        this.playEarth(event, plans);
        break;
    }
  }

  /**
   * The scars a cast will leave, decided up front so that replaying a fight's
   * history draws the same marks the animation would have drawn.
   */
  private plan(event: CastEvent): { scars: Scar[] } {
    const { element, target, origin, crit } = event;
    switch (element) {
      case "Fire":
        return {
          scars: [
            {
              kind: "scorch",
              gx: target.x,
              gy: target.y,
              rTiles: crit ? 0.62 : 0.42,
              verts: makeBlob(16, 0.5),
            },
          ],
        };
      case "Water":
        return {
          scars: [
            {
              kind: "stain",
              gx: target.x,
              gy: target.y,
              rTiles: crit ? 0.72 : 0.52,
              verts: makeBlob(18, 0.42),
            },
          ],
        };
      case "Air": {
        // Where the bolt lands: a punched-in crater with branches racing
        // outward, the way a real strike scars whatever it hits.
        const scars: Scar[] = [
          {
            kind: "blast",
            gx: target.x,
            gy: target.y,
            rTiles: crit ? 0.5 : 0.36,
            verts: makeBlob(11, 0.85),
          },
        ];
        const arms = crit ? 7 : 5;
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * TAU + rand(-0.3, 0.3);
          const len = rand(0.4, 1) * (crit ? 1.4 : 1);
          scars.push({
            kind: "arc",
            pts: jagged(
              target,
              { x: target.x + Math.cos(a) * len, y: target.y + Math.sin(a) * len },
              5,
              0.14
            ),
            width: rand(1, 2),
          });
        }
        return { scars };
      }
      case "Earth": {
        const scars: Scar[] = [
          { kind: "fracture", pts: jagged(origin, target, 14, crit ? 0.36 : 0.24), width: 2.2 },
        ];
        // Crazing that never closes again.
        const arms = crit ? 9 : 6;
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * TAU + rand(-0.25, 0.25);
          const len = rand(0.35, 0.95) * (crit ? 1.4 : 1);
          scars.push({
            kind: "fracture",
            pts: jagged(
              target,
              { x: target.x + Math.cos(a) * len, y: target.y + Math.sin(a) * len },
              5,
              0.12
            ),
            width: rand(1, 2.2),
          });
        }
        return { scars };
      }
    }
  }

  private playFire(event: CastEvent, plans: { scars: Scar[] }) {
    const a = this.screen(event.origin);
    const b = this.screen(event.target);
    const k = this.reduced ? 0.35 : event.crit ? 1.7 : 1;
    const travel = 400;
    const tw = this.geometry.tileSize.width;

    for (let i = 0; i < 10 * k; i++) {
      this.spawn({
        x: a.x + rand(-6, 6),
        y: a.y - 8 + rand(-5, 5),
        vx: rand(-30, 30),
        vy: rand(-70, -20),
        g: 120,
        life: rand(220, 420),
        size: rand(1, 2.2),
        type: "ember",
        color: EMBER,
      });
    }
    this.spawn({
      x: a.x,
      y: a.y - 9,
      vx: 0,
      vy: 0,
      life: travel,
      size: 5,
      type: "ember",
      color: RIM,
      trail: true,
      path: { x: b.x, y: b.y - 8, fromX: a.x, fromY: a.y - 9, arc: tw * 0.75 },
    });

    this.at(travel, () => {
      this.flash = {
        color: RIM,
        alpha: event.crit ? 0.36 : 0.18,
        born: performance.now(),
        dur: event.crit ? 260 : 170,
      };
      this.shake(event.crit ? 11 : 6, event.crit ? 480 : 300);
      this.ring(b.x, b.y, {
        r0: 4,
        rMax: tw * (event.crit ? 1.9 : 1.3),
        dur: 480,
        color: EMBER,
        width: 3,
      });

      const scorch = plans.scars[0] as Scar & { kind: "scorch" };
      this.burns.push({
        x: b.x,
        y: b.y,
        gx: scorch.gx,
        gy: scorch.gy,
        rMax: scorch.rTiles * tw,
        rTiles: scorch.rTiles,
        born: performance.now(),
        dur: 620,
        verts: scorch.verts,
      });

      for (let i = 0; i < 46 * k; i++) {
        const ang = rand(0, TAU);
        const sp = rand(40, 210) * (event.crit ? 1.3 : 1);
        this.spawn({
          x: b.x,
          y: b.y - 6,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp * this.squash - rand(30, 130),
          g: 260,
          drag: 0.99,
          life: rand(500, 1100),
          size: rand(1.2, 3),
          type: Math.random() < 0.3 ? "spark" : "ember",
          color: Math.random() < 0.4 ? EMBER_HOT : EMBER,
        });
      }
      for (let j = 0; j < 12 * k; j++) {
        this.spawn({
          x: b.x + rand(-14, 14),
          y: b.y + rand(-8, 8),
          vx: rand(-18, 18),
          vy: rand(-46, -14),
          g: -8,
          life: rand(900, 1600),
          size: rand(6, 13),
          type: "smoke",
          color: "#6d635c",
        });
      }
    });
  }

  private playWater(event: CastEvent, plans: { scars: Scar[] }) {
    const a = this.screen(event.origin);
    const b = this.screen(event.target);
    const k = this.reduced ? 0.35 : event.crit ? 1.7 : 1;
    const tw = this.geometry.tileSize.width;
    const travel = 320;

    for (let i = 0; i < 14 * k; i++) {
      this.spawn({
        x: a.x + rand(-8, 8),
        y: a.y - 10 + rand(-6, 6),
        vx: rand(-20, 20),
        vy: rand(-60, -20),
        g: 200,
        life: rand(260, 460),
        size: rand(1.4, 2.6),
        type: "dot",
        color: "#3f74c9",
      });
    }
    // Water travels along the ground rather than through the air.
    const steps = Math.round(14 * (this.reduced ? 0.5 : 1));
    for (let w = 0; w < steps; w++) {
      this.at((w * travel) / steps, () => {
        const t = w / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        for (let q = 0; q < 3; q++) {
          this.spawn({
            x: x + rand(-9, 9),
            y: y + rand(-5, 5),
            vx: rand(-24, 24),
            vy: rand(-52, -16),
            g: 260,
            life: rand(280, 520),
            size: rand(1.3, 2.4),
            type: "dot",
            color: INK,
          });
        }
      });
    }

    this.at(travel, () => {
      this.shake(event.crit ? 6 : 3, 280);
      this.ring(b.x, b.y, {
        r0: 4,
        rMax: tw * (event.crit ? 1.6 : 1.2),
        dur: 560,
        color: INK,
        width: 2.5,
      });
      this.commit(plans.scars[0]);

      const spikes = Math.round(9 * k);
      for (let i = 0; i < spikes; i++) {
        const ang = (i / spikes) * TAU + rand(-0.2, 0.2);
        const dist = rand(0.18, 0.55) * tw * (event.crit ? 1.35 : 1);
        this.spawn({
          x: b.x + Math.cos(ang) * dist,
          y: b.y + Math.sin(ang) * dist * this.squash,
          vx: 0,
          vy: 0,
          life: rand(900, 1500),
          size: rand(5, 9),
          rot: rand(-0.35, 0.35),
          type: "crystal",
          color: FROST,
        });
      }
      for (let j = 0; j < 30 * k; j++) {
        const ang = rand(0, TAU);
        const sp = rand(40, 170);
        this.spawn({
          x: b.x,
          y: b.y - 4,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp * this.squash - rand(40, 120),
          g: 300,
          life: rand(450, 900),
          size: rand(1.2, 2.6),
          type: "dot",
          color: "#3f74c9",
        });
      }
    });
  }

  private playAir(event: CastEvent, plans: { scars: Scar[] }) {
    const b = this.screen(event.target);
    const k = this.reduced ? 0.35 : event.crit ? 1.7 : 1;
    const tw = this.geometry.tileSize.width;

    // The bolt drops straight out of the sky onto the target — it doesn't
    // travel from the caster the way the other elements do.
    const boltDur = this.reduced ? 70 : event.crit ? 200 : 150;
    const topY = -Math.max(70, tw * 1.6);
    const main = jagged(
      { x: b.x, y: topY },
      { x: b.x, y: b.y - 6 },
      8,
      tw * (event.crit ? 0.34 : 0.24)
    );
    const forks: Position[][] = [];
    for (let i = 0; i < (event.crit ? 3 : 2); i++) {
      const from = main[1 + Math.floor(Math.random() * (main.length - 3))];
      const ang = Math.PI / 2 + rand(-1.1, 1.1);
      const len = rand(tw * 0.25, tw * 0.55);
      forks.push(
        jagged(from, { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len }, 3, tw * 0.1)
      );
    }
    this.bolts.push({ pts: main, forks, born: performance.now(), dur: boltDur });

    this.at(Math.round(boltDur * 0.5), () => {
      this.flash = {
        color: BOLT_WHITE,
        alpha: event.crit ? 0.5 : 0.3,
        born: performance.now(),
        dur: event.crit ? 220 : 160,
      };
      this.shake(event.crit ? 13 : 7, event.crit ? 420 : 260);
      this.ring(b.x, b.y, {
        r0: 3,
        rMax: tw * (event.crit ? 1.9 : 1.3),
        dur: 480,
        color: BOLT_BLUE,
        width: 3,
      });
      this.ring(b.x, b.y, {
        r0: 2,
        rMax: tw * (event.crit ? 1.2 : 0.85),
        dur: 320,
        color: BOLT_YELLOW,
        width: 2,
      });

      for (const scar of plans.scars) this.commit(scar);

      for (let i = 0; i < 34 * k; i++) {
        const ang = rand(0, TAU);
        const sp = rand(60, 220) * (event.crit ? 1.3 : 1);
        const c = Math.random();
        this.spawn({
          x: b.x,
          y: b.y - 4,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp * this.squash - rand(20, 90),
          g: 240,
          drag: 0.985,
          life: rand(260, 560),
          size: rand(1, 2.4),
          type: "spark",
          color: c < 0.4 ? BOLT_WHITE : c < 0.75 ? BOLT_BLUE : BOLT_YELLOW,
        });
      }
      for (let j = 0; j < 12 * k; j++) {
        const ang = rand(0, TAU);
        const dist = rand(0.15, 0.7) * tw;
        this.spawn({
          x: b.x + Math.cos(ang) * dist,
          y: b.y + Math.sin(ang) * dist * this.squash,
          vx: Math.cos(ang) * rand(30, 90),
          vy: Math.sin(ang) * rand(30, 90) * this.squash - rand(20, 60),
          g: 160,
          drag: 0.99,
          life: rand(600, 1100),
          size: rand(2.5, 5),
          rot: rand(0, TAU),
          vrot: rand(-8, 8),
          type: "chunk",
          color: "#ffffff",
        });
      }
    });
  }

  private playEarth(event: CastEvent, plans: { scars: Scar[] }) {
    const b = this.screen(event.target);
    const k = this.reduced ? 0.35 : event.crit ? 1.75 : 1;
    const tw = this.geometry.tileSize.width;
    const fracture = plans.scars[0] as Scar & { kind: "fracture" };
    const craze = plans.scars.slice(1);

    // Nothing crosses the air: the fracture runs under the sheet.
    this.writings.push({
      scar: fracture,
      born: performance.now(),
      perSegment: 19,
      emitted: 0,
      onSegment: (p) => {
        const s = this.screen(p);
        for (let q = 0; q < 2 * k; q++) {
          this.spawn({
            x: s.x + rand(-4, 4),
            y: s.y,
            vx: rand(-40, 40),
            vy: rand(-80, -30),
            g: 300,
            life: rand(300, 620),
            size: rand(1.4, 3),
            type: "dot",
            color: SOIL,
          });
        }
      },
    });

    this.at(fracture.pts.length * 19, () => {
      this.shake(event.crit ? 17 : 10, event.crit ? 700 : 460);
      this.ring(b.x, b.y, {
        r0: 4,
        rMax: tw * (event.crit ? 2 : 1.45),
        dur: 560,
        color: "#a3722c",
        width: 3.5,
      });
      for (const scar of craze) this.commit(scar);

      for (let j = 0; j < 14 * k; j++) {
        const ang = rand(0, TAU);
        const sp = rand(30, 120);
        this.spawn({
          x: b.x + rand(-12, 12),
          y: b.y + rand(-6, 6),
          vx: Math.cos(ang) * sp,
          vy: -rand(120, 300),
          g: 620,
          drag: 0.998,
          life: rand(700, 1200),
          size: rand(4, 10),
          rot: rand(0, TAU),
          vrot: rand(-6, 6),
          type: "chunk",
          color: "#f4f4f2",
        });
      }
      for (let m = 0; m < 22 * k; m++) {
        this.spawn({
          x: b.x + rand(-22, 22),
          y: b.y + rand(-10, 10),
          vx: rand(-40, 40),
          vy: rand(-40, -8),
          g: 20,
          life: rand(900, 1700),
          size: rand(7, 16),
          type: "smoke",
          color: DUST,
        });
      }
    });
  }

  frame(now: number) {
    const ctx = this.ctx;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (now >= this.timers[i].due) {
        const { run } = this.timers[i];
        this.timers.splice(i, 1);
        run();
      }
    }

    const air = this.airCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    air.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.decal, 0, 0);
    ctx.restore();

    this.advanceWritings(now);
    this.drawBurns(ctx, now);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const p = (now - r.born) / r.dur;
      if (p >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const rr = r.r0 + (r.rMax - r.r0) * ease(p);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rr, rr * this.squash, 0, 0, TAU);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.lineWidth = r.width * (1 - p * 0.6);
      ctx.stroke();
      ctx.restore();
    }

    this.drawBolts(air, now);
    this.drawParticles(air, now);

    if (this.flash) {
      const p = (now - this.flash.born) / this.flash.dur;
      if (p >= 1) {
        this.flash = null;
      } else {
        air.save();
        air.globalAlpha = this.flash.alpha * (1 - p);
        air.fillStyle = this.flash.color;
        air.fillRect(0, 0, this.width, this.height);
        air.restore();
      }
    }
  }

  private advanceWritings(now: number) {
    for (let i = this.writings.length - 1; i >= 0; i--) {
      const w = this.writings[i];
      const due = Math.floor((now - w.born) / w.perSegment);
      while (w.emitted < due && w.emitted < w.scar.pts.length - 1) {
        w.emitted++;
        w.onSegment?.(w.scar.pts[w.emitted]);
      }
      // Drawn live while it runs, then written into the sheet for good.
      if (w.emitted >= w.scar.pts.length - 1) {
        this.commit(w.scar);
        this.writings.splice(i, 1);
      } else {
        const partial = { ...w.scar, pts: w.scar.pts.slice(0, w.emitted + 1) };
        this.paintScar(this.ctx, partial as Scar);
      }
    }
  }

  private drawBolts(ctx: CanvasRenderingContext2D, now: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      const age = now - bolt.born;
      if (age > bolt.dur) {
        this.bolts.splice(i, 1);
        continue;
      }
      const p = age / bolt.dur;
      // A real strike flickers rather than fading smoothly, and dies out fast
      // at the end instead of lingering.
      const flicker = 0.5 + 0.5 * Math.abs(Math.sin(age * 0.28 + i * 1.7));
      const fade = 1 - Math.max(0, p - 0.7) / 0.3;
      ctx.save();
      ctx.lineCap = "round";
      ctx.globalAlpha = flicker * fade;
      ctx.shadowColor = BOLT_BLUE;
      ctx.shadowBlur = 18;
      this.strokeRun(ctx, bolt.pts, BOLT_BLUE, 6);
      ctx.shadowBlur = 10;
      this.strokeRun(ctx, bolt.pts, BOLT_WHITE, 2.2);
      for (const fork of bolt.forks) {
        ctx.shadowBlur = 8;
        this.strokeRun(ctx, fork, BOLT_YELLOW, 1.6);
      }
      ctx.restore();
    }
  }

  private drawBurns(ctx: CanvasRenderingContext2D, now: number) {
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      const p = (now - b.born) / b.dur;
      if (p >= 1) {
        // The hole has finished eating outwards: it is part of the board now.
        this.commit({
          kind: "scorch",
          gx: b.gx,
          gy: b.gy,
          rTiles: b.rTiles,
          verts: b.verts,
        });
        this.burns.splice(i, 1);
        continue;
      }
      const r = b.rMax * ease(p);
      ctx.save();
      blobPath(ctx, b.x, b.y, r * 0.94, b.verts, this.squash);
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = CHAR;
      ctx.fill();
      ctx.restore();

      ctx.save();
      blobPath(ctx, b.x, b.y, r, b.verts, this.squash);
      ctx.strokeStyle = RIM;
      ctx.lineWidth = 2.4;
      ctx.globalAlpha = 0.85 * (1 - p * 0.5);
      ctx.shadowColor = "#ff6a00";
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, now: number) {
    const dt = 1 / 60;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const age = now - p.born;
      if (age > p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = age / p.life;

      if (p.path) {
        const tp = clamp01(t);
        p.x = p.path.fromX + (p.path.x - p.path.fromX) * tp;
        p.y =
          p.path.fromY + (p.path.y - p.path.fromY) * tp - Math.sin(tp * Math.PI) * p.path.arc;
        if (p.trail && Math.random() < 0.9) {
          this.spawn({
            x: p.x + rand(-2, 2),
            y: p.y + rand(-2, 2),
            vx: rand(-14, 14),
            vy: rand(-24, -4),
            g: 40,
            life: rand(240, 460),
            size: rand(1.2, 2.6),
            type: "ember",
            color: Math.random() < 0.35 ? EMBER_HOT : "#f2620f",
          });
        }
      } else {
        p.vy += (p.g ?? 0) * dt;
        if (p.drag) {
          p.vx *= p.drag;
          p.vy *= p.drag;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.vrot) p.rot = (p.rot ?? 0) + p.vrot * dt;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.path ? 1 : 1 - t);

      if (p.type === "ember") {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, TAU);
        ctx.fill();
      } else if (p.type === "dot") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else if (p.type === "spark") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.type === "smoke") {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, (1 - t) * 0.3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + t * 2.2), 0, TAU);
        ctx.fill();
      } else if (p.type === "chunk") {
        /*
         * A torn-off piece of the board. It is the paper's own colour, so on
         * paper it would vanish: what makes it read is the shadow it throws
         * and the dark edge where the sheet came apart.
         */
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot ?? 0);
        const s = p.size;
        const face = () => {
          ctx.beginPath();
          ctx.moveTo(-s, -s * 0.6);
          ctx.lineTo(s * 0.9, -s * 0.8);
          ctx.lineTo(s, s * 0.7);
          ctx.lineTo(-s * 0.8, s * 0.5);
          ctx.closePath();
        };
        ctx.save();
        ctx.translate(s * 0.35, s * 0.5);
        face();
        ctx.fillStyle = "rgba(23,24,26,.28)";
        ctx.fill();
        ctx.restore();
        face();
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(23,24,26,.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (p.type === "crystal") {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot ?? 0);
        const g = p.size * (0.4 + ease(clamp01(t * 2.5)) * 0.6);
        ctx.beginPath();
        ctx.moveTo(0, -g * 2.2);
        ctx.lineTo(g * 0.55, 0);
        ctx.lineTo(0, g * 0.7);
        ctx.lineTo(-g * 0.55, 0);
        ctx.closePath();
        ctx.globalAlpha = Math.max(0, (1 - clamp01((t - 0.55) / 0.45)) * 0.9);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = "#1f4fa8";
        ctx.globalAlpha *= 0.7;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
