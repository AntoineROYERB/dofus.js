import { Box, boxAround, hasArea } from "./spotlight";

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
