import React from "react";
import SpriteAnimation, { Direction } from "../SpriteAnimation";
import { Position } from "../../../types/game";
import { SPRITE } from "../../../constants";
import { AttackKind, outfitSheet } from "../../../utils/fxManifest";

interface CharacterProps {
  screenPosition: Position;
  animation: "idle" | "walk" | "attack" | "die";
  direction: Direction;
  scale: number;
  /** The fighter's chosen colour. Drawn in the sheet's own stock colour if omitted. */
  color?: string;
  /** Fades from 1 to 0 over a death or a rematch's reset. Otherwise fully opaque. */
  opacity?: number;
  /**
   * The sheets of the outfit it wears, under public/animation/outfits/. An
   * outfit is drawn in its own colours — they tell its element — and has two
   * attacks of its own: a swing of its weapon and a throw.
   */
  outfit?: string;
  /** For an attack in an outfit: which of its two poses the spell strikes. */
  attack?: AttackKind;
}

/**
 * Where the feet fall in an outfit's attack frame: its bigger frame keeps the
 * figure lower than the idle one does (the grimoire's anchor is 192,246).
 */
const OUTFIT_ATTACK_FEET = 246 / 384;

const animationConfig = {
  idle: {
    spriteSheet: "/animation/Idle.png",
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
    spriteSheet: "/animation/Walk.png",
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
  attack: {
    spriteSheet: "/animation/Attack.png",
    framesPerDirection: 6,
    frameWidth: 384,
    frameHeight: 384,
    directionMap: {
      N: 0,
      NW: 1,
      W: 2,
      SW: 3,
      S: 4,
      SE: 5,
      E: 6,
      NE: 7,
    },
  },
};

export const Character: React.FC<CharacterProps> = ({
  screenPosition,
  animation,
  direction,
  scale,
  color,
  opacity = 1,
  outfit,
  attack = "ranged",
}) => {
  // No dedicated death sheet — the idle pose sinking and fading away reads
  // fine on its own, and it is what "die" borrows for its frames. A spell
  // that strikes no pose — a gust of wind at your own feet — keeps it idle.
  const pose =
    animation === "die" || (animation === "attack" && outfit && attack === "none")
      ? "idle"
      : animation;
  const base = animationConfig[pose];
  // An outfit's sheets share the original ones' layout, so only the file
  // changes: idle, walk, and its melee or its ranged attack.
  const config = outfit
    ? {
        ...base,
        spriteSheet: outfitSheet(
          outfit,
          pose === "walk"
            ? "Walk"
            : pose === "attack"
              ? attack === "melee"
                ? "AttackMelee"
                : "AttackRanged"
              : "Idle"
        ),
      }
    : base;
  const isDying = animation === "die";

  return (
    <div
      className="absolute"
      style={{
        left: `${screenPosition.x - config.frameWidth * scale * 0.5}px`,
        // The feet, not the middle of the frame: SPRITE.feet is where a
        // sprite's ink ends, and it is what everything hung on a fighter
        // measures from.
        top: `${screenPosition.y - config.frameHeight * scale * (outfit && pose === "attack" ? OUTFIT_ATTACK_FEET : SPRITE.feet)}px`,
        width: `${config.frameWidth * scale}px`,
        height: `${config.frameHeight * scale}px`,
        pointerEvents: "none",
        opacity,
        // Settling down and shrinking a touch as it fades, rather than a
        // flat cross-dissolve, is what sells "falling" instead of "erased".
        transform: isDying
          ? `translateY(${(1 - opacity) * scale * 40}px) scale(${1 - (1 - opacity) * 0.25})`
          : undefined,
        transition: isDying ? "opacity 80ms linear, transform 80ms linear" : undefined,
      }}
    >
      <SpriteAnimation
        {...config}
        direction={direction}
        scale={scale}
        color={outfit ? undefined : color}
        accent={outfit ? color : undefined}
      />
    </div>
  );
};
