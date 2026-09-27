import {
  barSpells,
  beatenChampions,
  championOf,
  grimoireFor,
  isUnlocked,
  kitOf,
  nextChallenge,
  outfitFor,
  settleLoadout,
  unlockedBy,
} from "./loadoutUtils";
import { Player } from "../types/game";
import { Champion, Grimoire, Outfit, Rune, Spell, SpellBook, Talisman } from "../types/message";
import { makeSpell } from "../test/fixtures";

const spell = (id: number): Spell => makeSpell({ id, name: `Spell ${id}` });

const book: SpellBook = { "1": spell(1), "2": spell(2), "3": spell(3), "10": spell(10) };

const player = (spellBar: string[] | null): Player =>
  ({ userId: "u", spellBar } as unknown as Player);

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

const outfit = (id: string, element: string, basicAttack: string): Outfit => ({
  id, name: id, element, basicAttack, weapon: "a stick",
  palette: { primary: "#000000", secondary: "#ffffff" }, sprite: id,
});
const grimoire = (id: string, element: string, spells: string[]): Grimoire => ({
  id, name: id, element, symbol: "*", lore: "", spells, passive: "", glyph: "",
  health: 100, actionPoints: 6, movementPoints: 4,
});
const rune = (id: string): Rune => ({ id, name: id, description: "", effect: { kind: "pushResist", value: 1 } });
const talisman = (id: string, ultimate: string): Talisman => ({ id, name: id, ultimate, sprite: id });
const champion = (id: string, set: Champion["set"], unlocked = ""): Champion => ({
  id, name: id, lines: ["hello", "goodbye"], set, unlockedBy: unlocked,
});

const fireSet = { outfit: "ember-coat", grimoire: "pyro", rune: "grit", talisman: "heart" };
const airSet = { outfit: "wind-coat", grimoire: "gale", rune: "grit", talisman: "feather" };
const content = {
  outfits: [outfit("ember-coat", "Fire", "1"), outfit("wind-coat", "Air", "6"), outfit("cinder-coat", "Fire", "2")],
  grimoires: [grimoire("pyro", "Fire", ["2", "3", "4"]), grimoire("gale", "Air", ["7", "8", "9"])],
  runes: [rune("grit")],
  talismans: [talisman("heart", "5"), talisman("feather", "10")],
  champions: [champion("ashka", fireSet), champion("sef", airSet, "ashka")],
};

describe("kits", () => {
  it("puts the basic attack first, the grimoire in the middle and the ultimate last", () => {
    expect(kitOf(fireSet, content)?.bar).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("mixes a talisman from another set", () => {
    expect(kitOf({ ...fireSet, talisman: "feather" }, content)?.bar.at(-1)).toBe("10");
  });

  it("refuses a grimoire of another element than the outfit", () => {
    expect(kitOf({ ...fireSet, grimoire: "gale" }, content)).toBeUndefined();
  });

  it("settles a class saved before loadouts into its champion's set", () => {
    expect(settleLoadout({ grimoire: "gale" }, content)).toEqual(airSet);
    expect(settleLoadout(undefined, content)).toEqual(fireSet);
    expect(settleLoadout({ ...fireSet, outfit: "cinder-coat" }, content)?.outfit).toBe("cinder-coat");
  });

  it("names the champion a set belongs to, and nobody for a mixed one", () => {
    expect(championOf(airSet, content.champions)?.id).toBe("sef");
    expect(championOf({ ...airSet, talisman: "heart" }, content.champions)).toBeUndefined();
  });

  it("keeps the grimoire in the outfit's element", () => {
    const [ember, wind] = content.outfits;
    const [pyro, gale] = content.grimoires;
    expect(grimoireFor(wind, pyro, content.grimoires)?.id).toBe("gale");
    expect(grimoireFor(ember, pyro, content.grimoires)?.id).toBe("pyro");
    expect(outfitFor(gale, ember, content.outfits)?.id).toBe("wind-coat");
    expect(outfitFor(pyro, content.outfits[2], content.outfits)?.id).toBe("cinder-coat");
  });
});

describe("the solo arc", () => {
  const champions = [
    champion("ashka", fireSet),
    champion("sef", airSet, "ashka"),
    champion("brine", fireSet, "sef"),
  ];

  it("opens only champions with no requirement at first", () => {
    const none = new Set<string>();
    expect(champions.map((c) => isUnlocked(c, none))).toEqual([true, false, false]);
    expect(nextChallenge(champions, none)?.id).toBe("ashka");
  });

  it("moves on once a champion is beaten", () => {
    const beaten = new Set(["ashka"]);
    expect(isUnlocked(champions[1], beaten)).toBe(true);
    expect(nextChallenge(champions, beaten)?.id).toBe("sef");
    expect(unlockedBy(champions, "ashka").map((c) => c.id)).toEqual(["sef"]);
  });

  it("starts over when every champion has fallen", () => {
    expect(nextChallenge(champions, new Set(["ashka", "sef", "brine"]))?.id).toBe("ashka");
  });

  it("keeps wins written down when opponents were classes", () => {
    expect([...beatenChampions(new Set(["gale"]), champions)]).toEqual(["sef"]);
  });
});
