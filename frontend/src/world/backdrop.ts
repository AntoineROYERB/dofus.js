import { IslandPalette } from "../types/message";
import { valueNoise } from "../explore/noise";
import { Rgb } from "./ascii";
import { Mat } from "./materials";
import { BACKDROP, FOREGROUND, Layer, WORLD, hex, mix, mul } from "./raster";
import { hash3 } from "./seed";

/**
 * Each island's back: a backdrop of its own that frames the board.
 *
 * It is painted in its own space — u along the screen, v up from its foot —
 * and stood behind the land at draw time, where it can be seen: on a phone
 * held sideways the board fills the height, so the back shows in the two
 * upper corners, its foot running parallel to the board's back edges; on a
 * tall screen it stands across the top, with terraces between it and the
 * board. It never comes nearer than two rings to a playable cell (see
 * wallFoot in compose.ts).
 *
 * What makes the mock-up's wall work is kept on every island: a broken top
 * against the dark, openings onto darkness, and two sources of light.
 */

export type BackdropLight = { u: number; v: number; radius: number; strength: number; color: Rgb; flicker: number };

/** `tops[u - WORLD.x0]` is the first empty v up from the foot: where the sky begins. */
export type Backdrop = { layer: Layer; lights: BackdropLight[]; tops: Uint8Array };

/** Some islands' backs stand on nothing: below their foot is the sky, not the land. */
export const FLOATING = new Set(["air"]);

const P = (p: IslandPalette) => ({
  stone: p.stone.map(hex),
  wood: p.wood.map(hex),
  leaves: p.leaves.map(hex),
  flowers: p.flowers.map(hex),
  earth: p.earth.map(hex),
  outline: hex(p.outline),
  liquid: p.liquid.map(hex),
  accent: hex(p.accent),
});

const u0 = WORLD.x0;

export const paintBackdrop = (look: string, palette: IslandPalette, seed: number): Backdrop => {
  const layer = new Layer(BACKDROP.w, BACKDROP.h, u0, 0);
  const c = P(palette);
  const lights: BackdropLight[] = [];
  const salt = seed % 997;
  const put = (u: number, v: number, mat: number, col: Rgb) => layer.put(u, v, mat, col);
  const at = (u: number, v: number) => layer.mat(u, v);
  const span = (f: (u: number) => void) => {
    for (let u = u0; u < u0 + BACKDROP.w; u++) f(u);
  };
  /** The broken top line of a wall: a height per column, ragged and notched. */
  const topOf = (base: number, rough: number) => (u: number) =>
    Math.round(base + (valueNoise(u, 0, 18, salt) - 0.5) * rough + (hash3(Math.floor(u / 5), 1, salt) < 0.18 ? -6 : 0));

  /** Coursed stone up to a top, lit on the left half of each block. */
  const courses = (top: (u: number) => number, tones: Rgb[], mortar: Rgb, mat: number = Mat.Stone) =>
    span((u) => {
      const h = top(u);
      for (let v = 0; v < h; v++) {
        const row = Math.floor(v / 4);
        const joint = v % 4 === 3 || (u + (row % 2) * 4) % 9 === 0;
        const block = Math.floor((u + (row % 2) * 4) / 9);
        const tone = tones[Math.floor(hash3(block, row, salt) * tones.length)];
        const edge = v >= h - 1;
        put(u, v, joint ? Mat.Mortar : mat, edge ? mul(tone, 1.2) : joint ? mortar : tone);
      }
    });

  /** An opening onto darkness, with a round head. */
  const arch = (cu: number, w: number, h: number, dark: Rgb) => {
    for (let v = 2; v < h; v++) {
      const head = v > h - w / 2 ? Math.sqrt(Math.max(0, (w / 2) ** 2 - (v - (h - w / 2)) ** 2)) : w / 2;
      for (let du = -head; du < head; du++) {
        if (at(cu + du, v)) put(cu + du, v, Mat.Void, mul(dark, 0.6 + 0.4 * (v / h)));
      }
    }
  };

  /** A brazier on a post, and its light. */
  const brazier = (cu: number, v: number, flame: Rgb) => {
    for (let k = 0; k < v; k++) put(cu, k, Mat.Metal, c.stone[0]);
    for (let du = -3; du <= 3; du++) put(cu + du, v, Mat.Metal, c.stone[1]);
    for (let du = -2; du <= 2; du++) put(cu + du, v + 1, Mat.Fire, flame);
    lights.push({ u: cu, v: v + 4, radius: 60, strength: 0.95, color: flame, flicker: 1 });
  };

  /** A long banner hanging from the top, in the island's colours. */
  const banner = (cu: number, from: number, len: number, col: Rgb, trim: Rgb) => {
    for (let v = from; v > from - len; v--) {
      for (let du = -3; du <= 3; du++) {
        const notch = v < from - len + 4 && Math.abs(du) < 4 - (v - (from - len)) ;
        if (notch) continue;
        put(cu + du, v, Mat.Banner, Math.abs(du) === 3 ? trim : du < 0 ? mul(col, 1.1) : col);
      }
    }
  };

  const arches = [-140, -56, 56, 140].map((a) => a + Math.round((hash3(a, 2, salt) - 0.5) * 16));

  switch (look) {
    case "earth": {
      // A basalt cliff in strata, magma in its cracks, fallen blocks at its foot.
      const top = topOf(92, 30);
      span((u) => {
        const h = top(u);
        for (let v = 0; v < h; v++) {
          const band = Math.floor((v + valueNoise(u, v, 12, salt) * 6) / 5) % 4;
          put(u, v, Mat.Basalt, mul(c.stone[band], v > h - 2 ? 1.25 : 1));
        }
        const vein = 20 + Math.round(valueNoise(u, 0, 26, salt + 4) * 50);
        if (valueNoise(u, 3, 40, salt + 2) > 0.55) put(u, vein, Mat.Magma, c.accent);
      });
      for (const a of arches) {
        arch(a, 16, 30, c.stone[0]);
        lights.push({ u: a, v: 14, radius: 42, strength: 0.7, color: c.accent, flicker: 0.6 });
      }
      break;
    }
    case "water": {
      // A drowned colonnade: columns, a broken entablature, two thin falls.
      const top = topOf(84, 10);
      span((u) => {
        const h = top(u);
        const col = ((u - u0) % 34 + 34) % 34;
        const isColumn = col < 9;
        for (let v = 0; v < h; v++) {
          if (v < 10) put(u, v, Mat.Water, c.liquid[(u + v) % 3 === 0 ? 2 : 1]);
          else if (isColumn || v > h - 12) put(u, v, Mat.Stone, col < 3 ? c.stone[3] : col < 6 ? c.stone[2] : c.stone[1]);
          else put(u, v, Mat.Void, mul(c.stone[0], 0.5));
        }
      });
      for (const a of [arches[0], arches[3]]) {
        for (let v = 10; v < 80; v++) for (let du = -2; du <= 2; du++) put(a + du, v, Mat.Water, c.liquid[du === 0 ? 3 : 2]);
        lights.push({ u: a, v: 40, radius: 46, strength: 0.6, color: c.liquid[3], flicker: 0.3 });
      }
      break;
    }
    case "ice": {
      // Frozen ramparts: crenellations, icicles, light through blue ice.
      const top = (u: number) => 78 + (((u - u0) % 16) < 8 ? 6 : 0) + Math.round((valueNoise(u, 0, 30, salt) - 0.5) * 10);
      courses(top, c.stone.slice(1), c.stone[0], Mat.Frost);
      span((u) => {
        const h = top(u);
        if (hash3(u, 4, salt) < 0.35) for (let k = 1; k < 2 + hash3(u, 5, salt) * 6; k++) put(u, h - 6 - k, Mat.Frost, c.stone[3]);
      });
      for (const a of [arches[1], arches[2]]) {
        arch(a, 14, 34, c.liquid[0]);
        for (let v = 6; v < 30; v++) for (let du = -4; du <= 4; du++) if (at(a + du, v) === Mat.Void) put(a + du, v, Mat.Glow, c.liquid[2]);
        lights.push({ u: a, v: 18, radius: 52, strength: 0.8, color: c.liquid[3], flicker: 0.2 });
      }
      break;
    }
    case "air": {
      // Broken arches standing on nothing, long pennants in the wind.
      span((u) => {
        for (let v = 0; v < 18; v++) if (valueNoise(u, v, 14, salt) > 0.45 - v * 0.01) put(u, v, Mat.Cloud, mix(c.stone[3], [230, 230, 245], 0.4));
      });
      for (const a of arches) {
        const h = 70 + Math.round(hash3(a, 9, salt) * 20);
        for (let v = 18; v < h; v++) {
          for (const side of [-1, 1]) for (let k = 0; k < 6; k++) put(a + side * (12 + k), v, Mat.Stone, k < 3 ? c.stone[2] : c.stone[1]);
        }
        for (let du = -18; du <= 18; du++) for (let v = h - 8; v < h; v++) {
          if (Math.abs(du) < 12 && v < h - 4 - Math.sqrt(144 - du * du) * 0.3) continue;
          put(a + du, v, Mat.Stone, c.stone[3]);
        }
        banner(a, h + 18, 26, c.flowers[0], c.flowers[2]);
        lights.push({ u: a, v: h - 10, radius: 40, strength: 0.55, color: c.flowers[1], flicker: 0.2 });
      }
      break;
    }
    case "acid": {
      // A fungal ruin: a low wall overrun by giant caps, and glowing vats.
      const top = topOf(56, 26);
      courses(top, c.stone.slice(0, 3), c.outline);
      for (const a of arches) {
        const h = 70 + Math.round(hash3(a, 3, salt) * 30);
        for (let v = 0; v < h; v++) for (let du = -2; du <= 2; du++) put(a + du, v, Mat.Trunk, du < 0 ? c.stone[3] : c.stone[2]);
        for (let du = -20; du <= 20; du++) for (let v = 0; v < 10 - Math.abs(du) / 3; v++) put(a + du, h + v, Mat.Mushroom, v > 4 ? c.flowers[2] : c.flowers[1]);
      }
      for (const a of [arches[1] + 24, arches[2] - 24]) {
        for (let v = 0; v < 14; v++) for (let du = -6; du <= 6; du++) put(a + du, v, v > 10 ? Mat.Acid : Mat.Metal, v > 10 ? c.liquid[3] : c.stone[1]);
        lights.push({ u: a, v: 14, radius: 54, strength: 0.85, color: c.liquid[3], flicker: 0.4 });
      }
      break;
    }
    case "fire": {
      // A forge wall, lava falling through its arches.
      const top = topOf(88, 22);
      courses(top, c.stone.slice(0, 3), c.outline, Mat.Basalt);
      for (const a of arches) {
        arch(a, 18, 46, c.stone[0]);
        for (let v = 0; v < 46; v++) for (let du = -3; du <= 3; du++) if (at(a + du, v) === Mat.Void) put(a + du, v, Mat.Lava, c.liquid[Math.abs(du) < 2 ? 3 : 2]);
        lights.push({ u: a, v: 20, radius: 58, strength: 0.95, color: c.liquid[3], flicker: 0.8 });
      }
      break;
    }
    default: {
      // Prairie: the mock-up's ruined wall — stone courses, arches, ivy, banners, braziers.
      const top = topOf(80, 26);
      courses(top, c.stone.slice(0, 3), c.stone[0]);
      for (const a of [arches[0], arches[1] + 6, arches[3]]) arch(a, 20, 44, c.outline);
      span((u) => {
        const h = top(u);
        if (valueNoise(u, 7, 16, salt + 6) > 0.55) {
          const len = 4 + Math.floor(hash3(u, 6, salt) * 22);
          for (let k = 0; k < len; k++) put(u, h - 1 - k, Mat.Ivy, c.leaves[k % 3 === 0 ? 2 : 1]);
        }
      });
      banner(arches[1] - 22, 70, 34, c.flowers[0], c.flowers[1]);
      banner(arches[2] + 22, 70, 34, c.flowers[0], c.flowers[1]);
      brazier(arches[1] + 34, 24, c.flowers[1]);
      brazier(arches[2] - 30, 24, c.flowers[1]);
    }
  }
  // Rubble at the foot, so the back stands on the land rather than ending on it.
  if (!FLOATING.has(look)) {
    span((u) => {
      const h = 1 + Math.floor(hash3(u, 11, salt) * 3);
      for (let v = 0; v < h; v++) if (at(u, v) !== Mat.Void) put(u, v, Mat.Rock, c.stone[v === h - 1 ? 2 : 1]);
    });
  }
  const tops = new Uint8Array(BACKDROP.w);
  for (let k = 0; k < BACKDROP.w; k++) {
    let v = BACKDROP.h - 1;
    while (v > 0 && !layer.mat(u0 + k, v)) v--;
    tops[k] = Math.min(BACKDROP.h - 1, v + 1);
  }
  return { layer, lights, tops };
};

/**
 * Large dark ferns at the bottom of the frame, in its two corners: the
 * nearest thing in the picture, which is what makes the rest of it read as
 * far. Painted against the frame, so they stay in the corners whatever the
 * screen's width; never over a playable cell (compose.ts checks).
 */
export const paintForeground = (widthArt: number, palette: IslandPalette, seed: number): Layer => {
  const layer = new Layer(Math.max(1, Math.ceil(widthArt) + 2), FOREGROUND.h, 0, 0);
  const leaves = palette.leaves.map(hex);
  const dark = mul(leaves[0], 0.45);
  const fronds = [0.02, 0.1, 0.9, 0.98];
  fronds.forEach((at, k) => {
    const root = Math.round(widthArt * at);
    const n = 5 + Math.floor(hash3(k, seed) * 4);
    for (let f = 0; f < n; f++) {
      const angle = -Math.PI / 2 + (f / (n - 1) - 0.5) * 2.2;
      const len = 26 + hash3(k, f, seed) * 26;
      for (let s = 0; s < len; s++) {
        const bend = (s / len) ** 2 * 10 * Math.sign(Math.cos(angle));
        const u = root + Math.cos(angle) * s + bend;
        const v = -Math.sin(angle) * s * 0.9;
        layer.put(u, v, Mat.Fern, mix(dark, leaves[1], (s / len) * 0.35));
        if (s % 3 === 0 && s > 4) {
          for (let l = 1; l < 5 - (s / len) * 3; l++) {
            layer.put(u - l, v + l * 0.4, Mat.Fern, dark);
            layer.put(u + l, v + l * 0.4, Mat.Fern, dark);
          }
        }
      }
    }
  });
  return layer;
};
