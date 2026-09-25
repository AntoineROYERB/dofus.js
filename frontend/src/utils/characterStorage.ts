import { CharacterAppearance } from "../types/game";
import { Loadout } from "../types/message";

const KEY = "dofusjs.character";

/** What the server accepts as a fighter's name. */
export const NAME_RULE = /^[a-zA-Z0-9 ]{3,20}$/;

/**
 * The character a player picked on the landing page. It is kept in storage
 * rather than in router state so it survives a reload — which matters now that
 * a reconnecting client resumes its session instead of starting over.
 */
export const saveCharacter = (
  name: string,
  color: string,
  loadout?: Partial<Loadout>
): void => {
  const character: CharacterAppearance = {
    name,
    color,
    symbol: (name || "P")[0].toUpperCase(),
    ...(loadout ? { loadout } : {}),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(character));
  } catch {
    // Private browsing or blocked site data: the player just has to pick again.
  }
};

export const readCharacter = (): CharacterAppearance | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CharacterAppearance> & {
      class?: string;
    };
    if (!parsed.name || !parsed.color) return null;
    // A character saved when it was a class carries that class's grimoire
    // now; settleLoadout dresses it in the set of the champion who carries
    // it. One saved before classes existed has nothing, and gets the first
    // champion's set.
    const loadout =
      parsed.loadout ?? (parsed.class ? { grimoire: parsed.class } : undefined);
    return {
      name: parsed.name,
      color: parsed.color,
      symbol: parsed.symbol ?? parsed.name[0].toUpperCase(),
      ...(loadout ? { loadout } : {}),
    };
  } catch {
    return null;
  }
};
