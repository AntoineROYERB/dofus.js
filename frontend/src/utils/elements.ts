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
  /**
   * Its colour for words written on the night page. `dark` was the text
   * colour on paper; on the Heart grimoire's night it all but vanished.
   */
  text: string;
  /** The icon, a pixel a letter: x its colour, d its shadow, l its light. */
  glyph: string[];
}

export const ELEMENTS: Record<string, ElementLook> = {
  Fire: {
    text: "#ff9a4a",
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
    text: "#7cc8ea",
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
    text: "#4fd0c4",
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
    text: "#e0a85c",
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
