import { Position } from "../types/game";

/**
 * Where the fight's scene sits on screen, and how big its glyphs are.
 *
 * The scene is painted in art pixels, a board cell being CELL_W by CELL_H of
 * them — the mock-up's proportions. The board's DOM (marks, rings, numbers)
 * is laid out by `isoToScreen` and then moved by the zoom layer's pan and
 * scale, so the scene follows the very same mapping: cell (x, y) is drawn
 * where its DOM tile sits, or a tap would land on one cell and the glyphs
 * would show another.
 */

/** A board cell, in art pixels: 2:1, like every cell of the game. */
export const CELL_W = 24;
export const CELL_H = 12;

/** How far one terrace level lifts the ground, in art pixels (0.6 of a cell, as in the world). */
export const RISE = 7;

/** The art pixel a board cell's centre falls on. */
export const cellToArt = (x: number, y: number): Position => ({
  x: ((x - y) * CELL_W) / 2,
  y: ((x + y) * CELL_H) / 2,
});

/** The board cell an art pixel belongs to (the inverse of cellToArt, rounded). */
export const artToCell = (ax: number, ay: number): Position => {
  const a = ax / (CELL_W / 2);
  const b = ay / (CELL_H / 2);
  // `+ 0` turns a rounded -0 into 0, so a cell compares equal to itself.
  return { x: Math.round((a + b) / 2) + 0, y: Math.round((b - a) / 2) + 0 };
};

/**
 * How many glyphs wide a board cell is drawn. On a phone a cell is about
 * 77 px wide at 740×360, and twenty glyphs there would be 4 px each — a
 * texture, not letters — so a phone gets about twelve; a desk gets twenty.
 */
export const glyphsPerCell = (width: number, height: number): number =>
  Math.min(width, height) <= 560 ? 12 : 20;

/** A glyph is this many times as tall as it is wide: a monospace cell. */
export const GLYPH_ASPECT = 1.8;

export type View = {
  /** The container, in CSS pixels. */
  width: number;
  height: number;
  dpr: number;
  /** The board layer's tile width in CSS pixels, before the pinch's scale. */
  tile: number;
  scale: number;
  pan: Position;
};

export type GlyphGrid = {
  /** One glyph's size in device pixels: whole numbers, so letters stay crisp. */
  gw: number;
  gh: number;
  cols: number;
  rows: number;
  /** CSS pixels per art pixel. */
  unit: number;
  /** The art pixel under the container's top-left corner. */
  left: number;
  top: number;
  /** Art pixels per glyph, across and down. */
  stepX: number;
  stepY: number;
};

/**
 * The narrowest a glyph may be, in CSS pixels. Below it a letter stops
 * reading as a letter, whatever the cell count says: a desk window that
 * leaves the board small gets fewer, larger glyphs per cell rather than a
 * grey texture.
 */
export const MIN_GLYPH = 5;

/**
 * The glyph grid for a view. The glyph size is a whole number of device
 * pixels, so a pinch changes it in whole steps and a letter never lands
 * between two pixels; the art beneath follows the pinch exactly.
 */
export const glyphGrid = (v: View): GlyphGrid => {
  const unit = (v.tile * v.scale) / CELL_W;
  const perCell = glyphsPerCell(v.width, v.height);
  const css = Math.max(MIN_GLYPH, (v.tile * v.scale) / perCell);
  const gw = Math.max(4, Math.round(css * v.dpr));
  const gh = Math.max(7, Math.round(gw * GLYPH_ASPECT));
  const cols = Math.ceil((v.width * v.dpr) / gw);
  const rows = Math.ceil((v.height * v.dpr) / gh);
  // screen = centre + pan + unit * art, so art = (screen - centre - pan) / unit.
  const left = (0 - v.width / 2 - v.pan.x) / unit;
  const top = (0 - v.height / 2 - v.pan.y) / unit;
  return { gw, gh, cols, rows, unit, left, top, stepX: gw / v.dpr / unit, stepY: gh / v.dpr / unit };
};

/** Where a board-layer position (from isoToScreen) lands in art pixels. */
export const boardToArt = (p: Position, v: Pick<View, "width" | "height" | "tile">): Position => {
  const f = v.tile / CELL_W;
  return { x: (p.x - v.width / 2) / f, y: (p.y - v.height / 2) / f };
};
