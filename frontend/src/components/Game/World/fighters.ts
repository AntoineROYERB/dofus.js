import { CREATURE_FEET, ROWS, artOf } from "../../../explore/sprites";
import { outfitSheet } from "../../../utils/fxManifest";
import { Animation, Direction, Figure, FigureFrame, FigureSpec, Pixels, checkFigure, guessFrame, loadFigure } from "../../../world/figures";

/**
 * Where a fighter's frames come from: its figure when one has been drawn
 * (public/figures), else its old sprite sheet, shrunk and guessed (see
 * guessFrame). Sheets are read into pixels once and kept.
 */

/** A hero stands about two cells tall; a creature of the bestiary fits in one. */
export const HERO_HEIGHT = 34;
export const CREATURE_HEIGHT = 13;

const pixels = new Map<string, Pixels | "loading" | "missing">();

const readPixels = (src: string): Pixels | null => {
  const hit = pixels.get(src);
  if (hit && hit !== "loading" && hit !== "missing") return hit;
  if (hit) return null;
  pixels.set(src, "loading");
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    pixels.set(src, { width: d.width, height: d.height, data: d.data });
  };
  img.onerror = () => pixels.set(src, "missing");
  img.src = src;
  return null;
};

/* ------------------------------ drawn figures ------------------------------ */

type Index = { figures: Record<string, string> };
let index: Index | "loading" | null = null;
const figures = new Map<string, Figure | "loading" | "broken">();

const figureIndex = (): Index | null => {
  if (index && index !== "loading") return index;
  if (index === "loading") return null;
  index = "loading";
  fetch("/figures/index.json")
    .then((r) => (r.ok ? r.json() : { figures: {} }))
    .then((j: Index) => (index = j))
    .catch(() => (index = { figures: {} }));
  return null;
};

const figureNamed = (name: string): Figure | null => {
  const hit = figures.get(name);
  if (hit === "broken" || hit === "loading") return null;
  if (hit) return hit;
  const sheet = readPixels(`/figures/${name}.png`);
  if (!sheet) return null;
  figures.set(name, "loading");
  fetch(`/figures/${name}.json`)
    .then((r) => r.json())
    .then((spec: FigureSpec) => {
      const errors = checkFigure(spec, sheet);
      if (errors.length) {
        console.warn(`figure ${name} refused:`, errors);
        figures.set(name, "broken");
      } else figures.set(name, loadFigure(spec, sheet));
    })
    .catch(() => figures.set(name, "broken"));
  return null;
};

/* ------------------------------ guessed frames ------------------------------ */

const guessed = new Map<string, FigureFrame>();

const OUTFIT = {
  idle: { sheet: "Idle", frames: 23, size: 256, fps: 12, rows: ROWS },
  walk: { sheet: "Walk", frames: 7, size: 256, fps: 10, rows: ROWS },
  attack: {
    sheet: "",
    frames: 6,
    size: 384,
    fps: 12,
    rows: { N: 0, NW: 1, W: 2, SW: 3, S: 4, SE: 5, E: 6, NE: 7 } as Record<Direction, number>,
  },
} as const;

const fromSheet = (
  src: string,
  key: string,
  box: { x: number; y: number; w: number; h: number; feetX: number; feetY: number },
  height: number
): FigureFrame | null => {
  const hit = guessed.get(key);
  if (hit) return hit;
  const sheet = readPixels(src);
  if (!sheet) return null;
  const frame = guessFrame(sheet, box, height);
  guessed.set(key, frame);
  return frame;
};

export type Pose = {
  /** A figure by its own name, for the preview page; otherwise found through the outfit or creature. */
  figure?: string;
  /** A figure's own animation, overriding the one read off `animation` (the preview's "hit"). */
  play?: Animation;
  outfit?: string;
  creature?: string;
  animation: "idle" | "walk" | "attack" | "die";
  attack?: "melee" | "ranged" | "none";
  direction: Direction;
  /** Seconds since the pose began, for the frame. */
  time: number;
};

/** The frame a fighter shows now, or null while its art is still loading. */
export const frameOf = (pose: Pose): FigureFrame | null => {
  const name = pose.creature ?? pose.outfit;
  const idx = figureIndex();
  const drawn = pose.figure ?? (name && idx ? idx.figures[name] : undefined);
  if (drawn) {
    const fig = figureNamed(drawn);
    if (fig) {
      const anim: Animation = pose.play ??
        (pose.animation === "walk" ? "walk" : pose.animation === "die" ? "fall" : pose.animation === "attack" ? (pose.attack === "melee" ? "melee" : pose.attack === "none" ? "idle" : "ranged") : "idle");
      const a = fig.spec.animations[anim];
      const k = anim === "fall" ? Math.min(a.frames - 1, Math.floor(pose.time * a.fps)) : Math.floor(pose.time * a.fps);
      return fig.frame(anim, pose.direction, k);
    }
  }
  if (pose.creature) {
    const art = artOf(pose.creature);
    const k = Math.floor(pose.time * 12) % 24;
    const row = ROWS[pose.direction];
    const height = Math.min(30, Math.round(CREATURE_HEIGHT * (art / 64)));
    return fromSheet(`/bestiary/${pose.creature}.png`, `c:${pose.creature}:${row}:${k}`, { x: k * art, y: row * art, w: art, h: art, feetX: art / 2, feetY: Math.round(art * CREATURE_FEET) }, height);
  }
  const pose2 = pose.animation === "die" || (pose.animation === "attack" && pose.attack === "none") ? "idle" : pose.animation;
  const o = OUTFIT[pose2];
  const sheetName = pose2 === "attack" ? (pose.attack === "melee" ? "AttackMelee" : "AttackRanged") : o.sheet;
  const src = pose.outfit ? outfitSheet(pose.outfit, sheetName as "Idle") : `/animation/${pose2 === "attack" ? "Attack" : o.sheet}.png`;
  const k = Math.floor(pose.time * o.fps) % o.frames;
  const row = o.rows[pose.direction];
  const feet = pose2 === "attack" ? 246 / 384 : 0.7;
  return fromSheet(src, `o:${src}:${row}:${k}`, { x: k * o.size, y: row * o.size, w: o.size, h: o.size, feetX: o.size / 2, feetY: Math.round(o.size * feet) }, HERO_HEIGHT);
};

/**
 * Forgets a figure's sheet and frames, so the next frame reads it again:
 * the preview page calls it when the file on disk changes.
 */
export const forgetFigure = (name: string): void => {
  figures.delete(name);
  pixels.delete(`/figures/${name}.png`);
};
