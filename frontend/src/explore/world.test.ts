import {
  findPath,
  inWorld,
  isRock,
  neighbours,
  SPAWN,
  walkable,
  WORLD_RADIUS,
} from "./world";

describe("the world's edges", () => {
  it("ends where it says it ends", () => {
    expect(inWorld({ x: WORLD_RADIUS, y: WORLD_RADIUS })).toBe(true);
    expect(inWorld({ x: WORLD_RADIUS + 1, y: 0 })).toBe(false);
    expect(inWorld({ x: 0, y: -WORLD_RADIUS - 1 })).toBe(false);
  });

  it("never offers a step off the edge", () => {
    const corner = { x: WORLD_RADIUS, y: WORLD_RADIUS };
    expect(neighbours(corner).every(inWorld)).toBe(true);
    expect(neighbours(corner)).toHaveLength(2);
  });
});

describe("scenery", () => {
  // Walking out of a rock is not a thing anyone can do, so arriving inside
  // one has to be impossible rather than unlikely.
  it("leaves a clearing to arrive in", () => {
    expect(isRock(SPAWN)).toBe(false);
    expect(walkable(SPAWN)).toBe(true);
    for (const step of neighbours(SPAWN)) expect(isRock(step)).toBe(false);
  });

  it("puts the same rock in the same place every time it is asked", () => {
    const cells = [
      { x: 7, y: -3 },
      { x: -12, y: 8 },
      { x: 19, y: 19 },
    ];
    for (const c of cells) expect(isRock(c)).toBe(isRock(c));
  });

  // Too few and the paper looks broken rather than moving; too many and there
  // is nowhere to go.
  it("covers some of the ground, not most of it", () => {
    let rocks = 0;
    let cells = 0;
    for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
      for (let y = -WORLD_RADIUS; y <= WORLD_RADIUS; y++) {
        cells++;
        if (isRock({ x, y })) rocks++;
      }
    }
    expect(rocks / cells).toBeGreaterThan(0.04);
    expect(rocks / cells).toBeLessThan(0.2);
  });
});

describe("findPath", () => {
  it("has nowhere to go to the cell you are on", () => {
    expect(findPath(SPAWN, SPAWN)).toBeNull();
  });

  it("refuses a rock, and the far side of the world", () => {
    const rock = (() => {
      for (let x = 4; x <= WORLD_RADIUS; x++) if (isRock({ x, y: 0 })) return { x, y: 0 };
      throw new Error("no rock on that row to test with");
    })();
    expect(findPath(SPAWN, rock)).toBeNull();
    expect(findPath(SPAWN, { x: WORLD_RADIUS + 5, y: 0 })).toBeNull();
  });

  it("walks one orthogonal step at a time, ending on the cell asked for", () => {
    const target = { x: 9, y: -6 };
    const path = findPath(SPAWN, target)!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual(target);
    expect(path).not.toContainEqual(SPAWN);

    let previous = SPAWN;
    for (const step of path) {
      expect(Math.abs(step.x - previous.x) + Math.abs(step.y - previous.y)).toBe(1);
      expect(walkable(step)).toBe(true);
      previous = step;
    }
  });

  it("is as short as the rocks allow", () => {
    const target = { x: 5, y: 5 };
    const path = findPath(SPAWN, target)!;
    // A breadth-first search cannot return more steps than the shortest walk,
    // and cannot return fewer than the straight-line distance.
    expect(path.length).toBeGreaterThanOrEqual(10);
  });

  it("goes around what it cannot go through", () => {
    // Somewhere far enough out that the scatter is certain to be in the way.
    const target = { x: -17, y: 13 };
    const path = findPath(SPAWN, target);
    if (path) {
      expect(path.every(walkable)).toBe(true);
      expect(path.length).toBeGreaterThanOrEqual(30);
    }
  });
});
