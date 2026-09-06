import React, { useLayoutEffect, useRef, useState } from "react";
import { Position, Character } from "../../../types/game";
import { EffectBadges } from "../EffectBadges";
import { effectTotal } from "../../../utils/effectUtils";

interface CharacterTooltipProps {
  /** The animated position, so the card follows a moving fighter. */
  screenPosition: Position;
  tileSize: { width: number; height: number };
  character: Character;
  /**
   * The board's own clipping box. It — not the browser window — is what cuts
   * the card off: the board is `overflow-hidden` so panning and pinch-zoom
   * never spill onto the rest of the page, and that clips a card just as
   * happily as it clips the board's own tiles. Keeping the card inside this
   * box, rather than the viewport, is what actually keeps it fully visible.
   */
  clipRef: React.RefObject<HTMLDivElement>;
}

/**
 * A stats card hovering over a fighter — the same figures the bottom bar
 * shows for the current player, but readable for anyone on the board
 * without switching who is selected. It sits above the sprite's head
 * rather than replacing it, so the pose underneath stays visible.
 */
export const CharacterTooltip: React.FC<CharacterTooltipProps> = ({
  screenPosition,
  tileSize,
  character,
  clipRef,
}) => {
  const shield = effectTotal(character.effects, "shield");
  // Mid-turn, a fighter's own actionPoints/movementPoints are their live,
  // spendable count. Between turns those fields just sit on whatever was
  // left over when they last acted — 0/0 right after spending it all — so
  // anyone else is shown what they'll actually start their next turn with.
  const actionPoints = character.isCurrentTurn
    ? character.actionPoints
    : character.maxActionPoints;
  const movementPoints = character.isCurrentTurn
    ? character.movementPoints
    : character.maxMovementPoints;

  const ref = useRef<HTMLDivElement>(null);
  // How far the card has to be nudged back onto the screen. A fighter at the
  // top edge would otherwise draw its card above the viewport, and one near
  // a side edge would draw it half off-screen — both unreadable.
  const [nudge, setNudge] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    const board = clipRef.current;
    if (!el || !board) return;
    // Measured before this render's nudge, so the two never compound.
    el.style.transform = "translate(-50%, -100%)";
    const rect = el.getBoundingClientRect();
    const bounds = board.getBoundingClientRect();
    const margin = 8;
    let dx = 0;
    let dy = 0;
    if (rect.left < bounds.left + margin) dx = bounds.left + margin - rect.left;
    if (rect.right > bounds.right - margin) {
      dx = bounds.right - margin - rect.right;
    }
    // Flip below the fighter's feet rather than clip against the board's own
    // top edge: cancels the card's own upward offset and its -100%
    // translate, then adds a small gap under the feet.
    if (rect.top < bounds.top + margin) {
      dy = rect.height + tileSize.height * 1.9 + tileSize.height * 0.3;
    }
    setNudge((prev) => (prev.x === dx && prev.y === dy ? prev : { x: dx, y: dy }));
  }, [screenPosition.x, screenPosition.y, tileSize.height, clipRef]);

  return (
    <div
      ref={ref}
      className="absolute z-20 flex flex-col items-center gap-1 whitespace-nowrap border border-hairline bg-paper px-2 py-1.5 shadow-sm"
      style={{
        left: `${screenPosition.x}px`,
        top: `${screenPosition.y - tileSize.height * 1.9}px`,
        transform: `translate(-50%, -100%) translate(${nudge.x}px, ${nudge.y}px)`,
        pointerEvents: "none",
      }}
    >
      <span className="font-display text-[13px] font-bold leading-none text-ink">
        {character.name}
      </span>
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-[11px] font-bold tabular-nums text-vermilion">
          {character.health}
          <span className="ml-0.5 text-[8.5px] font-normal uppercase text-muted">
            hp
          </span>
        </span>
        <span className="font-mono text-[11px] font-bold tabular-nums text-pa">
          {actionPoints}
          <span className="ml-0.5 text-[8.5px] font-normal uppercase text-muted">
            ap
          </span>
        </span>
        <span className="font-mono text-[11px] font-bold tabular-nums text-pm">
          {movementPoints}
          <span className="ml-0.5 text-[8.5px] font-normal uppercase text-muted">
            mp
          </span>
        </span>
        {shield > 0 && (
          <span className="font-mono text-[11px] font-bold tabular-nums text-graphite">
            {shield}
            <span className="ml-0.5 text-[8.5px] font-normal uppercase text-muted">
              shield
            </span>
          </span>
        )}
      </div>
      {character.effects && character.effects.length > 0 && (
        <EffectBadges effects={character.effects} />
      )}
    </div>
  );
};

export default CharacterTooltip;
