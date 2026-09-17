import { fitTile } from "./boardFit";

describe("fitTile", () => {
  it("is limited by height on a phone held sideways", () => {
    // 15-cell board: 8 tiles wide, (8 + 1.4) half-tiles tall.
    expect(fitTile(844, 370, 15)).toBeCloseTo((370 * 2) / 9.4);
  });

  it("is limited by width on a tall box", () => {
    expect(fitTile(400, 800, 15)).toBe(50);
  });

  it("never shrinks below a tappable minimum", () => {
    expect(fitTile(10, 10, 15)).toBe(12);
  });

  it("fits the whole diamond inside the box", () => {
    const tile = fitTile(844, 370, 15);
    expect(tile * 8).toBeLessThanOrEqual(844);
    expect((tile / 2) * 8).toBeLessThanOrEqual(370);
  });
});
