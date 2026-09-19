import { Box, boxAround, hasArea, overlaps, placeCard } from "./spotlight";

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("hasArea", () => {
  it("rejects the collapsed wrapper the phone's spell arc is", () => {
    expect(hasArea(box(0, 0, 780, 0))).toBe(false);
    expect(hasArea(box(0, 0, 0, 40))).toBe(false);
  });

  it("accepts anything that would show", () => {
    expect(hasArea(box(12, 339, 248, 73))).toBe(true);
  });
});

describe("boxAround", () => {
  it("has nothing to say about nothing", () => {
    expect(boxAround([])).toBeNull();
  });

  it("wraps a fan of slots, whatever order they come in", () => {
    const slots = [
      box(680, 209, 46, 46),
      box(565, 300, 46, 46),
      box(619, 255, 46, 46),
    ];
    expect(boxAround(slots)).toEqual({
      left: 565,
      top: 209,
      right: 726,
      bottom: 346,
    });
    expect(boxAround([...slots].reverse())).toEqual(boxAround(slots));
  });

  it("returns the one box it was given", () => {
    expect(boxAround([box(4, 8, 15, 16)])).toEqual(box(4, 8, 15, 16));
  });
});

describe("overlaps", () => {
  it("sees a shared pixel and nothing less", () => {
    expect(overlaps(box(0, 0, 10, 10), box(9, 9, 10, 10))).toBe(true);
    expect(overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(0, 10, 10, 10))).toBe(false);
  });
});

describe("placeCard", () => {
  const card = { width: 320, height: 180 };
  const screen = { width: 800, height: 620 };
  const boxAt = (spot: { top: number; left: number }): Box => ({
    left: spot.left,
    top: spot.top,
    right: spot.left + card.width,
    bottom: spot.top + card.height,
  });
  /** A row of cells, the size the board draws them at. */
  const cells = (left: number, top: number, count: number): Box[] =>
    Array.from({ length: count }, (_, i) => box(left + i * 54, top, 52, 26));
  /** The spell bar, across the foot of a desk layout. */
  const spellBar = box(230, 540, 390, 80);

  it("leaves the preferred spot alone when it covers nothing", () => {
    const spot = { top: 340, left: 40 };
    expect(placeCard(spot, card, screen, { cells: [], never: [] })).toEqual(spot);
    expect(
      placeCard(spot, card, screen, { cells: cells(600, 20, 3), never: [] })
    ).toEqual(spot);
  });

  it("moves off the cells the step is asking the player to click", () => {
    const startCells = cells(40, 420, 3);
    const chosen = placeCard({ top: 400, left: 40 }, card, screen, {
      cells: startCells,
      never: [],
    });
    for (const cell of startCells) {
      expect(overlaps(boxAt(chosen), cell)).toBe(false);
    }
  });

  it("never covers what the step is lighting, even to hide fewer cells", () => {
    // A range across the board: the only cell-free spots are over the bar.
    const range = [...cells(0, 40, 14), ...cells(0, 300, 14)];
    const chosen = placeCard({ top: 340, left: 40 }, card, screen, {
      cells: range,
      never: [spellBar],
    });
    expect(overlaps(boxAt(chosen), spellBar)).toBe(false);
  });

  it("ignores something as big as the board, which is always underneath", () => {
    const wholeBoard = box(0, 20, 800, 400);
    const spot = { top: 340, left: 40 };
    expect(
      placeCard(spot, card, screen, { cells: [], never: [wholeBoard] })
    ).toEqual(spot);
  });

  it("hides the fewest cells it can when nowhere is clear", () => {
    const range = [
      ...cells(0, 40, 14),
      ...cells(0, 300, 14),
      ...cells(0, 560, 2),
    ];
    const preferred = { top: 300, left: 40 };
    const chosen = placeCard(preferred, card, screen, {
      cells: range,
      never: [],
    });
    const covered = (spot: { top: number; left: number }) =>
      range.filter((cell) => overlaps(boxAt(spot), cell)).length;
    expect(covered(chosen)).toBeLessThan(covered(preferred));
  });

  it("keeps the card on screen wherever it lands", () => {
    const chosen = placeCard({ top: 400, left: 40 }, card, screen, {
      cells: cells(0, 420, 8),
      never: [spellBar],
    });
    expect(chosen.left).toBeGreaterThanOrEqual(16);
    expect(chosen.top).toBeGreaterThanOrEqual(16);
    expect(chosen.left + card.width).toBeLessThanOrEqual(screen.width - 16);
    expect(chosen.top + card.height).toBeLessThanOrEqual(screen.height - 16);
  });

  it("stays put rather than vanishing when every spot is as bad", () => {
    const spot = { top: 400, left: 40 };
    expect(
      placeCard(spot, card, screen, {
        cells: [],
        never: [box(0, 0, 400, 300), box(400, 0, 400, 320), box(0, 300, 800, 320)],
      })
    ).toEqual(spot);
  });
});
