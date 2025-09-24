import { Spell, SPELLS } from "../../data/spells";
import { Position } from "../types/game";

// Rotate a position based on the direction
const rotate = (
  pos: Position,
  direction: "up" | "down" | "left" | "right"
): Position => {
  const { x, y } = pos;
  switch (direction) {
    case "up":
      return { x, y };
    case "down":
      return { x: -x, y: -y };
    case "left":
      return { x: -y, y: x };
    case "right":
      return { x: y, y: -x };
  }
};

// Get the direction from one position to another
function getDirection(
  from: Position,
  to: Position
): "up" | "down" | "left" | "right" | null {
  if (from.x === to.x) {
    return from.y > to.y ? "down" : "up";
  } else if (from.y === to.y) {
    return from.x > to.x ? "left" : "right";
  }
  return null;
}

// Check if a position is within the range of a spell cast by a caster at a specific position
export function isInSpellAffectedArea(
  center: Position,
  casterPos: Position,
  spellId: number
): boolean {
  const dx = center.x - casterPos.x;
  const dy = center.y - casterPos.y;
  const spell = SPELLS[spellId - 1];
  if (!spell) {
    console.error(`Spell with ID ${spellId} not found`);
    return false;
  }
  const distance = Math.abs(dx) + Math.abs(dy);
  if (distance > spell.range) {
    return false;
  }

  if (
    spell.castInLineOnly &&
    center.x !== casterPos.x &&
    center.y !== casterPos.y
  ) {
    return false;
  }
  if (spell.castInLineOnly) {
    return true;
  }
  return true;
}

// Get all cells affected by a spell given its range and the caster's position.
export function getCellsInRange(spell: Spell, casterPos: Position): Position[] {
  const affectedCells: Position[] = [];
  const range = spell.range;

  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      if (Math.abs(dx) + Math.abs(dy) <= range) {
        affectedCells.push({
          x: casterPos.x + dx,
          y: casterPos.y + dy,
        });
      }
    }
  }

  return affectedCells;
}

// Calculate impacted cells by a spell given its ID and target position.
export function calculateImpactedCells(
  spellId: number,
  targetPos: Position,
  casterPosition: Position
): Position[] {
  const spell = SPELLS[spellId - 1];
  const impactedCells: Position[] = [];

  if (!spell) {
    console.error(`Spell with ID ${spellId} not found`);
    return impactedCells;
  }

  const applyPattern = (
    pattern: Position[],
    rotatePattern: boolean = false
  ) => {
    const direction = rotatePattern
      ? getDirection(casterPosition, targetPos)
      : null;
    pattern.forEach((offset) => {
      const transformed = direction ? rotate(offset, direction) : offset;
      impactedCells.push({
        x: targetPos.x + transformed.x,
        y: targetPos.y + transformed.y,
      });
    });
  };

  switch (spell.areaOfEffect) {
    case "none":
      impactedCells.push(targetPos);
      break;
    case "circle":
      applyPattern([
        { x: 2, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 2 },
        { x: -1, y: 1 },
        { x: -2, y: 0 },
        { x: 1, y: -1 },
        { x: 0, y: -2 },
        { x: -1, y: -1 },
      ]);
      break;
    case "line":
      applyPattern(
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: 2 },
        ],
        true
      );
      break;
    case "cross":
      applyPattern(
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: -1 },
        ],
        true
      );
      break;
    default:
      console.error(`Unknown area of effect: ${spell.areaOfEffect}`);
  }

  return impactedCells;
}
