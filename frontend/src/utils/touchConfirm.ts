import { t } from "../i18n/lang";
import { Player, Position } from "../types/game";
import { Spell } from "../types/message";

export type ConfirmAction = {
  kind: "move" | "cast";
  label: string;
  /** The cost or the damage, shown on the gold disc under its label. */
  detail: string;
  /** Who a cast lands on, and what it would leave them with. */
  target?: string;
  /** What lies on the cell, when something does: a finger has no hover card. */
  ground?: string;
};

/** A confirm action, with the cell it would act on: what the gold disc does. */
export type AimedAction = ConfirmAction & { cell: Position };

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
  /**
   * What the cast would really take off, relay and water included. Left out,
   * the spell's catalogue damage is shown.
   */
  expectedDamage?: number;
  /** A word on why the damage differs, such as the relay's bonus. */
  damageNote?: string;
  /** What lies on the previewed cell, if anything. */
  ground?: string;
}

/**
 * What the gold disc should offer for the aimed cell, if anything: a cast or
 * a walk, with what it costs and whom it hits. It used to be a bubble beside
 * the tapped cell, which sent the finger back across the board to press it;
 * the disc is under the thumb. Only for something this player can actually
 * do right now.
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
  expectedDamage,
  damageNote,
  ground,
}: ConfirmInput): ConfirmAction | null => {
  if (!touchMode || !previewed || isPositioningPhase || !isMyTurn) return null;
  const key = `${previewed.x},${previewed.y}`;

  if (selectedSpell) {
    if (!castable.has(key)) return null;
    const damage = expectedDamage ?? selectedSpell.damage;
    const fighter = standing?.character;
    const target = !fighter
      ? undefined
      : standing.userId === userId
        ? t("on yourself")
        : damage > 0
          ? `${fighter.name} · ${t("{from} → {to} hp", {
              from: fighter.health,
              to: Math.max(0, fighter.health - damage),
            })}`
          : fighter.name;
    return {
      kind: "cast",
      label: t("Cast"),
      detail:
        damage > 0
          ? `−${damage}${damageNote ? ` ${damageNote}` : ""}`
          : t("{n} AP", { n: selectedSpell.APCost }),
      target,
      ground,
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
  return { kind: "move", label: t("Move"), detail: t("{n} MP", { n: cost }), ground };
};
