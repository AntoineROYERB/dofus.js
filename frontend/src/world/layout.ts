import { Position } from "../types/game";
import { GRID_RADIUS } from "../utils/board";
import { valueNoise } from "../explore/noise";
import { generator } from "./seed";
import { CELL_H, CELL_W, cellToArt } from "./view";

/**
 * Where everything around the board goes: the land's levels, the ponds, the
 * trees and stones. Pure and seeded (seed.ts), so the same fight always gets
 * the same clearing, and testable without drawing a pixel.
 *
 * Two rules hold whatever the seed: the board itself is flat at level 0, and
 * nothing tall may cover a playable cell — nothing tall in the first ring
 * around the board, and nothing whose drawing would overlap it.
 */

/** How far out the land is laid, in cells from the middle of the board. */
export const LAND_RADIUS = 18;

/** An island's look, by palette id: what grows there and what it is built of. */
export type Look = {
  /** Grass per ground pixel, 0 to 1 (the plan's densities). */
  grass: number;
  /** The scenery that may stand around the board, and how often, by kind. */
  decor: Partial<Record<DecorKind, number>>;
  /** What the board's cover is drawn as. */
  cover: "boulder" | "stump" | "coral" | "iceblock" | "crystal" | "basalt";
  /** What fills the sunken ponds. */
  liquid: "water" | "lava" | "acid" | "ice";
  /** The air of the island. */
  ambient: "firefly" | "dust" | "drizzle" | "snow" | "petal" | "spore" | "ember";
  /** How much daylight reaches the scene. */
  ambientLight: number;
  /** Leaves come loose from its trees. */
  leaves: boolean;
};

export type DecorKind =
  | "tree"
  | "pine"
  | "bush"
  | "boulder"
  | "crystal"
  | "column"
  | "deadtree"
  | "mushroom"
  | "reeds"
  | "coral";

const LOOKS: Record<string, Look> = {
  prairie: {
    grass: 1,
    decor: { tree: 0.45, pine: 0.25, boulder: 0.15, bush: 0.15 },
    cover: "boulder",
    liquid: "water",
    ambient: "firefly",
    ambientLight: 0.62,
    leaves: true,
  },
  earth: {
    grass: 0.35,
    decor: { boulder: 0.4, column: 0.3, deadtree: 0.15, pine: 0.15 },
    cover: "boulder",
    liquid: "water",
    ambient: "dust",
    ambientLight: 0.62,
    leaves: false,
  },
  water: {
    grass: 0.7,
    decor: { coral: 0.3, reeds: 0.3, pine: 0.2, boulder: 0.2 },
    cover: "coral",
    liquid: "water",
    ambient: "drizzle",
    ambientLight: 0.66,
    leaves: false,
  },
  ice: {
    grass: 0,
    decor: { pine: 0.5, crystal: 0.3, boulder: 0.2 },
    cover: "iceblock",
    liquid: "ice",
    ambient: "snow",
    ambientLight: 0.42,
    leaves: false,
  },
  air: {
    grass: 0.8,
    decor: { tree: 0.4, crystal: 0.3, boulder: 0.15, bush: 0.15 },
    cover: "crystal",
    liquid: "water",
    ambient: "petal",
    ambientLight: 0.66,
    leaves: true,
  },
  acid: {
    grass: 0.8,
    decor: { mushroom: 0.5, bush: 0.3, crystal: 0.2 },
    cover: "boulder",
    liquid: "acid",
    ambient: "spore",
    ambientLight: 0.6,
    leaves: false,
  },
  fire: {
    grass: 0,
    decor: { column: 0.4, deadtree: 0.3, boulder: 0.3 },
    cover: "basalt",
    liquid: "lava",
    ambient: "ember",
    ambientLight: 0.6,
    leaves: false,
  },
};

/** An unknown palette (a new island, or a plain arena) borrows the prairie's look. */
export const lookOf = (palette: string | undefined): Look => LOOKS[palette ?? ""] ?? LOOKS.prairie;
export const KNOWN_LOOKS = Object.keys(LOOKS);

/** Each kind's size in art pixels, and whether it stands tall. */
export const DECOR_SIZE: Record<DecorKind, { w: number; h: number; tall: boolean }> = {
  tree: { w: 34, h: 54, tall: true },
  pine: { w: 22, h: 48, tall: true },
  deadtree: { w: 26, h: 42, tall: true },
  column: { w: 14, h: 40, tall: true },
  crystal: { w: 16, h: 30, tall: true },
  mushroom: { w: 30, h: 38, tall: true },
  coral: { w: 20, h: 22, tall: false },
  bush: { w: 18, h: 12, tall: false },
  boulder: { w: 18, h: 13, tall: false },
  reeds: { w: 14, h: 16, tall: false },
};

export type Decor = { kind: DecorKind; cell: Position; seed: number; size: number };

export type Pond = { centre: Position; a: number; b: number; cells: Set<string> };

export type Layout = {
  look: Look;
  levelOf: (p: Position) => number;
  ponds: Pond[];
  decor: Decor[];
};

const key = (p: Position) => `${p.x},${p.y}`;
const ringOf = (p: Position) => Math.abs(p.x) + Math.abs(p.y);

/**
 * The art box a decor piece covers once drawn: its foot on its cell's
 * centre, lifted by the cell's level.
 */
export const decorBox = (d: Decor, level: number) => {
  const size = DECOR_SIZE[d.kind];
  const w = size.w * d.size;
  const h = size.h * d.size;
  const foot = cellToArt(d.cell.x, d.cell.y);
  return { x: foot.x - w / 2, y: foot.y - level * 7 - h + 3, w, h };
};

/** Whether an art box comes within half a cell of a playable cell. */
export const overlapsBoard = (box: { x: number; y: number; w: number; h: number }): boolean => {
  // The board is a diamond: |ax| / (W/2) + |ay| / (H/2) <= R + 1 at its rim.
  // A box is clear of it when its nearest point is outside, with a margin.
  const nx = Math.max(box.x, Math.min(0, box.x + box.w));
  const ny = Math.max(box.y, Math.min(0, box.y + box.h));
  const reach = Math.abs(nx) / (CELL_W / 2) + Math.abs(ny) / (CELL_H / 2);
  return reach <= GRID_RADIUS + 1 + 0.5;
};

export const planScene = (palette: string | undefined, seed: number): Layout => {
  const look = lookOf(palette);
  const rand = generator(seed);
  const salt = Math.floor(rand() * 1e6);

  // Two ponds, sunk in the front corners, nudged by the seed.
  const ponds: Pond[] = [-1, 1].map((side) => {
    const centre = { x: side * (150 + rand() * 14), y: 68 + rand() * 10 };
    const pond: Pond = { centre, a: 44 + rand() * 8, b: 20 + rand() * 4, cells: new Set() };
    return pond;
  });
  for (let x = -LAND_RADIUS; x <= LAND_RADIUS; x++) {
    for (let y = -LAND_RADIUS; y <= LAND_RADIUS; y++) {
      const p = { x, y };
      if (ringOf(p) <= GRID_RADIUS + 2) continue;
      const art = cellToArt(x, y);
      for (const pond of ponds) {
        const u = (art.x - pond.centre.x) / pond.a;
        const v = (art.y - pond.centre.y) / pond.b;
        if (u * u + v * v <= 1) pond.cells.add(key(p));
      }
    }
  }
  const inPond = (p: Position) => ponds.some((pond) => pond.cells.has(key(p)));

  /*
   * The land's levels. The board and its first ring are flat at 0. Behind
   * it the land climbs in terraces, ragged along their edges; in front it
   * drops one step, so the board's plinth shows; the ponds sink one more.
   */
  const levelOf = (p: Position): number => {
    const ring = ringOf(p);
    const depth = p.x + p.y;
    if (ring <= GRID_RADIUS) return 0;
    if (inPond(p)) return -2;
    if (depth > GRID_RADIUS) return -1;
    if (ring === GRID_RADIUS + 1) return 0;
    const n = valueNoise(p.x - p.y, 0, 3, salt);
    if (depth < -GRID_RADIUS) {
      const back = (-depth - GRID_RADIUS - 1) / 2.6 + n * 1.2;
      return Math.max(0, Math.min(3, Math.floor(back + 0.6)));
    }
    // The flanks: mostly flat, a mound here and there well clear of the board.
    return ring >= GRID_RADIUS + 4 && valueNoise(p.x, p.y, 4, salt + 3) > 0.68 ? 1 : 0;
  };

  // Scenery, cell by cell, in a fixed order so the seed alone decides it.
  const kinds = Object.entries(look.decor) as [DecorKind, number][];
  const total = kinds.reduce((s, [, w]) => s + w, 0);
  const decor: Decor[] = [];
  for (let x = -LAND_RADIUS; x <= LAND_RADIUS; x++) {
    for (let y = -LAND_RADIUS; y <= LAND_RADIUS; y++) {
      const cell = { x, y };
      const r1 = rand();
      const r2 = rand();
      const r3 = rand();
      const ring = ringOf(cell);
      if (ring <= GRID_RADIUS + 1 || inPond(cell)) continue;
      // A pond's bank is lined with something growing, so it has something to reflect.
      const bank = !inPond(cell) && [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([dx, dy]) => inPond({ x: x + dx, y: y + dy }));
      // In front of the board the land is kept low and open: the eye reads the
      // board through it. The flanks and the back carry the trees.
      const front = x + y > GRID_RADIUS;
      const chance = bank ? 0.4 : front ? 0.05 : ring <= GRID_RADIUS + 3 ? 0.07 : 0.12;
      if (r1 > chance) continue;
      let pick = r2 * total;
      let kind = kinds[0][0];
      for (const [k, w] of kinds) {
        pick -= w;
        if (pick <= 0) {
          kind = k;
          break;
        }
      }
      const piece: Decor = { kind, cell, seed: Math.floor(r3 * 1e6), size: 0.85 + r3 * 0.3 };
      // Nothing tall may cover a playable cell, nor stand in front of the
      // board; a small piece takes its place.
      if (overlapsBoard(decorBox(piece, levelOf(cell))) || (front && DECOR_SIZE[kind].tall && !bank)) {
        const small = kinds.find(([k]) => !DECOR_SIZE[k].tall)?.[0] ?? "boulder";
        piece.kind = small;
        if (overlapsBoard(decorBox(piece, levelOf(cell)))) continue;
      }
      decor.push(piece);
    }
  }
  // Back to front, the order they are painted in.
  decor.sort((a, b) => a.cell.x + a.cell.y - (b.cell.x + b.cell.y) || a.cell.x - b.cell.x);
  return { look, levelOf, ponds, decor };
};
