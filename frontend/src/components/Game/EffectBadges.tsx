import React from "react";
import { Effect, EffectKind } from "../../types/message";

interface EffectBadgesProps {
  effects: Effect[] | null | undefined;
}

const look: Record<EffectKind, { icon: string; label: string }> = {
  poison: { icon: "☠", label: "poison" },
  regen: { icon: "✚", label: "regen" },
  shield: { icon: "◈", label: "shield" },
  ap: { icon: "★", label: "AP" },
  mp: { icon: "◆", label: "MP" },
};

const describe = (effect: Effect): string => {
  const turns = `${effect.turnsLeft} turn${effect.turnsLeft > 1 ? "s" : ""}`;
  switch (effect.kind) {
    case "poison":
      return `${effect.source}: ${effect.value} damage a turn, ${turns} left`;
    case "regen":
      return `${effect.source}: heals ${effect.value} a turn, ${turns} left`;
    case "shield":
      return `${effect.source}: soaks ${effect.value} per hit, ${turns} left`;
    default:
      return `${effect.source}: ${effect.value > 0 ? "+" : ""}${effect.value} ${
        look[effect.kind].label
      }, ${turns} left`;
  }
};

/**
 * Status effects have to be visible: losing health at the start of your turn
 * with nothing on screen to explain it reads as a bug, not as poison. They are
 * set in the label face, in graphite, because they are a state and not an
 * alarm — the one colour on this screen is spent elsewhere.
 */
export const EffectBadges: React.FC<EffectBadgesProps> = ({ effects }) => {
  if (!effects || effects.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {effects.map((effect, i) => (
        <span
          key={`${effect.kind}-${effect.source}-${i}`}
          title={describe(effect)}
          className="inline-flex items-center gap-1 border border-hairline px-1.5 font-mono text-[9.5px] leading-4 text-graphite"
        >
          <span aria-hidden>{look[effect.kind]?.icon ?? "•"}</span>
          <span className="tabular-nums">
            {effect.value > 0 && effect.kind !== "poison" ? "+" : ""}
            {effect.value}
          </span>
          <span className="tabular-nums text-muted">·{effect.turnsLeft}</span>
        </span>
      ))}
    </span>
  );
};

export default EffectBadges;
