import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { CRIES, SPELL_SAMPLES } from "./samples";

const AUDIO = join(__dirname, "../../public/audio");

describe("the recordings", () => {
  const named = CRIES.flatMap((v) => [...v.light, ...v.heavy, ...v.death]);

  it("all exist, so no blow lands in silence", () => {
    for (const name of named) expect(existsSync(join(AUDIO, "cries", `${name}.mp3`))).toBe(true);
    for (const name of SPELL_SAMPLES) expect(existsSync(join(AUDIO, "spells", `${name}.mp3`))).toBe(true);
  });

  it("are all used, so nothing ships that is never heard", () => {
    const shipped = readdirSync(join(AUDIO, "cries")).map((f) => f.replace(/\.mp3$/, ""));
    expect([...shipped].sort()).toEqual([...named].sort());
  });

  it("give every voice a grunt, a scream and a death", () => {
    for (const voice of CRIES) {
      expect(voice.light.length).toBeGreaterThan(0);
      expect(voice.heavy.length).toBeGreaterThan(0);
      expect(voice.death.length).toBeGreaterThan(0);
      // A file belongs to the voice whose number it carries.
    }
    CRIES.forEach((voice, i) => {
      for (const name of [...voice.light, ...voice.heavy, ...voice.death]) expect(name.startsWith(`v${i + 1}-`)).toBe(true);
    });
  });
});
