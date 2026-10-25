import { Mixer } from "./engine";
import { Voice } from "./score";

/**
 * The instruments: each voice is a handful of oscillators, a filter and an
 * envelope, built for one note and left to the garbage collector once it has
 * stopped. They are deliberately small — the battle plays sixteenths over
 * drums and a choir, and a phone has to keep up.
 */

export const frequencyOf = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

type Play = (m: Mixer, out: AudioNode, t: number, f: number, v: number, seconds: number, midi: number) => void;

const gainAt = (ctx: BaseAudioContext, value = 0) => {
  const gain = ctx.createGain();
  gain.gain.value = value;
  return gain;
};

const osc = (ctx: BaseAudioContext, type: OscillatorType, f: number, detune = 0) => {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  return o;
};

/** A slice of the shared noise, through a filter. */
export const noise = (m: Mixer, t: number, seconds: number, type: BiquadFilterType, f: number, q = 1) => {
  const source = m.ctx.createBufferSource();
  source.buffer = m.noise;
  source.loop = true;
  const filter = m.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  filter.Q.value = q;
  source.connect(filter);
  // Start somewhere different every time, or every hat is the same hat.
  source.start(t, Math.random() * 0.8);
  source.stop(t + seconds + 0.05);
  return { source, filter };
};

/** A slow wobble of pitch, coming in after the attack like a player's would. */
const vibrato = (ctx: BaseAudioContext, targets: OscillatorNode[], t: number, seconds: number, cents: number, rate = 5.2) => {
  if (seconds < 0.3) return;
  const lfo = osc(ctx, "sine", rate);
  const depth = gainAt(ctx);
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + Math.min(0.35, seconds * 0.5));
  lfo.connect(depth);
  for (const target of targets) depth.connect(target.detune);
  lfo.start(t);
  lfo.stop(t + seconds + 0.3);
};

const run = (sources: (OscillatorNode | AudioBufferSourceNode)[], t: number, end: number) => {
  for (const s of sources) {
    s.start(t);
    s.stop(end);
  }
};

const pluck: Play = (m, out, t, f, v, seconds) => {
  const { ctx } = m;
  const ring = Math.max(0.5, seconds * 1.8);
  const body = osc(ctx, "triangle", f);
  const bite = osc(ctx, "sawtooth", f, 4);
  const biteGain = gainAt(ctx, 0.28);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(f * 9, 9000), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(f * 1.4, 200), t + 0.3);
  const amp = gainAt(ctx);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v * 0.5, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0008, t + ring);
  body.connect(filter);
  bite.connect(biteGain).connect(filter);
  filter.connect(amp).connect(out);
  run([body, bite], t, t + ring + 0.05);
};

const bell: Play = (m, out, t, f, v) => {
  const { ctx } = m;
  // A music box's tine: its partials are not quite harmonic, which is what
  // makes it a bell rather than an organ.
  [
    [1, 1, 1.8],
    [2.01, 0.32, 0.8],
    [3.98, 0.12, 0.4],
    [5.43, 0.05, 0.2],
  ].forEach(([ratio, level, decay]) => {
    const o = osc(ctx, "sine", f * ratio);
    const amp = gainAt(ctx);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(v * 0.32 * level, t + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    o.connect(amp).connect(out);
    run([o], t, t + decay + 0.05);
  });
};

const flute: Play = (m, out, t, f, v, seconds) => {
  const { ctx } = m;
  const tone = osc(ctx, "sine", f);
  const air = osc(ctx, "triangle", f * 2);
  const airGain = gainAt(ctx, 0.07);
  const amp = gainAt(ctx);
  const end = t + seconds;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v * 0.36, t + 0.05);
  amp.gain.setValueAtTime(v * 0.33, Math.max(t + 0.05, end - 0.04));
  amp.gain.exponentialRampToValueAtTime(0.0008, end + 0.18);
  tone.connect(amp);
  air.connect(airGain).connect(amp);
  amp.connect(out);
  vibrato(ctx, [tone, air], t, seconds, 14);
  run([tone, air], t, end + 0.2);
  // The breath at the start of each note.
  const { filter } = noise(m, t, 0.12, "bandpass", f * 2, 2);
  const breath = gainAt(ctx);
  breath.gain.setValueAtTime(v * 0.05, t);
  breath.gain.exponentialRampToValueAtTime(0.0005, t + 0.1);
  filter.connect(breath).connect(out);
};

const pad: Play = (m, out, t, f, v, seconds) => {
  const { ctx } = m;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1100;
  filter.Q.value = 0.4;
  const amp = gainAt(ctx);
  const end = t + seconds;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v * 0.1, t + Math.min(0.6, seconds * 0.4));
  amp.gain.setValueAtTime(v * 0.1, end);
  amp.gain.linearRampToValueAtTime(0, end + 0.8);
  const voices = [-9, 0, 9].map((d) => osc(ctx, "sawtooth", f, d));
  for (const o of voices) o.connect(filter);
  filter.connect(amp).connect(out);
  run(voices, t, end + 0.85);
};

const strings: Play = (m, out, t, f, v, seconds) => {
  const { ctx } = m;
  const held = seconds > 0.4;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(f * 5, 5000), t);
  filter.frequency.exponentialRampToValueAtTime(Math.min(f * 3, 3200), t + 0.15);
  const amp = gainAt(ctx);
  const end = t + seconds;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v * 0.2, t + (held ? 0.06 : 0.008));
  amp.gain.setTargetAtTime(v * 0.13, t + 0.02, held ? 0.3 : 0.04);
  amp.gain.setValueAtTime(v * 0.13, end);
  amp.gain.exponentialRampToValueAtTime(0.0008, end + (held ? 0.3 : 0.07));
  const voices = [-6, 6].map((d) => osc(ctx, "sawtooth", f, d));
  for (const o of voices) o.connect(filter);
  filter.connect(amp).connect(out);
  if (held) vibrato(ctx, voices, t, seconds, 10, 5.6);
  run(voices, t, end + 0.35);
};

const brass: Play = (m, out, t, f, v, seconds) => {
  const { ctx } = m;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1.6;
  // The blat of a horn: the filter opens fast, then settles back.
  filter.frequency.setValueAtTime(f * 1.2, t);
  filter.frequency.exponentialRampToValueAtTime(Math.min(f * 7, 6000), t + 0.07);
  filter.frequency.exponentialRampToValueAtTime(Math.min(f * 3.5, 3500), t + 0.3);
  const amp = gainAt(ctx);
  const end = t + seconds;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v * 0.24, t + 0.035);
  amp.gain.setTargetAtTime(v * 0.19, t + 0.06, 0.2);
  amp.gain.setValueAtTime(v * 0.19, end);
  amp.gain.exponentialRampToValueAtTime(0.0008, end + 0.18);
  const voices = [-5, 5].map((d) => osc(ctx, "sawtooth", f, d));
  for (const o of voices) o.connect(filter);
  filter.connect(amp).connect(out);
  vibrato(ctx, voices, t, seconds, 9, 5);
  run(voices, t, end + 0.2);
};

const choir: Play = (m, out, t, f, v, seconds) => {
  const { ctx } = m;
  const amp = gainAt(ctx);
  const end = t + seconds;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v * 0.5, t + Math.min(0.45, seconds * 0.4));
  amp.gain.setValueAtTime(v * 0.5, end);
  amp.gain.linearRampToValueAtTime(0, end + 0.7);
  const voices = [-12, 0, 11].map((d) => osc(ctx, "sawtooth", f, d));
  // Two formants of an open "ah": what turns a buzz into a voice.
  for (const [formant, q, level] of [[750, 5, 1], [1150, 6, 0.6], [2600, 8, 0.2]]) {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = formant;
    band.Q.value = q;
    const share = gainAt(ctx, level);
    for (const o of voices) o.connect(band);
    band.connect(share).connect(amp);
  }
  amp.connect(out);
  vibrato(ctx, voices, t, seconds, 12, 5.4);
  run(voices, t, end + 0.75);
};

const bass: Play = (m, out, t, f, v, seconds) => {
  const { ctx } = m;
  const tri = osc(ctx, "triangle", f);
  const sub = osc(ctx, "sine", f);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const amp = gainAt(ctx);
  const end = t + seconds;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v * 0.42, t + 0.006);
  amp.gain.setTargetAtTime(v * 0.26, t + 0.01, Math.max(0.1, seconds * 0.4));
  amp.gain.setValueAtTime(v * 0.26, end);
  amp.gain.exponentialRampToValueAtTime(0.0008, end + 0.08);
  tri.connect(filter);
  sub.connect(filter);
  filter.connect(amp).connect(out);
  run([tri, sub], t, end + 0.1);
};

/** A falling sine: the body of every drum from a kick to a taiko. */
export const thump = (m: Mixer, out: AudioNode, t: number, from: number, to: number, fall: number, v: number, ring: number) => {
  const { ctx } = m;
  const o = osc(ctx, "sine", from);
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + fall);
  const amp = gainAt(ctx);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0008, t + ring);
  o.connect(amp).connect(out);
  run([o], t, t + ring + 0.05);
};

/** A burst of filtered noise with a sharp attack and an exponential tail. */
export const burst = (m: Mixer, out: AudioNode, t: number, type: BiquadFilterType, f: number, v: number, ring: number, q = 1) => {
  const { filter } = noise(m, t, ring, type, f, q);
  const amp = gainAt(m.ctx);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v, t + 0.003);
  amp.gain.exponentialRampToValueAtTime(0.0008, t + ring);
  filter.connect(amp).connect(out);
};

const taiko: Play = (m, out, t, _f, v) => {
  thump(m, out, t, 150, 46, 0.22, v * 0.95, 0.75);
  thump(m, out, t, 300, 120, 0.05, v * 0.2, 0.12);
  burst(m, out, t, "lowpass", 900, v * 0.35, 0.09);
};

const kick: Play = (m, out, t, _f, v) => thump(m, out, t, 140, 48, 0.1, v * 0.85, 0.32);

const snare: Play = (m, out, t, _f, v) => {
  burst(m, out, t, "highpass", 1400, v * 0.45, 0.15);
  thump(m, out, t, 220, 160, 0.05, v * 0.28, 0.08);
};

const hat: Play = (m, out, t, _f, v) => burst(m, out, t, "highpass", 7500, v * 0.3, 0.045);

const cymbal: Play = (m, out, t, _f, v, seconds, midi) => {
  const { ctx } = m;
  const { filter } = noise(m, t, seconds + 0.2, "highpass", 4800, 0.7);
  const amp = gainAt(ctx);
  if (midi === 1) {
    // A swell, rising into whatever comes next.
    amp.gain.setValueAtTime(0.0008, t);
    amp.gain.exponentialRampToValueAtTime(v * 0.3, t + seconds);
    amp.gain.linearRampToValueAtTime(0, t + seconds + 0.05);
  } else {
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(v * 0.3, t + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(1.2, seconds));
  }
  filter.connect(amp).connect(out);
};

const bird: Play = (m, out, t, f, v) => {
  const { ctx } = m;
  // Two to four quick chirps, each a little higher and a little faster.
  const o = osc(ctx, "sine", f);
  const amp = gainAt(ctx);
  const chirps = 2 + Math.floor(Math.random() * 3);
  let at = t;
  for (let i = 0; i < chirps; i++) {
    const length = 0.05 + Math.random() * 0.04;
    o.frequency.setValueAtTime(f * (0.9 + i * 0.05), at);
    o.frequency.exponentialRampToValueAtTime(f * (1.35 + i * 0.05), at + length * 0.6);
    o.frequency.exponentialRampToValueAtTime(f * 1.05, at + length);
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(v * 0.12, at + 0.01);
    amp.gain.linearRampToValueAtTime(0, at + length);
    at += length + 0.03 + Math.random() * 0.05;
  }
  o.connect(amp).connect(out);
  run([o], t, at + 0.05);
};

const cricket: Play = (m, out, t, _f, v, seconds) => {
  const { ctx } = m;
  const o = osc(ctx, "sine", 4300 + Math.random() * 500);
  const amp = gainAt(ctx);
  amp.gain.setValueAtTime(0, t);
  // Groups of three pulses, twice a second, for as long as the note lasts.
  for (let at = t; at < t + seconds; at += 0.5) {
    for (let p = 0; p < 3; p++) {
      const start = at + p * 0.045;
      amp.gain.setValueAtTime(v * 0.1, start);
      amp.gain.setValueAtTime(0, start + 0.025);
    }
  }
  o.connect(amp).connect(out);
  run([o], t, t + seconds + 0.1);
};

const VOICES: Record<Voice, Play> = {
  pluck, bell, flute, pad, strings, brass, choir, bass,
  taiko, kick, snare, hat, cymbal, bird, cricket,
};

/** Plays one note of the score, `seconds` long, starting at context time `t`. */
export const playNote = (m: Mixer, out: AudioNode, voice: Voice, t: number, midi: number, velocity: number, seconds: number) =>
  VOICES[voice](m, out, t, frequencyOf(midi), velocity, seconds, midi);
