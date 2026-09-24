import { recoloredSheet, targetHueFor } from "../utils/spriteRecolor";
import { Direction } from "../components/Game/SpriteAnimation";

/**
 * The sprites the world draws itself: the bestiary's creatures and bosses,
 * and the hero. They go onto the world's own pixel canvas rather than into
 * elements laid over it, so they sit on the same pixel grid as the ground and
 * pass behind a tree the way the tree's own ink would.
 *
 * Every sheet is 24 frames wide by 8 directions tall. The bestiary's frames
 * are 64 pixels (128 for a boss, 160 for the legendary one); the hero's are
 * 256 pixels drawn in blocks of 4, which is the same 64-pixel grid scaled up —
 * drawn at a quarter of its size it lands exactly on the others.
 */

const images = new Map<string, HTMLImageElement>();

const image = (src: string): HTMLImageElement | null => {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
};

/** Rows of every sheet, by the direction the sprite faces. */
export const ROWS: Record<Direction, number> = { NW: 0, W: 1, SW: 2, S: 3, SE: 4, E: 5, NE: 6, N: 7 };

export const FRAMES = 24;

/** A frame's side, in pixels of art. */
export const artOf = (name: string): number =>
  name.startsWith("legend") ? 160 : name.startsWith("boss") ? 128 : 64;

/** Where the feet are inside a bestiary frame, as a share of its height. */
export const CREATURE_FEET = 0.78;

export const creatureSheet = (name: string): HTMLImageElement | null => image(`/bestiary/${name}.png`);

/*
 * The hero's sheets, dyed to the player's colour the way the fight dyes them,
 * with the same cache — the dye is worked out once per sheet and colour.
 */
const HERO = {
  idle: { src: "/animation/Idle.png", frames: 23 },
  walk: { src: "/animation/Walk.png", frames: 7 },
};
export const HERO_FRAME = 256;
export const HERO_FEET = 0.7;

export const heroSheet = (
  pose: "idle" | "walk",
  color?: string
): { sheet: CanvasImageSource; frames: number } | null => {
  const { src, frames } = HERO[pose];
  const img = image(src);
  if (!img) return null;
  return { sheet: color ? recoloredSheet(img, src, targetHueFor(color)) : img, frames };
};
