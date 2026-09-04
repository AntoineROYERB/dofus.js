// Available colors for players
export const PLAYER_COLORS = [
  "#ff0000", // red
  "#0000ff", // blue
  "#008000", // green
  "#800080", // purple
  "#ffa500", // orange
  "#ffc0cb", // pink
  "#008080", // teal
  "#4b0082", // indigo
  "#a52a2a", // brown
  "#808080", // gray
  "#ffff00", // yellow
  "#00ffff", // cyan
  "#ff00ff", // magenta
  "#00ff00", // lime
];

/**
 * The board palette. It is deliberately almost colourless: the only saturated
 * colour on the board during play is the vermilion that marks what a spell
 * would hit, so that mark can never be confused with decoration. Choosing a
 * starting cell is a different question from targeting one, and gets its own
 * colour for the same reason paper maps use green for "go" and red for "no":
 * a cell you may not start on should never share a colour with a cell you may.
 */
export const BOARD = {
  tile: "#ffffff",
  tileAlt: "#f4f4f2",
  stroke: "#cfd0cd",
  /** Anything reachable or targetable, as a graphite wash. */
  wash: "#17181a",
  accent: "#d1462f",
  /** Where you are allowed to start, during positioning only. */
  place: "#1a7f37",
  /**
   * Where the opponent may start. Deliberately not the vermilion accent: this
   * marks a cell you must keep off, never one your click is about to act on.
   */
  foe: "#a3231b",
  /** The drawn boundary of the area you may act in this turn. */
  zoneEdge: "#3d3f3d",
  /*
   * Cells are clipped to their diamond, so a stroke laid on the edge only
   * shows its inner half. Widths here are doubled on purpose: what you read
   * on screen is half of what is written.
   */
  strokes: {
    tile: 1.6,
    marked: 3,
    zone: 3.5,
  },
  block: {
    top: "#e4e5e2",
    left: "#cdcecb",
    right: "#bebfbb",
    stroke: "#a9aaa6",
    /** Share of a tile's height the cover stands above the ground. */
    rise: 0.38,
  },
  /**
   * The ring under a fighter's feet, which is the only place a player's own
   * colour is allowed on the board. Whose turn it is is drawn in ink rather
   * than in the accent: vermilion says "this is what your click would do", and
   * a fighter standing there is not something you are about to click.
   */
  socle: {
    /** Share of a tile the ring is pulled in by, so it reads inside the cell. */
    inset: 0.16,
    fill: 0.2,
    fillPlaying: 0.28,
    stroke: 1.8,
    /** The ink ring the fighter whose turn it is wears, just outside its own. */
    turn: "#17181a",
    turnStroke: 2,
    /** Knocked out: no colour left, and the ring is drawn as a broken line. */
    out: "#8b8d8a",
  },
} as const;

/**
 * Where a sprite's ink actually sits inside its frame, measured off Idle.png:
 * the feet land at 0.70 — the number Character.tsx has always drawn with — and
 * the top of the helmet at 0.28. Anything hung above a fighter hangs off the
 * second one, because the 28% above it is empty pixels and hanging off the
 * frame would leave a health bar floating a third of a tile too high.
 */
export const SPRITE = {
  feet: 0.7,
  headTop: 0.281,
} as const;
