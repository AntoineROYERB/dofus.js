import {
  FOLDED_COUNT,
  needsFolding,
  ringLayout,
  SINGLE_RING_RADIUS,
  slotOffset,
} from "./spellArc";

describe("ringLayout", () => {
  it("puts three spells on the inner ring and the rest on the outer one", () => {
    const slots = ringLayout(8, false);
    expect(slots).toHaveLength(8);
    expect(slots.slice(0, 3).every((s) => s.radius === 104)).toBe(true);
    expect(slots.slice(3).every((s) => s.radius === 166)).toBe(true);
    expect(slots.every((s) => s.shown)).toBe(true);
  });

  it("keeps every spell between due left and straight up of the button", () => {
    for (const slot of ringLayout(8, false)) {
      expect(slot.angle).toBeGreaterThanOrEqual(180);
      expect(slot.angle).toBeLessThanOrEqual(270);
    }
  });

  it("never stacks two spells on the same spot", () => {
    const spots = ringLayout(8, false).map((s) => `${s.angle}/${s.radius}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it("folds to the first three spells and tucks the others away", () => {
    const slots = ringLayout(8, true);
    expect(slots.filter((s) => s.shown)).toHaveLength(FOLDED_COUNT);
    expect(slots.slice(0, FOLDED_COUNT).every((s) => s.shown)).toBe(true);
    expect(slots.slice(FOLDED_COUNT).every((s) => !s.shown)).toBe(true);
  });

  it("clears the main button and its timer ring when folded", () => {
    // Button radius 44, ring 5 beyond it, spell radius 23.
    for (const slot of ringLayout(8, true).filter((s) => s.shown)) {
      expect(slot.radius - 23).toBeGreaterThan(44 + 5);
    }
  });

  it("handles a bar with fewer spells than slots", () => {
    expect(ringLayout(2, false)).toHaveLength(2);
    expect(ringLayout(1, false)[0].angle).toBe(225);
    expect(ringLayout(0, true)).toEqual([]);
  });
});

describe("ringLayout for a five-spell bar", () => {
  it("puts every spell on one ring, all out, even when asked to fold", () => {
    for (const folded of [false, true]) {
      const slots = ringLayout(5, folded);
      expect(slots.every((s) => s.shown && s.radius === SINGLE_RING_RADIUS)).toBe(true);
      expect(slots[0].angle).toBe(180);
      expect(slots[4].angle).toBe(270);
    }
    expect(needsFolding(5)).toBe(false);
    expect(needsFolding(6)).toBe(true);
  });

  it("leaves room between neighbours for a 46px spell", () => {
    const slots = ringLayout(5, false).map(slotOffset);
    for (let i = 1; i < slots.length; i++) {
      const gap = Math.hypot(slots[i].dx - slots[i - 1].dx, slots[i].dy - slots[i - 1].dy);
      expect(gap).toBeGreaterThan(46);
    }
  });
});

describe("slotOffset", () => {
  it("points left at 180° and up at 270°", () => {
    const left = slotOffset({ angle: 180, radius: 100, shown: true });
    expect(left.dx).toBeCloseTo(-100);
    expect(left.dy).toBeCloseTo(0);
    const up = slotOffset({ angle: 270, radius: 100, shown: true });
    expect(up.dx).toBeCloseTo(0);
    expect(up.dy).toBeCloseTo(-100);
  });
});
