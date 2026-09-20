import React, { useEffect, useRef } from "react";
import { Position } from "../../../types/game";
import { TerrainCell, Zone } from "../../../types/message";
import { isoToScreen } from "../../../utils/isoUtils";
import { TEAR_SIDES, diamondCorners } from "../../../utils/tearSides";
import { prefersReducedMotion } from "../../../utils/motion";

interface TerrainLayerProps {
  terrain: TerrainCell[];
  zones: Zone[];
  tileSize: { width: number; height: number };
  centerX: number;
  centerY: number;
  /** The element the board measures itself against; see SpellFXLayer. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Which side a relay or a trap belongs to decides its colour. */
  userId: string;
  /** A spell that goes through the relay is selected: make the relay call out. */
  relayActive?: boolean;
}

/*
 * The same pigments the spell effects use, so what a spell leaves behind looks
 * like the mark it made going off.
 */
const EMBER = "#e2521d";
const EMBER_HOT = "#ffb03a";
const INK = "#2f5fa8";
const INK_LIGHT = "#8fb4ea";
const SOIL_DARK = "#2a1d10";
const WIND = "#2e9e6a";
const ENEMY = "#a3231b";

const TAU = Math.PI * 2;

/**
 * What shows through a hole in the board: the page the sheet is lying on,
 * which is `bg-paper` behind every screen the board is shown on. A crater is
 * not painted onto its cell, it is torn out of it, so the colour that belongs
 * in the gap is the one that was already under the paper.
 */
const PAGE: [number, number, number] = [242, 242, 240];
/** How dark the gap is at the instant the sheet gives way. */
const IMPACT: [number, number, number] = [20, 19, 15];

/*
 * The life of an impact, in milliseconds. The dark is held just long enough to
 * register as a blow, then withdraws over a second while the shadow of the
 * torn edge settles in its place. Everything here is spent in the moment: what
 * stays on the board afterwards costs no ink at all, which is the whole point
 * — a fight can dig twenty craters without the board getting any busier.
 */
const HOLE_HOLD = 160;
const HOLE_INK = 1000;
const HOLE_SMOKE = 1600;
const HOLE_SHRED = 800;
const HOLE_SHOCK = 340;

/** A stable pseudo-random number per cell, so a crack keeps its shape. */
const hash = (x: number, y: number, salt = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smoothstep = (u: number) => u * u * (3 - 2 * u);
const mix = (a: [number, number, number], b: [number, number, number], u: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * u)},${Math.round(a[1] + (b[1] - a[1]) * u)},${Math.round(
    a[2] + (b[2] - a[2]) * u
  )})`;

/** How many points a torn side is drawn with. */
const TEAR_STEPS = 6;

type Corner = [number, number];

const cornersOf = (c: Position, tw: number, th: number): Corner[] =>
  diamondCorners(c, { width: tw, height: th }).map((p) => [p.x, p.y] as Corner);

/**
 * One point along a torn side, always bitten inwards so the tear stays within
 * its own cell and the cells around it keep their outline. The bite comes from
 * the cell's hash, so a hole keeps the same ragged shape for the whole fight
 * and across a resize.
 */
const tearPoint = (
  x: number,
  y: number,
  side: number,
  step: number,
  a: Corner,
  b: Corner,
  c: Position
): Corner => {
  const u = step / TEAR_STEPS;
  let px = a[0] + (b[0] - a[0]) * u;
  let py = a[1] + (b[1] - a[1]) * u;
  if (step < TEAR_STEPS) {
    const n = hash(x * 7 + side, y * 11 + step, side * 3 + step);
    const m = hash(y * 5 + side, x * 13 + step, side + step * 7);
    const bite = 0.02 + 0.09 * n + 0.05 * m * m;
    px += (c.x - px) * bite;
    py += (c.y - py) * bite;
  }
  return [px, py];
};

/**
 * The outline of the hole torn out of one cell. A side that faces another hole
 * is left straight and full width: the two tears then overlap exactly, and the
 * edge between them is never drawn. Six craters in a heap stop being six dark
 * discs piled on each other and become one opening — the denser the cluster,
 * the less there is to draw, which is the opposite of how it used to behave.
 */
const tearPath = (
  ctx: CanvasRenderingContext2D,
  p: Position,
  c: Position,
  tw: number,
  th: number,
  isHole: (x: number, y: number) => boolean
) => {
  const k = cornersOf(c, tw, th);
  ctx.beginPath();
  ctx.moveTo(...k[TEAR_SIDES[0].from]);
  TEAR_SIDES.forEach((side, i) => {
    const a = k[side.from];
    const b = k[side.to];
    if (isHole(p.x + side.dx, p.y + side.dy)) {
      ctx.lineTo(...b);
      return;
    }
    for (let step = 1; step <= TEAR_STEPS; step++) {
      ctx.lineTo(...tearPoint(p.x, p.y, i, step, a, b, c));
    }
  });
  ctx.closePath();
};

/** The same tear, side by side, so only the sides facing paper get an edge. */
const tearEdges = (
  ctx: CanvasRenderingContext2D,
  p: Position,
  c: Position,
  tw: number,
  th: number,
  isHole: (x: number, y: number) => boolean,
  stroke: () => void
) => {
  const k = cornersOf(c, tw, th);
  TEAR_SIDES.forEach((side, i) => {
    if (isHole(p.x + side.dx, p.y + side.dy)) return;
    const a = k[side.from];
    const b = k[side.to];
    ctx.beginPath();
    ctx.moveTo(...a);
    for (let step = 1; step <= TEAR_STEPS; step++) {
      ctx.lineTo(...tearPoint(p.x, p.y, i, step, a, b, c));
    }
    stroke();
  });
};

const reduced = prefersReducedMotion();

/**
 * What spells have left on the board, drawn every frame from the server's
 * snapshot. The ground layer lies under the fighters — fire, water, ice,
 * cracks — and the top layer over them: smoke hides whoever stands in it,
 * and a storm's clouds hang above everyone.
 */
export const TerrainLayer: React.FC<TerrainLayerProps> = ({
  terrain,
  zones,
  tileSize,
  centerX,
  centerY,
  containerRef,
  userId,
  relayActive = false,
}) => {
  const groundRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  /**
   * When each hole was torn, so an impact can be played once and then left
   * alone. The server says nothing about a crater's age — terrain stays for
   * the rest of the fight and carries no timestamp — so the moment is the
   * client's own: a crater the board has never seen before is one that has
   * just been dug. Everything already there on the first frame is settled, so
   * a player joining a fight in progress finds the holes rather than watching
   * the whole fight's worth of explosions replay at once.
   */
  const bornAt = useRef(new Map<string, number>());
  const seeded = useRef(false);
  const state = useRef({ terrain, zones, tileSize, centerX, centerY, userId, relayActive });
  state.current = { terrain, zones, tileSize, centerX, centerY, userId, relayActive };

  useEffect(() => {
    const ground = groundRef.current;
    const top = topRef.current;
    const container = containerRef.current;
    if (!ground || !top || !container) return;
    const g = ground.getContext("2d");
    const t = top.getContext("2d");
    if (!g || !t) return;

    let frame = 0;
    let running = true;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = container.clientWidth;
      const height = container.clientHeight;
      for (const [canvas, ctx] of [
        [ground, g],
        [top, t],
      ] as const) {
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    size();

    const draw = (now: number) => {
      const s = state.current;
      const { width: tw, height: th } = s.tileSize;
      const w = container.clientWidth;
      const h = container.clientHeight;
      g.clearRect(0, 0, w, h);
      t.clearRect(0, 0, w, h);
      if (tw <= 0) return;
      const time = reduced ? 0 : now / 1000;
      const at = (p: Position) => isoToScreen(p.x, p.y, s.tileSize, s.centerX, s.centerY);

      const diamond = (ctx: CanvasRenderingContext2D, p: Position, scale = 1) => {
        const c = at(p);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - (th / 2) * scale);
        ctx.lineTo(c.x + (tw / 2) * scale, c.y);
        ctx.lineTo(c.x, c.y + (th / 2) * scale);
        ctx.lineTo(c.x - (tw / 2) * scale, c.y);
        ctx.closePath();
      };

      for (const zone of s.zones) {
        for (const cell of zone.cells) {
          diamond(g, cell, 0.96);
          g.fillStyle =
            zone.kind === "storm" ? "rgba(30,40,60,.16)" : "rgba(22,52,111,.16)";
          g.fill();
        }
      }

      /*
       * The craters, drawn together and before the rest, because each one
       * needs to know which of its neighbours are holes too. The board is a
       * sheet of paper; a crater is not a dark shape painted on a cell, it is
       * that cell torn out of the sheet. What is left is the page underneath,
       * and the only ink spent is the shadow the torn edge casts into it.
       *
       * It is also the truth of the rules, which the old drawing contradicted:
       * the server lets sight cross a crater and refuses to let legs cross it
       * — exactly what a hole does, and nothing a painted black disc says.
       */
      const holes = new Set<string>();
      for (const cell of s.terrain) {
        if (cell.kind === "crater") holes.add(`${cell.position.x},${cell.position.y}`);
      }
      const isHole = (x: number, y: number) => holes.has(`${x},${y}`);

      const born = bornAt.current;
      for (const k of born.keys()) if (!holes.has(k)) born.delete(k);
      for (const k of holes) {
        // -Infinity settles a hole immediately: it was already there.
        if (!born.has(k)) born.set(k, seeded.current && !reduced ? now : -Infinity);
      }
      seeded.current = true;

      for (const cell of s.terrain) {
        if (cell.kind !== "crater") continue;
        const p = cell.position;
        const c = at(p);
        const age = now - (born.get(`${p.x},${p.y}`) ?? -Infinity);
        const u = smoothstep(clamp01((age - HOLE_HOLD) / HOLE_INK));

        // The gap itself, black at the blow and withdrawing to the page.
        tearPath(g, p, c, tw, th, isHole);
        g.fillStyle = mix(IMPACT, PAGE, u);
        g.fill();

        /*
         * The sheet has a thickness, and it shows as the shadow it drops into
         * the hole. It arrives as the dark leaves, so the two never overlap.
         * Only the sides facing paper cast it: a side shared with another hole
         * has no edge above it to cast anything, and shading those too was
         * what drew a grey lattice across a cluster instead of one opening.
         */
        g.save();
        tearPath(g, p, c, tw, th, isHole);
        g.clip();
        for (const [width, alpha, drop] of [
          [Math.max(9, tw / 6), 0.34, th * 0.16],
          [Math.max(4, tw / 13), 0.26, th * 0.07],
        ] as const) {
          g.save();
          g.translate(0, drop);
          tearEdges(g, p, c, tw, th, isHole, () => {
            g.strokeStyle = `rgba(40,36,30,${alpha * u})`;
            g.lineWidth = width;
            g.stroke();
          });
          g.restore();
        }
        g.restore();

        tearEdges(g, p, c, tw, th, isHole, () => {
          g.strokeStyle = `rgba(110,104,95,${0.25 + 0.45 * u})`;
          g.lineWidth = Math.max(1, tw / 58) * (1 + (1 - u) * 1.6);
          g.stroke();
        });

        if (age >= HOLE_SMOKE) continue;

        // What the blow throws off: a ring running out past the cell, shreds
        // of paper thrown clear and falling back, and the smoke that carries
        // the dark away with it. None of it outlives the second it happens in.
        if (age < HOLE_SHOCK) {
          const ring = age / HOLE_SHOCK;
          g.strokeStyle = `rgba(40,36,30,${0.45 * (1 - ring)})`;
          g.lineWidth = Math.max(1.2, tw / 40) * (1 - ring) + 0.6;
          g.beginPath();
          g.ellipse(c.x, c.y, tw * (0.5 + ring * 1.1), th * (0.5 + ring * 1.1), 0, 0, TAU);
          g.stroke();
        }

        if (age < HOLE_SHRED) {
          const fly = age / HOLE_SHRED;
          for (let i = 0; i < 5; i++) {
            const a = hash(p.x, p.y, i + 3) * TAU;
            const reach = tw * (0.35 + 0.4 * hash(p.x, p.y, i + 13));
            const sx = c.x + Math.cos(a) * reach * fly;
            const sy =
              c.y + Math.sin(a) * reach * 0.55 * fly - th * 1.5 * fly + th * 2.2 * fly * fly;
            const side = Math.max(2, tw / 22) * (1 - fly * 0.4);
            t.save();
            t.translate(sx, sy);
            t.rotate(a + fly * 5);
            t.globalAlpha = 1 - fly;
            t.fillStyle = "#f6f5f0";
            t.fillRect(-side / 2, -side / 3, side, side * 0.66);
            t.strokeStyle = "rgba(120,114,104,.5)";
            t.lineWidth = 0.8;
            t.strokeRect(-side / 2, -side / 3, side, side * 0.66);
            t.restore();
          }
        }

        const smoke = age / HOLE_SMOKE;
        for (let i = 0; i < 5; i++) {
          const lag = i * 0.07;
          const puff = clamp01((smoke - lag) / (1 - lag));
          if (puff <= 0) continue;
          const drift = Math.sin(hash(p.x, p.y, i) * 6 + puff * 3) * tw * 0.16;
          const rise = th * (0.3 + 2.4 * (1 - Math.pow(1 - puff, 3)));
          const r = tw * (0.15 + 0.3 * puff);
          t.globalAlpha = 0.42 * Math.pow(1 - puff, 2.4);
          t.fillStyle = i % 2 ? "rgb(150,144,135)" : "rgb(122,116,107)";
          t.beginPath();
          t.ellipse(c.x + (i - 2) * tw * 0.1 + drift, c.y - rise, r, r * 0.72, 0, 0, TAU);
          t.fill();
        }
        t.globalAlpha = 1;
      }

      for (const cell of s.terrain) {
        const { x, y } = cell.position;
        const c = at(cell.position);
        const mine = cell.owner === s.userId;
        switch (cell.kind) {
          case "fire": {
            // Warm and bright, never dark: the flames have to read on paper,
            // which is all that is left around them now the craters are gaps.
            diamond(g, cell.position, 0.92);
            g.fillStyle = "rgba(255,150,60,.22)";
            g.fill();
            g.strokeStyle = "rgba(226,82,29,.55)";
            g.lineWidth = 1.2;
            g.stroke();
            for (let i = 0; i < 4; i++) {
              const fx = c.x + (i - 1.5) * tw * 0.13;
              const flick = Math.sin(time * 9 + x * 3 + y * 5 + i * 2);
              const fh = th * (0.75 + 0.22 * flick + 0.15 * hash(x, y, i));
              const fw = tw * 0.065;
              const base = c.y + th * 0.1 - Math.abs(i - 1.5) * th * 0.06;
              const flame = (height: number, width: number, color: string) => {
                g.fillStyle = color;
                g.beginPath();
                g.moveTo(fx - width, base);
                g.quadraticCurveTo(fx - width * 0.7, base - height * 0.6, fx + flick * width * 0.4, base - height);
                g.quadraticCurveTo(fx + width * 0.7, base - height * 0.5, fx + width, base);
                g.fill();
              };
              flame(fh, fw, EMBER);
              flame(fh * 0.7, fw * 0.62, EMBER_HOT);
              flame(fh * 0.35, fw * 0.3, "#fff3c4");
            }
            break;
          }
          case "water": {
            diamond(g, cell.position, 0.94);
            g.fillStyle = "rgba(47,95,168,.26)";
            g.fill();
            const r = ((time * 0.6 + hash(x, y)) % 1) * tw * 0.36;
            g.strokeStyle = `rgba(47,95,168,${0.55 * (1 - r / (tw * 0.36))})`;
            g.lineWidth = 1.2;
            g.beginPath();
            g.ellipse(c.x, c.y, r, r * (th / tw), 0, 0, TAU);
            g.stroke();
            if (!mine) {
              // Whose water it is matters: it heals one side and slows the other.
              g.fillStyle = ENEMY;
              g.globalAlpha = 0.5;
              g.beginPath();
              g.arc(c.x + tw * 0.28, c.y, 1.6, 0, TAU);
              g.fill();
              g.globalAlpha = 1;
            }
            break;
          }
          case "ice": {
            diamond(g, cell.position, 0.94);
            g.fillStyle = "rgba(205,228,255,.92)";
            g.fill();
            g.strokeStyle = "rgba(120,160,215,.9)";
            g.lineWidth = 1;
            g.stroke();
            g.strokeStyle = "#ffffff";
            g.lineWidth = 2;
            const glint = 0.5 + 0.5 * Math.sin(time * 2 + x + y);
            g.globalAlpha = 0.5 + 0.5 * glint;
            g.beginPath();
            g.moveTo(c.x - tw * 0.2, c.y - th * 0.02);
            g.lineTo(c.x - tw * 0.04, c.y - th * 0.2);
            g.moveTo(c.x + tw * 0.04, c.y + th * 0.16);
            g.lineTo(c.x + tw * 0.2, c.y);
            g.stroke();
            g.globalAlpha = 1;
            break;
          }
          case "crater":
            // Torn out of the sheet above, where it can see its neighbours.
            break;
          case "fissure": {
            diamond(g, cell.position, 0.9);
            g.fillStyle = "rgba(42,29,16,.3)";
            g.fill();
            const pts: [number, number][] = [];
            for (let i = 0; i <= 5; i++) {
              const u = i / 5;
              const wob = i === 0 || i === 5 ? 0 : (hash(x, y, i) - 0.5) * th * 0.5;
              pts.push([c.x - tw * 0.4 + u * tw * 0.8, c.y + wob]);
            }
            for (const [color, width] of [
              [SOIL_DARK, 5],
              ["#0e0804", 2],
            ] as const) {
              g.strokeStyle = color;
              g.lineWidth = width;
              g.beginPath();
              pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
              g.stroke();
            }
            break;
          }
          case "trap": {
            const bob = Math.sin(time * 2.4 + x + y) * th * 0.08;
            const r = tw * 0.16;
            t.strokeStyle = mine ? INK : ENEMY;
            t.lineWidth = 1.8;
            t.fillStyle = "rgba(47,95,168,.18)";
            t.beginPath();
            t.ellipse(c.x, c.y - th * 0.3 + bob, r, r * 0.95, 0, 0, TAU);
            t.fill();
            t.stroke();
            t.strokeStyle = "rgba(255,255,255,.95)";
            t.beginPath();
            t.arc(c.x - r * 0.35, c.y - th * 0.3 - r * 0.35 + bob, r * 0.35, 3.5, 4.6);
            t.stroke();
            break;
          }
          case "relay": {
            const color = mine ? WIND : ENEMY;
            diamond(g, cell.position, 0.9);
            g.fillStyle = mine ? "rgba(46,158,106,.22)" : "rgba(163,35,27,.1)";
            g.fill();
            g.strokeStyle = color;
            g.lineWidth = 1.5;
            g.stroke();
            if (mine && s.relayActive) {
              // Rings rolling out from it: this is where the spell will leave from.
              for (let k = 0; k < 2; k++) {
                const p = (time * 0.9 + k / 2) % 1;
                g.strokeStyle = `rgba(46,158,106,${0.8 * (1 - p)})`;
                g.lineWidth = 2.5;
                g.beginPath();
                g.ellipse(c.x, c.y, tw * (0.3 + p * 0.7), th * (0.3 + p * 0.7), 0, 0, TAU);
                g.stroke();
              }
            }
            const tall = mine && s.relayActive ? 11 : 8;
            for (let i = 0; i < tall; i++) {
              const rx = tw * (0.08 + i * 0.045);
              const yy = c.y - i * th * 0.2;
              const rot = time * (mine && s.relayActive ? 7 : 4) + i;
              t.strokeStyle = i % 2 ? "rgba(170,200,185,.9)" : color;
              t.lineWidth = 2;
              t.beginPath();
              t.ellipse(c.x + Math.sin(time * 3 + i) * 2, yy, rx, rx * 0.3, 0, rot, rot + 4.6);
              t.stroke();
            }
            break;
          }
          case "pillar":
            // Drawn by the tile itself, as raised cover.
            break;
          case "smoke": {
            for (let i = 0; i < 3; i++) {
              const drift = Math.sin(time * 0.7 + hash(x, y, i) * 6 + i) * tw * 0.08;
              t.fillStyle = i % 2 ? "rgba(150,144,135,.62)" : "rgba(128,121,112,.62)";
              t.beginPath();
              t.ellipse(
                c.x + (i - 1) * tw * 0.18 + drift,
                c.y - th * (0.35 + i * 0.28),
                tw * 0.3,
                th * 0.5,
                0,
                0,
                TAU
              );
              t.fill();
            }
            break;
          }
        }
      }

      for (const zone of s.zones) {
        const c = at(zone.center);
        if (zone.kind === "maelstrom") {
          const reach = tw * 1.15;
          for (let arm = 0; arm < 5; arm++) {
            g.strokeStyle = arm % 2 ? INK_LIGHT : INK;
            g.lineWidth = 2;
            g.beginPath();
            for (let r = reach; r > 3; r -= 3) {
              const a = (arm / 5) * TAU + r * (6 / tw) - time * 3;
              const px = c.x + Math.cos(a) * r;
              const py = c.y + Math.sin(a) * r * (th / tw);
              if (r === reach) g.moveTo(px, py);
              else g.lineTo(px, py);
            }
            g.stroke();
          }
          g.fillStyle = "rgba(5,13,34,.35)";
          g.beginPath();
          g.ellipse(c.x, c.y, tw * 0.16, th * 0.16, 0, 0, TAU);
          g.fill();
        } else {
          const cloudY = c.y - th * 4.2;
          for (let i = 0; i < 6; i++) {
            t.fillStyle = i % 2 ? "rgba(58,68,80,.8)" : "rgba(43,51,60,.8)";
            t.beginPath();
            t.ellipse(
              c.x + (i - 2.5) * tw * 0.42 + Math.sin(time * 0.5 + i) * 4,
              cloudY + Math.sin(i * 1.9) * th * 0.3,
              tw * 0.42,
              th * 0.55,
              0,
              0,
              TAU
            );
            t.fill();
          }
          // Rain, falling on the cells the storm covers.
          t.strokeStyle = "rgba(120,150,190,.55)";
          t.lineWidth = 1;
          for (let i = 0; i < 30; i++) {
            const cell = zone.cells[i % zone.cells.length];
            const p = at(cell);
            const fall = (time * 1.4 + hash(cell.x, cell.y, i)) % 1;
            const rx = p.x + (hash(i, cell.x, 3) - 0.5) * tw * 0.8;
            const ry = cloudY + (p.y - cloudY) * fall;
            t.beginPath();
            t.moveTo(rx, ry);
            t.lineTo(rx - 2, ry + th * 0.35);
            t.stroke();
          }
          // Now and then the cloud lights up from inside.
          if (!reduced && Math.sin(time * 2.3) > 0.97) {
            t.fillStyle = "rgba(220,235,255,.35)";
            t.beginPath();
            t.ellipse(c.x, cloudY, tw * 1.4, th * 0.9, 0, 0, TAU);
            t.fill();
          }
        }
      }
    };

    const loop = (now: number) => {
      if (!running) return;
      draw(now);
      const s = state.current;
      // Nothing on the board: one clear, then idle until something changes.
      if (!reduced && (s.terrain.length > 0 || s.zones.length > 0)) {
        frame = requestAnimationFrame(loop);
      } else {
        frame = 0;
      }
    };
    /*
     * Resizing a canvas blanks it, and the loop above does not necessarily
     * come back: with reduced motion, or on a board with nothing on it, it
     * draws once and idles. A ResizeObserver always delivers an initial
     * observation, and it arrives after the frame callbacks — so left alone
     * this wipes the terrain off the board immediately after drawing it, and
     * nothing puts it back. Ask for one more frame whenever the box changes.
     */
    const observer = new ResizeObserver(() => {
      size();
      if (!frame) frame = requestAnimationFrame(loop);
    });
    observer.observe(container);

    frame = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // Restarted whenever the board's contents change, so an idle board can
    // stop drawing without missing the next spell.
  }, [containerRef, terrain, zones, tileSize, centerX, centerY, relayActive]);

  return (
    <>
      <canvas
        ref={groundRef}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      />
      <canvas
        ref={topRef}
        className="absolute inset-0 pointer-events-none z-[5]"
        aria-hidden="true"
      />
    </>
  );
};

export default TerrainLayer;
