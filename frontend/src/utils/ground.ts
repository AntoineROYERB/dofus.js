import { Position } from "../types/game";
import { GroundCell } from "../types/message";

/**
 * The island ground's rules, as far as the board has to know them to promise
 * only what the server will accept: which cells stop feet, which stop sight,
 * and what a step costs. They mirror the modules in the server's ground.go —
 * what each terrain is called and the sentence a player reads come from the
 * catalogue instead, with the islands.
 */
const RULES: Record<string, { solid?: boolean; blocksSight?: boolean; enterCost?: number }> = {
  tall_grass: {},
  rock: { solid: true, blocksSight: true },
  shallow_water: { enterCost: 2 },
  ice: {},
  acid_pool: {},
  lava: { solid: true },
  air_current: {},
};

/** Every terrain the board knows the rules of, sorted. */
export const GROUND_KINDS = Object.keys(RULES).sort();

const key = (p: Position) => `${p.x},${p.y}`;

export const groundIndex = (ground: GroundCell[] | null | undefined): Map<string, GroundCell> =>
  new Map((ground ?? []).map((cell) => [key(cell.position), cell]));

export const isSolidGround = (kind: string | undefined): boolean => !!kind && !!RULES[kind]?.solid;

export const groundBlocksSight = (kind: string | undefined): boolean => !!kind && !!RULES[kind]?.blocksSight;

/** What a step onto each cell costs, in movement points. */
export const stepCostOf = (ground: GroundCell[] | null | undefined): ((p: Position) => number) => {
  const at = groundIndex(ground);
  return (p) => RULES[at.get(key(p))?.kind ?? ""]?.enterCost ?? 1;
};
