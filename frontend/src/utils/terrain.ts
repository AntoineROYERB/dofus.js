import { Position } from "../types/game";
import { TerrainCell, TerrainKind, ZoneKind } from "../types/message";
import { t } from "../i18n/lang";

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
  /** What a Stonewarden's pillar soaks up for its owner before it crumbles. */
  pillarHealth: 15,
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
 * to the kinds so a new one cannot ship without saying what it is. Getters,
 * so each read is in the language in force rather than the one at load.
 */
export const TERRAIN_INFO: Record<TerrainKind, { name: string; text: string }> = {
  fire: {
    get name() { return t("Fire"); },
    get text() { return t("One more burn to whoever walks in or starts a turn here. Water puts it out."); },
  },
  smoke: { get name() { return t("Smoke"); }, get text() { return t("Nothing can be seen through it. It can be walked through."); } },
  water: {
    get name() { return t("Water"); },
    get text() { return t("Enemies starting a turn here lose 1 MP; its owner heals {waterHealing}. Puts burns out.", { waterHealing: RULES.waterHealing }); },
  },
  ice: { get name() { return t("Ice"); }, get text() { return t("Whoever steps on it slides on to the far side."); } },
  trap: {
    get name() { return t("Bubble trap"); },
    get text() { return t("The first enemy to step here takes {trapDamage} and cannot move again this turn.", { trapDamage: RULES.trapDamage }); },
  },
  relay: {
    get name() { return t("Pylon"); },
    get text() { return t("Its owner's air spells go out from here whenever it reaches, {relayBonus}% harder. Blocks the way and the view. Breaks after {relayHealth} damage, and hurts every enemy beside it {relayBlast}.", { relayBonus: RULES.relayBonus, relayHealth: RULES.relayHealth, relayBlast: RULES.relayBlast }); },
  },
  crater: { get name() { return t("Crater"); }, get text() { return t("Nobody can walk through it."); } },
  fissure: { get name() { return t("Fissure"); }, get text() { return t("Nobody can walk through it."); } },
  pillar: {
    get name() { return t("Cairn"); },
    get text() { return t("Raised by a Stonewarden. Nothing walks through it or sees past it. Takes the blows aimed at its owner in the eight cells around it, a stone for every 3, until it has soaked up {pillarHealth}.", { pillarHealth: RULES.pillarHealth }); },
  },
};

export const ZONE_INFO: Record<ZoneKind, { name: string; text: string }> = {
  storm: {
    get name() { return t("Storm"); },
    get text() { return t("Strikes every enemy inside at the start of their turn, {conductBonus}% harder in water.", { conductBonus: RULES.conductBonus }); },
  },
  maelstrom: {
    get name() { return t("Maelstrom"); },
    get text() { return t("Drags enemies inside back to its centre and strips their buffs."); },
  },
  drums: {
    get name() { return t("Thunder drums"); },
    get text() { return t("Struck again at the start of each of its owner's turns, harder on the last beat."); },
  },
};
