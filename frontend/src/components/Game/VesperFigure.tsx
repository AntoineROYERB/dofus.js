import React, { useEffect, useRef } from "react";
import type { Direction } from "./SpriteAnimation";
import { Gesture, Soul, Vesper, VESPER_ART } from "../../vfx/vesper";

/** Facing left for the directions drawn mirrored; he is only drawn in profile. */
const faceOf = (d: Direction): 1 | -1 => (d === "W" || d === "NW" || d === "SW" || d === "N" ? -1 : 1);

/**
 * One settled frame of each soul, as an image. Icons used to be canvases
 * painted once, and a page that re-rendered around them came back to blank
 * ones; an image keeps what it shows.
 */
const stills = new Map<Soul, string>();
const stillOf = (soul: Soul): string => {
  const hit = stills.get(soul);
  if (hit) return hit;
  const v = new Vesper(soul, 1);
  // A second and a half of standing, so the cape has fallen into place.
  for (let k = 0; k < 90; k++) v.step(1 / 60);
  const c = document.createElement("canvas");
  c.width = VESPER_ART.w;
  c.height = VESPER_ART.h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(VESPER_ART.w, VESPER_ART.h);
  v.render(image.data);
  ctx.putImageData(image, 0, 0);
  const url = c.toDataURL();
  stills.set(soul, url);
  return url;
};

interface VesperFigureProps {
  soul: Soul;
  gesture: Gesture;
  direction: Direction;
  /** Screen pixels to one pixel of a hero's 256 sheet: an art pixel is four of them. */
  scale: number;
  /** One settled frame that never moves, for an icon. */
  still?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Ser Vesper on a canvas of his own, his feet at VESPER_ART's anchor. He is
 * painted at art resolution and scaled up with no smoothing, as every hero
 * is, but redrawn on every frame the screen shows rather than at a sheet's
 * 12 a second: his gestures are functions of real time (vfx/vesper.ts).
 */
export const VesperFigure: React.FC<VesperFigureProps> = ({ soul, gesture, direction, scale, still = false, className, style }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const knight = useRef<Vesper | null>(null);

  // What he does is read by the loop from the ref, so a new gesture never
  // restarts the loop or loses his cloth's momentum.
  const wanted = useRef({ soul, gesture, face: faceOf(direction) });
  wanted.current = { soul, gesture, face: faceOf(direction) };

  useEffect(() => {
    if (still) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!knight.current) knight.current = new Vesper(wanted.current.soul, Math.floor(Math.random() * 1000) + 1);
    const v = knight.current;
    const image = ctx.createImageData(VESPER_ART.w, VESPER_ART.h);
    let raf = 0, last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const w = wanted.current;
      v.setSoul(w.soul);
      v.play(w.gesture, w.face);
      v.step(last ? (now - last) / 1000 : 1 / 60);
      last = now;
      v.render(image.data);
      ctx.putImageData(image, 0, 0);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still]);

  const box: React.CSSProperties = {
    width: VESPER_ART.w * 4 * scale,
    height: VESPER_ART.h * 4 * scale,
    imageRendering: "pixelated",
    pointerEvents: "none",
    display: "block",
    maxWidth: "none",
    ...style,
  };
  if (still) return <img src={stillOf(soul)} alt="" aria-hidden className={className} style={box} />;
  return <canvas ref={canvasRef} width={VESPER_ART.w} height={VESPER_ART.h} aria-hidden className={className} style={box} />;
};

export default VesperFigure;
