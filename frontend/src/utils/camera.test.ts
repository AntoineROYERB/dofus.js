import { CAMERA_ZOOM, centreOf, followPan, resolveCamera } from "./camera";
import { isoToScreen } from "./isoUtils";

describe("followPan", () => {
  it("puts its target under the middle of the container", () => {
    const centre = { x: 400, y: 300 };
    const target = { x: 520, y: 240 };
    const pan = followPan(target, centre, 1);
    // Where the layer's transform lands the target: centre + pan + scale·(p − centre).
    expect(centre.x + pan.x + (target.x - centre.x)).toBe(centre.x);
    expect(centre.y + pan.y + (target.y - centre.y)).toBe(centre.y);
  });

  it("holds the target centred through a pinch", () => {
    const centre = { x: 400, y: 300 };
    const target = { x: 520, y: 240 };
    const scale = 2.5;
    const pan = followPan(target, centre, scale);
    expect(centre.x + pan.x + scale * (target.x - centre.x)).toBeCloseTo(centre.x);
    expect(centre.y + pan.y + scale * (target.y - centre.y)).toBeCloseTo(centre.y);
  });

  it("does not move a target already in the middle", () => {
    const pan = followPan({ x: 400, y: 300 }, { x: 400, y: 300 }, 1);
    expect(pan.x).toBeCloseTo(0);
    expect(pan.y).toBeCloseTo(0);
  });
});

describe("centreOf", () => {
  it("has nothing to look at without cells", () => {
    expect(centreOf([])).toBeNull();
  });

  it("averages the cells", () => {
    expect(centreOf([{ x: 0, y: 2 }, { x: 2, y: 4 }])).toEqual({ x: 1, y: 3 });
  });

  /*
   * The claim the camera actually leans on: averaging the cells and projecting
   * once is the same point as projecting each and averaging. True because the
   * projection is affine — and worth pinning to the projection itself rather
   * than to a comment about it.
   */
  it("projects to the middle of where the cells are drawn", () => {
    const tile = { width: 40, height: 20 };
    const cells = [
      { x: -5, y: 3 },
      { x: -4, y: 3 },
      { x: -4, y: 4 },
    ];
    const mid = centreOf(cells)!;
    const projectedMid = isoToScreen(mid.x, mid.y, tile, 100, 50);
    const screens = cells.map((c) => isoToScreen(c.x, c.y, tile, 100, 50));
    const midOfProjections = {
      x: screens.reduce((a, s) => a + s.x, 0) / screens.length,
      y: screens.reduce((a, s) => a + s.y, 0) / screens.length,
    };
    expect(projectedMid.x).toBeCloseTo(midOfProjections.x);
    expect(projectedMid.y).toBeCloseTo(midOfProjections.y);
  });
});

describe("resolveCamera", () => {
  it("follows at the default zoom unless it is told otherwise", () => {
    expect(resolveCamera("")).toBe(CAMERA_ZOOM);
    expect(resolveCamera("?spectate=1")).toBe(CAMERA_ZOOM);
  });

  it("stands still for ?camera=off", () => {
    expect(resolveCamera("?camera=off")).toBeNull();
    expect(resolveCamera("?debug=1&camera=off")).toBeNull();
  });

  it("takes the zoom the URL asks for", () => {
    expect(resolveCamera("?camera=1.6")).toBe(1.6);
    expect(resolveCamera("?camera=3")).toBe(3);
  });

  // A typo must not quietly hand back a board smaller than the fitted one,
  // which is the single size it is known to fit its box at.
  it("ignores a zoom that is not a usable number", () => {
    expect(resolveCamera("?camera=yes")).toBe(CAMERA_ZOOM);
    expect(resolveCamera("?camera=0")).toBe(CAMERA_ZOOM);
    expect(resolveCamera("?camera=0.4")).toBe(CAMERA_ZOOM);
    expect(resolveCamera("?camera=-2")).toBe(CAMERA_ZOOM);
  });
});

describe("CAMERA_ZOOM", () => {
  // The point of the zoom: the board must outgrow the box it is fitted to,
  // or there is nothing for the camera to reveal.
  it("draws the board larger than the viewport it was fitted to", () => {
    expect(CAMERA_ZOOM).toBeGreaterThan(1);
  });
});
