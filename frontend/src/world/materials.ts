/**
 * What every pixel of the fight's scene is made of.
 *
 * The scene is painted at art resolution, but nobody ever sees those pixels:
 * the ASCII pass turns each text cell into one glyph. A text cell covers
 * several pixels, and averaging them would turn an eye into a smudge of robe.
 * So each pixel also says what it is, and a cell keeps the pixels of its most
 * important material: the eye wins over the hood, the hood over the grass.
 * The material then picks the glyph, from a set of its own.
 *
 * The same tables drive the WebGL pass (uploaded as a texture) and the
 * Canvas 2D fallback, so the two cannot disagree about a priority or a glyph.
 */

export const Mat = {
  None: 0,
  // Ground: what a cell is when nothing stands on it.
  Soil: 1,
  Grass: 2,
  Flower: 3,
  Pebble: 4,
  Path: 5,
  Water: 6,
  Foam: 7,
  Ice: 8,
  Lava: 9,
  Acid: 10,
  Snow: 11,
  Wind: 12,
  TallGrass: 13,
  Cloud: 14,
  Void: 15,
  Sky: 16,
  Star: 17,
  Reflection: 18,
  // Built and raised: walls, terraces, the board's plinth.
  Stone: 20,
  Mortar: 21,
  Brick: 22,
  Strata: 23,
  Lip: 24,
  Rock: 25,
  Crystal: 26,
  Frost: 27,
  Basalt: 28,
  Magma: 29,
  // Growing things.
  Leaf: 30,
  Pine: 31,
  Trunk: 32,
  Bush: 33,
  Fern: 34,
  Ivy: 35,
  Mushroom: 36,
  Banner: 37,
  Reed: 38,
  Coral: 39,
  // Figures: what a character is painted in (see figures.ts).
  Outline: 40,
  Skin: 41,
  Hair: 42,
  Cloth: 43,
  ClothDark: 44,
  Trim: 45,
  Metal: 46,
  Leather: 47,
  Eye: 48,
  Glow: 49,
  Accent: 50,
  Wood: 51,
  Fur: 52,
  Slime: 53,
  Shell: 54,
  // Light and what moves on its own.
  Fire: 56,
  Ember: 57,
  Spark: 58,
  Smoke: 59,
  Mote: 60,
  LeafFall: 61,
  /** Not a material of its own: darkens what lies under it. Never wins a cell. */
  Shadow: 63,
} as const;
export type Mat = (typeof Mat)[keyof typeof Mat];

export const MATERIAL_COUNT = 64;

/** How the glyph is chosen inside a material's set. */
export const Pick = {
  /** By light: the first glyph for the darkest pixels, the last for the brightest. */
  Light: 0,
  /** By a hash of the cell: a texture that holds still. */
  Scatter: 1,
  /** Scattered, and reshuffled over time: water, fire, smoke. */
  Flicker: 2,
} as const;
export type Pick = (typeof Pick)[keyof typeof Pick];

export type MaterialInfo = {
  /** Which material a text cell shows when it covers several: the higher wins. */
  priority: number;
  glyphs: string;
  pick: Pick;
  /** Lies flat: the neon may run over it, and the board's grid would show on it. */
  floor?: boolean;
  /** Gives its own light: neither haze nor darkness takes its colour. */
  emissive?: boolean;
  /** Its glyph colour is the background's, so it reads as a texture rather than a mark. */
  quiet?: boolean;
};

const M: Partial<Record<number, MaterialInfo>> = {
  [Mat.Soil]: { priority: 1, glyphs: ".,:'", pick: Pick.Scatter, floor: true, quiet: true },
  [Mat.Grass]: { priority: 1, glyphs: ",'.`\";", pick: Pick.Scatter, floor: true },
  [Mat.Path]: { priority: 1, glyphs: ".:_,", pick: Pick.Scatter, floor: true, quiet: true },
  [Mat.Water]: { priority: 1, glyphs: "~-~=", pick: Pick.Flicker, floor: true },
  [Mat.Ice]: { priority: 1, glyphs: "=-_+", pick: Pick.Scatter, floor: true },
  [Mat.Lava]: { priority: 2, glyphs: "~^~*", pick: Pick.Flicker, floor: true, emissive: true },
  [Mat.Acid]: { priority: 2, glyphs: "o°~.", pick: Pick.Flicker, floor: true, emissive: true },
  [Mat.Snow]: { priority: 1, glyphs: ".'*,", pick: Pick.Scatter, floor: true },
  [Mat.Cloud]: { priority: 1, glyphs: "~-.~", pick: Pick.Flicker, floor: true, quiet: true },
  [Mat.Void]: { priority: 1, glyphs: " .", pick: Pick.Scatter, quiet: true },
  [Mat.Sky]: { priority: 1, glyphs: "  . ", pick: Pick.Scatter, quiet: true },
  [Mat.Stone]: { priority: 1, glyphs: "#=%", pick: Pick.Light },
  [Mat.Mortar]: { priority: 1, glyphs: "-=", pick: Pick.Scatter },
  [Mat.Brick]: { priority: 1, glyphs: "#=%", pick: Pick.Light },
  [Mat.Strata]: { priority: 1, glyphs: "=-~", pick: Pick.Scatter },
  [Mat.Flower]: { priority: 2, glyphs: "*o+", pick: Pick.Scatter, floor: true },
  [Mat.Pebble]: { priority: 2, glyphs: "o.°", pick: Pick.Scatter, floor: true },
  [Mat.Foam]: { priority: 2, glyphs: "~°.", pick: Pick.Flicker, floor: true },
  [Mat.Wind]: { priority: 2, glyphs: ">-~", pick: Pick.Flicker, floor: true },
  [Mat.Reflection]: { priority: 2, glyphs: "~-=", pick: Pick.Flicker, floor: true },
  [Mat.Lip]: { priority: 2, glyphs: "\"',", pick: Pick.Scatter },
  [Mat.Star]: { priority: 2, glyphs: ".*+'", pick: Pick.Scatter, emissive: true },
  [Mat.Banner]: { priority: 4, glyphs: "|#=", pick: Pick.Light },
  [Mat.Rock]: { priority: 5, glyphs: "%%#", pick: Pick.Light },
  [Mat.Crystal]: { priority: 5, glyphs: "/|*", pick: Pick.Light },
  [Mat.Frost]: { priority: 5, glyphs: "|/#", pick: Pick.Light },
  [Mat.Basalt]: { priority: 5, glyphs: "#%|", pick: Pick.Light },
  [Mat.Leaf]: { priority: 5, glyphs: "#&*", pick: Pick.Light },
  [Mat.Pine]: { priority: 5, glyphs: "A^'", pick: Pick.Light },
  [Mat.Trunk]: { priority: 5, glyphs: "||!", pick: Pick.Light },
  [Mat.Bush]: { priority: 5, glyphs: "%&*", pick: Pick.Light },
  [Mat.Fern]: { priority: 5, glyphs: "/\\v}", pick: Pick.Scatter },
  [Mat.Ivy]: { priority: 4, glyphs: "&%;", pick: Pick.Light },
  [Mat.Mushroom]: { priority: 5, glyphs: "nmO", pick: Pick.Light },
  [Mat.Reed]: { priority: 4, glyphs: "|'i", pick: Pick.Scatter },
  [Mat.Coral]: { priority: 5, glyphs: "Y%&", pick: Pick.Light },
  [Mat.TallGrass]: { priority: 5, glyphs: "|\\/Y", pick: Pick.Scatter },
  [Mat.Cloth]: { priority: 5, glyphs: "###%%&", pick: Pick.Light },
  [Mat.ClothDark]: { priority: 5, glyphs: "#%", pick: Pick.Light },
  [Mat.Hair]: { priority: 5, glyphs: "%~", pick: Pick.Light },
  [Mat.Skin]: { priority: 5, glyphs: "oc", pick: Pick.Light },
  // Folds and straps are detail: the cloth they lie on wins a shared cell.
  [Mat.Leather]: { priority: 4, glyphs: "%#", pick: Pick.Light },
  [Mat.Fur]: { priority: 5, glyphs: "%&o", pick: Pick.Light },
  [Mat.Slime]: { priority: 5, glyphs: "Oo°", pick: Pick.Light },
  [Mat.Shell]: { priority: 5, glyphs: "%#&", pick: Pick.Light },
  [Mat.Outline]: { priority: 6, glyphs: "@", pick: Pick.Light },
  [Mat.Wood]: { priority: 6, glyphs: "|!", pick: Pick.Light },
  [Mat.Metal]: { priority: 7, glyphs: "#[]", pick: Pick.Light },
  [Mat.Trim]: { priority: 7, glyphs: "=+", pick: Pick.Light },
  [Mat.Accent]: { priority: 7, glyphs: "+*", pick: Pick.Light },
  [Mat.Magma]: { priority: 8, glyphs: "~^*", pick: Pick.Flicker, emissive: true },
  [Mat.Fire]: { priority: 8, glyphs: "^*#@", pick: Pick.Flicker, emissive: true },
  [Mat.Ember]: { priority: 8, glyphs: "*.'", pick: Pick.Flicker, emissive: true },
  [Mat.Glow]: { priority: 8, glyphs: "*+", pick: Pick.Flicker, emissive: true },
  [Mat.Smoke]: { priority: 3, glyphs: "~%.", pick: Pick.Flicker },
  [Mat.Mote]: { priority: 9, glyphs: "*.'+", pick: Pick.Scatter, emissive: true },
  [Mat.LeafFall]: { priority: 8, glyphs: "`',", pick: Pick.Scatter },
  [Mat.Spark]: { priority: 9, glyphs: "*+'", pick: Pick.Flicker, emissive: true },
  [Mat.Eye]: { priority: 10, glyphs: "o0", pick: Pick.Light, emissive: true },
};

const BLANK: MaterialInfo = { priority: 0, glyphs: " ", pick: Pick.Scatter };

export const materialOf = (m: number): MaterialInfo => M[m] ?? BLANK;

/** The three glyphs the neon line is drawn with, by where it crosses the cell. */
export const EDGE_GLYPHS = "▔━▁";

/**
 * Every glyph the view can show, in atlas order. Glyph 0 is the blank. Built
 * from the tables above, so a new material's glyphs reach the atlas without
 * anyone keeping a second list.
 */
export const GLYPHS: string = (() => {
  const seen = new Set<string>([" "]);
  const out = [" "];
  for (let m = 0; m < MATERIAL_COUNT; m++) {
    for (const ch of materialOf(m).glyphs) {
      if (!seen.has(ch)) {
        seen.add(ch);
        out.push(ch);
      }
    }
  }
  for (const ch of EDGE_GLYPHS) if (!seen.has(ch)) out.push(ch);
  return out.join("");
})();

const glyphIndex = new Map([...GLYPHS].map((ch, i) => [ch, i]));
export const indexOfGlyph = (ch: string): number => glyphIndex.get(ch) ?? 0;

/**
 * The table the GPU reads, one RGBA texel per material: priority, the index
 * of its first glyph in the atlas, how many it has, and its flags (pick in
 * the low two bits, then floor, emissive, quiet). Each material's glyphs are
 * laid out once more, contiguously, after the atlas's unique list, so a set
 * is a start and a count — see GLYPH_RUNS.
 */
export const GLYPH_RUNS: string = (() => {
  let runs = "";
  for (let m = 0; m < MATERIAL_COUNT; m++) runs += materialOf(m).glyphs;
  return runs;
})();

export const materialTable = (): Uint8Array => {
  const out = new Uint8Array(MATERIAL_COUNT * 4);
  let start = 0;
  for (let m = 0; m < MATERIAL_COUNT; m++) {
    const info = materialOf(m);
    out[m * 4] = info.priority;
    out[m * 4 + 1] = start;
    out[m * 4 + 2] = info.glyphs.length;
    out[m * 4 + 3] =
      info.pick | (info.floor ? 4 : 0) | (info.emissive ? 8 : 0) | (info.quiet ? 16 : 0);
    start += info.glyphs.length;
  }
  return out;
};

/** The atlas index of each glyph in GLYPH_RUNS, for the GPU's glyph lookup. */
export const runIndices = (): Uint8Array =>
  Uint8Array.from([...GLYPH_RUNS], (ch) => indexOfGlyph(ch));
