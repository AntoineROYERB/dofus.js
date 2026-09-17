const KEY = "dofusjs.defeatedOpponents";

/**
 * Which computer opponents this device has beaten, by class id. It is the
 * whole of the solo arc's state, and it is deliberately local: the arc is
 * polish on top of the class content, not an account system.
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

export const markDefeated = (classId: string): void => {
  const defeated = readDefeated();
  if (defeated.has(classId)) return;
  defeated.add(classId);
  try {
    localStorage.setItem(KEY, JSON.stringify([...defeated]));
  } catch {
    // Private browsing or blocked site data: the arc just starts over.
  }
};
