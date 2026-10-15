/**
 * The key that takes this device back into its dream: the run's id and the
 * member's own secret. The server keeps the run; this is only the way back
 * in after a reload on a server that has forgotten the session, or after it
 * slept. Wrapped like every other store: blocked site data means the run is
 * lost on a reload, never that the page breaks.
 */
const KEY = "dofusjs.dream";

export type DreamTicket = { runId: string; key: string };

export const readDreamTicket = (): DreamTicket | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const held: unknown = JSON.parse(raw);
    if (!held || typeof held !== "object") return null;
    const { runId, key } = held as Partial<DreamTicket>;
    return typeof runId === "string" && typeof key === "string" && runId && key
      ? { runId, key }
      : null;
  } catch {
    return null;
  }
};

export const saveDreamTicket = (ticket: DreamTicket): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ticket));
  } catch {
    // Nothing kept: the run lives on, and a reload simply cannot rejoin it.
  }
};

export const forgetDreamTicket = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Same as above.
  }
};
