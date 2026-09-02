import React, { useRef, useEffect } from "react";

export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

interface SpriteAnimationProps {
  spriteSheet: string;
  framesPerDirection: number;
  frameWidth: number;
  frameHeight: number;
  direction: Direction;
  directionMap: Partial<Record<Direction, number>>;
  scale?: number;
}

const SpriteAnimation: React.FC<SpriteAnimationProps> = ({
  spriteSheet,
  framesPerDirection,
  frameWidth,
  frameHeight,
  direction,
  directionMap,
  scale = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Kept across runs so a resize or a change of direction does not restart the
  // walk cycle from its first frame.
  const animationState = useRef({
    frameX: 0,
    gameFrame: 0,
    lastSpriteSheet: spriteSheet,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CANVAS_WIDTH = (canvas.width = Math.round(frameWidth * scale));
    const CANVAS_HEIGHT = (canvas.height = Math.round(frameHeight * scale));

    const directionRow = directionMap[direction] ?? 0;

    const playerImage = new Image();
    playerImage.src = spriteSheet;

    playerImage.onerror = () => {
      console.error(`Failed to load sprite sheet: ${spriteSheet}`);
    };

    const staggerFrames = 5; // plus grand = plus lent

    /*
     * Both of these are per-run, not shared through the ref. They used to live
     * on the ref, so a second run — a resize, a change of pose — could cancel
     * its own frame instead of the previous run's, and the old loop carried on
     * drawing at the old size into the corner of the resized canvas.
     */
    let cancelled = false;
    let rafId = 0;

    const animate = () => {
      if (cancelled) return;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.drawImage(
        playerImage,
        animationState.current.frameX * frameWidth, // X source
        directionRow * frameHeight, // Y source (ligne pour la direction)
        frameWidth,
        frameHeight,
        0,
        0,
        CANVAS_WIDTH,
        CANVAS_HEIGHT
      );

      if (animationState.current.gameFrame % staggerFrames === 0) {
        animationState.current.frameX =
          (animationState.current.frameX + 1) % framesPerDirection;
      }

      animationState.current.gameFrame++;
      rafId = requestAnimationFrame(animate);
    };

    const start = () => {
      if (cancelled) return;

      if (animationState.current.lastSpriteSheet !== spriteSheet) {
        animationState.current.frameX = 0;
        animationState.current.gameFrame = 0;
        animationState.current.lastSpriteSheet = spriteSheet;
      }

      animate();
    };

    // A cached sheet is complete before onload could ever fire.
    if (playerImage.complete && playerImage.naturalWidth > 0) {
      start();
    } else {
      playerImage.onload = start;
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    spriteSheet,
    framesPerDirection,
    frameWidth,
    frameHeight,
    direction,
    directionMap,
    scale,
  ]);

  return (
    <div>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default SpriteAnimation;
