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
  const animationState = useRef({
    frameX: 0,
    gameFrame: 0,
    animationFrameId: 0,
    lastSpriteSheet: spriteSheet,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CANVAS_WIDTH = (canvas.width = frameWidth * scale);
    const CANVAS_HEIGHT = (canvas.height = frameHeight * scale);

    const directionRow = directionMap[direction] ?? 0;

    const playerImage = new Image();
    playerImage.src = spriteSheet;

    playerImage.onerror = () => {
      console.error(`Failed to load sprite sheet: ${spriteSheet}`);
    };

    const staggerFrames = 5; // plus grand = plus lent

    const animate = () => {
      if (!ctx) return;
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
      animationState.current.animationFrameId = requestAnimationFrame(animate);
    };

    playerImage.onload = () => {
      console.log(
        `Sprite sheet loaded: ${spriteSheet}. Dimensions: ${playerImage.width}x${playerImage.height}`
      );
      cancelAnimationFrame(animationState.current.animationFrameId);

      if (animationState.current.lastSpriteSheet !== spriteSheet) {
        animationState.current.frameX = 0;
        animationState.current.gameFrame = 0;
        animationState.current.lastSpriteSheet = spriteSheet;
      }

      animate();
    };

    return () => {
      cancelAnimationFrame(animationState.current.animationFrameId);
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
