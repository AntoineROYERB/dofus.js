const KEY = "dofusjs.defeatedOpponents";

/**
 * Which champions this device has beaten, by champion id (or, for wins from
 * before champions, by the class id that is now their grimoire — see
 * beatenChampions). It is the whole of the solo arc's state, and it is
 * deliberately local: the arc is polish on top of the content, not an
 * account system.
 */
export const readDefeated = (): Set<string> => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : []
    );
  } catch {
    return new Set();
  }
};

export const markDefeated = (championId: string): void => {
  const defeated = readDefeated();
  if (defeated.has(championId)) return;
  defeated.add(championId);
  try {
    localStorage.setItem(KEY, JSON.stringify([...defeated]));
  } catch {
    // Private browsing or blocked site data: the arc just starts over.
  }
};
