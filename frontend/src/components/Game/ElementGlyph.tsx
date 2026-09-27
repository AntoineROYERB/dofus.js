import React, { useEffect, useRef } from "react";
import { elementLook, GLYPH_SIZE } from "../../utils/elements";

interface ElementGlyphProps {
  element: string | undefined;
  /** Its side on screen, in CSS pixels. */
  size?: number;
  className?: string;
}

/**
 * An element's icon, in pixel art like the rest of the game: a flame, a
 * gust, a drop, a stone. It stands for the element everywhere one is shown.
 */
export const ElementGlyph: React.FC<ElementGlyphProps> = ({ element, size = 12, className = "" }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const look = elementLook(element);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !look) return;
    ctx.clearRect(0, 0, GLYPH_SIZE, GLYPH_SIZE);
    look.glyph.forEach((row, y) => {
      const left = Math.floor((GLYPH_SIZE - row.length) / 2);
      [...row].forEach((ch, x) => {
        const colour = ch === "x" ? look.color : ch === "d" ? look.dark : ch === "l" ? look.light : null;
        if (!colour) return;
        ctx.fillStyle = colour;
        ctx.fillRect(left + x, y, 1, 1);
      });
    });
  }, [look]);
  if (!look) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      width={GLYPH_SIZE}
      height={GLYPH_SIZE}
      className={`inline-block flex-none ${className}`}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
};

export default ElementGlyph;
