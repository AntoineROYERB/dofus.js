import { lineUpSlot, mod, shownPosition } from "./lineUp";

describe("mod", () => {
  it("wraps negative positions back into the list", () => {
    expect(mod(-1, 4)).toBe(3);
    expect(mod(-5, 4)).toBe(3);
    expect(mod(9, 4)).toBe(1);
  });
});

describe("shownPosition", () => {
  it("keeps the unbounded position when it already shows the selection", () => {
    // Turning right past the last of four classes keeps counting up.
    expect(shownPosition(4, 0, 4)).toBe(4);
    expect(shownPosition(-1, 3, 4)).toBe(-1);
  });

  it("jumps to a class selected elsewhere within the same lap", () => {
    expect(shownPosition(5, 3, 4)).toBe(7);
    expect(shownPosition(0, 2, 4)).toBe(2);
  });
});

describe("lineUpSlot", () => {
  it("shows the selected fighter full size and opaque", () => {
    expect(lineUpSlot(0)).toEqual({ x: 0, y: 0, scale: 1, opacity: 1 });
  });

  it("puts the neighbours to either side, smaller, paler and further back", () => {
    const left = lineUpSlot(-1);
    const right = lineUpSlot(1);
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    expect(right.scale).toBeLessThan(1);
    expect(right.opacity).toBeGreaterThan(0);
    expect(right.opacity).toBeLessThan(1);
    expect(right.y).toBeLessThan(0);
  });

  it("hides the fighters waiting beyond the neighbours", () => {
    expect(lineUpSlot(2).opacity).toBe(0);
    expect(lineUpSlot(-2).opacity).toBe(0);
  });
});
