/**
 * Turns the one stock sprite sheet into a version dyed in a player's colour,
 * by replacing every pixel's hue outright rather than rotating it. A rotation
 * kept the art's own spread of hues — the helmet blue, the tunic orange — just
 * turned together, so a character in "red" still wore an off-hue piece
 * wherever the stock art did. Setting every pixel to the same hue instead
 * means the whole fighter reads as one colour, the one that was actually
 * picked. The parts still don't collapse into a single flat shade, because
 * saturation and lightness are left exactly as the art drew them — the
 * helmet was always lighter than the tunic, the tunic always lighter than its
 * own shadow, and those differences are what saturation and lightness carry.
 */

const hueOf = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
};

/** The hue every pixel of a fighter's sprite is set to. */
export const targetHueFor = (color: string): number => hueOf(color);

const rgbToSl = (r: number, g: number, b: number): [number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return [s, l];
};

const hue2rgb = (p: number, q: number, t: number): number => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
};

/**
 * One canvas per (sheet, hue) pair, built once and handed out from then on.
 * Every fighter wearing the same colour — and there are only ever six —
 * redraws from the same dyed canvas rather than dyeing their own copy.
 */
const cache = new Map<string, HTMLCanvasElement>();

/**
 * The recoloured canvas for one sprite sheet at one target hue. `image` must
 * already be loaded (`naturalWidth > 0`) — the caller owns that wait, since
 * it is already loading the sheet itself to know its size.
 */
export const recoloredSheet = (
  image: HTMLImageElement,
  spriteSheet: string,
  targetHueDeg: number
): HTMLCanvasElement => {
  const rounded = Math.round(targetHueDeg);
  const key = `${spriteSheet}|${rounded}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0);

  const targetHue = ((rounded % 360) + 360) % 360 / 360;
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;

  // The sheet is drawn with a small, fixed set of colours — every fighter
  // sharing a plain, cel-shaded palette rather than a photographic one.
  // Working out each distinct colour's new value once, and looking the
  // rest up by their packed RGB, turns millions of trig calls into a few
  // thousand plus a fast pass of integer reads.
  const remap = new Map<number, [number, number, number]>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    const packed = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (remap.has(packed)) continue;
    const [s, l] = rgbToSl(data[i], data[i + 1], data[i + 2]);
    remap.set(packed, hslToRgb(targetHue, s, l));
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    const packed = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const rgb = remap.get(packed);
    if (!rgb) continue;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }

  ctx.putImageData(frame, 0, 0);

  cache.set(key, canvas);
  return canvas;
};

/**
 * The trims every outfit is drawn with — the two panels of its cape — in the
 * colours the artist left for the player: a crimson, and its purple shadow.
 * Nothing else on any outfit uses them, so they can be swapped exactly.
 */
export const OUTFIT_TRIMS = { light: 0x9c304d, dark: 0x674085 } as const;

/**
 * An outfit's sheet with its trims in the player's colour, and everything
 * else as drawn: the outfit's own colours tell its element, and never change.
 * The shadow trim keeps the player's hue a step darker, so the cape still
 * folds.
 */
export const accentedSheet = (
  image: HTMLImageElement,
  spriteSheet: string,
  color: string
): HTMLCanvasElement => {
  const key = `${spriteSheet}|accent|${color}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0);

  const n = parseInt(color.slice(1), 16);
  const [s, l] = rgbToSl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  const hue = hueOf(color) / 360;
  const light = hslToRgb(hue, s, Math.min(l, 0.55));
  const dark = hslToRgb(hue, s, Math.min(l, 0.55) * 0.62);

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    const packed = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const rgb =
      packed === OUTFIT_TRIMS.light ? light : packed === OUTFIT_TRIMS.dark ? dark : null;
    if (!rgb) continue;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }
  ctx.putImageData(frame, 0, 0);

  cache.set(key, canvas);
  return canvas;
};
