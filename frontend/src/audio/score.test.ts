import { hash, midiOf, Note, STINGERS, TRACKS, Voice } from "./score";

const DRUMS = new Set<Voice>(["taiko", "kick", "snare", "hat", "cymbal", "bird", "cricket"]);
const bars = (count: number) => Array.from({ length: count }, (_, i) => i);

describe("midiOf", () => {
  it("names middle C and its neighbours", () => {
    expect(midiOf("C4")).toBe(60);
    expect(midiOf("A4")).toBe(69);
    expect(midiOf("F#5")).toBe(78);
    expect(midiOf("Bb3")).toBe(58);
  });

  it("refuses what is not a pitch", () => {
    expect(() => midiOf("H2")).toThrow();
    expect(() => midiOf("C")).toThrow();
  });
});

describe("the tracks", () => {
  for (const track of Object.values(TRACKS)) {
    describe(track.id, () => {
      const every: Note[] = bars(128).flatMap((i) => [0, 1, 2].flatMap((level) => track.bar(i, level)));

      it("keeps every note inside its bar", () => {
        for (const note of every) {
          expect(note.beat).toBeGreaterThanOrEqual(0);
          expect(note.beat).toBeLessThan(track.beatsPerBar);
          expect(note.length).toBeGreaterThan(0);
          // A drum's length is how long it rings, and may ring into the next bar.
          if (!DRUMS.has(note.voice)) {
            expect(note.beat + note.length).toBeLessThanOrEqual(track.beatsPerBar + 1e-9);
          }
        }
      });

      it("plays every note at a level between silence and full", () => {
        for (const note of every) {
          expect(note.velocity).toBeGreaterThan(0);
          expect(note.velocity).toBeLessThanOrEqual(1);
          expect(Number.isFinite(note.midi)).toBe(true);
        }
      });

      // A wrong note in a hand-written melody is the easiest mistake to make
      // here and the hardest to hear in review.
      it("stays in its key", () => {
        for (const note of every) {
          if (DRUMS.has(note.voice)) continue;
          expect(track.scale).toContain(((note.midi % 12) + 12) % 12);
        }
      });

      it("is the same bar every time it is asked for", () => {
        for (const i of bars(40)) expect(track.bar(i, 1)).toEqual(track.bar(i, 1));
      });

      it("never falls silent for a whole bar", () => {
        for (const i of bars(128)) expect(track.bar(i, 1).length).toBeGreaterThan(0);
      });
    });
  }

  it("holds the battle back while fighters are being placed", () => {
    const voices = (level: number) => new Set(bars(32).flatMap((i) => TRACKS.battle.bar(i, level)).map((n) => n.voice));
    expect(voices(0).has("snare")).toBe(false);
    expect(voices(0).has("cymbal")).toBe(false);
    expect(voices(1).has("snare")).toBe(true);
  });

  it("plays the battle harder when someone is about to fall", () => {
    const count = (level: number) => bars(32).reduce((n, i) => n + TRACKS.battle.bar(i, level).length, 0);
    expect(count(2)).toBeGreaterThan(count(1));
    expect(count(1)).toBeGreaterThan(count(0));
  });
});

describe("the stingers", () => {
  it("are made of playable notes", () => {
    for (const notes of Object.values(STINGERS)) {
      expect(notes.length).toBeGreaterThan(0);
      for (const note of notes) {
        expect(note.beat).toBeGreaterThanOrEqual(0);
        expect(note.length).toBeGreaterThan(0);
        expect(note.velocity).toBeGreaterThan(0);
        expect(note.velocity).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("hash", () => {
  it("is stable, in [0, 1), and differs between inputs", () => {
    const values = bars(200).map((i) => hash(i, 1));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hash(3, 1)).toBe(hash(3, 1));
    expect(new Set(values).size).toBeGreaterThan(150);
  });
});
