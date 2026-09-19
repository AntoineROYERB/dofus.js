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

  it("leaves the preferred spot alone when nothing is in the way", () => {
    const spot = { top: 400, left: 40 };
    expect(placeCard(spot, card, screen, null)).toEqual(spot);
    expect(placeCard(spot, card, screen, box(600, 20, 100, 100))).toEqual(spot);
  });

  it("moves off the cells the step is asking the player to click", () => {
    // Start cells at the foot of the board, where the card would rather sit.
    const startCells = box(40, 380, 200, 90);
    const chosen = placeCard({ top: 400, left: 40 }, card, screen, startCells);
    expect(overlaps(
      { left: chosen.left, top: chosen.top, right: chosen.left + card.width, bottom: chosen.top + card.height },
      startCells
    )).toBe(false);
  });

  it("keeps the card on screen wherever it lands", () => {
    const chosen = placeCard({ top: 400, left: 40 }, card, screen, box(0, 300, 400, 200));
    expect(chosen.left).toBeGreaterThanOrEqual(16);
    expect(chosen.top).toBeGreaterThanOrEqual(16);
    expect(chosen.left + card.width).toBeLessThanOrEqual(screen.width - 16);
    expect(chosen.top + card.height).toBeLessThanOrEqual(screen.height - 16);
  });

  it("gives up on a screen with nowhere clear, rather than hiding the card", () => {
    const everywhere = box(0, 0, 800, 620);
    const spot = { top: 400, left: 40 };
    expect(placeCard(spot, card, screen, everywhere)).toEqual(spot);
  });
});
