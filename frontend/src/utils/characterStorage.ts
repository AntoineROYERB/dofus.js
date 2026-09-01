import { CharacterAppearance } from "../types/game";

const KEY = "dofusjs.character";

/**
 * The character a player picked on the landing page. It is kept in storage
 * rather than in router state so it survives a reload — which matters now that
 * a reconnecting client resumes its session instead of starting over.
 */
export const saveCharacter = (name: string, color: string): void => {
  const character: CharacterAppearance = {
    name,
    color,
    symbol: (name || "P")[0].toUpperCase(),
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
    const parsed = JSON.parse(raw) as Partial<CharacterAppearance>;
    if (!parsed.name || !parsed.color) return null;
    return {
      name: parsed.name,
      color: parsed.color,
      symbol: parsed.symbol ?? parsed.name[0].toUpperCase(),
    };
  } catch {
    return null;
  }
};
