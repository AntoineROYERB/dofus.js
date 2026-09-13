import { Player } from "../types/game";
import { CharacterClass, Spell, SpellBook } from "../types/message";

/**
 * The spells on a player's bar, in the order the number keys pick them. The
 * catalogue a snapshot carries holds every class's spells, so it is the
 * player's own bar that decides what shows. A snapshot from before classes
 * existed has no bar, and then the whole catalogue is the bar, as it was.
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

/** Whether a class's opponent can be challenged yet. */
export const isUnlocked = (
  cls: CharacterClass,
  defeated: ReadonlySet<string>
): boolean => cls.unlockedBy === "" || defeated.has(cls.unlockedBy);

/**
 * The opponent the arc points at next: the first unlocked one not yet beaten,
 * or — once every one has been — the first, to start over.
 */
export const nextChallenge = (
  classes: CharacterClass[],
  defeated: ReadonlySet<string>
): CharacterClass | undefined =>
  classes.find((cls) => isUnlocked(cls, defeated) && !defeated.has(cls.id)) ??
  classes[0];

/** The classes a win against this one opens up. */
export const unlockedBy = (
  classes: CharacterClass[],
  classId: string
): CharacterClass[] => classes.filter((cls) => cls.unlockedBy === classId);
