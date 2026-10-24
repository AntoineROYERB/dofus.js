import React, { useEffect, useRef } from "react";

/*
 * How an overlay is dismissed, shared by every one of them (see Overlay.tsx):
 * Escape, and a tap on the page dimmed around it.
 */

/** Open overlays, newest last: Escape only ever closes the one on top. */
const open: Array<() => void> = [];

export const useEscapeToClose = (onClose: (() => void) | undefined) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  const enabled = !!onClose;

  useEffect(() => {
    if (!enabled) return;
    const close = () => latest.current?.();
    open.push(close);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || open[open.length - 1] !== close) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      open.splice(open.indexOf(close), 1);
    };
  }, [enabled]);
};

/**
 * A tap on the backdrop, and only a tap: a click whose press started inside
 * the card — a scroll, a text selection, a drag that slid off the edge — ends
 * on the backdrop too, and used to close the card under the finger.
 */
export const useBackdropTap = (onClose: (() => void) | undefined) => {
  const pressedHere = useRef(false);
  return {
    onPointerDown: (event: React.PointerEvent) => {
      pressedHere.current = event.target === event.currentTarget;
    },
    onClick: (event: React.MouseEvent) => {
      if (event.target !== event.currentTarget || !pressedHere.current) return;
      pressedHere.current = false;
      onClose?.();
    },
  };
};
