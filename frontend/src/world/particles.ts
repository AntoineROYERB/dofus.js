import { Rgb, windAt } from "./ascii";
import { Look } from "./layout";
import { indexOfGlyph } from "./materials";
import { generator } from "./seed";

/**
 * The island's air: fireflies, dust, drizzle, snow, petals, spores, embers,
 * and leaves coming loose from the trees. Each is one glyph, moved on real
 * time so it drifts as smoothly at 120 Hz as at 60, and blown by the same
 * wind as the grass.
 */

type Kind = Look["ambient"] | "leaf";

type Mote = { x: number; y: number; vx: number; vy: number; age: number; life: number; kind: Kind; seed: number };

export type Air = { motes: Mote[]; rand: () => number; colors: Record<Kind, Rgb>; look: Look; trees: { x: number; y: number }[] };

const COUNT: Record<Look["ambient"], number> = {
  firefly: 46,
  dust: 90,
  drizzle: 110,
  snow: 80,
  petal: 70,
  spore: 70,
  ember: 90,
};

const GLYPHS: Record<Kind, string> = {
  firefly: "*.",
  dust: ".'",
  drizzle: "/'",
  snow: "*.",
  petal: ",`",
  spore: "o°.",
  ember: "*'.",
  leaf: "`',",
};

export const newAir = (look: Look, seed: number, colors: Record<Kind, Rgb>, trees: { x: number; y: number }[]): Air => ({
  motes: [],
  rand: generator(seed ^ 0x5eed),
  colors,
  look,
  trees,
});

const spawn = (air: Air, kind: Kind, view: { left: number; top: number; right: number; bottom: number }, anywhere: boolean): Mote => {
  const r = air.rand;
  const w = view.right - view.left;
  const h = view.bottom - view.top;
  let x = view.left + r() * w;
  let y = anywhere ? view.top + r() * h : view.top - 4;
  let vx = 0;
  let vy = 0;
  let life = 6 + r() * 6;
  switch (kind) {
    case "firefly":
      y = view.top + r() * h;
      life = 3 + r() * 5;
      break;
    case "dust":
      if (!anywhere) x = view.left - 4;
      y = view.top + r() * h;
      vx = 6 + r() * 6;
      vy = (r() - 0.5) * 2;
      break;
    case "drizzle":
      vx = 18;
      vy = 70 + r() * 20;
      life = 3;
      break;
    case "snow":
      vx = 4;
      vy = 8 + r() * 6;
      life = 20;
      break;
    case "petal":
      vx = 10 + r() * 5;
      vy = 6 + r() * 4;
      life = 16;
      break;
    case "spore":
    case "ember":
      if (!anywhere) y = view.bottom + 4;
      vx = (r() - 0.5) * 3;
      vy = -(5 + r() * 7);
      life = 8 + r() * 6;
      break;
    case "leaf": {
      const t = air.trees[Math.floor(r() * air.trees.length)];
      if (t) {
        x = t.x + (r() - 0.5) * 20;
        y = t.y - 30 - r() * 14;
      }
      vx = 6;
      vy = 9 + r() * 4;
      life = 9;
      break;
    }
  }
  return { x, y, vx, vy, age: anywhere ? r() * life : 0, life, kind, seed: Math.floor(r() * 1e6) };
};

/** Moves the air on by `dt` seconds. */
export const stepAir = (air: Air, dt: number, t: number, view: { left: number; top: number; right: number; bottom: number }) => {
  const want = COUNT[air.look.ambient];
  const leaves = air.look.leaves && air.trees.length ? 10 : 0;
  const ambient = air.motes.filter((m) => m.kind !== "leaf").length;
  for (let k = ambient; k < want; k++) air.motes.push(spawn(air, air.look.ambient, view, air.motes.length < want));
  if (air.motes.length - ambient < leaves && air.rand() < dt * 1.5) air.motes.push(spawn(air, "leaf", view, false));
  const margin = 24;
  air.motes = air.motes.filter((m) => {
    m.age += dt;
    const gust = windAt(m.x, m.y, t) - 0.5;
    switch (m.kind) {
      case "firefly":
        m.vx = Math.sin(t * 0.9 + m.seed) * 4;
        m.vy = Math.cos(t * 1.1 + m.seed * 0.7) * 3;
        break;
      case "leaf":
      case "petal":
      case "snow":
        m.x += Math.sin(t * 2 + m.seed) * dt * 6;
        break;
    }
    m.x += (m.vx + gust * 14) * dt;
    m.y += m.vy * dt;
    return (
      m.age < m.life &&
      m.x > view.left - margin &&
      m.x < view.right + margin &&
      m.y > view.top - margin * 2 &&
      m.y < view.bottom + margin
    );
  });
};

/** A mote's glyph and colour this instant; null while it is dark (a firefly between blinks). */
export const lookOfMote = (air: Air, m: Mote, t: number): { glyph: number; color: Rgb } | null => {
  const g = GLYPHS[m.kind];
  let k = 1;
  if (m.kind === "firefly") {
    k = Math.max(0, Math.sin(t * 2.2 + m.seed));
    if (k < 0.2) return null;
  }
  if (m.kind === "ember") k = 0.7 + 0.3 * Math.sin(t * 9 + m.seed);
  // Fade in and out over the first and last half second, in two steps.
  const edge = Math.min(m.age, m.life - m.age);
  if (edge < 0.25) return null;
  if (edge < 0.5) k *= 0.6;
  const c = air.colors[m.kind];
  return { glyph: indexOfGlyph(g[(m.seed + Math.floor(t * 3)) % g.length]), color: [c[0] * k, c[1] * k, c[2] * k] };
};

export type { Mote, Kind };
