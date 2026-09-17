import React from "react";
import { createPortal } from "react-dom";
import { Spell } from "../../types/message";
import { Position } from "../../types/game";
import { calculateImpactedCells } from "../../utils/spellUtils";
import { effectLook } from "./EffectBadges";
import { SpellGlyph } from "./SpellGlyph";

const W = 34;
const H = 17;
const LOOP = "2.6s";

/** Board cells shown in the demo: a strip the caster fires along. */
const DEMO_CELLS: Position[] = (() => {
  const out: Position[] = [];
  for (let x = -1; x <= 5; x++) {
    for (let y = -2; y <= 2; y++) {
      if (Math.abs(y) + Math.max(0, -x) <= 2) out.push({ x, y });
    }
  }
  return out.sort((a, b) => a.x + a.y - (b.x + b.y));
})();

const project = (p: Position) => ({
  x: (p.x - p.y) * (W / 2),
  y: (p.x + p.y) * (H / 2),
});

const diamond = (p: Position) => {
  const { x, y } = project(p);
  return `${x},${y - H / 2} ${x + W / 2},${y} ${x},${y + H / 2} ${x - W / 2},${y}`;
};

const Fighter: React.FC<{ at: Position; color: string }> = ({ at, color }) => {
  const { x, y } = project(at);
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx={9} ry={4} fill="#17181a" opacity={0.1} />
      <rect x={-5} y={-22} width={10} height={16} rx={3} fill={color} />
      <circle cy={-27} r={5.5} fill={color} />
    </g>
  );
};

/**
 * What a spell does, played out on a few cells instead of described: the
 * caster, the cells it can reach, the shot, the area it lands on, and what it
 * takes off. Loops for as long as the card is held open.
 */
const SpellDemo: React.FC<{ spell: Spell }> = ({ spell }) => {
  const caster: Position = { x: 0, y: 0 };
  const selfCast = spell.range === 0;
  const target: Position = selfCast
    ? caster
    : { x: Math.min(Math.max(spell.range, 2), 4), y: 0 };
  const inRange = (p: Position) =>
    Math.abs(p.x - caster.x) + Math.abs(p.y - caster.y) <= spell.range;
  const hit = new Set(
    calculateImpactedCells(spell, target, caster).map((p) => `${p.x},${p.y}`),
  );
  const from = project(caster);
  const to = project(target);
  const effect = spell.effect;

  return (
    <svg viewBox="-60 -70 260 120" className="h-[132px] w-full" aria-hidden>
      {DEMO_CELLS.map((p) => {
        const key = `${p.x},${p.y}`;
        return (
          <polygon
            key={key}
            points={diamond(p)}
            fill={!selfCast && inRange(p) ? "#eef2fb" : "#ffffff"}
            stroke="#e2e3e0"
            strokeWidth={0.8}
          />
        );
      })}

      {/* The area, lighting up as the shot lands. */}
      {DEMO_CELLS.filter((p) => hit.has(`${p.x},${p.y}`)).map((p) => (
        <polygon
          key={`hit-${p.x},${p.y}`}
          points={diamond(p)}
          fill={spell.color}
          stroke={spell.color}
          strokeWidth={1}
          opacity={0}
        >
          <animate
            attributeName="opacity"
            values="0;0;0.75;0.75;0"
            keyTimes="0;0.38;0.45;0.75;1"
            dur={LOOP}
            repeatCount="indefinite"
          />
        </polygon>
      ))}

      {!selfCast && <Fighter at={target} color="#8b8d8a" />}
      <Fighter at={caster} color="#17181a" />

      {/* The shot itself. */}
      {!selfCast && (
        <circle r={5} fill={spell.color} opacity={0}>
          <animate
            attributeName="opacity"
            values="0;1;1;0;0"
            keyTimes="0;0.1;0.38;0.42;1"
            dur={LOOP}
            repeatCount="indefinite"
          />
          <animateMotion
            path={`M${from.x},${from.y - 18} Q${(from.x + to.x) / 2},${
              Math.min(from.y, to.y) - 55
            } ${to.x},${to.y - 12}`}
            keyPoints="0;0;1;1"
            keyTimes="0;0.1;0.38;1"
            calcMode="linear"
            dur={LOOP}
            repeatCount="indefinite"
          />
        </circle>
      )}
      {selfCast && (
        <circle
          cx={from.x}
          cy={from.y - 12}
          fill="none"
          stroke={spell.color}
          strokeWidth={2}
        >
          <animate
            attributeName="r"
            values="4;4;26;26"
            keyTimes="0;0.3;0.6;1"
            dur={LOOP}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0.9;0;0"
            keyTimes="0;0.3;0.6;1"
            dur={LOOP}
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* What it does to whoever stood there. */}
      {(spell.damage > 0 || effect) && (
        <text
          x={to.x}
          textAnchor="middle"
          fontFamily="Archivo, system-ui, sans-serif"
          fontWeight={800}
          fontSize={15}
          fill={spell.damage > 0 ? "#d1462f" : spell.color}
          stroke="#fff"
          strokeWidth={3}
          paintOrder="stroke"
          opacity={0}
        >
          {spell.damage > 0
            ? `−${spell.damage}`
            : `${effectLook[effect!.kind]?.icon ?? ""} ${effect!.value > 0 && effect!.kind !== "poison" ? "+" : ""}${effect!.value}`}
          <animate
            attributeName="y"
            values={`${to.y - 30};${to.y - 30};${to.y - 52}`}
            keyTimes="0;0.45;0.9"
            dur={LOOP}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0;1;1;0"
            keyTimes="0;0.44;0.5;0.8;0.92"
            dur={LOOP}
            repeatCount="indefinite"
          />
        </text>
      )}
    </svg>
  );
};

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex items-baseline justify-between gap-3 border-t border-hairline py-1">
    <span className="font-mono text-[9px] uppercase tracking-label text-muted">
      {label}
    </span>
    <span className="text-right font-mono text-[11px] tabular-nums text-ink">
      {value}
    </span>
  </div>
);

interface SpellCardProps {
  spell: Spell;
  /** Why it cannot be cast right now, if it cannot. */
  blocked: string | null;
}

/**
 * The card a long press on a spell opens: the spell playing itself out, and
 * the numbers behind it. It sits over the middle of the screen, clear of the
 * thumb that is holding it open.
 */
export const SpellCard: React.FC<SpellCardProps> = ({ spell, blocked }) => {
  const effect = spell.effect;
  const area =
    spell.areaOfEffect === "none" ? "single cell" : spell.areaOfEffect;

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed left-1/2 top-1/2 z-[70] w-[min(540px,90vw)] -translate-x-1/2 -translate-y-1/2 animate-[card-pop_160ms_ease-out] border border-rule bg-panel p-3 shadow-[0_12px_32px_rgba(23,24,26,0.18)]"
    >
      <div className="flex gap-4">
        <div className="w-[52%] flex-none">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-9 w-9 flex-none place-items-center border border-hairline bg-board"
              style={{ color: spell.color }}
            >
              <SpellGlyph
                spellId={spell.id}
                fallback={spell.icon}
                className="h-6 w-6"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[17px] font-bold leading-tight">
                {spell.name}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-label text-muted">
                {spell.element} · {spell.APCost} AP
              </p>
            </div>
          </div>

          <SpellDemo spell={spell} />
        </div>

        <div className="min-w-0 flex-1">
          {spell.description && (
            <p className="mb-1.5 text-[12px] leading-snug text-graphite">
              {spell.description}
            </p>
          )}
          <Fact
            label="Range"
            value={spell.range === 0 ? "self" : `${spell.range} cells`}
          />
          <Fact label="Area" value={area} />
          {spell.damage > 0 && (
            <Fact
              label="Damage"
              value={`${spell.damage}${
                spell.criticalChance > 0
                  ? ` · crit ${spell.criticalDamage} (${spell.criticalChance}%)`
                  : ""
              }`}
            />
          )}
          {effect && (
            <Fact
              label="Effect"
              value={`${effectLook[effect.kind]?.icon ?? ""} ${
                effect.value > 0 && effect.kind !== "poison" ? "+" : ""
              }${effect.value} ${effectLook[effect.kind]?.label ?? effect.kind} · ${
                effect.duration
              }t · ${effect.onSelf ? "self" : "target"}`}
            />
          )}
          <Fact
            label="Use"
            value={
              spell.cooldown > 0
                ? `${spell.cooldown}-turn cooldown`
                : spell.maxCastsPerTurn > 0
                  ? `${spell.maxCastsPerTurn}× a turn`
                  : "no limit"
            }
          />
          {spell.range > 0 && (
            <Fact
              label="Line of sight"
              value={spell.needsLineOfSight ? "needed" : "ignored"}
            />
          )}
          {blocked && (
            <p className="mt-1.5 border-t border-hairline pt-1.5 text-[11.5px] font-medium text-vermilion">
              {blocked}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SpellCard;
