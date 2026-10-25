import type { Element } from "../vfx/spellFx";
import { getMixer, Mixer } from "./engine";
import { burst, frequencyOf, noise, thump } from "./voices";
import { CREATURES, CRIES, pick, playSample, SpellSample } from "./samples";

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

/**
 * What each element sounds like when it lands, from the recordings. Air in
 * this game is lightning as much as wind, so it lands as thunder.
 */
const BLAST: Record<Element, SpellSample> = { Fire: "fire", Air: "thunder", Water: "water", Earth: "earth" };

/** The thunder recording is quieter at its peak than the others; this evens them out. */
const LOUDNESS: Record<Element, number> = { Fire: 1, Air: 1.5, Water: 1.2, Earth: 1 };

/**
 * How fast the rush of air that carries each element is played: low and heavy
 * for earth, quick and high for air.
 */
const RUSH: Record<Element, number> = { Fire: 0.85, Air: 1.25, Water: 0.95, Earth: 0.7 };

/** The spell leaving its caster: a rush of air, and for an ultimate, a charge. */
export const playCast = ({ element, pan, heavy }: CastSound) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  playSample(m, out, "wind", { gain: 0.45, rate: RUSH[element], length: 0.45 });
  if (heavy) playSample(m, out, "charge", { gain: 0.5, length: 0.55, rate: 1.1 });
};

export type LandSound = CastSound & {
  /** Damage dealt, 0 for a spell that only moves or marks. */
  damage: number;
  crit: boolean;
};

/** The spell arriving where it was aimed: its element's blast. */
export const playImpact = ({ element, pan, heavy, damage, crit }: LandSound) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  // A spell that only moves or marks still lands, more quietly than a hit.
  const gain = damage > 0 ? Math.min(1, 0.75 + damage / 80) : 0.55;
  if (heavy) {
    // Slowed down, a blast becomes a bigger one; the earth's rumble under it
    // is the ground taking the weight.
    playSample(m, out, BLAST[element], { gain: 1, rate: 0.8 });
    if (element !== "Earth") playSample(m, out, "earth", { gain: 0.6, rate: 0.75 });
  } else {
    playSample(m, out, BLAST[element], { gain: gain * LOUDNESS[element], length: 1.4 });
  }
  // A critical shatters: the ice blast's crack, sped up, over the blow.
  if (crit) playSample(m, out, "ice", { gain: 0.55, rate: 1.35, length: 0.8 });
};

/**
 * A fighter's voice: which recorded voice, and how high it is played. A
 * creature growls and roars from its own recordings instead of a person's.
 */
export type CryVoice = { singer: number; rate: number; creature?: boolean };

const DEFAULT_VOICE: CryVoice = { singer: 0, rate: 1 };

/**
 * Below this much damage a fighter grunts; from it on they scream. It is low
 * on purpose: a hit should hurt, and only a burn's tick or a scratch is
 * shrugged off with a grunt.
 */
const SCREAM = 3;

/** A fighter crying out at a blow: a grunt for a scratch, a scream for the rest. */
export const playCry = (pan: number, amount: number, voice: CryVoice = DEFAULT_VOICE, delay = 0) => {
  const m = getMixer();
  if (!m) return;
  const set = CRIES[voice.singer % CRIES.length];
  const cry = voice.creature ? pick(CREATURES.hurt) : pick(amount < SCREAM ? set.light : set.heavy);
  playSample(m, outlet(m, pan), cry, {
    // A bigger blow is a louder cry, and a hint higher: the voice straining.
    gain: Math.min(1.25, 0.95 + amount / 60),
    rate: voice.rate * (amount >= 25 ? 1.06 : 1),
    delay,
  });
};

/** A fighter taking a blow: their cry, just after the spell lands so it is not swallowed. */
export const playHurt = (pan: number, amount: number, voice?: CryVoice) => playCry(pan, amount, voice, 0.07);

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

/** A fighter falling: a last scream, and the body landing. */
export const playDeath = (pan: number, voice: CryVoice = DEFAULT_VOICE) => {
  const m = getMixer();
  if (!m) return;
  const out = outlet(m, pan);
  const set = CRIES[voice.singer % CRIES.length];
  // A monster's last roar is played a little slower: the life going out of it.
  const cry = voice.creature ? pick(CREATURES.death) : pick(set.death);
  playSample(m, out, cry, { gain: 1, rate: voice.rate * (voice.creature ? 0.9 : 0.97) });
  // The earth blast, sped up and cut short, is a body hitting the ground.
  playSample(m, out, "earth", { gain: 0.45, rate: 1.5, delay: 0.75, length: 0.5 });
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
