import { soulOf, Vesper, VESPER_ART } from "./vesper";

const frame = (v: Vesper) => {
  const out = new Uint8ClampedArray(VESPER_ART.w * VESPER_ART.h * 4);
  v.render(out);
  return out;
};
const opaque = (out: Uint8ClampedArray, x: number, y: number) => out[(y * VESPER_ART.w + x) * 4 + 3] === 255;
/**
 * The rows and columns he covers. A row counts once a few pixels fill it,
 * so a spark or a puff of smoke drifting off on its own does not.
 */
const bounds = (out: Uint8ClampedArray) => {
  let top = Infinity, bottom = -1, left = Infinity, right = -1;
  for (let y = 0; y < VESPER_ART.h; y++) {
    let filled = 0;
    for (let x = 0; x < VESPER_ART.w; x++) if (opaque(out, x, y)) filled++;
    if (filled < 4) continue;
    for (let x = 0; x < VESPER_ART.w; x++)
      if (opaque(out, x, y)) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
  }
  return { top, bottom, left, right };
};
const settle = (v: Vesper, seconds: number) => {
  for (let k = 0; k < seconds * 60; k++) v.step(1 / 60);
};

describe("Ser Vesper", () => {
  it("knows his three souls by their outfits' sprites, and nothing else", () => {
    expect(soulOf("vesper-ablaze")).toBe("ablaze");
    expect(soulOf("vesper-mist")).toBe("mist");
    expect(soulOf("vesper-antlers")).toBe("antlers");
    expect(soulOf("fire")).toBeNull();
    expect(soulOf("vesper-")).toBeNull();
    expect(soulOf(undefined)).toBeNull();
  });

  it.each(["ablaze", "mist", "antlers"] as const)("stands on his anchor as tall as a hero, soul %s", (soul) => {
    const v = new Vesper(soul, 3);
    settle(v, 1);
    const b = bounds(frame(v));
    // His sabatons rest on the anchor's row, give or take the outline.
    expect(Math.abs(b.bottom - VESPER_ART.feetY)).toBeLessThanOrEqual(2);
    // A hero's sheet is 27 art pixels from feet to head; the soul rises above.
    expect(VESPER_ART.feetY - b.top).toBeGreaterThan(27);
    expect(b.top).toBeGreaterThan(0);
  });

  it("is outlined in dark wherever his body meets the empty canvas", () => {
    const v = new Vesper("ablaze", 5);
    settle(v, 1);
    const out = frame(v);
    // Walk in from the left along the hip's row: the first pixel met is ink.
    const y = VESPER_ART.feetY - 14;
    let x = 0;
    while (x < VESPER_ART.w && !opaque(out, x, y)) x++;
    const o = (y * VESPER_ART.w + x) * 4;
    expect(out[o] + out[o + 1] + out[o + 2]).toBeLessThan(60);
  });

  it("swings his blade out in front of him and plants it again", () => {
    const v = new Vesper("ablaze", 7);
    settle(v, 1);
    const rest = bounds(frame(v));
    v.play("attack", 1);
    let reach = rest.right;
    for (let k = 0; k < 40; k++) {
      v.step(1 / 60);
      reach = Math.max(reach, bounds(frame(v)).right);
    }
    expect(reach).toBeGreaterThan(rest.right + 4);
    // A blow played out leaves him on guard without being told.
    settle(v, 1);
    expect(v.playing).toBe("idle");
  });

  it("faces the other way when turned", () => {
    const v = new Vesper("antlers", 9);
    settle(v, 1);
    const right = bounds(frame(v));
    v.play("idle", -1);
    settle(v, 1);
    const left = bounds(frame(v));
    // His planted blade stands in front of him, so the body leans to one side.
    expect(Math.sign(right.right + right.left - 2 * VESPER_ART.feetX)).toBe(-Math.sign(left.right + left.left - 2 * VESPER_ART.feetX));
  });

  it("stays down when he falls, his soul gone to an ember", () => {
    const v = new Vesper("ablaze", 11);
    settle(v, 1);
    const up = bounds(frame(v));
    v.play("die", 1);
    // Long enough for the smoke of his fall to have cleared.
    settle(v, 4);
    expect(v.playing).toBe("die");
    expect(bounds(frame(v)).top).toBeGreaterThan(up.top + 6);
  });
});
