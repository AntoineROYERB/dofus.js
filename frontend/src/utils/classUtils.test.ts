import { barSpells, isUnlocked, nextChallenge, unlockedBy } from "./classUtils";
import { Player } from "../types/game";
import { CharacterClass, Spell, SpellBook } from "../types/message";
import { makeSpell } from "../test/fixtures";

const spell = (id: number): Spell => makeSpell({ id, name: `Spell ${id}` });

const book: SpellBook = { "1": spell(1), "2": spell(2), "3": spell(3), "10": spell(10) };

const player = (spellBar: string[] | null): Player =>
  ({ userId: "u", spellBar } as unknown as Player);

const cls = (id: string, unlocked = ""): CharacterClass => ({
  id,
  name: id,
  element: "Fire",
  symbol: "*",
  palette: { primary: "#000000", secondary: "#ffffff" },
  lore: "",
  passive: "",
  health: 100,
  actionPoints: 6,
  movementPoints: 4,
  spells: [],
  opponent: { name: id, lines: ["hello", "goodbye"] },
  unlockedBy: unlocked,
});

describe("barSpells", () => {
  it("follows the player's bar order, not the catalogue's", () => {
    expect(barSpells(player(["10", "1"]), book).map((s) => s.id)).toEqual([10, 1]);
  });

  it("handles a bar with fewer spells than slots", () => {
    expect(barSpells(player(["2"]), book).map((s) => s.id)).toEqual([2]);
  });

  it("skips ids the catalogue does not know", () => {
    expect(barSpells(player(["2", "99"]), book).map((s) => s.id)).toEqual([2]);
  });

  it("falls back to the whole catalogue by id when there is no bar", () => {
    expect(barSpells(player(null), book).map((s) => s.id)).toEqual([1, 2, 3, 10]);
    expect(barSpells(undefined, book).map((s) => s.id)).toEqual([1, 2, 3, 10]);
  });

  it("is empty without a catalogue", () => {
    expect(barSpells(player(["1"]), null)).toEqual([]);
  });
});

describe("the solo arc", () => {
  const classes = [cls("fire"), cls("air", "fire"), cls("water", "air")];

  it("opens only classes with no requirement at first", () => {
    const none = new Set<string>();
    expect(classes.map((c) => isUnlocked(c, none))).toEqual([true, false, false]);
    expect(nextChallenge(classes, none)?.id).toBe("fire");
  });

  it("moves on once an opponent is beaten", () => {
    const beaten = new Set(["fire"]);
    expect(isUnlocked(classes[1], beaten)).toBe(true);
    expect(nextChallenge(classes, beaten)?.id).toBe("air");
    expect(unlockedBy(classes, "fire").map((c) => c.id)).toEqual(["air"]);
  });

  it("starts over when every opponent has fallen", () => {
    expect(nextChallenge(classes, new Set(["fire", "air", "water"]))?.id).toBe("fire");
  });
});
