import { Spell, SpellState } from "../types/message";
import { RULES, TERRAIN_INFO, ZONE_INFO } from "./terrain";
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

/**
 * A cell the spell is close enough to reach, and that nothing but the line of
 * sight keeps it out of. Not a legal target — but not nothing either, and the
 * board draws it as its own thing: a player told only "not in range" cannot
 * tell a wall from a distance, and so cannot tell whether walking two cells
 * sideways would fix it.
 *
 * A cell that is seen and merely illegal for some other reason — occupied,
 * when the spell wants an empty one — is not out of sight and never answers
 * true here.
 */
export function outOfSight(
  spell: Spell | undefined,
  cell: Position,
  caster: Position,
  sightBlocked: (p: Position) => boolean,
  relay: Position | null
): boolean {
  if (!spell || !spell.needsLineOfSight || spell.targeting === "self") return false;
  const origins = [caster, ...(spell.relayed && relay ? [relay] : [])];
  const reaching = origins.filter((from) => distance(from, cell) <= spell.range);
  if (reaching.length === 0) return false;
  return !reaching.some((from) => hasLineOfSight(from, cell, sightBlocked));
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


/** What a spell does besides damage, one short phrase each. */
export const spellMechanics = (spell: Spell): string[] => {
  const out: string[] = [];
  if (spell.push > 0) out.push(`throws back ${spell.push}`);
  if (spell.push < 0) out.push(`drags in ${-spell.push}`);
  if (spell.terrain) out.push(`leaves ${TERRAIN_INFO[spell.terrain].name.toLowerCase()}`);
  if (spell.special === "crater") out.push("digs a crater");
  if (spell.special === "quake") out.push("opens fissures");
  if (spell.special === "pillar") out.push("raises a pillar");
  if (spell.special === "relay") out.push("sets your relay");
  if (spell.special === "leap") out.push("leap");
  if (spell.special === "detonate") out.push("sets burns off");
  if (spell.zone) {
    out.push(`${ZONE_INFO[spell.zone.kind].name.toLowerCase()} · ${spell.zone.duration} turns`);
  }
  if (spell.grantMP > 0) out.push(`+${spell.grantMP} MP now`);
  if (spell.relayed) out.push(`+${RULES.relayBonus}% through your relay`);
  if (spell.conducts) out.push(`+${RULES.conductBonus}% in water`);
  return out;
};


/**
 * What a spell does, in as few words as fit under its name: the damage, then
 * what it leaves on the target, the caster or the board.
 */
export const spellSummary = (spell: Spell): string => {
  const out: string[] = [];
  if (spell.damage > 0) out.push(`${spell.damage} dmg`);
  const e = spell.effect;
  if (e) {
    if (e.kind === "burn") out.push(`+${e.value} burn`);
    else if (e.kind === "root") out.push("roots");
    else if (e.kind === "ap" || e.kind === "mp") {
      out.push(`${e.value > 0 ? "+" : "−"}${Math.abs(e.value)} ${e.kind.toUpperCase()}`);
    } else if (e.kind === "shield") out.push(`shield ${e.value}`);
    else if (e.kind === "regen") out.push(`heal ${e.value}/t`);
    else if (e.kind === "poison") out.push(`poison ${e.value}/t`);
  }
  if (spell.push > 0) out.push(`push ${spell.push}`);
  if (spell.push < 0) out.push(`pull ${-spell.push}`);
  if (spell.grantMP > 0) out.push(`+${spell.grantMP} MP`);
  switch (spell.special) {
    case "detonate":
      out.push("sets burns off");
      break;
    case "leap":
      out.push("leap");
      break;
    case "relay":
      out.push("sets relay");
      break;
    case "pillar":
      out.push("wall");
      break;
    case "crater":
      out.push("crater");
      break;
    case "quake":
      out.push("fissures");
      break;
  }
  if (spell.terrain) out.push(TERRAIN_INFO[spell.terrain].name.toLowerCase());
  if (spell.zone) out.push(`${ZONE_INFO[spell.zone.kind].name.toLowerCase()} ${spell.zone.duration}t`);
  return out.join(" · ");
};
