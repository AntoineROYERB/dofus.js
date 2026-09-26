import { Position } from "../types/game";
import { TerrainCell, TerrainKind, ZoneKind } from "../types/message";

/** Numbers the server's rules are written with, mirrored for what the UI says. */
export const RULES = {
  /** Burn damage each stack does at the start of its victim's turn. */
  burnDamagePerStack: 4,
  /** The first turn an ultimate can be cast. */
  ultimateFromTurn: 2,
  trapDamage: 10,
  waterHealing: 5,
  /** Extra damage, in percent, an air spell deals through its relay. */
  relayBonus: 75,
  /** What a relay's pylon takes before it breaks. */
  relayHealth: 12,
  /** What a breaking pylon does to each of its owner's enemies beside it. */
  relayBlast: 10,
  /** Extra damage, in percent, water adds to lightning and storms. */
  conductBonus: 50,
} as const;

/** Damage raised by a percentage bonus, rounded down like the server. */
export const withBonus = (damage: number, percent: number): number =>
  Math.floor((damage * (100 + percent)) / 100);

const key = (p: Position) => `${p.x},${p.y}`;

/** Ground nobody can walk through, whoever is standing where. */
export const isSolidTerrain = (kind: TerrainKind | undefined): boolean =>
  kind === "crater" || kind === "fissure" || kind === "relay";

/** What a spell left that hides what is behind it: smoke, and a pylon. */
export const terrainBlocksSight = (kind: TerrainKind | undefined): boolean =>
  kind === "smoke" || kind === "relay";

/** The board's terrain, looked up by cell. */
export const terrainIndex = (
  terrain: TerrainCell[] | null | undefined
): Map<string, TerrainCell> =>
  new Map((terrain ?? []).map((cell) => [key(cell.position), cell]));

/** Where a player's relay stands, if they have one out. */
export const relayOf = (
  terrain: TerrainCell[] | null | undefined,
  owner: string
): Position | null =>
  (terrain ?? []).find((cell) => cell.kind === "relay" && cell.owner === owner)
    ?.position ?? null;

/**
 * What each kind of ground does, in the words the hover card uses. Kept next
 * to the kinds so a new one cannot ship without saying what it is.
 */
export const TERRAIN_INFO: Record<TerrainKind, { name: string; text: string }> = {
  fire: {
    name: "Fire",
    text: "One more burn to whoever walks in or starts a turn here. Water puts it out.",
  },
  smoke: { name: "Smoke", text: "Nothing can be seen through it. It can be walked through." },
  water: {
    name: "Water",
    text: `Enemies starting a turn here lose 1 MP; its owner heals ${RULES.waterHealing}. Puts burns out.`,
  },
  ice: { name: "Ice", text: "Whoever steps on it slides on to the far side." },
  trap: {
    name: "Bubble trap",
    text: `The first enemy to step here takes ${RULES.trapDamage} and cannot move again this turn.`,
  },
  relay: {
    name: "Pylon",
    text: `Its owner's air spells go out from here whenever it reaches, ${RULES.relayBonus}% harder. Blocks the way and the view. Breaks after ${RULES.relayHealth} damage, and hurts every enemy beside it ${RULES.relayBlast}.`,
  },
  crater: { name: "Crater", text: "Nobody can walk through it." },
  fissure: { name: "Fissure", text: "Nobody can walk through it." },
  pillar: { name: "Pillar", text: "Raised by a Stonewarden. Nothing walks through it or sees past it." },
};

export const ZONE_INFO: Record<ZoneKind, { name: string; text: string }> = {
  storm: {
    name: "Storm",
    text: `Strikes every enemy inside at the start of their turn, ${RULES.conductBonus}% harder in water.`,
  },
  maelstrom: {
    name: "Maelstrom",
    text: "Drags enemies inside back to its centre and strips their buffs.",
  },
};
