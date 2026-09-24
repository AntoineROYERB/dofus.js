import { Position } from "../types/game";
import { BOARD } from "../constants";
import { cellNoise, clamp01, valueNoise } from "./noise";
import { inFrontOf } from "./viewport";
import { biomeAt, Ground, groundAt, heightAt, MAX_LEVEL, WORLD_RADIUS } from "./world";

/**
 * The world, drawn: paper with a grain, washes of moss and sand, ink for the
 * grass and the stones, faceted rocks and trees drawn by hand, terraces with
 * a contour line along their edge, and a river.
 *
 * It is the "Composée" palette carried outdoors: paper, ink and graphite, a
 * wash where a fight would use none, and the vermilion kept for the rare
 * flower. Colour does almost nothing here that the line cannot, which keeps
 * the world recognisably the same object as the board you fight on.
 *
 * It is a canvas rather than a div per cell, for the reason the fight's
 * TerrainLayer is: a few hundred diamonds with grass on them, redrawn every
 * frame the camera moves, is a few milliseconds of canvas and a great deal of
 * layout for the DOM.
 */

/** How far one terrace level lifts the ground, as a share of a tile's height. */
export const LEVEL_RISE = 0.6;

type Tile = { width: number; height: number };
type RGB = [number, number, number];

export type Scene = {
  width: number;
  height: number;
  dpr: number;
  tile: Tile;
  /** Where cell (0, 0) lands on the canvas at ground level, the camera's pan included. */
  origin: Position;
  /** The cells worth drawing, back to front. */
  cells: Position[];
  /** The walker, in cells, fractions and all. */
  walker: Position;
  hovered: Position | null;
  /** Cells the hovered walk would take, as "x,y". */
  route: Set<string>;
  /** Seconds, for what moves on its own: the wind in the grass, the water. */
  time: number;
};

/* ---------- palette ---------- */

const WHITE: RGB = [255, 255, 255];
const WATER: RGB = [219, 232, 243];
const RIPPLE = "rgba(111,150,205,.75)";
const BANK = "rgba(61,90,140,.55)";
const GRAPHITE = "rgba(95,98,96,.85)";
const MOSS_INK = "rgba(72,98,70,.85)";
const SAND_INK = "rgba(122,104,70,.85)";
const LINE = "#3d3f3d";
const STONE_DARK: RGB = [168, 170, 165];
const STONE_LIGHT: RGB = [234, 234, 230];
const LEAF: RGB = [236, 239, 232];
const LEAF_MOSS: RGB = [212, 227, 198];
const WASH_MOSS: RGB = [120, 160, 100];
const WASH_SAND: RGB = [205, 170, 105];
/** Terrace stone, for cliffs and the stairs cut into them alike. */
const STONE_RIGHT: RGB = [218, 216, 210];
const STONE_LEFT: RGB = [233, 231, 226];

const mix = (a: RGB, b: RGB, u: number): RGB => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
  a[2] + (b[2] - a[2]) * u,
];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

const TAU = Math.PI * 2;
const key = (p: Position) => `${p.x},${p.y}`;

/* ---------- textures, made once ---------- */

/**
 * The moss and sand, painted once over the whole world in cell space and laid
 * onto the ground with the projection as its transform. Sampled at a fraction
 * of a cell, it runs across cell edges the way a wash does instead of filling
 * the grid square by square, with a darker rim where the pigment dried.
 */
const WASH_PER_CELL = 6;
const WASH_ORIGIN = -WORLD_RADIUS - 1.5;
let wash: HTMLCanvasElement | null = null;

const washTexture = (): HTMLCanvasElement => {
  if (wash) return wash;
  const side = (WORLD_RADIUS * 2 + 3) * WASH_PER_CELL;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return (wash = canvas);
  const img = ctx.createImageData(side, side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const X = WASH_ORIGIN + (i + 0.5) / WASH_PER_CELL;
      const Y = WASH_ORIGIN + (j + 0.5) / WASH_PER_CELL;
      const wobble = (valueNoise(X, Y, 1.1, 17) - 0.5) * 0.25;
      const { moss, sand } = biomeAt(X + wobble, Y - wobble);
      const w = Math.max(moss, sand);
      if (w < 0.01) continue;
      const colour = moss > sand ? WASH_MOSS : WASH_SAND;
      const rim = Math.exp(-(((w - 0.5) / 0.1) ** 2)) * 0.12;
      const mottle = (valueNoise(X, Y, 0.7, 23) - 0.5) * 0.08 * w;
      const k = (j * side + i) * 4;
      img.data[k] = colour[0];
      img.data[k + 1] = colour[1];
      img.data[k + 2] = colour[2];
      img.data[k + 3] = clamp01(w * 0.26 + rim + mottle) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return (wash = canvas);
};

/** The paper's tooth: speckle and a few fibres, laid over everything. */
let grain: HTMLCanvasElement | null = null;

const grainTexture = (): HTMLCanvasElement => {
  if (grain) return grain;
  const size = 220;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return (grain = canvas);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const img = ctx.createImageData(size, size);
  for (let k = 0; k < img.data.length; k += 4) {
    const v = 150 + rnd() * 80;
    img.data[k] = v;
    img.data[k + 1] = v;
    img.data[k + 2] = v - 4;
    img.data[k + 3] = rnd() < 0.55 ? rnd() * 34 : 0;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = "round";
  ctx.lineWidth = 0.6;
  for (let n = 0; n < 70; n++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = rnd() * TAU;
    const l = 4 + rnd() * 12;
    ctx.strokeStyle = `rgba(120,118,110,${0.08 + rnd() * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a + 0.6) * l * 0.5,
      y + Math.sin(a + 0.6) * l * 0.5,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l
    );
    ctx.stroke();
  }
  return (grain = canvas);
};

/* ---------- the painter ---------- */

type Corners = { T: Position; R: Position; B: Position; L: Position };

/** Which side of a diamond faces which neighbour. */
const EDGES: [number, number, keyof Corners, keyof Corners][] = [
  [1, 0, "R", "B"],
  [0, 1, "L", "B"],
  [-1, 0, "L", "T"],
  [0, -1, "T", "R"],
];

const painter = (ctx: CanvasRenderingContext2D, scene: Scene) => {
  const { width: tw, height: th } = scene.tile;
  const rise = th * LEVEL_RISE;
  const { origin, walker } = scene;

  const at = (c: Position, level: number): Position => ({
    x: origin.x + ((c.x - c.y) * tw) / 2,
    y: origin.y + ((c.x + c.y) * th) / 2 - level * rise,
  });
  const cornersOf = (s: Position): Corners => ({
    T: { x: s.x, y: s.y - th / 2 },
    R: { x: s.x + tw / 2, y: s.y },
    B: { x: s.x, y: s.y + th / 2 },
    L: { x: s.x - tw / 2, y: s.y },
  });
  const path = (pts: Position[]) => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  };
  const fillPoly = (pts: Position[], fill: string) => {
    ctx.beginPath();
    path(pts);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const line = (a: Position, b: Position) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  const down = (p: Position, d: number): Position => ({ x: p.x, y: p.y + d });
  const diamond = (k: Corners) => [k.T, k.R, k.B, k.L];

  /** Paths gathered by style, so a few hundred tufts cost one stroke rather than a few hundred. */
  const batch = () => {
    const paths = new Map<string, Path2D>();
    return {
      get: (style: string) => {
        let p = paths.get(style);
        if (!p) paths.set(style, (p = new Path2D()));
        return p;
      },
      fill: () => paths.forEach((p, style) => ((ctx.fillStyle = style), ctx.fill(p))),
      stroke: (width: number) => {
        ctx.lineWidth = width;
        paths.forEach((p, style) => ((ctx.strokeStyle = style), ctx.stroke(p)));
      },
    };
  };
  const polyTo = (p: Path2D, pts: Position[]) => {
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    p.closePath();
  };
  const segmentTo = (p: Path2D, a: Position, b: Position) => {
    p.moveTo(a.x, a.y);
    p.lineTo(b.x, b.y);
  };

  /*
   * The wind: every blade of grass leans the same way, by an amount that
   * rises and falls as gusts roll across the world, with each tuft a little
   * out of step with its neighbours. It is a function of time and place and
   * nothing else, so a frame can be drawn from scratch at any moment.
   */
  const time = scene.time;
  const windAt = (x: number, y: number): number => {
    const gust = 0.55 + 0.45 * Math.sin((x + y) * 0.35 - time * 1.3);
    const flutter = 0.7 + 0.3 * Math.sin(time * 2.6 + cellNoise(Math.round(x), Math.round(y), 300) * TAU);
    return gust * flutter;
  };

  /** A tuft of grass, bent by the wind at its root. */
  const tuft = (p: Path2D, px: number, py: number, blades: number, len: number, seed = 0) => {
    const lean = windAt((px - origin.x) / tw, (py - origin.y) / th) * 0.45;
    for (let i = 0; i < blades; i++) {
      const a = -Math.PI / 2 + (i - (blades - 1) / 2) * 0.32 + lean * 0.5;
      const l = len * (0.75 + 0.35 * cellNoise(Math.round(px), Math.round(py), 70 + i + seed));
      p.moveTo(px + (i - blades / 2) * 1.2, py);
      p.quadraticCurveTo(
        px + Math.cos(a) * l * 0.3,
        py + Math.sin(a) * l * 0.6,
        px + Math.cos(a) * l + (i - 1) * 1.5 + lean * l * 0.35,
        py + Math.sin(a) * l
      );
    }
  };

  /**
   * The level a cell's ground is actually drawn at. A stair is carved down
   * into its terrace, so its floor is the level below, and its neighbours
   * see a notch there rather than a terrace.
   */
  const floorOf = (p: Position): number => {
    const g = groundAt(p);
    return g.level - (g.stair ? 1 : 0);
  };

  /*
   * The paper is not quite one white: each cell is one of four barely
   * different ones, few enough to fill each in a single call.
   */
  const topColour = (c: Position, g: Ground): RGB =>
    g.obstacle === "water" || g.ford
      ? WATER
      : shade(
          WHITE,
          0.985 + (Math.floor(cellNoise(c.x, c.y, 5) * 4) / 3 - 0.5) * 0.03 - (MAX_LEVEL - g.level) * 0.012
        );

  /**
   * The wash, as a fill rather than a draw: one pattern per terrace level,
   * carrying the projection as its transform, so a cell's top is washed by
   * filling it — no clip, and no way for the wash to land anywhere else.
   */
  const washes: (CanvasPattern | null)[] = [];
  const washFor = (level: number): CanvasPattern | null => {
    if (washes[level] !== undefined) return washes[level];
    const pattern = ctx.createPattern(washTexture(), "no-repeat");
    if (pattern) {
      // Texture pixel (i, j) is the point WASH_ORIGIN + (i, j) / WASH_PER_CELL
      // in cells; the projection is affine, so it is one matrix.
      const o = at({ x: WASH_ORIGIN, y: WASH_ORIGIN }, level);
      const a = tw / 2 / WASH_PER_CELL;
      const b = th / 2 / WASH_PER_CELL;
      pattern.setTransform(new DOMMatrix([a, b, -a, b, o.x, o.y]));
    }
    return (washes[level] = pattern);
  };

  /** The seam between cells: drawn near the walker, gone further out. */
  const seamAlpha = (c: Position) =>
    0.4 * clamp01(1 - (Math.abs(c.x - walker.x) + Math.abs(c.y - walker.y) - 2.5) / 4.5);

  /** Where the pointer is, and the walk it would take. */
  const paintMarks = (c: Position, k: Corners, s: Position) => {
    if (scene.route.has(key(c))) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(2, th * 0.07), 0, TAU);
      ctx.fillStyle = BOARD.move;
      ctx.globalAlpha = 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const h = scene.hovered;
    if (h && h.x === c.x && h.y === c.y) {
      ctx.beginPath();
      path(diamond(k));
      ctx.fillStyle = BOARD.move;
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = BOARD.move;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };

  /**
   * A flight of steps carved into a terrace, down to the ground below. The
   * cell's own ground lies a level lower (see floorOf), and the steps stand
   * on it: each a block a quarter of a level taller than the one before, the
   * last flush with the terrace. They are cut from the same stone as the
   * cliff around them — the same fills, a stratum on each riser, ink only on
   * the nosing — so the stair reads as part of the terrace, not an object
   * leaned against it.
   */
  const STEPS_PER_FLIGHT = 4;
  const flight = (c: Position, tufts: Path2D) => {
    const g = groundAt(c);
    if (!g.stair) return;
    const up = { x: -g.stair.x, y: -g.stair.y };
    const floor = g.level - 1;
    const across = { x: Math.abs(up.y), y: Math.abs(up.x) };
    const project = (X: number, Y: number, h: number): Position => ({
      x: origin.x + ((X - Y) * tw) / 2,
      y: origin.y + ((X + Y) * th) / 2 - h * rise,
    });
    const blocks = [];
    for (let i = 0; i < STEPS_PER_FLIGHT; i++) {
      const t0 = -0.5 + i / STEPS_PER_FLIGHT;
      const t1 = t0 + 1 / STEPS_PER_FLIGHT;
      const xs = [c.x + up.x * t0 - across.x * 0.5, c.x + up.x * t1 + across.x * 0.5];
      const ys = [c.y + up.y * t0 - across.y * 0.5, c.y + up.y * t1 + across.y * 0.5];
      blocks.push({
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        y0: Math.min(...ys),
        y1: Math.max(...ys),
        top: floor + (i + 1) / STEPS_PER_FLIGHT,
      });
    }
    blocks.sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0));
    const tread = rgb(topColour(c, g));
    for (const { x0, x1, y0, y1, top } of blocks) {
      const right = [project(x1, y0, top), project(x1, y1, top), project(x1, y1, floor), project(x1, y0, floor)];
      const left = [project(x0, y1, top), project(x1, y1, top), project(x1, y1, floor), project(x0, y1, floor)];
      const treadPts = [project(x0, y0, top), project(x1, y0, top), project(x1, y1, top), project(x0, y1, top)];
      fillPoly(right, rgb(STONE_RIGHT));
      fillPoly(left, rgb(STONE_LEFT));
      ctx.strokeStyle = "rgba(61,63,61,.3)";
      ctx.lineWidth = 0.7;
      const mid = (a: Position, b: Position, u: number) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      line(mid(left[3], left[0], 0.45), mid(left[2], left[1], 0.45));
      line(mid(right[3], right[0], 0.45), mid(right[2], right[1], 0.45));
      fillPoly(treadPts, tread);
      // Every step edge gets a fine line — a flight seen from its top shows
      // no risers, and without them it would read as a flat strip — and the
      // nosings facing the viewer a firmer one.
      ctx.strokeStyle = "rgba(61,63,61,.4)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.strokeStyle = "rgba(61,63,61,.7)";
      ctx.lineWidth = 1;
      line(treadPts[1], treadPts[2]);
      line(treadPts[2], treadPts[3]);
    }
    // Something growing in the corner of a step, now and then.
    if (cellNoise(c.x, c.y, 160) < 0.6) {
      const i = 1 + Math.floor(cellNoise(c.x, c.y, 161) * 2);
      const b = blocks[blocks.length - 1 - i];
      const p = project(b.x0 + 0.08, b.y1 - 0.08, b.top);
      tuft(tufts, p.x, p.y, 3, th * 0.2);
    }
  };

  /**
   * One row of ground — cells sharing an x + y, which never overlap one
   * another: the cliffs below them, the paper, the wash, then the ink —
   * water, seams, contours, grass, stones, flowers — each gathered into a
   * handful of paths. Shadows are gathered for the caller to lay down once
   * the ground is finished, since they fall across the rows in front.
   */
  const paintRow = (cells: Position[], shadows: Path2D) => {
    const fills = batch();
    // Created on first use: most rows need only a few of these.
    const paths = new Map<string, Path2D>();
    const P = (name: string) => {
      let p = paths.get(name);
      if (!p) paths.set(name, (p = new Path2D()));
      return p;
    };
    const washed: Path2D[] = [];
    const seams = batch();
    const grass = batch();
    const fords: { c: Position; k: Corners }[] = [];
    const marked: { c: Position; k: Corners; s: Position }[] = [];
    const flights: Position[] = [];

    for (const c of cells) {
      const g = groundAt(c);
      const level = floorOf(c);
      const s = at(c, level);
      const k = cornersOf(s);
      const top = topColour(c, g);
      const water = g.obstacle === "water" || g.ford;

      /*
       * The cliff below a terrace, on the sides that drop to lower ground,
       * engraved rather than shaded: bands of stone at uneven heights and a
       * crack or two, in the same ink as everything else on the paper.
       */
      const right = floorOf({ x: c.x + 1, y: c.y });
      const left = floorOf({ x: c.x, y: c.y + 1 });
      const cliff = (from: Position, to: Position, levels: number, colour: RGB, salt: number) => {
        const drop = levels * rise;
        polyTo(fills.get(rgb(colour)), [from, to, down(to, drop), down(from, drop)]);
        const bands = Math.round(levels * 3);
        for (let b = 1; b <= bands; b++) {
          const f = (b - 0.4 + (cellNoise(c.x, c.y, salt + b) - 0.5) * 0.4) / (bands + 0.2);
          const a = down(from, f * drop);
          const z = down(to, f * drop);
          P("strata").moveTo(a.x, a.y);
          P("strata").quadraticCurveTo(
            (a.x + z.x) / 2,
            (a.y + z.y) / 2 + (cellNoise(c.x, c.y, salt + 10 + b) - 0.5) * 4,
            z.x,
            z.y
          );
        }
        for (let n = 0; n < 2; n++) {
          if (cellNoise(c.x, c.y, salt + 20 + n) > 0.6) continue;
          const u = 0.2 + 0.6 * cellNoise(c.x, c.y, salt + 30 + n);
          const p = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
          const start = drop * (0.15 + 0.3 * cellNoise(c.x, c.y, salt + 40 + n));
          segmentTo(P("cracks"), down(p, start), { x: p.x + 1, y: p.y + start + drop * 0.35 });
        }
      };
      if (right < level) cliff(k.R, k.B, level - right, STONE_RIGHT, 400);
      if (left < level) cliff(k.L, k.B, level - left, STONE_LEFT, 500);
      polyTo(fills.get(rgb(top)), diamond(k));
      if (!water) polyTo((washed[level] ??= new Path2D()), diamond(k));

      if (water) {
        for (let i = 0; i < 2; i++) {
          // Ripples drift downstream and back, never quite still.
          const drift = Math.sin(time * 0.9 + cellNoise(c.x, c.y, 52 + i) * TAU) * tw * 0.06;
          const px = s.x + (cellNoise(c.x, c.y, 50 + i) - 0.5) * tw * 0.4 + drift;
          const py = s.y + (i - 0.5) * th * 0.35;
          P("ripples").moveTo(px - tw * 0.1, py);
          P("ripples").quadraticCurveTo(px, py - 2.5, px + tw * 0.1, py);
        }
        for (const [dx, dy, a, b] of EDGES) {
          const n = groundAt({ x: c.x + dx, y: c.y + dy });
          if (n.obstacle !== "water" && !n.ford) segmentTo(P("banks"), k[a], k[b]);
        }
        if (g.ford) fords.push({ c, k });
      } else {
        const alpha = Math.round(seamAlpha(c) * 20) / 20;
        if (alpha > 0 && !g.stair) polyTo(seams.get(`rgba(160,162,158,${alpha})`), diamond(k));
      }

      // The contour: a firm line along every edge that drops to lower ground,
      // except where the top of a stair comes out onto it.
      for (const [dx, dy, a, b] of EDGES) {
        const n = { x: c.x + dx, y: c.y + dy };
        const flightTop = groundAt(n).stair;
        const arriving = !!flightTop && flightTop.x === dx && flightTop.y === dy;
        if (floorOf(n) < level && !arriving) segmentTo(P("contours"), k[a], k[b]);
      }

      // A few stones fallen at the foot of a cliff that faces the viewer.
      const underCliff =
        floorOf({ x: c.x - 1, y: c.y }) > level || floorOf({ x: c.x, y: c.y - 1 }) > level;
      if (underCliff && !g.obstacle && !g.path && !g.stair && cellNoise(c.x, c.y, 170) < 0.5) {
        const back = floorOf({ x: c.x - 1, y: c.y }) > level ? k.L : k.R;
        const px = back.x + (k.T.x - back.x) * 0.5 + (s.x - back.x) * 0.25;
        const py = back.y + (k.T.y - back.y) * 0.5 + (s.y - back.y) * 0.25 + th * 0.08;
        for (let i = 0; i < 2; i++) {
          const r = tw * (0.035 + 0.02 * cellNoise(c.x, c.y, 171 + i));
          P("stones").moveTo(px + i * r * 1.7 + r, py + i * 2);
          P("stones").ellipse(px + i * r * 1.7, py + i * 2, r, r * 0.6, 0, 0, TAU);
        }
      }

      // The trodden way to and from a stair: worn earth running into the
      // flight, so the way up can be seen from a distance.
      if (g.path) {
        for (const [dx, dy] of EDGES) {
          const n = { x: c.x + dx, y: c.y + dy };
          const ng = groundAt(n);
          const flight = ng.stair;
          const leads =
            (ng.path && floorOf(n) === level) ||
            (!!flight && ((flight.x === -dx && flight.y === -dy) || (flight.x === dx && flight.y === dy)));
          if (!leads) continue;
          // Footprints, rather than a band of colour: a trodden way is
          // ground people have walked on, not something laid over it.
          const end = { x: s.x + ((dx - dy) * tw) / 4, y: s.y + ((dx + dy) * th) / 4 };
          for (let i = 0; i < 2; i++) {
            const u = 0.15 + i * 0.5;
            const side = (i % 2 ? 1 : -1) * th * 0.09;
            const fx = s.x + (end.x - s.x) * u + side * 0.6;
            const fy = s.y + (end.y - s.y) * u + side * 0.3;
            P("prints").moveTo(fx + 2.2, fy);
            P("prints").ellipse(fx, fy, 2.2, 1.3, -0.45, 0, TAU);
          }
        }
      }

      if (!g.obstacle && !g.ford && !g.stair && !g.path && !(c.x === 0 && c.y === 0)) {
        let nearWater = false;
        for (const [dx, dy] of EDGES) {
          if (groundAt({ x: c.x + dx, y: c.y + dy }).obstacle === "water") nearWater = true;
        }
        const ink = g.sand > g.moss + 0.1 ? SAND_INK : g.moss > 0.1 ? MOSS_INK : GRAPHITE;

        const grassChance = 0.2 + g.moss * 0.35 - g.sand * 0.12 + (nearWater ? 0.5 : 0);
        const tufts = cellNoise(c.x, c.y, 60) < grassChance ? (cellNoise(c.x, c.y, 61) < 0.35 ? 2 : 1) : 0;
        for (let t = 0; t < tufts; t++) {
          const px = s.x + (cellNoise(c.x, c.y, 62 + t) - 0.5) * tw * 0.5;
          const py = s.y + (cellNoise(c.x, c.y, 64 + t) - 0.5) * th * 0.45;
          const blades = 3 + Math.floor(cellNoise(c.x, c.y, 66 + t) * 3);
          const len = th * (0.22 + 0.14 * cellNoise(c.x, c.y, 68 + t)) * (nearWater ? 1.4 : 1);
          tuft(grass.get(ink), px, py, blades, len, t * 9);
        }

        const pebbles = cellNoise(c.x, c.y, 80);
        if (pebbles < 0.09 + g.sand * 0.12) {
          const px = s.x + (cellNoise(c.x, c.y, 81) - 0.5) * tw * 0.45;
          const py = s.y + (cellNoise(c.x, c.y, 82) - 0.5) * th * 0.4;
          for (let i = 0; i < (pebbles < 0.04 ? 3 : 2); i++) {
            const r = tw * (0.035 + 0.03 * cellNoise(c.x, c.y, 83 + i));
            const ex = px + i * r * 1.6;
            const ey = py + (i % 2) * r * 0.6;
            P("stones").moveTo(ex + r, ey);
            P("stones").ellipse(ex, ey, r, r * 0.6, 0, 0, TAU);
          }
        }

        if (cellNoise(c.x, c.y, 90) < 0.03 + g.moss * 0.03) {
          const px = s.x + (cellNoise(c.x, c.y, 91) - 0.5) * tw * 0.4;
          const py = s.y + (cellNoise(c.x, c.y, 92) - 0.5) * th * 0.4;
          const size = th / 30;
          for (let i = 0; i < 3; i++) {
            const fx = px + (i - 1) * 4 * size;
            const fy = py - (2 + (i % 2) * 3) * size;
            segmentTo(grass.get(ink), { x: fx, y: fy + 4 * size }, { x: fx, y: fy });
            P("flowers").moveTo(fx + 1.7 * size, fy);
            P("flowers").arc(fx, fy, 1.7 * size, 0, TAU);
          }
        }

        if (g.sand > 0.4) {
          for (let i = 0; i < 5; i++) {
            if (cellNoise(c.x, c.y, 100 + i) > g.sand * 0.8) continue;
            P("stipple").rect(
              s.x + (cellNoise(c.x, c.y, 110 + i) - 0.5) * tw * 0.6,
              s.y + (cellNoise(c.x, c.y, 120 + i) - 0.5) * th * 0.5,
              1.2,
              1.2
            );
          }
        }
      }

      if (g.obstacle === "rock" || g.obstacle === "tree") {
        const [ox, oy, rx, ry] =
          g.obstacle === "rock" ? [0.14, 0.1, 0.44, 0.34] : [0.24, 0.06, 0.36, 0.26];
        shadows.moveTo(s.x + tw * (ox + rx), s.y + th * oy);
        shadows.ellipse(s.x + tw * ox, s.y + th * oy, tw * rx, th * ry, 0, 0, TAU);
      }

      const h = scene.hovered;
      // A thicket: scrub drawn thick and dark enough to read as a barrier.
      if (g.obstacle === "thicket") {
        const ink = g.sand > g.moss ? SAND_INK : MOSS_INK;
        const p = grass.get(ink);
        for (let t = 0; t < 7; t++) {
          const px = s.x + (cellNoise(c.x, c.y, 130 + t) - 0.5) * tw * 0.6;
          const py = s.y + (cellNoise(c.x, c.y, 140 + t) - 0.5) * th * 0.55;
          tuft(p, px, py, 5, th * (0.3 + 0.2 * cellNoise(c.x, c.y, 150 + t)), t);
        }
      }

      if (g.stair) flights.push(c);
      if (scene.route.has(key(c)) || (h && h.x === c.x && h.y === c.y)) {
        // On a stair, the mark sits halfway up, where you would stand.
        const m = g.stair ? at(c, g.level - 0.5) : s;
        marked.push({ c, k: g.stair ? cornersOf(m) : k, s: m });
      }
    }

    fills.fill();
    ctx.strokeStyle = "rgba(61,63,61,.38)";
    ctx.lineWidth = 0.8;
    if (paths.has("strata")) ctx.stroke(P("strata"));
    ctx.strokeStyle = "rgba(61,63,61,.25)";
    if (paths.has("cracks")) ctx.stroke(P("cracks"));
    washed.forEach((p, level) => {
      const pattern = washFor(level);
      if (!pattern) return;
      ctx.fillStyle = pattern;
      ctx.fill(p);
    });

    ctx.fillStyle = "rgba(95,98,96,.5)";
    if (paths.has("prints")) ctx.fill(P("prints"));
    ctx.strokeStyle = RIPPLE;
    ctx.lineWidth = 1;
    if (paths.has("ripples")) ctx.stroke(P("ripples"));
    // Stepping stones, the one thing that says this water can be crossed.
    for (const { c, k } of fords) {
      for (let i = 0; i < 3; i++) {
        const u = (i + 0.5) / 3;
        const px = k.T.x + (k.B.x - k.T.x) * u + (cellNoise(c.x, c.y, 55 + i) - 0.5) * tw * 0.2;
        const py = k.T.y + (k.B.y - k.T.y) * u;
        P("stones").moveTo(px + tw * 0.09, py);
        P("stones").ellipse(px, py, tw * 0.09, th * 0.1, 0, 0, TAU);
      }
    }
    ctx.strokeStyle = BANK;
    ctx.lineWidth = 1.3;
    if (paths.has("banks")) ctx.stroke(P("banks"));

    seams.stroke(0.8);
    ctx.strokeStyle = "rgba(61,63,61,.75)";
    ctx.lineWidth = 1.2;
    if (paths.has("contours")) ctx.stroke(P("contours"));
    for (const c of flights) flight(c, grass.get(MOSS_INK));

    grass.stroke(1);
    ctx.fillStyle = "#e7e7e3";
    if (paths.has("stones")) ctx.fill(P("stones"));
    ctx.strokeStyle = GRAPHITE;
    ctx.lineWidth = 0.8;
    if (paths.has("stones")) ctx.stroke(P("stones"));
    ctx.fillStyle = BOARD.accent;
    if (paths.has("flowers")) ctx.fill(P("flowers"));
    ctx.fillStyle = "rgba(150,128,90,.45)";
    if (paths.has("stipple")) ctx.fill(P("stipple"));

    for (const { c, k, s } of marked) paintMarks(c, k, s);
  };

  /** Ground, back to front, a row at a time: the painter's algorithm. */
  const paintRows = (cells: Position[]) => {
    const shadows = new Path2D();
    let row: Position[] = [];
    for (const c of cells) {
      if (row.length > 0 && c.x + c.y !== row[0].x + row[0].y) {
        paintRow(row, shadows);
        row = [];
      }
      row.push(c);
    }
    if (row.length > 0) paintRow(row, shadows);
    return shadows;
  };

  const shadow = (x: number, y: number, rx: number, ry: number, alpha: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = `rgba(40,42,40,${alpha})`;
    ctx.fill();
  };

  /**
   * The ground, strictly back to front. Drawing it a terrace level at a time
   * looks equivalent and is not: a high cell's cliff drops past the cells
   * diagonally in front of it, and one of those standing at an intermediate
   * level has to cover the foot of that cliff. Only depth order gets it right.
   */
  const paintGround = () => {
    const shadows = paintRows(scene.cells);
    // Nothing stands just in front of higher ground (see world.ts), so the
    // shadows can go down over the finished ground without landing on a cliff.
    ctx.fillStyle = "rgba(40,42,40,.11)";
    ctx.fill(shadows);
    const feet = at(walker, heightAt(walker));
    shadow(feet.x + 2, feet.y + 1, tw * 0.16, th * 0.16, 0.16);
  };

  /**
   * The ground in front of the walker, again, but only inside a box around
   * them: whatever of it covers the walker has to be over the sprite, and
   * redrawing every row in that box — not a hand-picked few cells — keeps it
   * drawn in the same order, and so identical, to the sheet underneath.
   */
  const paintGroundWithin = (cells: Position[], box: { x: number; y: number; w: number; h: number }) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    paintRows(cells);
    ctx.restore();
  };

  /* ---------- what stands on the ground ---------- */

  const boulder = (c: Position, s: Position) => {
    const n = 7;
    const rx = tw * (0.3 + 0.1 * cellNoise(c.x, c.y, 11));
    const ry = rx * 0.52;
    const height = th * (0.5 + 0.7 * cellNoise(c.x, c.y, 12));
    const a0 = cellNoise(c.x, c.y, 13) * TAU;
    const base: Position[] = [];
    const crown: Position[] = [];
    const angles: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      const r = 1 + (cellNoise(c.x, c.y, 20 + i) - 0.5) * 0.3;
      angles.push(a);
      base.push({ x: s.x + Math.cos(a) * rx * r, y: s.y + Math.sin(a) * ry * r });
      crown.push({
        x: s.x + Math.cos(a) * rx * r * 0.6 - tw * 0.02,
        y: s.y - height + Math.sin(a) * ry * r * 0.6 + (cellNoise(c.x, c.y, 30 + i) - 0.5) * th * 0.18,
      });
    }
    // Only the facets turned towards the viewer, back ones first; the crown
    // covers the rest. Light comes from the upper left.
    const facets: { i: number; j: number; am: number }[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const am = a0 + ((i + 0.5) / n) * TAU;
      if (Math.sin(am) >= -0.35) facets.push({ i, j, am });
    }
    facets.sort((a, b) => Math.sin(a.am) - Math.sin(b.am));
    ctx.lineJoin = "round";
    for (const f of facets) {
      const light = clamp01(0.5 - 0.55 * Math.cos(f.am + 0.5));
      const pts = [base[f.i], base[f.j], crown[f.j], crown[f.i]];
      fillPoly(pts, rgb(mix(STONE_DARK, STONE_LIGHT, light)));
      ctx.strokeStyle = "rgba(61,63,61,.7)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      if (light < 0.4) {
        ctx.strokeStyle = "rgba(61,63,61,.35)";
        ctx.lineWidth = 0.7;
        for (let q = 1; q < 4; q++) {
          const u = q / 4;
          const p = { x: base[f.i].x + (base[f.j].x - base[f.i].x) * u, y: base[f.i].y + (base[f.j].y - base[f.i].y) * u };
          const r = { x: crown[f.i].x + (crown[f.j].x - crown[f.i].x) * u, y: crown[f.i].y + (crown[f.j].y - crown[f.i].y) * u };
          line(
            { x: p.x + (r.x - p.x) * 0.12, y: p.y + (r.y - p.y) * 0.12 },
            { x: p.x + (r.x - p.x) * 0.7, y: p.y + (r.y - p.y) * 0.7 }
          );
        }
      }
    }
    fillPoly(crown, "#f3f3f0");
    ctx.strokeStyle = "rgba(61,63,61,.75)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
  };

  const hatch = (cx: number, cy: number, r: number) => {
    ctx.strokeStyle = "rgba(61,63,61,.45)";
    ctx.lineWidth = 0.7;
    for (let k = -2 * r; k <= 2 * r; k += 3) {
      line({ x: cx + k - 2 * r, y: cy - 2 * r }, { x: cx + k + 2 * r, y: cy + 2 * r });
    }
  };

  const tree = (c: Position, g: Ground, s: Position) => {
    const size = 0.9 + 0.35 * cellNoise(c.x, c.y, 14);
    // The crown leans with the wind; the trunk stays planted.
    const sway = windAt(c.x, c.y) * tw * 0.025 * size;
    const leaf = rgb(mix(LEAF, LEAF_MOSS, g.moss));
    ctx.strokeStyle = "#5f6260";
    ctx.lineWidth = Math.max(1.5, tw / 28);
    if (cellNoise(c.x, c.y, 15) < 0.55) {
      const r = tw * 0.27 * size;
      const cx = s.x + sway;
      const cy = s.y - th * 1.45 * size;
      line(s, { x: cx, y: cy + r * 0.4 });
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fillStyle = leaf;
      ctx.fill();
      // The shaded half of the crown, hatched.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.clip();
      ctx.beginPath();
      const o = r * 0.2;
      path([
        { x: cx + 2 * r + o, y: cy - 2 * r + o },
        { x: cx + 2 * r + o, y: cy + 2 * r + o },
        { x: cx - 2 * r + o, y: cy + 2 * r + o },
      ]);
      ctx.clip();
      hatch(cx, cy, r);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const w = tw * 0.26 * size;
      const h = th * 1.1 * size;
      line(s, { x: s.x, y: s.y - th * 0.5 });
      for (let t = 0; t < 2; t++) {
        const by = s.y - th * 0.35 - t * h * 0.55;
        const ww = w * (1 - t * 0.28);
        const lean = sway * (0.5 + t * 0.5);
        const tri = [
          { x: s.x - ww + lean * 0.3, y: by },
          { x: s.x + ww + lean * 0.3, y: by },
          { x: s.x + lean, y: by - h },
        ];
        fillPoly(tri, leaf);
        ctx.save();
        ctx.beginPath();
        path(tri);
        ctx.clip();
        ctx.beginPath();
        ctx.rect(s.x + lean * 0.5, by - h, ww, h);
        ctx.clip();
        hatch(s.x + lean * 0.5, by - h / 2, h);
        ctx.restore();
        ctx.beginPath();
        path(tri);
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  };

  const paintObject = (c: Position) => {
    const g = groundAt(c);
    const s = at(c, g.level);
    if (g.obstacle === "rock") boulder(c, s);
    else if (g.obstacle === "tree") tree(c, g, s);
  };

  /**
   * Ground standing higher than the walker and in front of them, drawn again
   * over them: a terrace between you and the camera hides your feet, the way
   * a boulder does. Only the few cells right in front are worth it.
   */
  const paintGrain = (mode: GlobalCompositeOperation) => {
    const pattern = ctx.createPattern(grainTexture(), "repeat");
    if (!pattern) return;
    ctx.save();
    ctx.globalCompositeOperation = mode;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, scene.width, scene.height);
    ctx.restore();
  };

  /**
   * Gusts: a few airy strokes of ink crossing the sheet in the direction the
   * grass leans, each carrying a leaf, fading in and out as they pass. They
   * ride with the paper rather than the screen, so walking into the wind
   * reads as walking into it.
   */
  const paintGusts = () => {
    const { width: W, height: H } = scene;
    const span = W * 1.5;
    const wrap = (v: number, m: number) => ((v % m) + m) % m;
    ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const period = 9 + k * 1.7;
      const pass = Math.floor((time + k * 2.3) / period);
      const u = ((time + k * 2.3) % period) / period;
      const alpha = Math.sin(u * Math.PI) ** 2 * 0.3;
      if (alpha < 0.01) continue;
      const len = Math.min(170, W * 0.2);
      const x0 = wrap(u * span + origin.x - W / 2 + cellNoise(k, pass, 410) * W, span) - W * 0.25;
      const y0 = wrap(H * cellNoise(k, pass, 400) + origin.y - H / 2, H);
      ctx.strokeStyle = `rgba(95,98,96,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const v = i / 24;
        const x = x0 + v * len;
        const y = y0 + Math.sin(v * Math.PI * 2 + time * 2 + k) * 4 + v * len * 0.12;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      // A curl where the gust breaks.
      const hx = x0 + len;
      const hy = y0 + len * 0.12 + Math.sin(Math.PI * 2 + time * 2 + k) * 4;
      ctx.arc(hx, hy - 5, 5, Math.PI / 2, Math.PI * 2.1, true);
      ctx.stroke();
      // And the leaf it carries.
      const lx = hx + 14 + Math.sin(time * 1.7 + k) * 6;
      const ly = hy - 4 + Math.sin(time * 3.1 + k) * 5;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(time * 2.2 + k);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 1.6, 0, 0, TAU);
      ctx.fillStyle = `rgba(90,122,84,${Math.min(1, alpha * 3)})`;
      ctx.fill();
      ctx.restore();
    }
  };

  return { paintGround, paintGroundWithin, paintObject, paintGrain, paintGusts };
};

const begin = (canvas: HTMLCanvasElement, scene: Scene) => {
  const w = Math.max(1, Math.round(scene.width * scene.dpr));
  const h = Math.max(1, Math.round(scene.height * scene.dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  ctx.clearRect(0, 0, scene.width, scene.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return ctx;
};

/**
 * The world in two sheets, with the walker between them: the ground and all
 * that stands behind the walker on the first, and on the second whatever
 * stands in front — rocks, trees, and the edge of any terrace high enough to
 * hide the walker's feet.
 */
export const paintWorld = (behind: HTMLCanvasElement, front: HTMLCanvasElement, scene: Scene) => {
  const back = begin(behind, scene);
  const fore = begin(front, scene);
  if (!back || !fore) return;

  // The camera's box over-covers the screen by design (see visibleBounds);
  // what is actually on it is decided here, where the terraces are known.
  const { width: tw, height: th } = scene.tile;
  const onScreen = (c: Position) => {
    const x = scene.origin.x + ((c.x - c.y) * tw) / 2;
    const y = scene.origin.y + ((c.x + c.y) * th) / 2 - groundAt(c).level * th * LEVEL_RISE;
    return x > -tw && x < scene.width + tw && y > -th * 2 && y < scene.height + th * 2.5;
  };
  scene = { ...scene, cells: scene.cells.filter(onScreen) };

  const b = painter(back, scene);
  b.paintGround();
  for (const c of scene.cells) {
    if (groundAt(c).obstacle && !inFrontOf(c, scene.walker)) b.paintObject(c);
  }
  b.paintGrain("multiply");

  /*
   * The box the sprite can occupy: a frame as wide as a tile, standing on
   * the walker's feet. Every cell in front of the walker whose ground — top
   * or cliff — reaches into it is redrawn there.
   */
  const rise = th * LEVEL_RISE;
  const feet = {
    x: scene.origin.x + ((scene.walker.x - scene.walker.y) * tw) / 2,
    y: scene.origin.y + ((scene.walker.x + scene.walker.y) * th) / 2 - heightAt(scene.walker) * rise,
  };
  const box = { x: feet.x - tw * 0.6, y: feet.y - tw * 1.1, w: tw * 1.2, h: tw * 1.1 + th * 0.6 };
  const reaches = (c: Position) => {
    const x = scene.origin.x + ((c.x - c.y) * tw) / 2;
    const y = scene.origin.y + ((c.x + c.y) * th) / 2 - groundAt(c).level * rise;
    return (
      Math.abs(x - feet.x) < box.w / 2 + tw / 2 &&
      y - th / 2 < box.y + box.h &&
      y + th / 2 + MAX_LEVEL * rise > box.y
    );
  };

  const f = painter(fore, scene);
  f.paintGroundWithin(
    scene.cells.filter((c) => inFrontOf(c, scene.walker) && reaches(c)),
    box
  );
  for (const c of scene.cells) {
    if (groundAt(c).obstacle && inFrontOf(c, scene.walker)) f.paintObject(c);
  }
  // Only over what this sheet holds: everywhere else it would grain the
  // walker too, who is drawn on neither.
  f.paintGrain("source-atop");
  f.paintGusts();
};
