import { Player, Position } from "../types/game";
import { Spell } from "../types/message";

export type ConfirmAction = {
  kind: "move" | "cast";
  label: string;
  /** The cost or the damage, shown in the bubble's pill. */
  detail: string;
  /** Who a cast lands on, and what it would leave them with. */
  target?: string;
};

interface ConfirmInput {
  touchMode: boolean;
  previewed: Position | null;
  isPositioningPhase: boolean;
  isMyTurn: boolean;
  selectedSpell: Spell | undefined;
  /** Cells the selected spell can land on, as "x,y". */
  castable: Set<string>;
  /** Movement points each reachable cell costs, as "x,y". */
  walkable: Map<string, number>;
  characterPosition: Position | undefined;
  /** Whoever stands on the previewed cell. */
  standing: Player | undefined;
  userId: string;
}

/**
 * What the confirm bubble over a tapped cell should offer, if anything.
 * Only for a finger — a mouse already previewed the cell by hovering — and
 * only for something this player can actually do right now.
 */
export const confirmActionFor = ({
  touchMode,
  previewed,
  isPositioningPhase,
  isMyTurn,
  selectedSpell,
  castable,
  walkable,
  characterPosition,
  standing,
  userId,
}: ConfirmInput): ConfirmAction | null => {
  if (!touchMode || !previewed || isPositioningPhase || !isMyTurn) return null;
  const key = `${previewed.x},${previewed.y}`;

  if (selectedSpell) {
    if (!castable.has(key)) return null;
    const fighter = standing?.character;
    const target = !fighter
      ? undefined
      : standing.userId === userId
        ? "on yourself"
        : selectedSpell.damage > 0
          ? `${fighter.name} · ${fighter.health} → ${Math.max(
              0,
              fighter.health - selectedSpell.damage
            )} hp`
          : fighter.name;
    return {
      kind: "cast",
      label: "Cast",
      detail:
        selectedSpell.damage > 0
          ? `−${selectedSpell.damage}`
          : `${selectedSpell.APCost} AP`,
      target,
    };
  }

  if (
    characterPosition &&
    characterPosition.x === previewed.x &&
    characterPosition.y === previewed.y
  ) {
    return null;
  }
  const cost = walkable.get(key);
  if (cost === undefined || cost === 0) return null;
  return { kind: "move", label: "Move", detail: `${cost} MP` };
};

/**
 * Where the confirm bubble goes: beside the cell, never over it, so whoever
 * stands there and the area stay in view. It opens towards the wider side of
 * the board — for a cell on the right half, that is also away from the spell
 * arc in the bottom-right corner — and stays inside the board vertically.
 */
export const bubblePlacement = (
  cell: Position,
  tile: { width: number; height: number },
  board: { width: number; height: number }
) => {
  const offset = tile.width * 0.5 + 10;
  const toLeft = cell.x > board.width * 0.5;
  return {
    toLeft,
    left: toLeft ? cell.x - offset : cell.x + offset,
    top: Math.min(Math.max(cell.y - tile.height * 0.9, 34), board.height - 34),
  };
};
