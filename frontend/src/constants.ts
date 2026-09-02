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
 * colour on the board is the vermilion that marks what a spell would hit, so
 * that mark can never be confused with decoration.
 */
export const BOARD = {
  tile: "#ffffff",
  tileAlt: "#f4f4f2",
  stroke: "#cfd0cd",
  /** Anything reachable or targetable, as a graphite wash. */
  wash: "#17181a",
  accent: "#d1462f",
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
} as const;
