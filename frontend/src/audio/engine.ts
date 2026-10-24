import { onSettings, readSettings, SoundSettings } from "./settings";

/**
 * The one AudioContext the game plays through, and the mixer behind it.
 *
 *   music ──┐                ┌──> compressor ──> speakers
 *           ├──> master ─────┘
 *   effects ┘       ▲
 *     │  │          │
 *     └──┴──> reverb┘   (both buses send a share to one hall)
 *
 * Every sound is synthesised on the spot: there is no audio file to fetch,
 * license or keep in step with the art, and the whole score weighs as much as
 * the code that describes it.
 *
 * Browsers, and iOS above all, refuse to start a context before the player
 * has touched the page. So nothing is created until the first touch, click or
 * key, and whatever asked for sound before that — the lobby's music, say — is
 * remembered and started then. Sounds that would have played before it are
 * simply dropped: a hit nobody could hear yet is not worth replaying late.
 */
export type Mixer = {
  ctx: AudioContext;
  music: GainNode;
  effects: GainNode;
  /** A white noise second, shared by every drum, footstep and whoosh. */
  noise: AudioBuffer;
};

let mixer: Mixer | null = null;
const waiting: ((mixer: Mixer) => void)[] = [];

/** The music bus sits lower than the effects: it is a bed, not the show. */
const MUSIC_HEADROOM = 0.42;

const apply = (settings: SoundSettings) => {
  if (!mixer) return;
  const { ctx, music, effects } = mixer;
  const t = ctx.currentTime;
  music.gain.setTargetAtTime(settings.muted ? 0 : settings.music * MUSIC_HEADROOM, t, 0.08);
  effects.gain.setTargetAtTime(settings.muted ? 0 : settings.effects, t, 0.05);
};

/** A hall's tail: stereo noise falling away over a couple of seconds. */
const impulse = (ctx: AudioContext, seconds: number, decay: number): AudioBuffer => {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
};

const build = (): Mixer | null => {
  const Context =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;

  const ctx = new Context({ latencyHint: "interactive" });
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(compressor);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.6, 2.8);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  reverb.connect(wet).connect(master);

  const bus = (send: number) => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const toHall = ctx.createGain();
    toHall.gain.value = send;
    gain.connect(toHall).connect(reverb);
    return gain;
  };

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  return { ctx, music: bus(0.45), effects: bus(0.22), noise };
};

/** The mixer, once the player has touched the page; null until then. */
export const getMixer = (): Mixer | null => (mixer && mixer.ctx.state === "running" ? mixer : null);

/** Runs `run` now if sound is ready, or as soon as it is. */
export const whenReady = (run: (mixer: Mixer) => void) => {
  const ready = getMixer();
  if (ready) run(ready);
  else waiting.push(run);
};

const unlock = () => {
  if (!mixer) {
    mixer = build();
    if (!mixer) return;
    apply(readSettings());
    onSettings(apply);
  }
  const { ctx } = mixer;
  if (ctx.state !== "running") {
    ctx.resume().then(flush, () => {});
  } else {
    flush();
  }
};

const flush = () => {
  if (!mixer || mixer.ctx.state !== "running") return;
  const ready = mixer;
  for (const run of waiting.splice(0)) run(ready);
};

let installed = false;

/**
 * Listens for the first gesture, and keeps the context asleep while the page
 * is hidden: a phone in a pocket should not go on playing a fight's drums,
 * and a context left running drains the battery for nothing.
 */
export const installAudio = () => {
  if (installed || typeof window === "undefined") return;
  installed = true;
  for (const event of ["pointerdown", "touchend", "keydown"]) {
    window.addEventListener(event, unlock, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (!mixer) return;
    if (document.hidden) mixer.ctx.suspend().catch(() => {});
    else mixer.ctx.resume().then(flush, () => {});
  });
};
