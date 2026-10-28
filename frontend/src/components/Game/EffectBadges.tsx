import React from "react";
import { Effect, EffectKind } from "../../types/message";
import { Key, t, tn } from "../../i18n/lang";

interface EffectBadgesProps {
  effects: Effect[] | null | undefined;
}

export const effectLook: Record<EffectKind, { icon: string; label: Key }> = {
  poison: { icon: "☠", label: "poison" },
  regen: { icon: "✚", label: "regen" },
  shield: { icon: "◈", label: "shield" },
  ap: { icon: "★", label: "AP" },
  mp: { icon: "◆", label: "MP" },
  burn: { icon: "♨", label: "burn" },
  root: { icon: "⊗", label: "rooted" },
};

const describe = (effect: Effect): string => {
  const left = tn("{n} turn left", "{n} turns left", effect.turnsLeft);
  const source = effect.source;
  switch (effect.kind) {
    case "poison":
      return `${source}: ${t("{n} damage a turn", { n: effect.value })}, ${left}`;
    case "regen":
      return `${source}: ${t("heals {n} a turn", { n: effect.value })}, ${left}`;
    case "shield":
      return `${source}: ${t("soaks {n} per hit", { n: effect.value })}, ${left}`;
    case "burn":
      return `${t("Burning ×{n}", { n: effect.value })}: ${t("{n} damage a turn", { n: effect.value * 4 })}, ${left}`;
    case "root":
      return `${source}: ${t("cannot move next turn")}`;
    default:
      return `${source}: ${effect.value > 0 ? "+" : ""}${effect.value} ${t(effectLook[effect.kind].label)}, ${left}`;
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
          <span aria-hidden>{effectLook[effect.kind]?.icon ?? "•"}</span>
          <span className="tabular-nums">
            {effect.kind === "burn"
              ? "×"
              : effect.value > 0 && effect.kind !== "poison" && effect.kind !== "root"
                ? "+"
                : ""}
            {effect.kind === "root" ? "" : effect.value}
          </span>
          <span className="tabular-nums text-muted">·{effect.turnsLeft}</span>
        </span>
      ))}
    </span>
  );
};

export default EffectBadges;
