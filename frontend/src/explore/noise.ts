/**
 * The world's randomness, which is not random at all: every value here is a
 * function of where it is asked about, so the same cell gets the same answer
 * on every render, after every reload and on every device. That is what lets
 * the world be scenery rather than a stored map — see world.ts.
 */

/** A stable number in [0, 1) per integer cell, with a salt to ask several questions of one cell. */
export const cellNoise = (x: number, y: number, salt = 0): number => {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^
    Math.imul(y | 0, 0x165667b1) ^
    Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2b3f5c1d);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
};

export const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u);

/** 0 below 0, 1 above 1, and an ease in between. */
export const smoothstep = (u: number): number => {
  const v = clamp01(u);
  return v * v * (3 - 2 * v);
};

/**
 * Noise that varies smoothly between cells, for anything that should read as
 * a region rather than a speckle: `scale` is roughly how many cells one bump
 * spans. It takes fractional coordinates, which is what lets a wash be sampled
 * finer than the grid and run across cell edges.
 */
export const valueNoise = (x: number, y: number, scale: number, salt: number): number => {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const u = smoothstep(fx - x0);
  const v = smoothstep(fy - y0);
  const a = cellNoise(x0, y0, salt);
  const b = cellNoise(x0 + 1, y0, salt);
  const c = cellNoise(x0, y0 + 1, salt);
  const d = cellNoise(x0 + 1, y0 + 1, salt);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/** Two octaves: broad shapes with a ragged edge, rather than perfect blobs. */
export const fbm = (x: number, y: number, salt: number): number =>
  0.65 * valueNoise(x, y, 6, salt) + 0.35 * valueNoise(x, y, 2.5, salt + 7);
