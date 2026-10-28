import { Rgb } from "./ascii";

/**
 * A layer of the scene at art resolution: four bytes a pixel, colour and
 * material, laid out exactly as the GPU reads it, so a layer is uploaded as
 * it stands. Coordinates are art pixels, (0, 0) being the middle of the
 * board; `x0`/`y0` is the art pixel of the layer's first byte.
 */
export class Layer {
  readonly data: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly x0: number,
    readonly y0: number
  ) {
    this.data = new Uint8Array(w * h * 4);
  }

  /** The byte offset of an art pixel, or -1 off the layer. */
  index(ax: number, ay: number): number {
    const x = Math.floor(ax) - this.x0;
    const y = Math.floor(ay) - this.y0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return (y * this.w + x) * 4;
  }

  put(ax: number, ay: number, mat: number, c: Rgb): number {
    const i = this.index(ax, ay);
    if (i < 0) return i;
    const d = this.data;
    d[i] = c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0];
    d[i + 1] = c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1];
    d[i + 2] = c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2];
    d[i + 3] = mat;
    return i;
  }

  /** Four raw bytes, for the layers that are not colour (auxiliary data). */
  set(ax: number, ay: number, r: number, g: number, b: number, a: number): void {
    const i = this.index(ax, ay);
    if (i < 0) return;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  mat(ax: number, ay: number): number {
    const i = this.index(ax, ay);
    return i < 0 ? 0 : this.data[i + 3];
  }

  clear(): void {
    this.data.fill(0);
  }

  /** Clears a rectangle, in art pixels, clipped to the layer. */
  clearRect(ax: number, ay: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.floor(ax) - this.x0);
    const y0 = Math.max(0, Math.floor(ay) - this.y0);
    const x1 = Math.min(this.w, Math.ceil(ax + w) - this.x0);
    const y1 = Math.min(this.h, Math.ceil(ay + h) - this.y0);
    for (let y = y0; y < y1; y++) this.data.fill(0, (y * this.w + x0) * 4, (y * this.w + x1) * 4);
  }
}

/** The world's extent in art pixels: wider and taller than any screen it may meet. */
export const WORLD = { x0: -224, y0: -248, w: 448, h: 448 } as const;

/** The backdrop, in its own space: u along the art x axis, v up from its foot. */
export const BACKDROP = { w: WORLD.w, h: 128 } as const;

/** The foreground, anchored to the bottom of the frame. */
export const FOREGROUND = { h: 64 } as const;

export const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

export const mul = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
export const mix = (a: Rgb, b: Rgb, u: number): Rgb => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
  a[2] + (b[2] - a[2]) * u,
];
