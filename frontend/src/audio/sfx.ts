import type { Element } from "../vfx/spellFx";
import { getMixer, Mixer } from "./engine";
import { burst, frequencyOf, noise, thump } from "./voices";

/**
 * Every sound the game makes that is not music. Each one answers something
 * that just happened on screen, and each element has its own voice the way it
 * has its own colour: fire roars, air whistles and cracks, water splashes,
 * earth grinds and lands.
 *
 * All of them are fire-and-forget and silently do nothing until the player
 * has touched the page (see engine.ts).
 */

export type Surface = "grass" | "dirt" | "stone" | "sand" | "water" | "ice";

/** Where on the stereo field a sound sits, -1 left to 1 right. */
const outlet = (m: Mixer, pan: number): AudioNode => {
  const panner = m.ctx.createStereoPanner();
  panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));
  panner.connect(m.effects);
  return panner;
};

const gainAt = (ctx: BaseAudioContext, value = 0) => {
  const gain = ctx.createGain();
  gain.gain.value = value;
  return gain;
};

/** Noise through a filter whose frequency sweeps, with its own envelope. */
const sweep = (
  m: Mixer,
  out: AudioNode,
  t: number,
  type: BiquadFilterType,
  from: number,
  to: number,
  seconds: number,
  v: number,
  q = 1,
  attack = 0.01
) => {
  const { filter } = noise(m, t, seconds, type, from, q);
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + seconds);
  const amp = gainAt(m.ctx);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v, t + attack);
  amp.gain.exponentialRampToValueAtTime(0.0008, t + seconds);
  filter.connect(amp).connect(out);
};

/** A pitched oscillator gliding from one frequency to another. */
const glide = (
  m: Mixer,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  from: number,
  to: number,
  seconds: number,
  v: number
) => {
  const o = m.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + seconds);
  const amp = gainAt(m.ctx);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v, t + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0008, t + seconds);
  o.connect(amp).connect(out);
  o.start(t);
  o.stop(t + seconds + 0.05);
};

const tone = (m: Mixer, out: AudioNode, t: number, f: number, v: number, ring: number, type: OscillatorType = "sine") =>
  glide(m, out, t, type, f, f * 0.999, ring, v);

/** Fire's crackle: a scatter of tiny clicks after the blast. */
const crackle = (m: Mixer, out: AudioNode, t: number, count: number, spread: number, v: number) => {
  for (let i = 0; i < count; i++) {
    burst(m, out, t + Math.random() * spread, "highpass", 2500 + Math.random() * 3000, v * (0.4 + Math.random() * 0.6), 0.012);
  }
};

const bubbles = (m: Mixer, out: AudioNode, t: number, count: number, v: number) => {
  for (let i = 0; i < count; i++) {
    const f = 380 + Math.random() * 600;
    glide(m, out, t + Math.random() * 0.3, "sine", f, f * 1.9, 0.06, v * 0.25);
  }
};

/* ------------------------------------------------------------------ */
/* Casting and landing                                                 */
/* ------------------------------------------------------------------ */

export type CastSound = {
  element: Element;
  /** -1 to 1, where the caster stands across the screen. */
  pan: number;
  /** An ultimate, a quake, a meteor, a legendary stepping in: bigger, longer. */
  heavy: boolean;
};

/** The spell leaving its caster. */
export const playCast = ({ element, pan, heavy }: CastSound) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.01;
  const big = heavy ? 1.5 : 1;
  switch (element) {
    case "Fire":
      sweep(m, out, t, "bandpass", 300, 2200, 0.32 * big, 0.5, 1.2, 0.08);
      thump(m, out, t, 90, 45, 0.25, 0.35, 0.35 * big);
      break;
    case "Air":
      sweep(m, out, t, "bandpass", 900, 3800, 0.35 * big, 0.45, 9, 0.12);
      sweep(m, out, t, "highpass", 3000, 6000, 0.2, 0.12);
      break;
    case "Water":
      sweep(m, out, t, "lowpass", 500, 2600, 0.3 * big, 0.55, 2, 0.06);
      bubbles(m, out, t, 3, 0.6);
      break;
    case "Earth":
      sweep(m, out, t, "lowpass", 220, 700, 0.35 * big, 0.65, 1.5, 0.05);
      thump(m, out, t, 70, 38, 0.3, 0.45, 0.45 * big);
      break;
  }
  if (heavy) {
    // The air drawn in before something large: a swell under the element.
    sweep(m, out, t, "bandpass", 200, 1200, 0.6, 0.35, 0.8, 0.5);
  }
};

export type LandSound = CastSound & {
  /** Damage dealt, 0 for a spell that only moves or marks. */
  damage: number;
  crit: boolean;
};

/** The spell arriving where it was aimed. */
export const playImpact = ({ element, pan, heavy, damage, crit }: LandSound) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.01;
  // Louder for a bigger number, but a scratch is still heard.
  const v = Math.min(1, 0.55 + damage / 60) * (heavy ? 1.25 : 1);
  const ring = heavy ? 1.6 : 1;
  switch (element) {
    case "Fire":
      sweep(m, out, t, "lowpass", 3200, 260, 0.55 * ring, 0.6 * v, 0.8, 0.004);
      thump(m, out, t, 110, 40, 0.2, 0.55 * v, 0.45 * ring);
      crackle(m, out, t + 0.05, heavy ? 22 : 12, 0.5 * ring, 0.25 * v);
      break;
    case "Air":
      glide(m, out, t, "square", 2400, 160, 0.13, 0.12 * v);
      sweep(m, out, t, "highpass", 6000, 2000, 0.18 * ring, 0.5 * v, 0.7, 0.002);
      thump(m, out, t, 180, 60, 0.1, 0.35 * v, 0.25);
      break;
    case "Water":
      sweep(m, out, t, "lowpass", 3800, 500, 0.45 * ring, 0.55 * v, 1, 0.004);
      bubbles(m, out, t + 0.05, heavy ? 10 : 6, v);
      thump(m, out, t, 130, 70, 0.1, 0.3 * v, 0.2);
      break;
    case "Earth":
      thump(m, out, t, 130, 34, 0.3, 0.8 * v, 0.6 * ring);
      sweep(m, out, t, "lowpass", 1400, 180, 0.4 * ring, 0.5 * v, 0.9, 0.004);
      crackle(m, out, t + 0.03, 6, 0.25, 0.18 * v);
      break;
  }
  if (crit) {
    // A critical rings: a struck metal shimmer over the blow.
    tone(m, out, t, 1244, 0.12, 0.7);
    tone(m, out, t + 0.01, 1865, 0.08, 0.55);
    tone(m, out, t + 0.02, 2490, 0.05, 0.4);
  }
  if (heavy) {
    thump(m, out, t, 80, 28, 0.6, 0.6, 1.4);
    sweep(m, out, t + 0.05, "lowpass", 900, 120, 1.4, 0.3, 0.7, 0.05);
  }
};

/** A fighter taking a blow: the body, under the spell's own impact. */
export const playHurt = (pan: number, amount: number) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.01;
  const v = Math.min(1, 0.4 + amount / 50);
  thump(m, out, t, 210, 85, 0.1, 0.45 * v, 0.18);
  burst(m, out, t, "bandpass", 1600, 0.3 * v, 0.06, 1.2);
};

/** Health coming back: a rising sparkle. */
export const playHeal = (pan: number) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.01;
  [84, 88, 91, 96].forEach((midi, i) => tone(m, out, t + i * 0.06, frequencyOf(midi), 0.09, 0.6));
  sweep(m, out, t, "highpass", 5000, 9000, 0.4, 0.06, 0.7, 0.1);
};

/** A shield taking hold: a glassy shimmer. */
export const playShield = (pan: number) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.01;
  tone(m, out, t, 660, 0.09, 0.5, "triangle");
  tone(m, out, t + 0.04, 990, 0.07, 0.45, "triangle");
  tone(m, out, t + 0.08, 1320, 0.05, 0.4, "triangle");
};

/** Action or movement points taken away: something drained, falling. */
export const playDrain = (pan: number) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.01;
  glide(m, out, t, "triangle", 880, 220, 0.22, 0.14);
  glide(m, out, t + 0.05, "sine", 660, 165, 0.22, 0.08);
};

/** A fighter falling. */
export const playDeath = (pan: number) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.01;
  glide(m, out, t, "sawtooth", 330, 55, 0.9, 0.09);
  glide(m, out, t, "sine", 220, 40, 1.1, 0.25);
  thump(m, out, t + 0.35, 120, 35, 0.25, 0.6, 0.6);
  sweep(m, out, t + 0.35, "lowpass", 900, 150, 0.4, 0.3, 0.8, 0.004);
};

/** A body thrown across the board, or one leaping. */
export const playWhoosh = (pan: number) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.01;
  sweep(m, out, t, "bandpass", 400, 1800, 0.3, 0.35, 2, 0.12);
};

/* ------------------------------------------------------------------ */
/* Feet                                                                */
/* ------------------------------------------------------------------ */

let stride = 0;

/** One step onto `surface`. Left and right feet differ a little, as they do. */
export const playStep = (surface: Surface, pan = 0) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const t = m.ctx.currentTime + 0.005;
  stride += 1;
  const foot = stride % 2 === 0 ? 1 : 0.88;
  const jitter = 0.9 + Math.random() * 0.2;
  switch (surface) {
    case "grass":
      sweep(m, out, t, "lowpass", 1400 * foot * jitter, 500, 0.09, 0.22, 0.7, 0.012);
      sweep(m, out, t + 0.01, "highpass", 4000, 3000, 0.05, 0.04);
      break;
    case "dirt":
      sweep(m, out, t, "lowpass", 900 * foot * jitter, 300, 0.08, 0.25, 0.8, 0.006);
      thump(m, out, t, 130 * foot, 70, 0.05, 0.18, 0.08);
      break;
    case "stone":
      burst(m, out, t, "bandpass", 2300 * foot * jitter, 0.22, 0.04, 2.5);
      thump(m, out, t, 260 * foot, 140, 0.03, 0.16, 0.06);
      break;
    case "sand":
      sweep(m, out, t, "bandpass", 3200 * jitter, 1800, 0.12, 0.14, 0.6, 0.03);
      break;
    case "water":
      sweep(m, out, t, "lowpass", 2600 * jitter, 500, 0.18, 0.3, 1, 0.005);
      bubbles(m, out, t + 0.02, 2, 0.5);
      break;
    case "ice":
      burst(m, out, t, "highpass", 4200 * jitter, 0.18, 0.03);
      tone(m, out, t, 2800 * foot, 0.03, 0.12);
      break;
  }
};

/* ------------------------------------------------------------------ */
/* The frame                                                           */
/* ------------------------------------------------------------------ */

/** Your turn has come: two notes of a bell, rising. */
export const playTurnChime = () => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, 0);
  const t = m.ctx.currentTime + 0.01;
  tone(m, out, t, frequencyOf(81), 0.16, 0.9);
  tone(m, out, t, frequencyOf(81) * 2.01, 0.04, 0.4);
  tone(m, out, t + 0.14, frequencyOf(86), 0.18, 1.2);
  tone(m, out, t + 0.14, frequencyOf(86) * 2.01, 0.05, 0.5);
};

/** The pitch each element's spells are picked up at. */
const PICK: Record<Element, number> = { Fire: 76, Air: 81, Water: 72, Earth: 67 };

/** A spell picked up from the bar, ready to aim. */
export const playSelect = (element?: string) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, 0);
  const t = m.ctx.currentTime + 0.005;
  const f = frequencyOf(PICK[element as Element] ?? 79);
  glide(m, out, t, "triangle", f, f * 1.5, 0.08, 0.12);
  tone(m, out, t + 0.04, f * 1.5, 0.06, 0.2);
};

/** A plain tap on the frame: a button, a toggle. */
export const playTap = () => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, 0);
  const t = m.ctx.currentTime + 0.005;
  glide(m, out, t, "sine", 1400, 900, 0.04, 0.1);
};
