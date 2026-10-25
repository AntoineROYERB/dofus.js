import { Player, Position } from "../types/game";
import { Spell } from "../types/message";
import { sameSide } from "./sides";

/**
 * The cell a spell is aimed at the moment it is picked, so that on a phone a
 * cast is often one tap on the spell and one on the gold disc, and the board
 * is only touched to aim elsewhere. It is a suggestion the player can see
 * (the area is drawn on it) and change, never a cast on its own.
 *
 * - A spell cast on yourself: your own cell.
 * - A spell that helps (no damage, an effect that adds): the ally — you
 *   included — with the least health left, among those it can reach.
 * - A spell that harms: an enemy it would finish, else the one with the
 *   least health, the nearer on a tie.
 * - A spell for an empty or a fallen ally's cell: the reachable cell nearest
 *   to the enemy closest to you, or the fallen ally.
 *
 * Only cells the spell can actually land on are offered (`castable`, the
 * board's own mirror of range and line of sight); with none, there is no aim
 * and the player picks.
 */
export const autoTarget = ({
  spell,
  castable,
  caster,
  players,
  userId,
}: {
  spell: Spell;
  /** Cells the spell can land on, as "x,y". */
  castable: Set<string>;
  caster: Position;
  players: Record<string, Player> | undefined;
  userId: string;
}): Position | null => {
  if (spell.targeting === "self") return caster;

  const key = (p: Position) => `${p.x},${p.y}`;
  const distance = (p: Position) => Math.abs(p.x - caster.x) + Math.abs(p.y - caster.y);
  const standing = Object.entries(players ?? {})
    .filter(([, p]) => p.character.isAlive && p.character.position)
    .map(([id, p]) => ({ id, p, at: p.character.position as Position }));
  const enemies = standing.filter(({ id }) => !sameSide(players, id, userId));

  if (spell.targeting === "fallen" || spell.targeting === "empty") {
    const cells = [...castable].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    });
    if (cells.length === 0) return null;
    if (spell.targeting === "fallen") return cells[0];
    const nearest = [...enemies].sort((a, b) => distance(a.at) - distance(b.at))[0];
    if (!nearest) return null;
    const towards = (c: Position) =>
      Math.abs(c.x - nearest.at.x) + Math.abs(c.y - nearest.at.y);
    return cells.sort((a, b) => towards(a) - towards(b) || distance(a) - distance(b))[0];
  }

  const helps =
    spell.damage <= 0 && !!spell.effect && spell.effect.value > 0 && spell.effect.kind !== "poison" &&
    spell.effect.kind !== "burn" && spell.effect.kind !== "root";

  if (helps) {
    const allies = standing
      .filter(({ id }) => sameSide(players, id, userId))
      .filter(({ at }) => castable.has(key(at)))
      .sort(
        (a, b) =>
          a.p.character.health / Math.max(1, a.p.character.maxHealth) -
            b.p.character.health / Math.max(1, b.p.character.maxHealth) ||
          distance(a.at) - distance(b.at)
      );
    return allies[0]?.at ?? (castable.has(key(caster)) ? caster : null);
  }

  const inReach = enemies
    .filter(({ at }) => castable.has(key(at)))
    .sort((a, b) => {
      const finishes = (e: typeof a) => (spell.damage > 0 && e.p.character.health <= spell.damage ? 0 : 1);
      return (
        finishes(a) - finishes(b) ||
        a.p.character.health - b.p.character.health ||
        distance(a.at) - distance(b.at)
      );
    });
  return inReach[0]?.at ?? null;
};
