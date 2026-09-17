import { Spell, SpellState } from "../types/message";
import { Position } from "../types/game";

type Direction = "up" | "down" | "left" | "right";

// Rotate a pattern offset to face the given direction.
const rotate = (pos: Position, direction: Direction | null): Position => {
  switch (direction) {
    case "down":
      return { x: -pos.x, y: -pos.y };
    case "left":
      return { x: -pos.y, y: pos.x };
    case "right":
      return { x: pos.y, y: -pos.x };
    default:
      return pos;
  }
};

// Orientation from one cell to another, for the four axis-aligned cases.
const getDirection = (from: Position, to: Position): Direction | null => {
  if (from.x === to.x) return from.y > to.y ? "down" : "up";
  if (from.y === to.y) return from.x > to.x ? "left" : "right";
  return null;
};

/**
 * These patterns mirror AreaPattern in the Go server. They drive the hover
 * preview only: the server decides who actually takes damage.
 */
export const areaPattern = (
  areaOfEffect: Spell["areaOfEffect"]
): { pattern: Position[]; rotates: boolean } => {
  switch (areaOfEffect) {
    case "circle":
      return {
        pattern: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 2 },
          { x: -1, y: 1 },
          { x: -2, y: 0 },
          { x: 1, y: -1 },
          { x: 0, y: -2 },
          { x: -1, y: -1 },
        ],
        rotates: false,
      };
    case "line":
      return {
        pattern: [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: 2 },
        ],
        rotates: true,
      };
    case "cross":
      return {
        pattern: [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: -1 },
        ],
        rotates: true,
      };
    default:
      return { pattern: [{ x: 0, y: 0 }], rotates: false };
  }
};

/** Whether a cell is close enough for the caster to target it. */
export function isInSpellRange(
  cell: Position,
  casterPos: Position,
  spell: Spell | undefined
): boolean {
  if (!spell) return false;
  const distance = Math.abs(cell.x - casterPos.x) + Math.abs(cell.y - casterPos.y);
  return distance <= spell.range;
}

/** The cells a spell would cover if it were cast at `targetPos`. */
export function calculateImpactedCells(
  spell: Spell | undefined,
  targetPos: Position,
  casterPosition: Position
): Position[] {
  if (!spell) return [];

  const { pattern, rotates } = areaPattern(spell.areaOfEffect);
  const direction = rotates ? getDirection(casterPosition, targetPos) : null;

  return pattern.map((offset) => {
    const transformed = rotate(offset, direction);
    return { x: targetPos.x + transformed.x, y: targetPos.y + transformed.y };
  });
}

const shapes: Record<Spell["areaOfEffect"], string | null> = {
  none: null,
  circle: "circle",
  cross: "cross",
  line: "line",
};

/** The one line that says what the selected spell actually does. */
export const spec = (spell: Spell): string => {
  const parts = [`${spell.APCost} AP`];
  parts.push(spell.range === 0 ? "on yourself" : `range ${spell.range}`);
  const shape = shapes[spell.areaOfEffect];
  if (shape) parts.push(shape);
  if (spell.cooldown > 0) {
    parts.push(`${spell.cooldown} turn cooldown`);
  } else if (spell.maxCastsPerTurn > 0) {
    parts.push(
      spell.maxCastsPerTurn === 1
        ? "once a turn"
        : `${spell.maxCastsPerTurn}× a turn`
    );
  }
  return parts.join(" · ");
};

/** Why a spell cannot be cast right now, or null when it can. */
export const unavailableReason = (
  spell: Spell,
  state: SpellState | undefined,
  actionPoints: number
): string | null => {
  if (state && state.cooldownLeft > 0) {
    return `recharging — ${state.cooldownLeft} turn${
      state.cooldownLeft > 1 ? "s" : ""
    } left`;
  }
  if (
    spell.maxCastsPerTurn > 0 &&
    state &&
    state.castsThisTurn >= spell.maxCastsPerTurn
  ) {
    return "no casts left this turn";
  }
  if (actionPoints < spell.APCost) return "not enough action points";
  return null;
};
