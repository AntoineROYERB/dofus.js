import { Position } from "../types/game";

/**
 * A walk, as a value.
 *
 * It is out here rather than inside the hook that runs it because the hook
 * cannot be tested without a DOM, and this is where the mistakes are. The one
 * that shipped: the walker was marked as standing on its *destination* the
 * moment a route was asked for, and the loop then used that as the cell the
 * first step departed from — so every walk opened by interpolating from the
 * far end of the route back to the first step, which on a camera locked to
 * the walker reads as the whole world being flung across the screen and
 * pulled back. Two meanings sharing one field, which a type can separate and
 * a test can hold apart: `standing` is where the figure *is*, and the end of
 * `queue` is where it is *going*.
 */

/** How long one step takes, in ms. The fight's walk, so a step is a step. */
export const STEP_MS = 300;

/** The step being taken right now. */
export type Leg = { from: Position; to: Position; since: number };

export type Walk = {
  /** The cell the figure is on, or the one it left this step. */
  standing: Position;
  leg: Leg | null;
  /** Steps planned and not yet begun, in order. */
  queue: Position[];
};

export const standingAt = (cell: Position): Walk => ({
  standing: cell,
  leg: null,
  queue: [],
});

/**
 * Where a route asked for now has to be planned from: the cell the step in
 * progress is landing on, not the one it left. Planning from behind the
 * figure would make it walk back the way it came before setting off.
 */
export const originOf = (walk: Walk): Position => walk.leg?.to ?? walk.standing;

/** Take a route — the steps after originOf — in place of whatever was queued. */
export const follow = (walk: Walk, route: Position[]): Walk =>
  route.length === 0 ? walk : { ...walk, queue: route };

/**
 * The walk at `now`. A step that has run its time lands, and the next one
 * departs from where it landed — never from anywhere else.
 */
export const advance = (walk: Walk, now: number): Walk => {
  const depart = (from: Position, queue: Position[]): Walk => {
    const [next, ...rest] = queue;
    return next
      ? { standing: from, leg: { from, to: next, since: now }, queue: rest }
      : { standing: from, leg: null, queue: [] };
  };

  if (!walk.leg) {
    return walk.queue.length === 0 ? walk : depart(walk.standing, walk.queue);
  }
  if (now - walk.leg.since < STEP_MS) return walk;
  return depart(walk.leg.to, walk.queue);
};

/**
 * Where the figure is, in cells, fractions and all. The projection is affine,
 * so a fractional cell projects to exactly the point between the two cells'
 * own — which is what lets the camera move smoothly instead of a cell at a
 * time.
 */
export const positionOf = (walk: Walk, now: number): Position => {
  if (!walk.leg) return walk.standing;
  const { from, to, since } = walk.leg;
  const t = Math.min(1, Math.max(0, (now - since) / STEP_MS));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
};

export const isMoving = (walk: Walk): boolean =>
  walk.leg !== null || walk.queue.length > 0;
