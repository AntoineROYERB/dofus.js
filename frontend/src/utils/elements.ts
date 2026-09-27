/*
 * The four elements, each with one colour and one icon, used wherever the
 * game shows an element: the spells, the grimoires, the sets, the wardrobe.
 *
 * The colours come from the grimoires' own sigils — ember, sky, lagoon and
 * ochre — kept clear of vermilion, which marks what a spell is about to hit,
 * and of the blue of action points. A player has no colour of their own any
 * more, so nothing else on the screen competes with them.
 *
 * The server paints spells from the same four colours (config/spells.json,
 * "elements"); keep the two in step.
 */

export interface ElementLook {
  /** Its colour, for text on paper and the marks it leaves. */
  color: string;
  /** Its shadow, for the icon's dark side and small text. */
  dark: string;
  /** Its light, for the icon's lit side. */
  light: string;
  /** The icon, a pixel a letter: x its colour, d its shadow, l its light. */
  glyph: string[];
}

export const ELEMENTS: Record<string, ElementLook> = {
  Fire: {
    color: "#e0791a",
    dark: "#8a3f0c",
    light: "#ffd08a",
    glyph: [
      "....l....",
      "...ll....",
      "...lx..l.",
      "..lxx.lx.",
      "..lxxxxx.",
      ".lxxdxxxl",
      ".xxdddxx.",
      ".xxdldxx.",
      "..xxdxx..",
      "...xxx...",
    ],
  },
  Air: {
    color: "#4fa3c7",
    dark: "#24607a",
    light: "#cfeefa",
    glyph: [
      "...xxx...",
      "..x...x..",
      "......x..",
      "xxxxxx...",
      ".........",
      "xxxxxxxx.",
      "........x",
      ".....x..x",
      "......xx.",
    ],
  },
  Water: {
    color: "#1f8a8a",
    dark: "#0e4a4c",
    light: "#9fe0d6",
    glyph: [
      "....x....",
      "....x....",
      "...xxx...",
      "..xxxxx..",
      "..xlxxx..",
      ".xlxxxxx.",
      ".xlxxxdx.",
      "..xxxdx..",
      "...xxx...",
    ],
  },
  Earth: {
    color: "#a8702a",
    dark: "#5e3c12",
    light: "#e8c48a",
    glyph: [
      "...xxx...",
      "..xlllx..",
      ".xllxxxx.",
      "xlxxxxxdx",
      "xxxxxxddx",
      "xxxxxdddx",
      ".xxddddx.",
      "..xxxxx..",
    ],
  },
};

/** An element's look, or undefined for one the client does not know. */
export const elementLook = (element: string | undefined): ElementLook | undefined =>
  element ? ELEMENTS[element] : undefined;

/** The side of the square every glyph is drawn in, in its own pixels. */
export const GLYPH_SIZE = 10;
