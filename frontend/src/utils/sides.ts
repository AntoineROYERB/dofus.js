import { Player } from "../types/game";

/**
 * Whether two fighters fight together. In a duel nobody has a team and every
 * fighter is their own side; in a dream's fight the party is one side and the
 * monsters the other. Mirrors sameSideLocked in the server.
 */
export const sameSide = (
  players: Record<string, Player> | undefined | null,
  a: string,
  b: string
): boolean => {
  if (a === b) return true;
  const team = players?.[a]?.team;
  return !!team && team === players?.[b]?.team;
};

/** Whether a fight is played between teams rather than as a duel. */
export const teamed = (players: Record<string, Player> | undefined | null): boolean =>
  Object.values(players ?? {}).some((p) => !!p.team);
