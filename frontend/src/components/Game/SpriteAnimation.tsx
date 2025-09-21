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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CANVAS_WIDTH = (canvas.width = frameWidth * scale);
    const CANVAS_HEIGHT = (canvas.height = frameHeight * scale);

    const directionRow = directionMap[direction] ?? 0;

    let animationFrameId: number;

    const playerImage = new Image();
    playerImage.src = spriteSheet;

    let frameX = 0;
    let gameFrame = 0;
    const staggerFrames = 5; // plus grand = plus lent

    const animate = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.drawImage(
        playerImage,
        frameX * frameWidth, // X source
        directionRow * frameHeight, // Y source (ligne pour la direction)
        frameWidth,
        frameHeight,
        0,
        0,
        CANVAS_WIDTH,
        CANVAS_HEIGHT
      );

      if (gameFrame % staggerFrames === 0) {
        frameX = (frameX + 1) % framesPerDirection;
      }

      gameFrame++;
      animationFrameId = requestAnimationFrame(animate);
    };

    playerImage.onload = () => {
      cancelAnimationFrame(animationFrameId);
      frameX = 0;
      gameFrame = 0;
      animate();
    };

    return () => {
      cancelAnimationFrame(animationFrameId);
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
