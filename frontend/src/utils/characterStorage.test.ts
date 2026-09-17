import { NAME_RULE, readCharacter, saveCharacter } from "./characterStorage";

describe("NAME_RULE", () => {
  it.each(["Antoine", "abc", "Player 2", "a".repeat(20)])("accepts %s", (name) => {
    expect(NAME_RULE.test(name)).toBe(true);
  });

  it.each(["ab", "a".repeat(21), "a!b", "", "Élodie"])("refuses %s", (name) => {
    expect(NAME_RULE.test(name)).toBe(false);
  });
});

describe("saveCharacter / readCharacter", () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  });
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  beforeEach(() => store.clear());

  it("round-trips a rename and a class change, as the home screen does", () => {
    saveCharacter("Tester", "#d8ae31", "pyromancer");
    saveCharacter("Antoine", "#5bd831", "windwalker");
    expect(readCharacter()).toEqual({
      name: "Antoine",
      color: "#5bd831",
      symbol: "A",
      class: "windwalker",
    });
  });

  it("reads nothing when nothing was saved", () => {
    expect(readCharacter()).toBeNull();
  });
});
