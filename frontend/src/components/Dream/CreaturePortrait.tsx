import React, { useEffect, useRef } from "react";
import { ROWS, artOf, creatureSheet } from "../../explore/sprites";

/**
 * A creature of the bestiary standing still, facing the viewer: the first
 * frame of its sheet, drawn at a whole multiple of its art size so it stays
 * on its pixel grid (ART_DIRECTION.md, 5.1).
 */
export const CreaturePortrait: React.FC<{ id: string; zoom?: number; className?: string }> = ({
  id,
  zoom = 1,
  className,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const art = artOf(id);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const draw = () => {
      if (cancelled) return;
      const canvas = ref.current;
      const sheet = creatureSheet(id);
      if (!canvas || !sheet) {
        // The sheet is still loading: look again shortly.
        timer = window.setTimeout(draw, 120);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sheet, 0, ROWS.S * art, art, art, 0, 0, art * zoom, art * zoom);
    };
    draw();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, art, zoom]);

  return (
    <canvas
      ref={ref}
      width={art * zoom}
      height={art * zoom}
      aria-hidden
      className={className}
      style={{ imageRendering: "pixelated" }}
    />
  );
};
