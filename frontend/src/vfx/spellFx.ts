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

/**
 * Spells that are drawn as themselves rather than as their element: the
 * ultimates, and the ones that move or buff instead of hitting.
 */
export type Signature =
  | "meteor"
  | "tempest"
  | "maelstrom"
  | "quake"
  | "leap"
  | "relay"
  | "self"
  | "cannon"
  | "hammer"
  | "pillar";

/** What a cast needs to be drawn, independent of where the log came from. */
export type CastEvent = {
  seq: number;
  element: Element;
  origin: Position;
  target: Position;
  crit: boolean;
  damage: number;
  /** Drawn as itself when set; otherwise as its element. */
  signature?: Signature;
  /** The relay an air spell went out from. */
  via?: Position;
  /** Every cell the spell covered, and what it left there. */
  area?: Position[];
  terrain?: "fire" | "smoke" | "water" | "ice" | "trap" | "";
  /** Already waited for the wind to reach the relay. */
  arrived?: boolean;
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

/** An ink whirlpool turning on the ground. */
type Swirl = { x: number; y: number; r: number; born: number; dur: number };

/** A jet of water between two points, held for a moment. */
type Beam = { ax: number; ay: number; bx: number; by: number; born: number; dur: number; width: number };

/** A stone hammer swinging down onto a point. */
type Hammer = { x: number; y: number; size: number; born: number; dur: number };

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
  private swirls: Swirl[] = [];
  private beams: Beam[] = [];
  private hammers: Hammer[] = [];
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
      this.swirls.length > 0 ||
      this.beams.length > 0 ||
      this.hammers.length > 0 ||
      this.timers.length > 0 ||
      this.flash !== null ||
      performance.now() < this.shakeEnd
    );
  }

  /**
   * Wipes every scar a finished fight left behind. A rematch starts the
   * server's log back at zero, but a canvas only ever gets drawn onto — left
   * alone, the previous fight's scorch marks and craters would still be
   * sitting on a board that is meant to be clean again.
   */
  reset() {
    this.scars = [];
    this.particles = [];
    this.rings = [];
    this.burns = [];
    this.writings = [];
    this.bolts = [];
    this.swirls = [];
    this.beams = [];
    this.hammers = [];
    this.timers = [];
    this.flash = null;
    this.renderScars();
    this.blitScars();
  }

  /** Replays a cast's permanent mark without any of its animation. */
  restore(event: CastEvent) {
    const plans = this.plan(event);
    for (const scar of plans.scars) this.commit(scar);
    this.blitScars();
  }

  play(event: CastEvent) {
    const plans = this.plan(event);
    if (event.via) this.playRelayStream(event.origin, event.via);
    switch (event.signature) {
      case "cannon":
        return this.playCannon(event, plans);
      case "hammer":
        return this.playHammer(event, plans);
      case "pillar":
        return this.playPillar(event);
      case "meteor":
        return this.playMeteor(event, plans);
      case "tempest":
        return this.playTempest(event, plans);
      case "maelstrom":
        this.playMaelstrom(event);
        break;
      case "quake":
        return this.playQuake(event, plans);
      case "leap":
        return this.playLeap(event);
      case "relay":
        return this.playRelayPulse(event.target, true);
      case "self":
        return this.playSelfBuff(event);
    }
    if (event.terrain) this.spread(event);
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
    // What moves or buffs leaves no mark of its own; the terrain layer draws
    // whatever it did leave.
    if (
      event.signature === "leap" ||
      event.signature === "relay" ||
      event.signature === "self" ||
      event.signature === "pillar"
    ) {
      return { scars: [] };
    }
    if (event.signature === "hammer") {
      const scars: Scar[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + rand(-0.25, 0.25);
        const len = rand(0.5, 1.1) * (crit ? 1.4 : 1);
        scars.push({
          kind: "fracture",
          pts: jagged(target, { x: target.x + Math.cos(a) * len, y: target.y + Math.sin(a) * len }, 5, 0.12),
          width: rand(1.2, 2.6),
        });
      }
      return { scars };
    }
    if (event.signature === "quake") {
      const scars: Scar[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + rand(-0.2, 0.2);
        const len = rand(1.6, 2.6);
        scars.push({
          kind: "fracture",
          pts: jagged(origin, { x: origin.x + Math.cos(a) * len, y: origin.y + Math.sin(a) * len }, 8, 0.16),
          width: rand(1.4, 2.6),
        });
      }
      return { scars };
    }
    if (event.signature === "meteor") {
      return {
        scars: [
          { kind: "scorch", gx: target.x, gy: target.y, rTiles: 0.95, verts: makeBlob(22, 0.55) },
        ],
      };
    }
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
    if (event.via && !event.arrived) {
      this.at(220, () => this.playAir({ ...event, arrived: true }, plans));
      return;
    }
    const b = this.screen(event.target);
    const k = this.reduced ? 0.35 : event.crit ? 1.7 : 1;
    const tw = this.geometry.tileSize.width;

    // The bolt drops straight out of the sky onto the target — it doesn't
    // travel from the caster the way the other elements do.
    const boltDur = this.reduced ? 70 : event.crit ? 200 : 150;
    const topY = -Math.max(70, tw * 1.6);
    // Through a relay, the bolt comes off the relay rather than out of the sky.
    const relay = event.via ? this.screen(event.via) : null;
    const main = jagged(
      relay ? { x: relay.x, y: relay.y - tw * 0.9 } : { x: b.x, y: topY },
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

  /** The ground an area spell lays down, flaring up cell by cell. */
  private spread(event: CastEvent) {
    const cells = event.area ?? [];
    const tw = this.geometry.tileSize.width;
    const k = this.reduced ? 0.3 : 1;
    cells.forEach((cell, i) => {
      this.at(120 + i * 35, () => {
        const c = this.screen(cell);
        const n = Math.round(6 * k);
        for (let j = 0; j < n; j++) {
          switch (event.terrain) {
            case "fire":
              this.spawn({
                x: c.x + rand(-tw * 0.25, tw * 0.25),
                y: c.y + rand(-4, 4),
                vx: rand(-12, 12),
                vy: rand(-90, -40),
                g: -10,
                life: rand(400, 800),
                size: rand(1.4, 2.8),
                type: "ember",
                color: Math.random() < 0.4 ? EMBER_HOT : EMBER,
              });
              break;
            case "water":
              this.spawn({
                x: c.x + rand(-tw * 0.3, tw * 0.3),
                y: c.y - rand(30, 80),
                vx: -8,
                vy: rand(160, 240),
                life: rand(220, 380),
                size: 1.4,
                type: "spark",
                color: "#3f74c9",
              });
              break;
            case "ice":
              if (j < 2) {
                this.spawn({
                  x: c.x + rand(-tw * 0.2, tw * 0.2),
                  y: c.y + rand(-3, 3),
                  vx: 0,
                  vy: 0,
                  life: rand(700, 1100),
                  size: rand(4, 7),
                  rot: rand(-0.3, 0.3),
                  type: "crystal",
                  color: FROST,
                });
              }
              break;
            case "smoke":
              this.spawn({
                x: c.x + rand(-10, 10),
                y: c.y - rand(0, 10),
                vx: rand(-14, 14),
                vy: rand(-26, -8),
                g: -6,
                life: rand(900, 1500),
                size: rand(8, 14),
                type: "smoke",
                color: "#4e4943",
              });
              break;
            case "trap":
              if (j < 2) {
                this.ring(c.x, c.y, { r0: 2, rMax: tw * 0.3, dur: 420, color: INK, width: 2 });
              }
              break;
          }
        }
      });
    });
  }

  /** The wind running from the caster to its relay before the spell goes out. */
  private playRelayStream(from: Position, via: Position) {
    const a = this.screen(from);
    const b = this.screen(via);
    const tw = this.geometry.tileSize.width;
    const n = this.reduced ? 4 : 18;
    for (let i = 0; i < n; i++) {
      this.at((i * 180) / n, () => {
        this.spawn({
          x: a.x,
          y: a.y - tw * 0.5,
          vx: 0,
          vy: 0,
          life: 260,
          size: rand(1.2, 2.2),
          type: "dot",
          color: "#2e9e6a",
          path: { x: b.x, y: b.y - tw * 0.5, fromX: a.x, fromY: a.y - tw * 0.5, arc: tw * rand(0.6, 1.2) },
        });
      });
    }
    this.at(200, () => this.playRelayPulse(via, true));
  }

  /** A gust going up where an air relay stands. */
  private playRelayPulse(at: Position, placed = false) {
    const c = this.screen(at);
    const tw = this.geometry.tileSize.width;
    this.ring(c.x, c.y, { r0: 3, rMax: tw * (placed ? 1 : 0.6), dur: 420, color: "#2e9e6a", width: 2.5 });
    for (let i = 0; i < (this.reduced ? 5 : 16); i++) {
      this.spawn({
        x: c.x + rand(-tw * 0.25, tw * 0.25),
        y: c.y - rand(0, 10),
        vx: rand(-10, 10),
        vy: rand(-220, -120),
        drag: 0.97,
        life: rand(300, 600),
        size: rand(1, 1.8),
        type: "spark",
        color: "#2e9e6a",
      });
    }
  }

  /** Wind wrapping round a caster who has just taken it. */
  private playSelfBuff(event: CastEvent) {
    const c = this.screen(event.origin);
    const tw = this.geometry.tileSize.width;
    this.ring(c.x, c.y, { r0: tw * 0.5, rMax: tw * 0.15, dur: 380, color: "#2e9e6a", width: 2 });
    for (let i = 0; i < (this.reduced ? 6 : 20); i++) {
      const a = rand(0, TAU);
      this.spawn({
        x: c.x + Math.cos(a) * tw * 0.6,
        y: c.y - 20 + Math.sin(a) * tw * 0.3,
        vx: -Math.sin(a) * 160,
        vy: Math.cos(a) * 60,
        drag: 0.94,
        life: rand(260, 460),
        size: rand(1, 1.8),
        type: "spark",
        color: "#6fcf97",
      });
    }
  }

  /** A jet of water hard enough to throw whoever it hits. */
  private playCannon(event: CastEvent, plans: { scars: Scar[] }) {
    const a = this.screen(event.origin);
    const b = this.screen(event.target);
    const tw = this.geometry.tileSize.width;
    const dur = this.reduced ? 200 : 700;
    const lift = tw * 0.35;
    this.beams.push({
      ax: a.x,
      ay: a.y - lift,
      bx: b.x,
      by: b.y - lift * 0.8,
      born: performance.now(),
      dur,
      width: tw * (event.crit ? 0.3 : 0.24),
    });
    // The kick of it going out.
    this.ring(a.x, a.y, { r0: 4, rMax: tw * 0.7, dur: 300, color: INK, width: 3 });
    this.shake(this.reduced ? 0 : 5, dur);
    this.at(120, () => {
      this.shake(this.reduced ? 0 : event.crit ? 13 : 9, 420);
      this.ring(b.x, b.y, { r0: 4, rMax: tw * 1.4, dur: 520, color: INK, width: 3.5 });
      this.commit(plans.scars[0]);
    });
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = this.reduced ? 0.3 : 1;
    // Spray thrown on past the target, the way the water is going.
    for (let t = 0; t < 8; t++) {
      this.at(120 + t * 70, () => {
        for (let i = 0; i < 9 * k; i++) {
          const sp = rand(90, 260);
          const spread = rand(-0.7, 0.7);
          this.spawn({
            x: b.x + rand(-6, 6),
            y: b.y - lift * 0.8 + rand(-6, 6),
            vx: (dx / len) * sp + (-dy / len) * sp * spread,
            vy: (dy / len) * sp + (dx / len) * sp * spread - rand(40, 140),
            g: 420,
            drag: 0.99,
            life: rand(350, 700),
            size: rand(1.4, 3.2),
            type: "dot",
            color: Math.random() < 0.4 ? "#d8ecff" : "#3f74c9",
          });
        }
      });
    }
  }

  /** A stone hammer brought down from above the target. */
  private playHammer(event: CastEvent, plans: { scars: Scar[] }) {
    const b = this.screen(event.target);
    const tw = this.geometry.tileSize.width;
    const fall = this.reduced ? 120 : 380;
    this.hammers.push({ x: b.x, y: b.y, size: tw * (event.crit ? 0.9 : 0.75), born: performance.now(), dur: fall + 380 });
    this.at(fall, () => {
      this.shake(this.reduced ? 0 : event.crit ? 20 : 14, 520);
      this.flash = { color: "#2a1d10", alpha: event.crit ? 0.18 : 0.1, born: performance.now(), dur: 160 };
      this.ring(b.x, b.y, { r0: 4, rMax: tw * 1.6, dur: 520, color: "#a3722c", width: 4.5 });
      for (const scar of plans.scars) this.commit(scar);
      const k = this.reduced ? 0.3 : 1;
      for (let j = 0; j < 16 * k; j++) {
        this.spawn({
          x: b.x + rand(-12, 12),
          y: b.y + rand(-6, 6),
          vx: rand(-140, 140),
          vy: -rand(160, 320),
          g: 680,
          drag: 0.998,
          life: rand(600, 1000),
          size: rand(3, 8),
          rot: rand(0, TAU),
          vrot: rand(-8, 8),
          type: "chunk",
          color: "#f4f4f2",
        });
      }
      for (let m = 0; m < 14 * k; m++) {
        this.spawn({
          x: b.x + rand(-18, 18),
          y: b.y + rand(-8, 8),
          vx: rand(-60, 60),
          vy: rand(-40, -10),
          g: 20,
          life: rand(800, 1400),
          size: rand(7, 13),
          type: "smoke",
          color: DUST,
        });
      }
    });
  }

  /** Rock shoved up out of the ground; the tile draws the pillar itself. */
  private playPillar(event: CastEvent) {
    const b = this.screen(event.target);
    const tw = this.geometry.tileSize.width;
    this.shake(this.reduced ? 0 : 8, 500);
    this.ring(b.x, b.y, { r0: tw * 0.3, rMax: tw * 1.2, dur: 500, color: "#a3722c", width: 3 });
    for (let j = 0; j < (this.reduced ? 4 : 14); j++) {
      this.spawn({
        x: b.x + rand(-tw * 0.3, tw * 0.3),
        y: b.y + rand(-4, 4),
        vx: rand(-90, 90),
        vy: -rand(120, 260),
        g: 640,
        life: rand(500, 900),
        size: rand(2.5, 6),
        rot: rand(0, TAU),
        vrot: rand(-6, 6),
        type: "chunk",
        color: "#c9a56a",
      });
    }
    for (let m = 0; m < (this.reduced ? 3 : 10); m++) {
      this.spawn({
        x: b.x + rand(-20, 20),
        y: b.y + rand(-6, 6),
        vx: rand(-50, 50),
        vy: rand(-30, -8),
        g: 15,
        life: rand(700, 1200),
        size: rand(6, 11),
        type: "smoke",
        color: DUST,
      });
    }
  }

  private drawBeams(ctx: CanvasRenderingContext2D, now: number) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];
      const p = (now - beam.born) / beam.dur;
      if (p >= 1) {
        this.beams.splice(i, 1);
        continue;
      }
      // It shoots out, holds, and thins away.
      const reach = ease(clamp01(p / 0.18));
      const thin = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      const ex = beam.ax + (beam.bx - beam.ax) * reach;
      const ey = beam.ay + (beam.by - beam.ay) * reach;
      const dx = ex - beam.ax;
      const dy = ey - beam.ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const layers: [string, number][] = [
        ["rgba(22,52,111,.55)", 1.25],
        ["#3f74c9", 1],
        ["#8fb4ea", 0.55],
        ["#eef6ff", 0.22],
      ];
      ctx.save();
      ctx.lineCap = "round";
      for (const [color, share] of layers) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, beam.width * share * thin);
        ctx.beginPath();
        const steps = 16;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const wob = Math.sin(t * 14 - now / 30) * beam.width * 0.12 * t;
          const x = beam.ax + dx * t + nx * wob;
          const y = beam.ay + dy * t + ny * wob;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      if (!this.reduced && Math.random() < 0.8) {
        this.spawn({
          x: beam.ax + dx * Math.random(),
          y: beam.ay + dy * Math.random(),
          vx: nx * rand(-60, 60),
          vy: ny * rand(-60, 60) + 20,
          g: 300,
          life: rand(200, 400),
          size: rand(1, 2),
          type: "dot",
          color: "#8fb4ea",
        });
      }
    }
  }

  private drawHammers(ctx: CanvasRenderingContext2D, now: number) {
    for (let i = this.hammers.length - 1; i >= 0; i--) {
      const h = this.hammers[i];
      const age = now - h.born;
      if (age >= h.dur) {
        this.hammers.splice(i, 1);
        continue;
      }
      const fall = h.dur - 380;
      const p = clamp01(age / fall);
      // Raised high and tilted back, then brought down all at once.
      const drop = p * p * p;
      const angle = -1.4 * (1 - drop);
      const y = h.y - h.size * 1.9 * (1 - drop);
      const alpha = age > fall ? 1 - (age - fall) / 380 : 1;
      const s = h.size;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(h.x + s * 0.55, y - s * 0.1);
      ctx.rotate(angle);
      // Handle.
      ctx.fillStyle = "#5a4428";
      ctx.fillRect(-s * 0.05, -s * 1.15, s * 0.1, s * 0.95);
      // Head, a block of stone with a dark face.
      ctx.translate(-s * 0.55, -s * 0.25);
      ctx.fillStyle = "#8a6a3a";
      ctx.fillRect(-s * 0.1, -s * 0.12, s * 1.3, s * 0.42);
      ctx.fillStyle = "#c9a56a";
      ctx.fillRect(-s * 0.1, -s * 0.12, s * 1.3, s * 0.12);
      ctx.strokeStyle = "#2a1d10";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s * 0.1, -s * 0.12, s * 1.3, s * 0.42);
      ctx.restore();
    }
  }

  /** The Stonewarden taking off and coming down hard. */
  private playLeap(event: CastEvent) {
    const a = this.screen(event.origin);
    const b = this.screen(event.target);
    const tw = this.geometry.tileSize.width;
    for (let i = 0; i < 10; i++) {
      this.spawn({
        x: a.x + rand(-10, 10),
        y: a.y,
        vx: rand(-60, 60),
        vy: rand(-120, -40),
        g: 500,
        life: rand(400, 700),
        size: rand(2, 4),
        rot: rand(0, TAU),
        vrot: rand(-6, 6),
        type: "chunk",
        color: "#e9e1d0",
      });
    }
    this.spawn({
      x: a.x,
      y: a.y - 20,
      vx: 0,
      vy: 0,
      life: 300,
      size: 4,
      type: "dot",
      color: SOIL,
      path: { x: b.x, y: b.y - 20, fromX: a.x, fromY: a.y - 20, arc: tw * 1.2 },
    });
    this.at(300, () => {
      this.shake(this.reduced ? 0 : 12, 380);
      this.ring(b.x, b.y, { r0: 4, rMax: tw * 1.3, dur: 500, color: "#a3722c", width: 4 });
      for (let m = 0; m < (this.reduced ? 6 : 18); m++) {
        this.spawn({
          x: b.x + rand(-20, 20),
          y: b.y + rand(-6, 6),
          vx: rand(-70, 70),
          vy: rand(-50, -10),
          g: 30,
          life: rand(700, 1300),
          size: rand(6, 12),
          type: "smoke",
          color: DUST,
        });
      }
    });
  }

  /** A burning rock out of the top corner of the sky, and what it does to the sheet. */
  private playMeteor(event: CastEvent, plans: { scars: Scar[] }) {
    const b = this.screen(event.target);
    const tw = this.geometry.tileSize.width;
    const fall = this.reduced ? 250 : 780;
    const fromX = b.x + this.width * 0.6;
    const fromY = -tw * 2;
    this.flash = { color: "#2a1d10", alpha: 0.18, born: performance.now(), dur: fall + 300 };
    // The warning: a ring pulsing where it will land.
    for (let i = 0; i < 3; i++) {
      this.at((i * fall) / 3, () =>
        this.ring(b.x, b.y, { r0: tw * 1.6, rMax: tw * 0.3, dur: fall / 3, color: EMBER, width: 2 })
      );
    }
    this.spawn({
      x: fromX,
      y: fromY,
      vx: 0,
      vy: 0,
      life: fall,
      size: tw * 0.22,
      type: "ember",
      color: EMBER_HOT,
      trail: true,
      path: { x: b.x, y: b.y - 6, fromX, fromY, arc: 0 },
    });
    this.at(fall, () => {
      this.flash = { color: "#fff4dc", alpha: this.reduced ? 0.2 : 0.75, born: performance.now(), dur: 420 };
      this.shake(this.reduced ? 0 : 24, 900);
      this.ring(b.x, b.y, { r0: 6, rMax: tw * 3.2, dur: 700, color: EMBER_HOT, width: 6 });
      this.at(120, () => this.ring(b.x, b.y, { r0: 6, rMax: tw * 4.4, dur: 900, color: EMBER, width: 4 }));
      const scorch = plans.scars[0] as Scar & { kind: "scorch" };
      this.burns.push({
        x: b.x,
        y: b.y,
        gx: scorch.gx,
        gy: scorch.gy,
        rMax: scorch.rTiles * tw,
        rTiles: scorch.rTiles,
        born: performance.now(),
        dur: 900,
        verts: scorch.verts,
      });
      const k = this.reduced ? 0.3 : 1;
      for (let i = 0; i < 110 * k; i++) {
        const ang = rand(Math.PI, TAU);
        const sp = rand(80, 380);
        this.spawn({
          x: b.x,
          y: b.y - 4,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp * 0.8 - rand(40, 160),
          g: 320,
          drag: 0.99,
          life: rand(600, 1400),
          size: rand(1.4, 3.6),
          type: Math.random() < 0.3 ? "spark" : "ember",
          color: Math.random() < 0.45 ? EMBER_HOT : EMBER,
        });
      }
      for (let j = 0; j < 22 * k; j++) {
        this.spawn({
          x: b.x + rand(-20, 20),
          y: b.y + rand(-8, 8),
          vx: rand(-120, 120),
          vy: -rand(160, 360),
          g: 620,
          drag: 0.998,
          life: rand(800, 1400),
          size: rand(4, 11),
          rot: rand(0, TAU),
          vrot: rand(-6, 6),
          type: "chunk",
          color: "#f4f4f2",
        });
      }
      for (let m = 0; m < 30 * k; m++) {
        this.spawn({
          x: b.x + rand(-30, 30),
          y: b.y + rand(-10, 10),
          vx: rand(-30, 30),
          vy: rand(-70, -20),
          g: -10,
          life: rand(1400, 2400),
          size: rand(10, 20),
          type: "smoke",
          color: "#3b322b",
        });
      }
      if (event.terrain) this.spread(event);
    });
  }

  /** Lightning all over the area, then once more, hard, on the target. */
  private playTempest(event: CastEvent, plans: { scars: Scar[] }) {
    const cells = [...(event.area ?? [event.target])].sort(() => Math.random() - 0.5).slice(0, 8);
    this.flash = { color: "#101828", alpha: 0.22, born: performance.now(), dur: 1400 };
    cells.forEach((cell, i) => {
      this.at(80 + i * 110, () => {
        const b = this.screen(cell);
        const tw = this.geometry.tileSize.width;
        const pts = jagged({ x: b.x + rand(-30, 30), y: -tw * 1.6 }, { x: b.x, y: b.y - 4 }, 8, tw * 0.22);
        this.bolts.push({ pts, forks: [], born: performance.now(), dur: 140 });
        this.ring(b.x, b.y, { r0: 2, rMax: tw * 0.7, dur: 300, color: BOLT_BLUE, width: 2 });
      });
    });
    this.at(80 + cells.length * 110, () => this.playAir({ ...event, crit: true }, plans));
  }

  /** The water turning under the target before it closes on it. */
  private playMaelstrom(event: CastEvent) {
    const b = this.screen(event.target);
    const tw = this.geometry.tileSize.width;
    this.swirls.push({ x: b.x, y: b.y, r: tw * 1.3, born: performance.now(), dur: this.reduced ? 400 : 1300 });
    this.shake(this.reduced ? 0 : 6, 900);
  }

  /** The ground giving way all around the caster. */
  private playQuake(event: CastEvent, plans: { scars: Scar[] }) {
    const a = this.screen(event.origin);
    const tw = this.geometry.tileSize.width;
    this.shake(this.reduced ? 0 : 18, 1300);
    for (let i = 0; i < 3; i++) {
      this.at(i * 180, () => this.ring(a.x, a.y, { r0: 6, rMax: tw * 2.8, dur: 700, color: "#a3722c", width: 4 }));
    }
    for (const scar of plans.scars) {
      this.writings.push({ scar: scar as Scar & { kind: "fracture" }, born: performance.now(), perSegment: 40, emitted: 0 });
    }
    const cells = event.area ?? [];
    cells.forEach((cell, i) => {
      this.at(100 + i * 40, () => {
        const c = this.screen(cell);
        for (let j = 0; j < (this.reduced ? 1 : 3); j++) {
          this.spawn({
            x: c.x + rand(-8, 8),
            y: c.y,
            vx: rand(-40, 40),
            vy: -rand(140, 280),
            g: 640,
            life: rand(600, 1000),
            size: rand(3, 8),
            rot: rand(0, TAU),
            vrot: rand(-6, 6),
            type: "chunk",
            color: "#f4f4f2",
          });
        }
        this.spawn({
          x: c.x,
          y: c.y,
          vx: rand(-20, 20),
          vy: rand(-30, -10),
          g: 10,
          life: rand(900, 1500),
          size: rand(8, 14),
          type: "smoke",
          color: DUST,
        });
      });
    });
  }

  private drawSwirls(ctx: CanvasRenderingContext2D, now: number) {
    for (let i = this.swirls.length - 1; i >= 0; i--) {
      const s = this.swirls[i];
      const p = (now - s.born) / s.dur;
      if (p >= 1) {
        this.swirls.splice(i, 1);
        continue;
      }
      const reach = s.r * (0.4 + 0.6 * ease(clamp01(p * 2)));
      ctx.save();
      ctx.globalAlpha = 1 - clamp01((p - 0.7) / 0.3);
      for (let arm = 0; arm < 6; arm++) {
        ctx.strokeStyle = arm % 2 ? "#8fb4ea" : INK;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let r = reach; r > 3; r -= 3) {
          const ang = (arm / 6) * TAU + r * (6 / Math.max(1, s.r)) - p * 14;
          const x = s.x + Math.cos(ang) * r;
          const y = s.y + Math.sin(ang) * r * this.squash;
          if (r === reach) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
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
    this.drawSwirls(ctx, now);

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
    this.drawBeams(air, now);
    this.drawHammers(air, now);
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
