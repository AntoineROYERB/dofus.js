import { Position } from "../types/game";

/**
 * The board's camera. It does one thing: hold a fighter in the middle of the
 * screen and let the paper slide underneath them — the question an exploration
 * mode has to answer before any of the rest of it is worth building.
 *
 * It is expressed as an addition to the pinch-zoom's pan rather than as a move
 * of the board's centre, and that choice is the whole reason this is cheap.
 * Every cell is laid out from `isoToScreen(x, y, tile, centreX, centreY)` into
 * absolute pixels: move the centre and all hundred-odd of them recompute and
 * re-layout on every frame of every walk, and their memo — the one thing
 * keeping the board off the main thread during a fight — stops holding. Move
 * the layer they already sit in instead and the browser composites a single
 * transform; the tiles never learn the camera exists.
 *
 * It also means the pointer maths needs nothing at all: useGridInteraction
 * already undoes a pan and a scale about the container's centre to find the
 * cell under a finger, so a camera that *is* a pan comes back out correctly
 * for free.
 */

/**
 * How much bigger than "the whole board fits on screen" the tiles are drawn
 * while the camera follows. Without it there is nothing to scroll: fitTile
 * sizes the diamond to the viewport by definition, so a camera locked onto a
 * fighter would only shove an already-complete board off to one side and leave
 * white paper where the rest of it used to be.
 *
 * Applied to the tile rather than to the layer's scale so the sprites are
 * *drawn* larger instead of being blown up after the fact — Character takes
 * its own scale from tileSize.width, and a canvas stretched by CSS goes soft.
 *
 * 1.6 rather than something bolder because a board has to stay somewhere you
 * can see, not just somewhere you stand: at 2.2 a desktop showed under four
 * cells across and anything worth walking towards was off the edge of the
 * screen before you could want to, which reads as a close-up rather than as a
 * place. It is what `?camera=on` gives a fight; the world sets its own, and
 * sets it lower — see WORLD_ZOOM.
 */
export const CAMERA_ZOOM = 1.6;

/**
 * The pan that puts `target` — a screen position from isoToScreen, in the
 * board layer's own pixels — under the middle of the container.
 *
 * The layer is transformed `translate(pan) scale(scale)` about its own centre,
 * so a point p lands at `centre + pan + scale * (p - centre)`. Setting that
 * equal to `centre` and solving for pan is the line below. The scale belongs
 * in it because a board pinched in moves further across the screen per cell
 * than a flat one does.
 */
export const followPan = (
  target: Position,
  centre: Position,
  scale: number
): Position => ({
  x: -scale * (target.x - centre.x),
  y: -scale * (target.y - centre.y),
});

/**
 * Where the camera looks while there is no fighter on the board yet: the
 * middle of the cells this player may start on. Without it the first thing a
 * zoomed board shows is its own empty centre, and the green block you are
 * being asked to click is somewhere off the edge of the screen.
 *
 * The projection is affine in x and y, so the centre of the cells and the
 * centre of where they are drawn are the same point — averaging the cells and
 * projecting once is the same answer as projecting each and averaging, for a
 * fraction of the work.
 */
export const centreOf = (cells: Position[]): Position | null => {
  if (cells.length === 0) return null;
  const sum = cells.reduce((a, c) => ({ x: a.x + c.x, y: a.y + c.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / cells.length, y: sum.y / cells.length };
};

/**
 * Whether a *fight* gets a camera, and how far in — null for the fitted,
 * whole-board view a fight is played on.
 *
 * A fight is not the place for this. Its board is a diamond sized to the
 * screen on purpose: both fighters, every cell a spell could reach and every
 * scrap of terrain are meant to be readable at a glance, and a camera that
 * holds you in the middle takes half of that away to buy movement a fight
 * does not need. Exploration is where going somewhere is the point, and that
 * is where the camera lives — see ExploreBoard.
 *
 * So a fight has no camera unless its URL asks: `?camera=1.6` turns one on at
 * that zoom, for comparing a fight with one against a fight without. That
 * reaches a phone too — the iOS shell is pointed at the Vite dev server
 * through CAP_SERVER_URL, and a query string rides along on that URL.
 *
 * Kept pure, and separate from the window it normally reads, because the
 * precedence is the part worth holding still.
 */
export const resolveCamera = (search: string): number | null => {
  const asked = new URLSearchParams(search).get("camera");
  if (asked === null || asked === "off") return null;
  if (asked === "on") return CAMERA_ZOOM;
  const zoom = Number(asked);
  // A zoom that does not parse, or that would shrink the board below the one
  // size it is known to fit its box at, is a typo — not an instruction.
  return Number.isFinite(zoom) && zoom >= 1 ? zoom : null;
};

/**
 * Read once at import: it cannot change without a reload, and a board that
 * re-reads its own URL on every frame of every walk is a board that has
 * forgotten what it is for.
 */
export const CAMERA =
  typeof window === "undefined" ? null : resolveCamera(window.location.search);
