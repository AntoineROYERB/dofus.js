import React from "react";
import { createPortal } from "react-dom";
import { Spell } from "../../types/message";
import { Position } from "../../types/game";
import { areaPattern } from "../../utils/spellUtils";
import { effectLook } from "./EffectBadges";

const ELEMENT_ICON: Record<string, string> = {
  Fire: "🔥",
  Water: "💧",
  Air: "💨",
  Earth: "🪨",
};

/** One stat, rendered the same way EffectBadges renders a status effect. */
const Badge: React.FC<{ icon: string; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <span className="inline-flex items-center gap-1 border border-hairline px-1.5 py-0.5 font-mono text-[10px] leading-4 text-graphite">
    <span aria-hidden>{icon}</span>
    <span className="tabular-nums text-ink">{children}</span>
  </span>
);

const CELL_W = 16;
const CELL_H = 10;

/** Where a pattern cell's diamond centre lands on screen, isometric-projected. */
const project = (p: Position) => ({
  sx: (p.x - p.y) * (CELL_W / 2),
  sy: (p.x + p.y) * (CELL_H / 2),
});

/**
 * The exact shape a spell will hit, drawn as the same diamond tiles the board
 * uses — a word like "cross" tells you nothing about which cells light up.
 */
const AreaPreview: React.FC<{
  areaOfEffect: Spell["areaOfEffect"];
  color: string;
}> = ({ areaOfEffect, color }) => {
  if (areaOfEffect === "none") return null;

  const { pattern, rotates } = areaPattern(areaOfEffect);
  const points = pattern.map((p) => ({ ...p, ...project(p) }));
  const xs = points.map((p) => p.sx);
  const ys = points.map((p) => p.sy);
  const pad = CELL_W;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const w = maxX - minX;
  const h = maxY - minY;
  const diamond = `${CELL_W / 2},0 ${CELL_W},${CELL_H / 2} ${CELL_W / 2},${CELL_H} 0,${CELL_H / 2}`;

  return (
    <div className="flex items-center gap-2">
      <svg
        viewBox={`${minX} ${minY} ${w} ${h}`}
        width={w}
        height={h}
        className="flex-none"
        aria-hidden
      >
        {points.map((p, i) => {
          const isCentre = p.x === 0 && p.y === 0;
          return (
            <polygon
              key={i}
              points={diamond}
              transform={`translate(${p.sx - CELL_W / 2}, ${p.sy - CELL_H / 2})`}
              fill={color}
              fillOpacity={isCentre ? 0.85 : 0.4}
              stroke={isCentre ? color : "none"}
              strokeWidth={isCentre ? 1 : 0}
            />
          );
        })}
      </svg>
      {rotates && (
        <span className="font-sans text-[10px] leading-tight text-muted">
          faces the target
        </span>
      )}
    </div>
  );
};

interface SpellTooltipProps {
  spell: Spell;
  blocked: string | null;
  /** Screen rect of the slot this tooltip is anchored to. */
  anchorRect: DOMRect;
}

/**
 * The rich hover card that replaces the native `title`. Rendered through a
 * portal because the spell bar scrolls horizontally (`overflow-x-auto`),
 * which — per CSS's auto-computed overflow-y — clips anything positioned
 * above it if it isn't lifted out of that container.
 */
export const SpellTooltip: React.FC<SpellTooltipProps> = ({
  spell,
  blocked,
  anchorRect,
}) => {
  const width = 240;
  const gap = 8;
  const left = Math.min(
    Math.max(anchorRect.left + anchorRect.width / 2 - width / 2, 8),
    window.innerWidth - width - 8
  );
  const showBelow = anchorRect.top < 160;
  const top = showBelow
    ? anchorRect.bottom + gap
    : anchorRect.top - gap;

  const effect = spell.effect;

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[60] border-2 border-ink bg-paper p-2.5 text-ink shadow-lg"
      style={{
        left,
        width,
        top: showBelow ? top : undefined,
        bottom: showBelow ? undefined : window.innerHeight - top,
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-display text-[13px] font-bold leading-tight">
          {spell.name}
        </span>
        <span
          aria-hidden
          className="h-2 w-2 flex-none"
          style={{ backgroundColor: spell.color }}
        />
      </div>

      <div className="mb-1.5 flex flex-wrap gap-1">
        <Badge icon="⚡">{spell.APCost} AP</Badge>
        <Badge icon="📏">
          {spell.range === 0 ? "self" : spell.range}
        </Badge>
        {spell.damage > 0 && (
          <Badge icon="🗡">
            {spell.damage}
            {spell.criticalChance > 0 ? ` (crit ${spell.criticalChance}%)` : ""}
          </Badge>
        )}
        {spell.cooldown > 0 && <Badge icon="⏱">{spell.cooldown}</Badge>}
        {spell.cooldown === 0 && spell.maxCastsPerTurn > 0 && (
          <Badge icon="🔁">{spell.maxCastsPerTurn}/turn</Badge>
        )}
        {spell.range > 0 && spell.needsLineOfSight === false && (
          <Badge icon="👁">ignores line of sight</Badge>
        )}
        {ELEMENT_ICON[spell.element] && (
          <Badge icon={ELEMENT_ICON[spell.element]}>{spell.element}</Badge>
        )}
      </div>

      {effect && (
        <div className="mb-1.5 flex items-center gap-1.5 font-sans text-[10.5px] text-graphite">
          <span aria-hidden>{effectLook[effect.kind]?.icon ?? "•"}</span>
          <span>
            {effect.value > 0 && effect.kind !== "poison" ? "+" : ""}
            {effect.value} {effectLook[effect.kind]?.label ?? effect.kind}
            {" · "}
            {effect.duration} turn{effect.duration > 1 ? "s" : ""}
            {" · "}
            {effect.onSelf ? "on self" : "on target"}
          </span>
        </div>
      )}

      <AreaPreview areaOfEffect={spell.areaOfEffect} color={spell.color} />

      {blocked && (
        <div className="mt-1.5 border-t border-hairline pt-1.5 font-sans text-[10.5px] font-medium text-vermilion">
          {blocked}
        </div>
      )}
    </div>,
    document.body
  );
};

export default SpellTooltip;
