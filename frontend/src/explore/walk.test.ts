import { Position } from "../types/game";
import {
  advance,
  follow,
  isMoving,
  originOf,
  positionOf,
  standingAt,
  STEP_MS,
  Walk,
} from "./walk";

const route = (...cells: [number, number][]): Position[] =>
  cells.map(([x, y]) => ({ x, y }));

/** Run a walk frame by frame, collecting where the figure was on each one. */
const play = (walk: Walk, frames: number, dt = 16): Position[] => {
  const seen: Position[] = [];
  let now = 0;
  let current = walk;
  for (let i = 0; i < frames; i++) {
    current = advance(current, now);
    seen.push(positionOf(current, now));
    now += dt;
  }
  return seen;
};

describe("a walk", () => {
  it("stands still with nothing queued", () => {
    const walk = standingAt({ x: 2, y: -1 });
    expect(isMoving(walk)).toBe(false);
    expect(positionOf(walk, 999)).toEqual({ x: 2, y: -1 });
    expect(advance(walk, 50)).toBe(walk);
  });

  /*
   * The bug this file exists for. A route is planned to somewhere far away,
   * and the very first thing the figure does must be to step to the first
   * cell of it — not to appear at the far end and walk back. On a camera
   * locked to the walker, a single frame of that throws the whole world
   * across the screen.
   */
  it("sets off from where it is standing, not from where it is going", () => {
    const walk = follow(standingAt({ x: 0, y: 0 }), route([0, 1], [0, 2], [0, 3]));
    const started = advance(walk, 0);
    expect(started.leg).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 0, y: 1 },
      since: 0,
    });
    expect(positionOf(started, 0)).toEqual({ x: 0, y: 0 });
  });

  it("never moves more than one cell in one step", () => {
    const walk = follow(
      standingAt({ x: 0, y: 0 }),
      route([1, 0], [2, 0], [2, 1], [2, 2], [3, 2])
    );
    const seen = play(walk, 120);
    for (let i = 1; i < seen.length; i++) {
      const jump =
        Math.abs(seen[i].x - seen[i - 1].x) + Math.abs(seen[i].y - seen[i - 1].y);
      // One frame of a 300ms step covers a small fraction of a cell. Anything
      // near a whole cell is a leg starting somewhere it should not.
      expect(jump).toBeLessThan(0.5);
    }
  });

  it("walks every step of its route, in order, and stops on the last", () => {
    const steps = route([1, 0], [1, 1], [1, 2]);
    const walk = follow(standingAt({ x: 0, y: 0 }), steps);
    let current = walk;
    const landed: Position[] = [];
    for (let now = 0; now <= STEP_MS * 4; now += STEP_MS) {
      const before = current.standing;
      current = advance(current, now);
      if (current.standing !== before) landed.push(current.standing);
    }
    expect(landed).toEqual(steps);
    expect(isMoving(current)).toBe(false);
    expect(positionOf(current, STEP_MS * 9)).toEqual({ x: 1, y: 2 });
  });

  it("moves at one cell per step, no faster and no slower", () => {
    const walk = advance(follow(standingAt({ x: 0, y: 0 }), route([0, 1])), 0);
    expect(positionOf(walk, 0)).toEqual({ x: 0, y: 0 });
    expect(positionOf(walk, STEP_MS / 2)).toEqual({ x: 0, y: 0.5 });
    expect(positionOf(walk, STEP_MS)).toEqual({ x: 0, y: 1 });
    // Past its time it waits on the cell rather than overshooting it.
    expect(positionOf(walk, STEP_MS * 3)).toEqual({ x: 0, y: 1 });
  });
});

describe("changing your mind mid-walk", () => {
  it("plans from the step being landed, not the one being left", () => {
    const walking = advance(
      follow(standingAt({ x: 0, y: 0 }), route([0, 1], [0, 2])),
      0
    );
    expect(originOf(walking)).toEqual({ x: 0, y: 1 });
  });

  it("plans from where it stands when it is standing", () => {
    expect(originOf(standingAt({ x: 4, y: 4 }))).toEqual({ x: 4, y: 4 });
  });

  it("finishes the step it is taking before turning", () => {
    const walking = advance(
      follow(standingAt({ x: 0, y: 0 }), route([0, 1], [0, 2], [0, 3])),
      0
    );
    // A new route from { x: 0, y: 1 }, which is where the current step lands.
    const turned = follow(walking, route([1, 1], [2, 1]));
    expect(turned.leg).toEqual(walking.leg);

    const next = advance(turned, STEP_MS);
    expect(next.standing).toEqual({ x: 0, y: 1 });
    expect(next.leg?.from).toEqual({ x: 0, y: 1 });
    expect(next.leg?.to).toEqual({ x: 1, y: 1 });
  });

  it("never jumps when a route is replaced mid-step", () => {
    let current = advance(
      follow(standingAt({ x: 0, y: 0 }), route([0, 1], [0, 2], [0, 3])),
      0
    );
    const seen: Position[] = [];
    for (let now = 0; now <= STEP_MS * 4; now += 16) {
      // Change your mind on every single frame, which is worse than anyone can.
      current = follow(current, route([1, 1], [2, 1], [3, 1]));
      current = advance(current, now);
      seen.push(positionOf(current, now));
    }
    for (let i = 1; i < seen.length; i++) {
      const jump =
        Math.abs(seen[i].x - seen[i - 1].x) + Math.abs(seen[i].y - seen[i - 1].y);
      expect(jump).toBeLessThan(0.5);
    }
  });
});
