import { Rgb } from "./ascii";
import { FigureFrame } from "./figures";
import { Mat } from "./materials";
import { Layer } from "./raster";
import { hash3 } from "./seed";

export type Rect = { x: number; y: number; w: number; h: number };

export const union = (a: Rect | null, b: Rect | null): Rect | null => {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/**
 * Draws a fighter's frame into the fighters' layer, its feet on (fx, fy),
 * over a shadow cast down and to the right. A fading fighter (falling, or
 * reset for a rematch) loses pixels in a fixed pattern rather than going
 * transparent: the ASCII view has no half-glyphs. Idle life — a breath of
 * one pixel — lifts everything above the feet.
 *
 * Returns the rectangle it touched, and where its glow is, if it has one.
 */
export const stampFigure = (
  dyn: Layer,
  f: FigureFrame,
  fx: number,
  fy: number,
  opts: { opacity: number; breath: number; sink: number }
): { rect: Rect; glow: { x: number; y: number; color: Rgb } | null } => {
  const left = Math.round(fx) - f.feetX;
  const top = Math.round(fy) - f.feetY + Math.round(opts.sink);
  // The shadow first, as wide as the figure's feet are.
  const rx = Math.max(4, Math.round(f.w * 0.32));
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx / rx) ** 2 + (dy / 2.4) ** 2 > 1) continue;
      dyn.put(Math.round(fx) + dx + 2, Math.round(fy) + dy + 1, Mat.Shadow, [0, 0, 0]);
    }
  }
  let gx = 0, gy = 0, gn = 0;
  const gc: Rgb = [0, 0, 0];
  for (let y = 0; y < f.h; y++) {
    const lift = y < f.feetY - 2 ? opts.breath : 0;
    for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x;
      const m = f.mats[i];
      if (!m) continue;
      if (opts.opacity < 1 && hash3(x, y, 17) > opts.opacity) continue;
      const c: Rgb = [f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2]];
      dyn.put(left + x, top + y - lift, m, c);
      if (m === Mat.Glow || m === Mat.Fire) {
        gx += left + x;
        gy += top + y;
        gn++;
        gc[0] += c[0];
        gc[1] += c[1];
        gc[2] += c[2];
      }
    }
  }
  return {
    rect: { x: left - 2, y: Math.min(top - 2, fy - 3), w: f.w + 6, h: f.h + 6 },
    glow: gn >= 2 ? { x: gx / gn, y: gy / gn, color: [gc[0] / gn, gc[1] / gn, gc[2] / gn] } : null,
  };
};
