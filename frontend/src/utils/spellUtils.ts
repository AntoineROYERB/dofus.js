import { Spell, SpellState } from "../types/message";
import { RULES } from "./terrain";
import { Position } from "../types/game";
import { distance, hasLineOfSight, neighbours } from "./board";

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

// The way a directional area faces: the cast's own direction along a row or
// a column, otherwise the longer of its two axes, so an area aimed on a slant
// still lies straight on the grid. Mirrors facing() on the server.
const getDirection = (from: Position, to: Position): Direction => {
  if (from.x === to.x) return from.y > to.y ? "down" : "up";
  if (from.y === to.y) return from.x > to.x ? "left" : "right";
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "down" : "up";
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
      // Every cell within two steps, the centre and its four neighbours
      // included.
      return {
        pattern: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
          { x: 0, y: -1 },
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
    case "wall":
      // Across the cast, centred on the target.
      return {
        pattern: [
          { x: -2, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
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

/**
 * Where a spell aimed at `cell` would be cast from: the caster's relay, for a
 * spell that can use one and whenever the relay reaches, otherwise the
 * caster's own cell if it lands from there, otherwise nowhere. Mirrors
 * castOriginLocked on the server.
 */
export function castOrigin(
  spell: Spell,
  cell: Position,
  caster: Position,
  sightBlocked: (p: Position) => boolean,
  relay: Position | null
): Position | null {
  if (spell.targeting === "self") {
    return cell.x === caster.x && cell.y === caster.y ? caster : null;
  }
  const reaches = (from: Position) =>
    distance(from, cell) <= spell.range &&
    (!spell.needsLineOfSight || hasLineOfSight(from, cell, sightBlocked));
  if (spell.relayed && relay && reaches(relay)) return relay;
  if (reaches(caster)) return caster;
  return null;
}

/** The cells a spell would cover if it were cast at `targetPos`. */
export function calculateImpactedCells(
  spell: Spell | undefined,
  targetPos: Position,
  casterPosition: Position
): Position[] {
  if (!spell) return [];
  // A leap shakes the cells around where its caster lands.
  if (spell.special === "leap") return neighbours(targetPos);
  if (spell.targeting === "self") targetPos = casterPosition;

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
  wall: "wall",
};

/** The one line that says what the selected spell costs and reaches. */
export const spec = (spell: Spell): string => {
  const parts = [`${spell.APCost} AP`];
  if (spell.targeting === "self") parts.push("on yourself");
  else if (spell.targeting === "empty") parts.push(`a free cell within ${spell.range}`);
  else parts.push(`range ${spell.range}`);
  if (spell.relayed) parts.push("or from your relay");
  const shape = shapes[spell.areaOfEffect];
  if (shape) parts.push(shape);
  if (spell.ultimate) {
    parts.push(`once a fight, from turn ${RULES.ultimateFromTurn}`);
  } else if (spell.cooldown > 0) {
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
  actionPoints: number,
  turnNumber: number
): string | null => {
  if (spell.ultimate && state?.spent) return "already used this fight";
  if (spell.ultimate && turnNumber < RULES.ultimateFromTurn) {
    return `unlocks on turn ${RULES.ultimateFromTurn}`;
  }
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

