import React, { useState } from "react";
import { Link } from "react-router-dom";
import SpriteAnimation, {
  Direction,
} from "../components/Game/SpriteAnimation";
import AttackImage from "../animation/Attack.png";
import IdleImage from "../animation/Idle.png";
import WalkImage from "../animation/Walk.png";

const directionMapAttack: Partial<Record<Direction, number>> = {
  N: 0,
  NE: 7,
  E: 6,
  SE: 5,
  S: 4,
  SW: 3,
  W: 2,
  NW: 1,
};

const directionMapDefault: Partial<Record<Direction, number>> = {
  NW: 0,
  W: 1,
  SW: 2,
  S: 3,
  SE: 4,
  E: 5,
  NE: 6,
  N: 7,
};

const spriteSheets = {
  attack: {
    src: AttackImage,
    frames: 7,
    width: 384,
    height: 384,
    directionMap: directionMapAttack,
  },
  idle: {
    src: IdleImage,
    frames: 23,
    width: 256,
    height: 256,
    directionMap: directionMapDefault,
  },
  walk: {
    src: WalkImage,
    frames: 7,
    width: 256,
    height: 256,
    directionMap: directionMapDefault,
  },
};

const AnimationPage: React.FC = () => {
  const [spriteSheet, setSpriteSheet] = useState(spriteSheets.attack);
  const [directionIndex, setDirectionIndex] = useState(0);
  const directions: Direction[] = ["NW", "W", "SW", "S", "SE", "E", "NE", "N"];

  const handleDirectionChange = () => {
    setDirectionIndex((prevIndex) => (prevIndex + 1) % directions.length);
  };

  const currentDirection = directions[directionIndex];

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-3xl mb-4">Animation Page</h1>
      <div className="flex space-x-4 mb-4">
        <button
          onClick={() => setSpriteSheet(spriteSheets.attack)}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700"
        >
          Attack
        </button>
        <button
          onClick={() => setSpriteSheet(spriteSheets.idle)}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-700"
        >
          Idle
        </button>
        <button
          onClick={() => setSpriteSheet(spriteSheets.walk)}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-700"
        >
          Walk
        </button>
      </div>
      <button
        onClick={handleDirectionChange}
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700"
      >
        Change Direction
      </button>
      <p className="mb-4">Current Direction: {currentDirection}</p>
      <SpriteAnimation
        spriteSheet={spriteSheet.src}
        framesPerDirection={spriteSheet.frames}
        frameWidth={spriteSheet.width}
        frameHeight={spriteSheet.height}
        direction={currentDirection}
        directionMap={spriteSheet.directionMap}
      />
      <Link to="/">
        <button className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700">
          Go Back
        </button>
      </Link>
    </div>
  );
};

export default AnimationPage;