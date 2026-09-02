import React from "react";
import { Effect, EffectKind } from "../../types/message";

interface EffectBadgesProps {
  effects: Effect[] | null | undefined;
}

const look: Record<EffectKind, { icon: string; label: string; tone: string }> = {
  poison: { icon: "☠", label: "poison", tone: "text-green-700 bg-green-100" },
  regen: { icon: "✚", label: "regen", tone: "text-emerald-700 bg-emerald-100" },
  shield: { icon: "◈", label: "shield", tone: "text-sky-700 bg-sky-100" },
  ap: { icon: "★", label: "AP", tone: "text-blue-700 bg-blue-100" },
  mp: { icon: "◆", label: "MP", tone: "text-amber-700 bg-amber-100" },
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
 * with nothing on screen to explain it reads as a bug, not as poison.
 */
export const EffectBadges: React.FC<EffectBadgesProps> = ({ effects }) => {
  if (!effects || effects.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {effects.map((effect, i) => (
        <span
          key={`${effect.kind}-${effect.source}-${i}`}
          title={describe(effect)}
          className={`inline-flex items-center gap-0.5 px-1 rounded text-[10px] leading-4 ${
            look[effect.kind]?.tone ?? "text-stone-700 bg-stone-100"
          }`}
        >
          <span aria-hidden>{look[effect.kind]?.icon ?? "•"}</span>
          <span className="tabular-nums">
            {effect.value > 0 && effect.kind !== "poison" ? "+" : ""}
            {effect.value}
          </span>
          <span className="opacity-60 tabular-nums">·{effect.turnsLeft}</span>
        </span>
      ))}
    </span>
  );
};

export default EffectBadges;
