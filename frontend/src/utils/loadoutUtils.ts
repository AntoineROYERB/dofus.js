import { Player } from "../types/game";
import {
  Champion,
  ContentResponse,
  Grimoire,
  Loadout,
  Outfit,
  Rune,
  Spell,
  SpellBook,
  Talisman,
} from "../types/message";

/**
 * The spells on a player's bar, in the order the number keys pick them. The
 * catalogue a snapshot carries holds every loadout's spells, so it is the
 * player's own bar that decides what shows. A snapshot from before bars
 * existed has none, and then the whole catalogue is the bar, as it was.
 */
export const barSpells = (
  player: Player | undefined,
  book: SpellBook | null | undefined
): Spell[] => {
  if (!book) return [];
  const bar = player?.spellBar;
  if (bar && bar.length > 0) {
    return bar.map((id) => book[id]).filter((spell): spell is Spell => !!spell);
  }
  return Object.keys(book)
    .map((id) => book[id])
    .sort((a, b) => a.id - b.id);
};

/**
 * A loadout resolved against the content: what the character wears and
 * carries, and the bar that makes — the outfit's basic attack, the grimoire's
 * three spells, then the talisman's ultimate. The server resolves it the same
 * way when the character takes its seat.
 */
export type Kit = {
  loadout: Loadout;
  element: string;
  outfit: Outfit;
  grimoire: Grimoire;
  rune: Rune;
  talisman: Talisman;
  bar: string[];
};

type Items = Pick<
  ContentResponse,
  "outfits" | "grimoires" | "runes" | "talismans" | "champions"
>;

export const sameLoadout = (a?: Partial<Loadout>, b?: Partial<Loadout>): boolean =>
  !!a &&
  !!b &&
  a.outfit === b.outfit &&
  a.grimoire === b.grimoire &&
  a.rune === b.rune &&
  a.talisman === b.talisman;

/** Resolves a whole loadout, or nothing when an item is missing or mismatched. */
export const kitOf = (
  loadout: Partial<Loadout> | undefined,
  content: Items | null | undefined
): Kit | undefined => {
  if (!loadout || !content) return undefined;
  const outfit = content.outfits.find((o) => o.id === loadout.outfit);
  const grimoire = content.grimoires.find((g) => g.id === loadout.grimoire);
  const rune = content.runes.find((r) => r.id === loadout.rune);
  const talisman = content.talismans.find((t) => t.id === loadout.talisman);
  if (!outfit || !grimoire || !rune || !talisman) return undefined;
  if (outfit.element !== grimoire.element) return undefined;
  return {
    loadout: { outfit: outfit.id, grimoire: grimoire.id, rune: rune.id, talisman: talisman.id },
    element: outfit.element,
    outfit,
    grimoire,
    rune,
    talisman,
    bar: [outfit.basicAttack, ...grimoire.spells, talisman.ultimate],
  };
};

/**
 * A saved loadout made whole. A complete one is kept as it is. One that is
 * only partly known — a character saved when it was a class, which is its
 * grimoire now — becomes the set of the champion carrying that grimoire.
 * Anything else is the first champion's set, which is what the server deals
 * a character that names no loadout.
 */
export const settleLoadout = (
  loadout: Partial<Loadout> | undefined,
  content: Items | null | undefined
): Loadout | undefined => {
  if (!content || content.champions.length === 0) return undefined;
  const whole = kitOf(loadout, content);
  if (whole) return whole.loadout;
  const byGrimoire = content.champions.find(
    (c) => loadout?.grimoire && c.set.grimoire === loadout.grimoire
  );
  return (byGrimoire ?? content.champions[0]).set;
};

/** The champion whose set this is, if it is one. */
export const championOf = (
  loadout: Partial<Loadout> | undefined,
  champions: Champion[]
): Champion | undefined => champions.find((c) => sameLoadout(c.set, loadout));

/**
 * The outfit a grimoire ends up worn in: the one already worn if it is of the
 * grimoire's element, otherwise the first outfit of that element.
 */
export const outfitFor = (
  grimoire: Grimoire,
  current: Outfit | undefined,
  outfits: Outfit[]
): Outfit | undefined =>
  current?.element === grimoire.element
    ? current
    : outfits.find((o) => o.element === grimoire.element);

/**
 * The grimoire an outfit ends up carrying: the one already carried if it is
 * of the outfit's element, otherwise the first grimoire of that element. An
 * outfit decides the element, and the grimoire follows it.
 */
export const grimoireFor = (
  outfit: Outfit,
  current: Grimoire | undefined,
  grimoires: Grimoire[]
): Grimoire | undefined =>
  current?.element === outfit.element
    ? current
    : grimoires.find((g) => g.element === outfit.element);

/** Whether a champion can be challenged yet. */
export const isUnlocked = (
  champion: Champion,
  defeated: ReadonlySet<string>
): boolean => champion.unlockedBy === "" || defeated.has(champion.unlockedBy);

/**
 * The champion the arc points at next: the first unlocked one not yet beaten,
 * or — once every one has been — the first, to start over.
 */
export const nextChallenge = (
  champions: Champion[],
  defeated: ReadonlySet<string>
): Champion | undefined =>
  champions.find((c) => isUnlocked(c, defeated) && !defeated.has(c.id)) ??
  champions[0];

/** The champions a win against this one opens up. */
export const unlockedBy = (champions: Champion[], championId: string): Champion[] =>
  champions.filter((c) => c.unlockedBy === championId);

/**
 * Who this device has beaten, by champion. Wins written down when opponents
 * were classes are kept: a class id is the grimoire its champion carries now.
 */
export const beatenChampions = (
  defeated: ReadonlySet<string>,
  champions: Champion[]
): Set<string> => {
  const beaten = new Set<string>();
  for (const c of champions) {
    if (defeated.has(c.id) || defeated.has(c.set.grimoire)) beaten.add(c.id);
  }
  return beaten;
};
