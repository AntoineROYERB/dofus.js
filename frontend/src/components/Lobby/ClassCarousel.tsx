import React, { useRef, useState } from "react";
import { CharacterClass } from "../../types/message";
import {
  CharacterShowcase,
  ShowcaseFigure,
} from "../Game/CharacterShowcase";
import { lineUpSlot, mod, shownPosition } from "../../utils/lineUp";

interface ClassCarouselProps {
  classes: CharacterClass[];
  selectedId: string | undefined;
  onSelect: (cls: CharacterClass) => void;
}

/** A line-up slot as a style, sliding between places. */
const place = (offset: number): React.CSSProperties => {
  const { x, y, scale, opacity } = lineUpSlot(offset);
  return {
    transform: `translate(${x}%, ${y}%) scale(${scale})`,
    transformOrigin: "50% 70%",
    opacity,
    transition:
      "transform 380ms cubic-bezier(.2,.8,.2,1), opacity 380ms cubic-bezier(.2,.8,.2,1)",
  };
};

const Arrow: React.FC<{ dir: -1 | 1; onClick: () => void; label: string }> = ({
  dir,
  onClick,
  label,
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`absolute top-[58%] z-10 grid h-11 w-9 -translate-y-1/2 place-items-center text-graphite/70 transition-[color,transform] hover:text-ink active:scale-90 ${
      dir < 0 ? "-left-7" : "-right-7"
    }`}
  >
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  </button>
);

/**
 * The class picker on the home screen. The stand never moves; the fighters
 * do. The chosen class stands on it, the classes either side wait in the
 * background, and the arrows (or a swipe) slide the whole line one place,
 * each fighter in its own class's colour.
 *
 * Fighters are keyed by an unbounded position rather than by class, so
 * turning past the last class keeps sliding the same way instead of jumping
 * back across the stand.
 */
export const ClassCarousel: React.FC<ClassCarouselProps> = ({
  classes,
  selectedId,
  onSelect,
}) => {
  const count = classes.length;
  const selectedIndex = Math.max(
    0,
    classes.findIndex((c) => c.id === selectedId)
  );
  const [position, setPosition] = useState(selectedIndex);
  // A class picked elsewhere moves the line to it without a slide.
  const shown = shownPosition(position, selectedIndex, count);
  const cls = classes[mod(shown, count)];

  const turn = (dir: -1 | 1) => {
    const next = shown + dir;
    setPosition(next);
    onSelect(classes[mod(next, count)]);
  };

  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - start.y)) {
      turn(dx < 0 ? 1 : -1);
    }
  };

  const figures: ShowcaseFigure[] = [-2, -1, 0, 1, 2].map((offset) => {
    const slot = shown + offset;
    return {
      key: slot,
      color: classes[mod(slot, count)].palette.primary,
      style: place(offset),
      behind: offset !== 0,
    };
  });

  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center justify-end">
      <div
        className="relative flex w-full flex-1 touch-pan-y items-end justify-center"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="relative w-[min(62%,calc((100dvh-170px)*1.2))]">
          <CharacterShowcase
            color={cls.palette.primary}
            figures={figures}
            figureScale={2.7}
            className="w-full"
          />
          <Arrow dir={-1} onClick={() => turn(-1)} label="Previous class" />
          <Arrow dir={1} onClick={() => turn(1)} label="Next class" />
        </div>
      </div>

      <p
        aria-live="polite"
        className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-graphite"
      >
        <span
          aria-hidden
          className="h-2 w-2 transition-colors duration-300"
          style={{ backgroundColor: cls.palette.primary }}
        />
        <b className="font-semibold text-ink">
          {cls.symbol} {cls.name}
        </b>
        <span>
          {cls.health} hp · {cls.actionPoints} ap · {cls.movementPoints} mp
        </span>
      </p>
      {cls.passive && (
        <p className="mt-0.5 max-w-[34ch] text-center text-[11px] leading-snug text-graphite">
          {cls.passive}
        </p>
      )}
    </div>
  );
};

export default ClassCarousel;
