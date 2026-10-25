import { useCallback, useEffect, useRef, useState } from "react";
import { Position } from "../types/game";
import { Direction } from "../components/Game/SpriteAnimation";
import { getDirection } from "../utils/pathUtils";
import { findPath, SPAWN } from "./world";
import {
  advance,
  follow,
  isMoving,
  originOf,
  positionOf,
  standingAt,
  Walk,
} from "./walk";

export type Walker = {
  /** Where the figure is, in cells, between whole ones while it walks. */
  at: Position;
  /** The cell it is standing on, or the one it just left. */
  cell: Position;
  direction: Direction;
  moving: boolean;
  walkTo: (target: Position) => void;
};

/**
 * Someone walking around the world, on their own clock.
 *
 * The fight's walk cannot be borrowed: useCharacterAnimations plays back
 * differences between two server states — it is told where a fighter ended up
 * and works out the walk that must have happened. Here the walk is the
 * authority and there is no server to disagree with, so the loop runs the
 * other way round and is much smaller for it.
 *
 * Nothing here decides anything. The walk itself is a value in walk.ts, where
 * it can be played out frame by frame in a test without a DOM; this turns
 * frames into ticks of it and hands React what to draw.
 */
export const useWalker = (start: Position = SPAWN): Walker => {
  const walk = useRef<Walk>(standingAt(start));
  const [at, setAt] = useState<Position>(start);
  const [cell, setCell] = useState<Position>(start);
  const [direction, setDirection] = useState<Direction>("SE");
  const [moving, setMoving] = useState(false);

  const walkTo = useCallback((target: Position) => {
    const route = findPath(originOf(walk.current), target);
    if (route) walk.current = follow(walk.current, route);
  }, []);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = performance.now();
      const before = walk.current;
      const next = advance(before, now);
      walk.current = next;

      setAt((prev) => {
        const p = positionOf(next, now);
        return prev.x === p.x && prev.y === p.y ? prev : p;
      });
      if (next.standing !== before.standing) setCell(next.standing);
      if (next.leg && next.leg !== before.leg) {
        setDirection(getDirection(next.leg.from, next.leg.to));
      }
      setMoving((prev) => {
        const now_ = isMoving(next);
        return prev === now_ ? prev : now_;
      });
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return { at, cell, direction, moving, walkTo };
};
