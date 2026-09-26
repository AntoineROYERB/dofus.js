import { TerrainCell } from "../types/message";

/*
 * What a spell leaves on the board, drawn with the armour grimoire's own
 * looping sheets, so the ground a spell leaves behind is the same pixel art
 * as the spell that left it. TerrainLayer's vector drawings are only a fallback
 * for while the sheets are on their way.
 */
export const TERRAIN_SHEETS: Partial<Record<TerrainCell["kind"], string>> = {
  fire: "fire/firewall",
  smoke: "fire/smoke",
  water: "water/water",
  ice: "water/ice",
  trap: "water/bubbles",
  fissure: "earth/fissures",
};
export const ZONE_SHEETS: Record<string, string> = {
  storm: "air/tempest",
  maelstrom: "water/maelstrom",
};
/** A pillar comes up once, in the grimoire's sheet, and stays on its last frame. */
export const PILLAR_SHEET = "earth/pillar";
/**
 * Every sheet the terrain layer keeps on the board. A cast leaves them out of its
 * own animation, so the fire it lays down is not drawn twice over itself.
 */
export const LASTING_SHEETS = new Set<string>([
  ...Object.values(TERRAIN_SHEETS).filter((k): k is string => !!k),
  ...Object.values(ZONE_SHEETS),
  PILLAR_SHEET,
]);
