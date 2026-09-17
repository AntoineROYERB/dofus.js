import React, { useLayoutEffect, useRef, useState } from "react";
import SpriteAnimation from "./SpriteAnimation";
import { CharacterStand, STAND } from "./CharacterStand";

const idle = {
  spriteSheet: "/animation/Idle.png",
  framesPerDirection: 23,
  frameWidth: 256,
  frameHeight: 256,
  directionMap: { NW: 0, W: 1, SW: 2, S: 3, SE: 4, E: 5, NE: 6, N: 7 },
} as const;

/**
 * One fighter around the stand. Several can share it — the home screen's
 * class line-up — each moved by its own style on an inner layer, so the
 * outer layer's placement on the middle tile is never disturbed.
 */
export interface ShowcaseFigure {
  key: string | number;
  color: string;
  style?: React.CSSProperties;
  /** Drawn behind the stand rather than standing on it. */
  behind?: boolean;
}

interface CharacterShowcaseProps {
  color: string;
  /** Replaces the single fighter in `color` when given. */
  figures?: ShowcaseFigure[];
  /** Sizes the stand; the fighter is scaled to whatever width it ends up. */
  className?: string;
  /** The fighter's height in tiles; larger makes it the star of the stand. */
  figureScale?: number;
}

/**
 * The player's fighter, idling on a few cells of the arena. The sprite is
 * sized from the stand's rendered width with the board's own arithmetic, so
 * it stands on the middle tile at any size.
 */
export const CharacterShowcase: React.FC<CharacterShowcaseProps> = ({
  color,
  figures,
  className = "",
  figureScale = 1.7,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = () => {
      const tile = (STAND.tileWidth * stage.offsetWidth) / STAND.viewBox.width;
      if (tile > 0) setScale((tile / 256) * figureScale);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [figureScale]);

  return (
    <div ref={stageRef} className={`relative ${className}`}>
      <CharacterStand className="relative z-[1] block w-full" />
      {(figures ?? [{ key: "only", color }]).map((figure) => (
        <div
          key={figure.key}
          className="pointer-events-none absolute"
          style={{
            // Feet on the middle tile, by the board's own arithmetic.
            left: `${STAND.origin.x * 100}%`,
            top: `${STAND.origin.y * 100}%`,
            transform: `translate(-50%, -${STAND.feet * 100}%)`,
            zIndex: figure.behind ? 0 : 2,
          }}
        >
          <div style={figure.style}>
            <SpriteAnimation
              {...idle}
              direction="S"
              scale={scale}
              color={figure.color}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default CharacterShowcase;
