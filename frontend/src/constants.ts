/**
 * The colours a player used to pick for their fighter. Players have no colour
 * of their own any more — the only colours are the elements' (utils/elements)
 * and, on the board, amber for yours and red for theirs — but a character is
 * still saved and sent with one, so the first stands in for anyone who never
 * picked.
 */
export const PLAYER_COLORS = [
  "#d8ae31", // amber
  "#5bd831", // lime
  "#31d8ae", // emerald
  "#315bd8", // azure
  "#ae31d8", // violet
  "#d8315b", // rose
];

/**
 * The board palette: the frame's night, a step lighter, so the board reads as
 * ground under the sky rather than as more sky. It is deliberately muted: the
 * only saturated colours on it during play are the green of where you can walk
 * and the red that marks what a spell would hit, so neither can ever be
 * confused with decoration. Choosing a
 * starting cell is a different question from targeting one, and gets its own
 * colour for the same reason paper maps use green for "go" and red for "no":
 * a cell you may not start on should never share a colour with a cell you may.
 */
export const BOARD = {
  /** Text and frames, and anything drawn in ink on the board: the `ink` token. */
  ink: "#eef1ff",
  tile: "#2a3576",
  tileAlt: "#25306c",
  stroke: "#4a58a6",
  accent: "#ff6a3d",
  /** Health, in its bars and its numbers: the `hp` token. */
  hp: "#ff2a44",
  /**
   * Two inks, and only two, while a turn is being played: where your legs can
   * take you, and what your click is about to hit. They used to be the same
   * graphite at two opacities, which meant a cell in a spell's range and a
   * cell two movement points away were drawn identically — and opacity was
   * already spoken for, since it is what says how far a cell is. The green is
   * the same one movement points are written in, below and in the combat log.
   */
  move: "#46e06a",
  /**
   * In range, but not seen: a cell the spell is close enough to reach and the
   * line of sight refuses. It is drawn, because "too far" and "I cannot see
   * it" are different answers — but barely. It is the accent bled almost all
   * the way out to grey: enough to notice if you look for it, never enough to
   * compete with the cells you can actually act on. A mark that shouts an
   * impossibility is worse than no mark at all.
   */
  blind: "#ff6a3d",
  /** Where you are allowed to start, during positioning only. */
  place: "#46e06a",
  /** Action points, wherever a spell's cost or a debuff changes them. */
  pa: "#4fa3ff",
  /** Movement points, same occasions. */
  pm: "#46e06a",
  /** Cells an air spell reaches through its caster's relay. */
  relay: "#2e9e6a",
  /**
   * The hairline around something drawn on top of the board rather than on it
   * — a health bar over a fighter's head. The area you may act in used to be
   * outlined in this too; it now borrows the colour of whatever it encloses.
   */
  edge: "#0d1234",
  /**
   * Where the opponent may start. Deliberately not the vermilion accent: this
   * marks a cell you must keep off, never one your click is about to act on.
   */
  foe: "#ff6a3d",
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
  /**
   * How a cell's wash comes and goes. It used to snap: the whole reachable
   * area appeared in one frame the moment the pointer touched the board. It
   * now grows in, and it grows outward from the fighter's own feet, so the
   * green reads as something spreading from the character rather than as a
   * shape being switched on. Both are switched off under reduced motion.
   */
  washIn: {
    /** How long one cell takes to reach its full tint, in ms. */
    fade: 190,
    /** How long the green takes to reach the far edge of the range, in ms. */
    sweep: 170,
  },
  block: {
    top: "#6d7fd6",
    left: "#4b5cb4",
    right: "#38479a",
    stroke: "#1d2766",
    /** Share of a tile's height the cover stands above the ground. */
    rise: 0.38,
  },
  /** A Stonewarden's pillar: raw earth, and taller than the map's own cover. */
  pillar: {
    top: "#c9a56a",
    left: "#8a6a3a",
    right: "#6e5230",
    stroke: "#4a3620",
    rise: 1.25,
    /** How long it takes to come up out of the ground, in ms. */
    grow: 520,
  },
  /**
   * The ring under a fighter's feet: amber under yours — the colour of your
   * own turn and your own fighter in the charter — and red under the other
   * side's, the red that already marks what is theirs on the ground. Players
   * have no colour of their own; the only colours are the elements'. Whose
   * turn it is is a second ink ring just outside: vermilion says "this is
   * what your click would do", and a fighter standing there is not something
   * you are about to click.
   */
  socle: {
    /** Under your own fighter: the `gold` token. */
    mine: "#ffd76a",
    /** Under everyone else's. */
    theirs: "#ff6a3d",
    /** Share of a tile the ring is pulled in by, so it reads inside the cell. */
    inset: 0.16,
    fill: 0.2,
    fillPlaying: 0.28,
    stroke: 1.8,
    /** The ink ring the fighter whose turn it is wears, just outside its own. */
    turn: "#eef1ff",
    turnStroke: 2,
    /** Knocked out: no colour left, and the ring is drawn as a broken line. */
    out: "#6b77a8",
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
