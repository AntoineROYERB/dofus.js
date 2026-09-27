import React, { useRef, useState } from "react";
import { Champion, ContentResponse, Loadout } from "../../types/message";
import { championOf, kitOf } from "../../utils/loadoutUtils";
import {
  CharacterShowcase,
  ShowcaseFigure,
} from "../Game/CharacterShowcase";
import { lineUpSlot, mod, shownPosition } from "../../utils/lineUp";
import { elementLook } from "../../utils/elements";
import { ElementGlyph } from "../Game/ElementGlyph";

interface SetCarouselProps {
  content: ContentResponse;
  /** What the character wears and carries now. */
  loadout: Loadout;
  /** The player's colour, on the trims of the set they wear. */
  color: string;
  onSelect: (champion: Champion) => void;
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
 * The champions' sets on the home screen. The stand never moves; the fighters
 * do. The set worn stands on it, the others wait either side in the
 * background, and the arrows (or a swipe) slide the whole line one place,
 * each fighter in its outfit's colour. A set of the player's own making —
 * mixed in the wardrobe — stands in the place of the champion whose outfit
 * it wears.
 *
 * Fighters are keyed by an unbounded position rather than by set, so turning
 * past the last set keeps sliding the same way instead of jumping back across
 * the stand.
 */
export const SetCarousel: React.FC<SetCarouselProps> = ({
  content,
  loadout,
  color,
  onSelect,
}) => {
  const champions = content.champions;
  const count = champions.length;
  const worn =
    championOf(loadout, champions) ??
    champions.find((c) => c.set.outfit === loadout.outfit);
  const selectedIndex = Math.max(0, champions.findIndex((c) => c.id === worn?.id));
  const [position, setPosition] = useState(selectedIndex);
  // A set picked elsewhere moves the line to it without a slide.
  const shown = shownPosition(position, selectedIndex, count);
  const kit = kitOf(loadout, content);
  const colourOf = (champion: Champion) =>
    kitOf(champion.set, content)?.outfit.palette.primary ?? "#000000";

  const turn = (dir: -1 | 1) => {
    const next = shown + dir;
    setPosition(next);
    onSelect(champions[mod(next, count)]);
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
      // The set worn is the player's, in their colour; the others wait in
      // their champions'.
      color: offset === 0 ? color : colourOf(champions[mod(slot, count)]),
      // The set worn stands in the character's own outfit; the others wait
      // in their champions'.
      outfit:
        offset === 0
          ? kit?.outfit.sprite
          : kitOf(champions[mod(slot, count)].set, content)?.outfit.sprite,
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
            color={color}
            figures={figures}
            glyph={kit?.grimoire.glyph}
            talisman={kit ? content.spells[kit.talisman.ultimate]?.color : undefined}
            talismanId={kit?.talisman.id}
            figureScale={2.7}
            className="w-full"
          />
          <Arrow dir={-1} onClick={() => turn(-1)} label="Previous set" />
          <Arrow dir={1} onClick={() => turn(1)} label="Next set" />
        </div>
      </div>

      <p
        aria-live="polite"
        className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-graphite"
      >
        <ElementGlyph element={kit?.element} size={12} />
        <b className="font-semibold" style={{ color: elementLook(kit?.element)?.dark }}>
          {kit?.element}
        </b>
        <b className="font-semibold text-ink">{kit?.grimoire.name}</b>
        <span>
          {kit?.grimoire.health} hp · {kit?.grimoire.actionPoints} ap ·{" "}
          {kit?.grimoire.movementPoints} mp
        </span>
      </p>
      {/* Always two lines tall, so the screen does not jump between sets. */}
      <p className="mt-0.5 line-clamp-2 min-h-[2lh] max-w-[40ch] text-center text-[11px] leading-snug text-graphite">
        {kit?.grimoire.passive} · {kit?.rune.name}: {kit?.rune.description}
      </p>
    </div>
  );
};

export default SetCarousel;
