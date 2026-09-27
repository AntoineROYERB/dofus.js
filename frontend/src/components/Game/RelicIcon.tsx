import React, { useEffect, useRef } from "react";
import { drawRelic, RELIC_BOX } from "../../vfx/relics";

interface RelicIconProps {
  /** The talisman it is. */
  id: string;
  /** How many CSS pixels one of its own pixels takes. */
  unit: number;
  /** Grey and still while its ultimate is charging. */
  charging?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** A talisman's shard, alive: it glows and its element stirs round it. */
export const RelicIcon: React.FC<RelicIconProps> = ({ id, unit, charging, className, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // Whole screen pixels to one of its own, so it stays crisp.
  const u = Math.max(1, Math.round(unit * dpr));
  const side = (RELIC_BOX * u) / dpr;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = canvas.height = RELIC_BOX * u;
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawRelic(ctx, id, 0, 0, u, (now - start) / 1000, !charging);
      if (!charging) frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [id, u, charging]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{ width: side, height: side, imageRendering: "pixelated", ...style }}
    />
  );
};

export default RelicIcon;
