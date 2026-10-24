/**
 * The game's music, written down as data.
 *
 * Nothing here makes a sound. A track is a function from a bar number to the
 * notes that bar holds, so the music can be read, tested and changed without
 * an AudioContext, and music.ts only has to turn notes into oscillators. The
 * melodies are written out by hand rather than generated: a random walk over a
 * scale is easy to make and tiring to hear, and these loop for as long as a
 * player stays on a screen.
 *
 * - overworld: the lobby and the open world by day. Major, bouncing bass,
 *   plucked arpeggios and a wooden flute, after Terraria's daytime themes.
 * - night: the open world after dark. Slow and minor, a flute and a music box
 *   over a pad, crickets instead of birds.
 * - battle: every fight. D minor at a gallop, taiko drums, string ostinato,
 *   horns and a choir, after the epic fight themes of Dofus. Its intensity
 *   rises from the placement phase to the fight to a fighter close to falling.
 */

export type Voice =
  | "pluck"
  | "bell"
  | "flute"
  | "pad"
  | "strings"
  | "brass"
  | "choir"
  | "bass"
  | "taiko"
  | "kick"
  | "snare"
  | "hat"
  | "cymbal"
  | "bird"
  | "cricket";

export type Note = {
  voice: Voice;
  /** When it starts, in beats from the top of its bar. */
  beat: number;
  /** How long it is held, in beats. */
  length: number;
  /** MIDI pitch; drums read it as a hint of tuning or ignore it. */
  midi: number;
  /** 0 to 1. */
  velocity: number;
};

export type TrackId = "overworld" | "night" | "battle";

export type Track = {
  id: TrackId;
  bpm: number;
  beatsPerBar: number;
  /** Every pitch class the track's harmony allows, 0 for C. */
  scale: number[];
  /**
   * The notes of a bar. `intensity` only means something to the battle: 0
   * while fighters are being placed, 1 once the fight is on, 2 when someone
   * is about to fall.
   */
  bar: (index: number, intensity: number) => Note[];
};

/* ------------------------------------------------------------------ */
/* Pitches and chords                                                  */
/* ------------------------------------------------------------------ */

const PITCH: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/** "F#5" → 78. Middle C is C4, 60. */
export const midiOf = (name: string): number => {
  const match = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!match || PITCH[match[1]] === undefined) throw new Error(`not a pitch: ${name}`);
  return PITCH[match[1]] + (Number(match[2]) + 1) * 12;
};

/** A chord as its root in octave 3 and the intervals above it. */
type Chord = { root: number; tones: number[] };

const MAJOR = [0, 4, 7];
const MINOR = [0, 3, 7];
const chord = (root: string, tones = MAJOR): Chord => ({ root: midiOf(`${root}3`), tones });

/** A phrase: one array of [beat, length, pitch] per bar. */
type Phrase = [number, number, string][][];

const play = (voice: Voice, phrase: [number, number, string][], velocity: number, shift = 0): Note[] =>
  phrase.map(([beat, length, name]) => ({ voice, beat, length, midi: midiOf(name) + shift, velocity }));

/** The chord's own tones, spread upwards over `count` notes from `octave` above its root. */
const spread = (c: Chord, count: number, octave = 0): number[] =>
  Array.from({ length: count }, (_, i) => {
    const tone = c.tones[i % c.tones.length];
    return c.root + 12 * octave + tone + 12 * Math.floor(i / c.tones.length);
  });

/**
 * A number in [0, 1) that depends only on its inputs. The birds and crickets
 * must not sing at exactly the same beat of every loop, but a track is also a
 * pure function of its bar, so they draw from this rather than Math.random.
 */
export const hash = (...values: number[]): number => {
  let h = 2166136261;
  for (const v of values) {
    h ^= Math.floor(v * 1000) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 100000) / 100000;
};

/* ------------------------------------------------------------------ */
/* Overworld — D major, 100 bpm                                       */
/* ------------------------------------------------------------------ */

const OVERWORLD_A = [chord("D"), chord("A"), chord("B", MINOR), chord("G"), chord("D"), chord("A"), chord("G"), chord("A")];
const OVERWORLD_A2 = [...OVERWORLD_A.slice(0, 7), chord("D")];
const OVERWORLD_B = [chord("G"), chord("D"), chord("E", MINOR), chord("A"), chord("G"), chord("D"), chord("B", MINOR), chord("A")];

const OVERWORLD_THEME: Phrase = [
  [[0, 1, "F#5"], [1, 0.5, "A5"], [1.5, 0.5, "F#5"], [2, 1, "E5"], [3, 1, "D5"]],
  [[0, 1.5, "E5"], [1.5, 0.5, "C#5"], [2, 2, "A4"]],
  [[0, 1, "B4"], [1, 0.5, "D5"], [1.5, 0.5, "F#5"], [2, 1, "E5"], [3, 0.5, "D5"], [3.5, 0.5, "C#5"]],
  [[0, 3, "D5"], [3, 0.5, "B4"], [3.5, 0.5, "D5"]],
  [[0, 1, "A5"], [1, 0.5, "B5"], [1.5, 0.5, "A5"], [2, 1, "F#5"], [3, 1, "D5"]],
  [[0, 1, "E5"], [1, 1, "C#5"], [2, 1, "E5"], [3, 1, "A5"]],
  [[0, 1.5, "G5"], [1.5, 0.5, "F#5"], [2, 1, "E5"], [3, 1, "D5"]],
  [[0, 2, "E5"]],
];
// The same theme, coming home to the tonic instead of leaving on the fifth.
const OVERWORLD_THEME2: Phrase = [...OVERWORLD_THEME.slice(0, 7), [[0, 3, "D5"]]];

const OVERWORLD_BRIDGE: Phrase = [
  [[0, 0.5, "B4"], [0.5, 0.5, "D5"], [1, 1, "G5"], [2, 1, "F#5"], [3, 1, "D5"]],
  [[0, 1.5, "F#5"], [1.5, 0.5, "E5"], [2, 2, "D5"]],
  [[0, 0.5, "E5"], [0.5, 0.5, "G5"], [1, 1, "B5"], [2, 1, "A5"], [3, 1, "G5"]],
  [[0, 3, "A5"], [3, 1, "E5"]],
  [[0, 1, "D5"], [1, 1, "G5"], [2, 0.5, "F#5"], [2.5, 0.5, "G5"], [3, 1, "A5"]],
  [[0, 2, "F#5"], [2, 1, "A5"], [3, 1, "D6"]],
  [[0, 1, "B5"], [1, 1, "A5"], [2, 1, "F#5"], [3, 1, "D5"]],
  [[0, 2, "C#5"], [2, 1, "E5"], [3, 1, "A4"]],
];

/** Up and back over four chord tones, an eighth note each. */
const ARPEGGIO = [0, 1, 2, 3, 1, 2, 3, 2];

const overworld: Track = {
  id: "overworld",
  bpm: 100,
  beatsPerBar: 4,
  scale: [2, 4, 6, 7, 9, 11, 1],
  bar: (index) => {
    // 32 bars: the theme, the theme again coming home, the bridge, and a
    // breath where only the guitar and the birds carry on.
    const section = Math.floor(index / 8) % 4;
    const cycle = Math.floor(index / 32);
    const i = index % 8;
    const chords = section === 1 ? OVERWORLD_A2 : section === 2 ? OVERWORLD_B : OVERWORLD_A;
    const c = chords[i];
    const notes: Note[] = [];

    // Melody. Every other time round the flute hands it to the music box, so
    // a player standing still for minutes does not hear the same loop twice.
    const lead: Voice = cycle % 2 === 0 ? "flute" : "bell";
    if (section === 0) notes.push(...play(lead, OVERWORLD_THEME[i], 0.55));
    if (section === 1) notes.push(...play(lead, OVERWORLD_THEME2[i], 0.55));
    if (section === 2) notes.push(...play(lead === "flute" ? "bell" : "flute", OVERWORLD_BRIDGE[i], 0.5));

    // The guitar arpeggio, which never stops.
    const tones = spread(c, 4, 1);
    const pattern = cycle % 2 === 0 ? ARPEGGIO : [...ARPEGGIO].reverse();
    pattern.forEach((t, step) =>
      notes.push({ voice: "pluck", beat: step / 2, length: 0.5, midi: tones[t], velocity: step % 2 === 0 ? 0.42 : 0.3 })
    );

    // A soft pad holding the chord.
    for (const midi of spread(c, 3, 1)) notes.push({ voice: "pad", beat: 0, length: 4, midi, velocity: 0.22 });

    // The bouncing bass.
    const r = c.root - 12;
    notes.push(
      { voice: "bass", beat: 0, length: 1, midi: r, velocity: 0.7 },
      { voice: "bass", beat: 1.5, length: 0.5, midi: r, velocity: 0.45 },
      { voice: "bass", beat: 2, length: 1, midi: r + 7, velocity: 0.6 },
      { voice: "bass", beat: 3, length: 0.5, midi: r + 12, velocity: 0.5 },
      { voice: "bass", beat: 3.5, length: 0.5, midi: r + 7, velocity: 0.45 }
    );

    // Light drums, and only the shaker in the breath.
    for (let step = 0; step < 8; step++) {
      notes.push({ voice: "hat", beat: step / 2, length: 0.25, midi: 0, velocity: step % 2 === 0 ? 0.22 : 0.12 });
    }
    if (section !== 3) {
      notes.push(
        { voice: "kick", beat: 0, length: 0.5, midi: 0, velocity: 0.5 },
        { voice: "kick", beat: 2, length: 0.5, midi: 0, velocity: 0.42 },
        { voice: "snare", beat: 1, length: 0.25, midi: 0, velocity: 0.16 },
        { voice: "snare", beat: 3, length: 0.25, midi: 0, velocity: 0.16 }
      );
    }

    // Birds, now and then, never on the same beat twice in a row.
    if (hash(index, 1) < 0.45) {
      const beat = Math.floor(hash(index, 2) * 8) / 2;
      notes.push({ voice: "bird", beat, length: 0.5, midi: 84 + Math.floor(hash(index, 3) * 12), velocity: 0.25 });
    }
    return notes;
  },
};

/* ------------------------------------------------------------------ */
/* Night — A minor, 68 bpm                                            */
/* ------------------------------------------------------------------ */

const NIGHT_CHORDS = [
  chord("A", MINOR), chord("F"), chord("C"), chord("G"),
  chord("A", MINOR), chord("F"), chord("D", MINOR), chord("E"),
];

const NIGHT_THEME: Phrase = [
  [[0, 1.5, "E5"], [1.5, 0.5, "D5"], [2, 2, "C5"]],
  [[0, 1, "A4"], [1, 1, "C5"], [2, 2, "F5"]],
  [[0, 1.5, "E5"], [1.5, 0.5, "D5"], [2, 1, "C5"], [3, 1, "G4"]],
  [[0, 3, "B4"], [3, 1, "D5"]],
  [[0, 1, "C5"], [1, 1, "E5"], [2, 1.5, "A5"], [3.5, 0.5, "G5"]],
  [[0, 2, "F5"], [2, 1, "E5"], [3, 1, "C5"]],
  [[0, 1, "D5"], [1, 1, "F5"], [2, 1, "A5"], [3, 1, "F5"]],
  [[0, 2, "E5"], [2, 1, "G#4"], [3, 1, "B4"]],
];

const night: Track = {
  id: "night",
  bpm: 68,
  beatsPerBar: 4,
  scale: [9, 11, 0, 2, 4, 5, 7, 8],
  bar: (index) => {
    const i = index % 8;
    const phrase = Math.floor(index / 8) % 4;
    const c = NIGHT_CHORDS[i];
    const notes: Note[] = [];

    // The theme on the flute, then the music box, then nothing but the
    // night for a while, then the music box again.
    if (phrase === 0) notes.push(...play("flute", NIGHT_THEME[i], 0.4));
    if (phrase === 1 || phrase === 3) notes.push(...play("bell", NIGHT_THEME[i], 0.42));

    for (const midi of spread(c, 3, 1)) notes.push({ voice: "pad", beat: 0, length: 4, midi, velocity: 0.28 });
    notes.push({ voice: "bass", beat: 0, length: 4, midi: c.root - 12, velocity: 0.45 });

    // A slow harp, three notes a bar.
    const harp = spread(c, 5, 1);
    [[0, 0], [1.5, 2], [3, 4]].forEach(([beat, t]) =>
      notes.push({ voice: "pluck", beat, length: Math.min(1.5, 4 - beat), midi: harp[t], velocity: 0.22 })
    );

    if (hash(index, 7) < 0.7) {
      notes.push({ voice: "cricket", beat: Math.floor(hash(index, 8) * 4), length: 1, midi: 0, velocity: 0.16 });
    }
    return notes;
  },
};

/* ------------------------------------------------------------------ */
/* Battle — D minor, 138 bpm                                          */
/* ------------------------------------------------------------------ */

const DRIVE_CHORDS = [
  chord("D", MINOR), chord("D", MINOR), chord("Bb"), chord("C"),
  chord("D", MINOR), chord("Bb"), chord("G", MINOR), chord("A"),
];
const RISE_CHORDS = [
  chord("Bb"), chord("F"), chord("C"), chord("D", MINOR),
  chord("Bb"), chord("F"), chord("G", MINOR), chord("A"),
];
// The bridge leans on E flat, the chord a semitone above home: the darkest
// move D minor has, and the one fight music reaches for before a return.
const BRIDGE_CHORDS = [
  chord("G", MINOR), chord("D", MINOR), chord("Bb"), chord("A"),
  chord("G", MINOR), chord("D", MINOR), chord("Eb"), chord("A"),
];

const HORN_THEME: Phrase = [
  [[0, 1, "D4"], [1, 1, "A4"], [2, 1.5, "A4"], [3.5, 0.5, "G4"]],
  [[0, 0.5, "F4"], [0.5, 0.5, "G4"], [1, 1, "A4"], [2, 2, "D5"]],
  [[0, 1.5, "D5"], [1.5, 0.5, "C5"], [2, 1, "Bb4"], [3, 1, "F4"]],
  [[0, 2, "C5"], [2, 1, "G4"], [3, 1, "E4"]],
  [[0, 1, "F4"], [1, 1, "A4"], [2, 1, "D5"], [3, 1, "F5"]],
  [[0, 2, "F5"], [2, 1, "E5"], [3, 1, "D5"]],
  [[0, 1, "D5"], [1, 1, "Bb4"], [2, 1, "G4"], [3, 1, "Bb4"]],
  [[0, 3, "A4"], [3, 1, "C#5"]],
];

const RISING_THEME: Phrase = [
  [[0, 2, "F5"], [2, 1, "D5"], [3, 1, "Bb4"]],
  [[0, 1.5, "C5"], [1.5, 0.5, "D5"], [2, 2, "A4"]],
  [[0, 1, "G4"], [1, 1, "C5"], [2, 1, "E5"], [3, 1, "G5"]],
  [[0, 3, "F5"], [3, 1, "E5"]],
  [[0, 1, "D5"], [1, 1, "F5"], [2, 1, "Bb5"], [3, 1, "A5"]],
  [[0, 2, "A5"], [2, 1, "G5"], [3, 1, "F5"]],
  [[0, 1, "G5"], [1, 1, "F5"], [2, 1, "E5"], [3, 1, "D5"]],
  [[0, 4, "C#5"]],
];

/** Sixteenths over the root: 3 + 3 + 2, the gallop under every fight. */
const OSTINATO = [0, 0, 12, 0, 0, 7, 0, 12];
const ACCENTS = new Set([0, 3, 6, 8, 11, 14]);

const battle: Track = {
  id: "battle",
  bpm: 138,
  beatsPerBar: 4,
  scale: [2, 4, 5, 7, 9, 10, 0, 1, 3],
  bar: (index, intensity) => {
    const i = index % 8;
    // While fighters are still being placed the fight has not started: the
    // drive alone, quietly, waiting. Once it has, 32 bars: the drive, the
    // horn theme, the rising theme, and the bridge.
    const section = intensity <= 0 ? 0 : Math.floor(index / 8) % 4;
    const chords = section === 2 ? RISE_CHORDS : section === 3 ? BRIDGE_CHORDS : DRIVE_CHORDS;
    const c = chords[i];
    const notes: Note[] = [];
    const calm = intensity <= 0;
    const urgent = intensity >= 2;

    // The string ostinato, the fight's heartbeat. Half-time in the bridge.
    const step = section === 3 ? 0.5 : 0.25;
    for (let s = 0; s < 4 / step; s++) {
      const offset = OSTINATO[s % OSTINATO.length];
      notes.push({
        voice: "strings",
        beat: s * step,
        length: step,
        midi: c.root + offset,
        velocity: (ACCENTS.has(s) ? 0.5 : 0.3) * (calm ? 0.6 : 1),
      });
    }

    // Low horns on the root and fifth, under the drive and the horn theme.
    if (section <= 1) {
      notes.push(
        { voice: "brass", beat: 0, length: 4, midi: c.root - 12, velocity: calm ? 0.25 : 0.38 },
        { voice: "brass", beat: 0, length: 4, midi: c.root - 5, velocity: calm ? 0.18 : 0.28 }
      );
    }

    // The choir holds the chord, and carries the bridge.
    const choir = section === 3 ? 0.5 : calm ? 0.16 : 0.26;
    for (const midi of spread(c, 3, 1)) notes.push({ voice: "choir", beat: 0, length: 4, midi, velocity: choir });

    // The themes. When someone is about to fall the strings double the
    // melody an octave up, which is all "urgent" has to mean.
    if (section === 1) {
      notes.push(...play("brass", HORN_THEME[i], 0.62));
      if (urgent) notes.push(...play("strings", HORN_THEME[i], 0.3, 12));
    }
    if (section === 2) {
      notes.push(...play("strings", RISING_THEME[i], 0.42));
      notes.push(...play("brass", RISING_THEME[i], 0.42, -12));
      if (urgent) notes.push(...play("flute", RISING_THEME[i], 0.3, 12));
    }

    // Taiko: a full pattern in the fight, two blows a bar in the bridge and
    // while placing.
    const taiko: [number, number][] =
      calm || section === 3
        ? [[0, 0.9], [2.5, 0.6]]
        : [[0, 1], [0.75, 0.45], [1.5, 0.65], [2, 0.95], [2.75, 0.45], [3, 0.6], [3.5, 0.8]];
    for (const [beat, velocity] of taiko) {
      notes.push({ voice: "taiko", beat, length: 1, midi: 0, velocity: velocity * (calm ? 0.7 : 1) });
    }

    if (!calm && section !== 3) {
      notes.push(
        { voice: "snare", beat: 1, length: 0.25, midi: 0, velocity: 0.4 },
        { voice: "snare", beat: 3, length: 0.25, midi: 0, velocity: 0.45 }
      );
      if (urgent) {
        for (let s = 0; s < 8; s++) {
          notes.push({ voice: "snare", beat: 2 + s * 0.25, length: 0.25, midi: 0, velocity: 0.12 + s * 0.03 });
        }
      }
    }

    // A crash where each theme comes in, and a roll at the end of the bridge
    // that throws the loop back to the start.
    if (!calm && i === 0 && (section === 1 || section === 2)) {
      notes.push({ voice: "cymbal", beat: 0, length: 4, midi: 0, velocity: 0.5 });
    }
    if (!calm && section === 3 && i === 7) {
      for (let s = 0; s < 16; s++) {
        notes.push({ voice: "snare", beat: s * 0.25, length: 0.25, midi: 0, velocity: 0.15 + s * 0.03 });
      }
      notes.push({ voice: "cymbal", beat: 2, length: 2, midi: 1, velocity: 0.45 });
    }
    return notes;
  },
};

export const TRACKS: Record<TrackId, Track> = { overworld, night, battle };

/* ------------------------------------------------------------------ */
/* Stingers                                                            */
/* ------------------------------------------------------------------ */

export type StingerId = "victory" | "defeat" | "fightStart";

/**
 * Short phrases that answer a moment instead of filling it, played once over
 * whatever music is left. Beats are counted at STINGER_BPM.
 */
export const STINGER_BPM = 120;

export const STINGERS: Record<StingerId, Note[]> = {
  // A horn call up the D major chord, landing on a held, bright tonic.
  victory: [
    ...play("brass", [[0, 0.33, "D4"], [0.33, 0.33, "F#4"], [0.66, 0.34, "A4"], [1, 3, "D5"]], 0.75),
    ...play("brass", [[1, 3, "A4"], [1, 3, "F#4"]], 0.5),
    ...play("strings", [[1, 0.25, "D5"], [1.25, 0.25, "F#5"], [1.5, 0.25, "A5"], [1.75, 2.25, "D6"]], 0.35),
    ...[50, 54, 57].map((midi) => ({ voice: "choir" as Voice, beat: 1, length: 3.5, midi, velocity: 0.4 })),
    { voice: "taiko", beat: 1, length: 1, midi: 0, velocity: 1 },
    { voice: "cymbal", beat: 1, length: 4, midi: 0, velocity: 0.55 },
  ],
  // The same horn falling instead, slow, onto a low minor chord.
  defeat: [
    ...play("brass", [[0, 1, "A4"], [1, 1, "F4"], [2, 1, "D4"], [3, 1, "C#4"], [4, 4, "D4"]], 0.5),
    ...[38, 45, 50, 53].map((midi) => ({ voice: "choir" as Voice, beat: 4, length: 4, midi, velocity: 0.38 })),
    { voice: "taiko", beat: 4, length: 1, midi: 0, velocity: 0.7 },
  ],
  // One blow and a stab of the chord: the fight is on.
  fightStart: [
    { voice: "taiko", beat: 0, length: 1, midi: 0, velocity: 1 },
    { voice: "taiko", beat: 0.5, length: 1, midi: 0, velocity: 0.7 },
    { voice: "cymbal", beat: 0, length: 3, midi: 0, velocity: 0.5 },
    ...play("brass", [[0, 1.5, "D4"], [0, 1.5, "F4"], [0, 1.5, "A4"], [0, 1.5, "D3"]], 0.6),
  ],
};
