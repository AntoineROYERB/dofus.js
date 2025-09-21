import React from "react";
import SpriteAnimation, { Direction } from "../SpriteAnimation";
import IdleImage from "../../../animation/Idle.png";
import WalkImage from "../../../animation/Walk.png";
import { Position } from "../../../types/game";

interface CharacterProps {
  screenPosition: Position;
  animation: "idle" | "walk";
  direction: Direction;
  scale: number;
}

const animationConfig = {
  idle: {
    spriteSheet: IdleImage,
    framesPerDirection: 23,
    frameWidth: 256,
    frameHeight: 256,
    directionMap: {
      NW: 0,
      W: 1,
      SW: 2,
      S: 3,
      SE: 4,
      E: 5,
      NE: 6,
      N: 7,
    },
  },
  walk: {
    spriteSheet: WalkImage,
    framesPerDirection: 7,
    frameWidth: 256,
    frameHeight: 256,
    directionMap: {
      NW: 0,
      W: 1,
      SW: 2,
      S: 3,
      SE: 4,
      E: 5,
      NE: 6,
      N: 7,
    },
  },
};

export const Character: React.FC<CharacterProps> = ({
  screenPosition,
  animation,
  direction,
  scale,
}) => {
  const config = animationConfig[animation];

  return (
    <div
      className="absolute"
      style={{
        left: `${screenPosition.x - config.frameWidth * scale * 0.5}px`,
        top: `${screenPosition.y - config.frameHeight * scale * 0.7}px`, // Adjust to better center the character
        width: `${config.frameWidth * scale}px`,
        height: `${config.frameHeight * scale}px`,
        pointerEvents: "none",
      }}
    >
      <SpriteAnimation {...config} direction={direction} scale={scale} />
    </div>
  );
};
