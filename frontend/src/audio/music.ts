import { getMixer, Mixer, whenReady } from "./engine";
import { Note, STINGER_BPM, STINGERS, StingerId, TrackId, TRACKS } from "./score";
import { playNote } from "./voices";

/**
 * Plays the score: one track at a time, crossfading when the screen asks for
 * another.
 *
 * Notes are scheduled a quarter of a second ahead on the audio clock, from a
 * timer that only has to wake often enough to stay ahead. Scheduling on the
 * audio clock is what keeps a drum on the beat when the main thread is busy
 * drawing a spell; a timer that played each note itself would drift by
 * however long the last frame took.
 */

const LOOKAHEAD = 0.25;
const TICK_MS = 50;
const FADE = 1.6;

type Playing = {
  id: TrackId;
  out: GainNode;
  bar: number;
  /** Context time at which the next bar starts. */
  at: number;
};

let wanted: TrackId | null = null;
let playing: Playing | null = null;
let intensity = 1;
let timer: number | undefined;

const schedule = (m: Mixer, p: Playing, notes: Note[], start: number, secondsPerBeat: number) => {
  for (const note of notes) {
    playNote(m, p.out, note.voice, start + note.beat * secondsPerBeat, note.midi, note.velocity, note.length * secondsPerBeat);
  }
};

const tick = () => {
  const m = getMixer();
  if (!m || !playing) return;
  const track = TRACKS[playing.id];
  const secondsPerBeat = 60 / track.bpm;
  const now = m.ctx.currentTime;
  // A page that was throttled in the background comes back far behind: start
  // again from now rather than firing every missed bar at once.
  if (playing.at < now) playing.at = now + 0.05;
  while (playing.at < now + LOOKAHEAD) {
    schedule(m, playing, track.bar(playing.bar, intensity), playing.at, secondsPerBeat);
    playing.at += track.beatsPerBar * secondsPerBeat;
    playing.bar += 1;
  }
};

const fadeOut = (m: Mixer, p: Playing) => {
  const t = m.ctx.currentTime;
  p.out.gain.cancelScheduledValues(t);
  p.out.gain.setValueAtTime(p.out.gain.value, t);
  p.out.gain.linearRampToValueAtTime(0, t + FADE);
  window.setTimeout(() => p.out.disconnect(), (FADE + 4) * 1000);
};

const start = (m: Mixer) => {
  if (playing?.id === wanted) return;
  if (playing) fadeOut(m, playing);
  playing = null;
  if (!wanted) return;

  const out = m.ctx.createGain();
  const t = m.ctx.currentTime;
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(TRACKS[wanted].gain, t + FADE * 0.6);
  out.connect(m.music);
  playing = { id: wanted, out, bar: 0, at: t + 0.1 };
  if (timer === undefined) timer = window.setInterval(tick, TICK_MS);
  tick();
};

/**
 * Asks for a track, or for silence. Asking for the track already playing
 * changes nothing, so every screen can simply say what it wants on mount.
 */
export const playMusic = (id: TrackId | null) => {
  wanted = id;
  whenReady((m) => start(m));
};

/** How hard the battle plays; read at the top of every bar, so it changes on the beat. */
export const setIntensity = (level: number) => {
  intensity = level;
};

/** A phrase played once over the music, on the music's volume. */
export const playStinger = (id: StingerId) => {
  const m = getMixer();
  if (!m) return;
  const out = m.ctx.createGain();
  out.gain.value = 1.15;
  out.connect(m.music);
  const secondsPerBeat = 60 / STINGER_BPM;
  const t = m.ctx.currentTime + 0.05;
  for (const note of STINGERS[id]) {
    playNote(m, out, note.voice, t + note.beat * secondsPerBeat, note.midi, note.velocity, note.length * secondsPerBeat);
  }
  window.setTimeout(() => out.disconnect(), 9000);
};
