import { useEffect, useRef, useState, useCallback } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 3;
/** Below this, close enough to "not zoomed" that letting go snaps back flush. */
const SNAP_BACK_THRESHOLD = 1.05;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/**
 * A phone-only home-screen app has no browser chrome, so there is no native
 * pinch-to-zoom on the board the way a Safari tab would offer one. This
 * reproduces just enough of it — two fingers scale and drag the board inside
 * its own container, one finger keeps moving and casting as before.
 */
export const usePinchZoom = (containerRef: React.RefObject<HTMLDivElement>) => {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);

  // The gesture math runs inside event listeners mounted once; refs, not
  // the state above, are what it reads so a listener never goes stale.
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  scaleRef.current = scale;
  panRef.current = pan;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    distance: number;
    scale: number;
    mid: { x: number; y: number };
    pan: { x: number; y: number };
  } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const clampPan = (nextScale: number, nextPan: { x: number; y: number }) => {
      const rect = container.getBoundingClientRect();
      const maxX = (rect.width * (nextScale - 1)) / 2;
      const maxY = (rect.height * (nextScale - 1)) / 2;
      return {
        x: clamp(nextPan.x, -maxX, maxX),
        y: clamp(nextPan.y, -maxY, maxY),
      };
    };

    const startGesture = () => {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        distance: distance(a, b),
        scale: scaleRef.current,
        mid: midpoint(a, b),
        pan: panRef.current,
      };
      setIsPinching(true);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) startGesture();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size !== 2 || !gesture.current) return;

      e.preventDefault();
      const [a, b] = [...pointers.current.values()];
      const newDistance = distance(a, b);
      const newMid = midpoint(a, b);
      const factor = newDistance / gesture.current.distance;
      const nextScale = clamp(gesture.current.scale * factor, MIN_SCALE, MAX_SCALE);
      const nextPan = {
        x: gesture.current.pan.x + (newMid.x - gesture.current.mid.x),
        y: gesture.current.pan.y + (newMid.y - gesture.current.mid.y),
      };
      setScale(nextScale);
      setPan(clampPan(nextScale, nextPan));
    };

    const endPointer = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);

      if (pointers.current.size < 2) gesture.current = null;

      if (pointers.current.size === 0) {
        setIsPinching(false);
        if (scaleRef.current < SNAP_BACK_THRESHOLD) reset();
      } else if (pointers.current.size === 1) {
        // One finger remains: recenter on it so a re-pinch starts clean.
        startGesture();
      }
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", endPointer);
    container.addEventListener("pointercancel", endPointer);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", endPointer);
      container.removeEventListener("pointercancel", endPointer);
    };
  }, [containerRef, reset]);

  return { scale, pan, isPinching, reset };
};
