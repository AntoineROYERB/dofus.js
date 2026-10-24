import { Mixer, whenReady } from "./engine";

/**
 * Recorded sounds: the cries and the spells' blasts.
 *
 * Everything else the game plays is synthesised, but a voice in pain and an
 * explosion are the two things synthesis could not make believable — a buzz
 * shaped into a vowel read as a machine, not as someone getting hurt. These
 * come from two free packs on OpenGameArt (credited in public/audio/CREDITS.md),
 * trimmed, mono for the voices and loudness-matched so none of them jumps out.
 *
 * They are fetched and decoded once, as soon as the player first touches the
 * page, which is long before the first blow lands. A sound asked for before
 * its file has arrived is simply skipped.
 */

/** Which cries each of the four recorded voices has, by how hard the blow was. */
export const CRIES: { light: string[]; heavy: string[]; death: string[] }[] = [
  {
    light: ["v1-yell9", "v1-yell16", "v1-yell1"],
    heavy: ["v1-yell15", "v1-yell6", "v1-yell14", "v1-yell7", "v1-yell8", "v1-yell13", "v1-yell11", "v1-yell10", "v1-yell4", "v1-yell5"],
    death: ["v1-yell2", "v1-yell3", "v1-yell12"],
  },
  {
    light: ["v2-yell1", "v2-yell10", "v2-yell9"],
    heavy: ["v2-yell7", "v2-yell2", "v2-yell3", "v2-yell11"],
    death: ["v2-yell8", "v2-yell4", "v2-yell5"],
  },
  {
    light: ["v3-grunt1", "v3-grunt2", "v3-grunt3", "v3-grunt4", "v3-grunt5", "v3-grunt6", "v3-yell3"],
    heavy: ["v3-yell4", "v3-yell5", "v3-yell8", "v3-yell7", "v3-yell12", "v3-yell15", "v3-yell14", "v3-yell11", "v3-yell2"],
    death: ["v3-yell10", "v3-yell1", "v3-yell6"],
  },
  {
    light: ["v4-yell13", "v4-yell12", "v4-yell6"],
    heavy: ["v4-yell7", "v4-yell9", "v4-yell3", "v4-yell4", "v4-yell8", "v4-yell5"],
    death: ["v4-yell2", "v4-yell10", "v4-yell11"],
  },
];

export const SPELL_SAMPLES = ["fire", "ice", "thunder", "water", "wind", "earth", "charge", "poison"] as const;
export type SpellSample = (typeof SPELL_SAMPLES)[number];

/** Where the recordings are served from; a page hosted elsewhere can point it at its own copy. */
let base = "/audio/";
export const setSampleBase = (url: string) => {
  base = url;
};

const urlOf = (name: string): string =>
  name.startsWith("v") && name.includes("-") ? `${base}cries/${name}.mp3` : `${base}spells/${name}.mp3`;

const buffers = new Map<string, AudioBuffer>();
let loading = false;

const load = async (m: Mixer, name: string) => {
  try {
    const response = await fetch(urlOf(name));
    if (!response.ok) return;
    buffers.set(name, await m.ctx.decodeAudioData(await response.arrayBuffer()));
  } catch {
    // A missing or undecodable file costs that one sound, never the fight.
  }
};

/** Starts fetching every recording; called once, on the first gesture. */
export const preloadSamples = () => {
  if (loading) return;
  loading = true;
  whenReady((m) => {
    const names = [...SPELL_SAMPLES, ...CRIES.flatMap((v) => [...v.light, ...v.heavy, ...v.death])];
    for (const name of names) void load(m, name);
  });
};

export type SampleOptions = {
  /** Where it sits across the speakers, -1 to 1. */
  pan?: number;
  gain?: number;
  /** Playback speed: below 1 is slower and lower, which is how a voice deepens. */
  rate?: number;
  /** Seconds to wait before it starts. */
  delay?: number;
  /** Cut it after this many seconds, with a short fade. */
  length?: number;
};

/** Plays a recording through `out`, or does nothing if it has not loaded. */
export const playSample = (m: Mixer, out: AudioNode, name: string, options: SampleOptions = {}) => {
  const buffer = buffers.get(name);
  if (!buffer) return;
  const { ctx } = m;
  const t = ctx.currentTime + 0.005 + (options.delay ?? 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = options.rate ?? 1;
  const amp = ctx.createGain();
  const gain = options.gain ?? 1;
  amp.gain.setValueAtTime(gain, t);
  source.connect(amp).connect(out);
  source.start(t);
  if (options.length !== undefined) {
    const end = t + options.length;
    amp.gain.setValueAtTime(gain, Math.max(t, end - 0.12));
    amp.gain.linearRampToValueAtTime(0, end);
    source.stop(end + 0.02);
  }
};

/** One of `names`, never the same one twice in a row for a given list. */
const last = new Map<string[], string>();
export const pick = (names: string[]): string => {
  if (names.length === 1) return names[0];
  let choice = names[Math.floor(Math.random() * names.length)];
  if (choice === last.get(names)) choice = names[(names.indexOf(choice) + 1) % names.length];
  last.set(names, choice);
  return choice;
};
