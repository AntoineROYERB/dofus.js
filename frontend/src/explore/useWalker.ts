import { useCallback, useEffect, useRef, useState } from "react";
import { Position } from "../types/game";
import { Direction } from "../components/Game/SpriteAnimation";
import { getDirection } from "../utils/pathUtils";
import { findPath, SPAWN } from "./world";

/** How long one step takes, in ms. The fight's walk, so a step is a step. */
const STEP_MS = 300;

export type Walker = {
  /**
   * Where the figure is, in cells, between whole numbers while it walks. The
   * projection is affine, so a fractional cell projects to exactly the point
   * between the two cells' own — which is what makes the camera smooth rather
   * than something that jumps a cell at a time.
   */
  at: Position;
  /** The cell it is standing on, or the one it is heading to. */
  cell: Position;
  direction: Direction;
  moving: boolean;
  walkTo: (target: Position) => void;
};

/**
 * Someone walking around the world, on their own clock.
 *
 * The fight's walk cannot be borrowed: useCharacterAnimations plays back
 * differences between two server states — it is told where a fighter has
 * *ended up* and works out the walk that must have happened. Here the walk is
 * the authority and there is no server to disagree with, so the loop is the
 * other way round, and much smaller for it.
 *
 * A click while already walking does not snap: the new route is planned from
 * the cell the current step is landing on, and takes over when it lands. That
 * costs one step of lag and buys never seeing the figure teleport backwards
 * to a cell it had already left.
 */
export const useWalker = (start: Position = SPAWN): Walker => {
  const [at, setAt] = useState<Position>(start);
  const [cell, setCell] = useState<Position>(start);
  const [direction, setDirection] = useState<Direction>("SE");
  const [moving, setMoving] = useState(false);

  /** The step being walked right now: where from, where to, and since when. */
  const leg = useRef<{ from: Position; to: Position; since: number } | null>(null);
  /** The rest of the route, not yet started. */
  const queue = useRef<Position[]>([]);
  /** Where the figure will be once everything already planned has played. */
  const settled = useRef<Position>(start);
  const frame = useRef(0);

  const walkTo = useCallback((target: Position) => {
    // From where the current step lands, not from where the sprite happens to
    // be: a route planned from a cell that is already behind it would have to
    // start by walking back.
    const from = leg.current?.to ?? settled.current;
    const route = findPath(from, target);
    if (!route) return;
    queue.current = route;
    settled.current = target;
    setMoving(true);
  }, []);

  useEffect(() => {
    const step = () => {
      frame.current = requestAnimationFrame(step);
      const now = performance.now();

      if (!leg.current) {
        const next = queue.current.shift();
        if (!next) {
          if (moving) setMoving(false);
          return;
        }
        const from = settled.current;
        leg.current = { from, to: next, since: now };
        setDirection(getDirection(from, next));
        return;
      }

      const { from, to, since } = leg.current;
      const progress = Math.min(1, (now - since) / STEP_MS);
      setAt({
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      });

      if (progress < 1) return;

      // The step has landed. Whatever comes next starts from here.
      settled.current = to;
      setCell(to);
      leg.current = null;
      const next = queue.current[0];
      if (next) {
        leg.current = { from: to, to: next, since: now };
        queue.current.shift();
        setDirection(getDirection(to, next));
      } else {
        setMoving(false);
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
    // `moving` is read only to avoid setting it to the value it already has;
    // re-running the loop when it changes is harmless and keeps that honest.
  }, [moving]);

  return { at, cell, direction, moving, walkTo };
};
