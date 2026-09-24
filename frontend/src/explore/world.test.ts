import {
  BOSSES,
  canStep,
  findPath,
  groundAt,
  heightAt,
  inWorld,
  isRock,
  lairOf,
  levelOf,
  LINEAGES,
  MAX_LEVEL,
  neighbours,
  regionAt,
  RING,
  SPAWN,
  walkable,
  WORLD_RADIUS,
} from "./world";
import { Position } from "../types/game";

const everyCell = (): Position[] => {
  const cells: Position[] = [];
  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
    for (let y = -WORLD_RADIUS; y <= WORLD_RADIUS; y++) cells.push({ x, y });
  }
  return cells;
};

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

describe("the river", () => {
  const river = everyCell().filter((c) => {
    const g = groundAt(c);
    return g.obstacle === "water" || g.ford;
  });

  it("runs through the world, and cannot be walked into", () => {
    const water = river.filter((c) => groundAt(c).obstacle === "water");
    expect(water.length).toBeGreaterThan(WORLD_RADIUS);
    expect(water.some(walkable)).toBe(false);
  });

  // A river the width of the world with no way across would cut it in two.
  it("can be crossed at a ford", () => {
    const fords = river.filter((c) => groundAt(c).ford);
    expect(fords.length).toBeGreaterThan(0);
    expect(fords.every(walkable)).toBe(true);

    const farBank = { x: 0, y: 14 };
    const path = findPath(SPAWN, farBank)!;
    expect(path).not.toBeNull();
    expect(path.some((c) => groundAt(c).ford)).toBe(true);
  });
});

describe("terraces", () => {
  it("stay within the levels the drawing knows about", () => {
    const levels = new Set(everyCell().map(levelOf));
    expect(Math.min(...levels)).toBe(0);
    expect(Math.max(...levels)).toBeLessThanOrEqual(MAX_LEVEL);
    // Flat ground everywhere would make the terraces a feature nobody sees.
    expect(levels.size).toBeGreaterThan(1);
  });

  it("are climbed one level at a time", () => {
    for (const c of everyCell()) {
      for (const n of neighbours(c)) {
        expect(Math.abs(levelOf(n) - levelOf(c))).toBeLessThanOrEqual(1);
      }
    }
  });

  it("are only climbed by their stairs", () => {
    let walls = 0;
    for (const c of everyCell()) {
      for (const n of [
        { x: c.x + 1, y: c.y },
        { x: c.x, y: c.y + 1 },
      ]) {
        if (!walkable(c) || !walkable(n) || Math.abs(levelOf(n) - levelOf(c)) !== 1) continue;
        const [low, high] = levelOf(c) < levelOf(n) ? [c, n] : [n, c];
        const flight = groundAt(high).stair;
        const isStair = !!flight && high.x + flight.x === low.x && high.y + flight.y === low.y;
        expect(canStep(c, n)).toBe(isStair);
        if (!isStair) walls++;
      }
    }
    // Most of a terrace's edge is a wall; the stairs are the exception.
    expect(walls).toBeGreaterThan(0);
  });

  // Somewhere the ground goes up two levels at once, and you have to go round.
  it("have cliffs two levels high that nothing climbs", () => {
    let cliffs = 0;
    for (const c of everyCell()) {
      for (const n of [
        { x: c.x + 1, y: c.y },
        { x: c.x, y: c.y + 1 },
      ]) {
        if (!walkable(c) || !walkable(n) || Math.abs(levelOf(n) - levelOf(c)) !== 2) continue;
        cliffs++;
        expect(canStep(c, n)).toBe(false);
        expect(canStep(n, c)).toBe(false);
      }
    }
    expect(cliffs).toBeGreaterThan(0);
  });

  // A stair is carved into the terrace and leads down to the ground below.
  it("put a stair where it can be walked onto and off", () => {
    const stairs = everyCell().filter((c) => groundAt(c).stair);
    expect(stairs.length).toBeGreaterThan(0);
    for (const c of stairs) {
      const flight = groundAt(c).stair as Position;
      const foot = { x: c.x + flight.x, y: c.y + flight.y };
      expect(walkable(c)).toBe(true);
      expect(walkable(foot)).toBe(true);
      expect(levelOf(foot)).toBe(levelOf(c) - 1);
      expect(canStep(foot, c)).toBe(true);
    }
  });

  it("are climbed at an even pace, halfway up in the middle of the stair", () => {
    const c = everyCell().find((p) => groundAt(p).stair) as Position;
    const flight = groundAt(c).stair as Position;
    const l = levelOf(c);
    expect(heightAt(c)).toBe(l - 0.5);
    expect(heightAt({ x: c.x + flight.x, y: c.y + flight.y })).toBe(l - 1);
    expect(heightAt({ x: c.x + flight.x / 2, y: c.y + flight.y / 2 })).toBeCloseTo(l - 0.75);
  });

  // Rocks behind a terrace would have the terrace drawn over their feet.
  it("never hide the foot of a rock or a tree", () => {
    for (const c of everyCell()) {
      const g = groundAt(c);
      if (g.obstacle !== "rock" && g.obstacle !== "tree") continue;
      for (let i = 0; i <= 2; i++) {
        for (let j = 0; j <= 2; j++) {
          expect(levelOf({ x: c.x + i, y: c.y + j })).toBeLessThanOrEqual(g.level);
        }
      }
    }
  });
});

describe("the world as a whole", () => {
  // Scenery that walls off part of the map makes the walled-off part a
  // drawing of somewhere you cannot go.
  it("can be walked all over from where you arrive", () => {
    const seen = new Set([`${SPAWN.x},${SPAWN.y}`]);
    const queue = [SPAWN];
    while (queue.length > 0) {
      for (const n of neighbours(queue.shift() as Position)) {
        const k = `${n.x},${n.y}`;
        if (!seen.has(k)) {
          seen.add(k);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(everyCell().filter(walkable).length);
  });
});

describe("regions", () => {
  it("begin in the Prairie, around the spawn", () => {
    expect(regionAt(SPAWN)).toBe("prairie");
    expect(groundAt(SPAWN).region).toBe("prairie");
  });

  it("give every boss of the ring a region of its own", () => {
    const seen = new Set(everyCell().map((c) => groundAt(c).region));
    for (const r of RING) expect(seen.has(r)).toBe(true);
  });

  // A boss has to be reachable, or its region is scenery around a locked door.
  it("put each boss in its lair, with a way to walk up to it", () => {
    const reached = new Set([`${SPAWN.x},${SPAWN.y}`]);
    const queue = [SPAWN];
    while (queue.length > 0) {
      for (const n of neighbours(queue.shift() as Position)) {
        const k = `${n.x},${n.y}`;
        if (!reached.has(k)) {
          reached.add(k);
          queue.push(n);
        }
      }
    }
    for (const r of RING) {
      const lair = lairOf(r) as Position;
      const g = groundAt(lair);
      expect(g.boss).toBe(true);
      expect(g.creature).toBe(BOSSES[r]);
      expect(walkable(lair)).toBe(false);
      const approach = [
        { x: lair.x + 1, y: lair.y },
        { x: lair.x - 1, y: lair.y },
        { x: lair.x, y: lair.y + 1 },
        { x: lair.x, y: lair.y - 1 },
      ];
      expect(approach.some((p) => reached.has(`${p.x},${p.y}`))).toBe(true);
    }
  });

  it("people each region with its own lineage, and nobody walks through them", () => {
    for (const c of everyCell()) {
      const g = groundAt(c);
      if (!g.creature || g.boss) continue;
      expect(LINEAGES[g.region]).toContain(g.creature);
      expect(walkable(c)).toBe(false);
    }
  });
});
