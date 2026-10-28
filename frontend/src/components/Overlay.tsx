import React, { useRef, useState } from "react";
import { useBackdropTap, useEscapeToClose } from "../hooks/useDismiss";
import { t } from "../i18n/lang";

/*
 * Everything the game lays over a screen — a question, a sheet, a card —
 * closes the same three ways: the × in its corner, a tap on the dimmed page
 * around it, and Escape. Each overlay used to answer a different subset of
 * those, behind a nine-pixel "Close" that a thumb could not find, and a press
 * that began inside a card and slipped off it shut the card it was meant for.
 */

/** The × every overlay closes with: a thumb's width, whatever it sits on. */
export const CloseButton: React.FC<{
  onClick: () => void;
  label?: string;
  className?: string;
}> = ({ onClick, label, className = "" }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label ?? t("Close")}
    title={label ?? t("Close")}
    // Graphite on hover, not vermilion: a phone keeps the hover after
    // the tap, and a red × beside the screen's one red button is two.
    className={`grid h-10 w-10 flex-none place-items-center text-ink transition-[color,transform] hover:text-graphite active:scale-90 ${className}`}
  >
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  </button>
);

interface ModalProps {
  /** Absent for a question that must be answered, like a fight's result. */
  onClose?: () => void;
  labelledBy?: string;
  /** The card's own frame and width. */
  className?: string;
  /** How dark the page goes behind it: a fight dims harder than a menu. */
  dim?: "soft" | "hard";
  /** Off where the card already has a Cancel of its own beside its field. */
  closeButton?: boolean;
  children: React.ReactNode;
}

/**
 * A card in the middle of the screen. It never grows past the screen: on a
 * phone held sideways there are barely 300 pixels of height, and a card
 * taller than that used to push its buttons out of reach.
 */
export const Modal: React.FC<ModalProps> = ({
  onClose,
  labelledBy,
  className = "",
  dim = "soft",
  closeButton = true,
  children,
}) => {
  useEscapeToClose(onClose);
  const backdrop = useBackdropTap(onClose);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      {...backdrop}
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] motion-safe:animate-fade-in ${
        dim === "hard" ? "bg-night/80" : "bg-night/65"
      }`}
    >
      <div
        className={`relative max-h-full w-full overflow-y-auto overscroll-contain motion-safe:animate-rise ${className}`}
      >
        {onClose && closeButton && (
          <CloseButton onClick={onClose} className="absolute right-1 top-1" />
        )}
        {children}
      </div>
    </div>
  );
};

interface SideSheetProps {
  title: React.ReactNode;
  onClose: () => void;
  /** Pinned under the scrolling body: the sheet's ways out. */
  footer?: React.ReactNode;
  /** The width, as a Tailwind class. */
  width?: string;
  children: React.ReactNode;
}

/** How far a sheet has to be dragged to the right before it lets go. */
const SWIPE_CLOSE = 72;

/**
 * A panel sliding in from the right edge, the way a phone game's menus do —
 * and going back the way it came: a swipe to the right sends it away, as
 * does the × or a tap on the board left showing beside it.
 */
export const SideSheet: React.FC<SideSheetProps> = ({
  title,
  onClose,
  footer,
  width = "w-[min(380px,88vw)]",
  children,
}) => {
  useEscapeToClose(onClose);
  const backdrop = useBackdropTap(onClose);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; sliding: boolean } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, sliding: false };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== event.pointerId) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    // Only a mostly sideways drag is a dismissal; anything steeper is the
    // log being scrolled.
    if (!s.sliding && dx > 8 && dx > Math.abs(dy) * 1.5) s.sliding = true;
    if (s.sliding) setDrag(Math.max(0, dx));
  };
  const onPointerEnd = () => {
    const sliding = start.current?.sliding;
    start.current = null;
    if (sliding && drag > SWIPE_CLOSE) onClose();
    else setDrag(0);
  };

  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden
        {...backdrop}
        className="absolute inset-0 bg-night/60 motion-safe:animate-fade-in"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          transform: drag ? `translateX(${drag}px)` : undefined,
          transition: drag ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)",
        }}
        className={`absolute bottom-0 right-0 top-0 flex touch-pan-y flex-col rounded-l-3xl border-l-2 border-gold/60 bg-paper pb-[env(safe-area-inset-bottom)] pl-4 pr-[calc(0.5rem+env(safe-area-inset-right))] pt-[max(0.25rem,env(safe-area-inset-top))] shadow-md motion-safe:animate-slide-in ${width}`}
      >
        <div className="flex flex-none items-center justify-between gap-3 border-b border-gold/40">
          <span className="min-w-0 truncate font-display text-[17px] font-bold">
            {title}
          </span>
          <CloseButton onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 pr-2">
          {children}
        </div>
        {footer && (
          <div className="flex flex-none gap-2 border-t border-hairline py-2 pr-2">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
};
