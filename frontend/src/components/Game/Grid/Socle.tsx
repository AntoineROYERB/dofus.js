import React from "react";
import { BOARD } from "../../../constants";
import { Position } from "../../../types/game";

interface SocleProps {
  /** The animated position, so the ring walks with the fighter it belongs to. */
  screenPosition: Position;
  tileSize: { width: number; height: number };
  /** The colour this player chose when they named their character. */
  color: string;
  isPlaying: boolean;
  isAlive: boolean;
  /** Fades from 1 to 0 as the fighter standing on it dies or is reset. */
  opacity?: number;
}

/**
 * A ring on the ground under a fighter, in the colour that player picked.
 *
 * Every character on the board is drawn from the same sprite sheet, so until
 * now the only way to tell two fighters apart was to remember where each one
 * was standing. The mark goes under the feet rather than on the sprite because
 * a cell is the board's unit of reading: two characters overlapping, or one
 * standing behind cover, still leave their own cell visible.
 *
 * It carries the turn as well. That used to live only in the bar at the top of
 * the screen, which is the wrong end of the screen to be looking at while you
 * are aiming.
 */
export const Socle: React.FC<SocleProps> = ({
  screenPosition,
  tileSize,
  color,
  isPlaying,
  isAlive,
  opacity = 1,
}) => {
  const w = tileSize.width * (1 - BOARD.socle.inset);
  const h = tileSize.height * (1 - BOARD.socle.inset);
  const diamond = (dw: number, dh: number) =>
    `${dw / 2},0 ${dw},${dh / 2} ${dw / 2},${dh} 0,${dh / 2}`;

  // The ink ring sits outside the coloured one, so the two never overprint.
  const gap = tileSize.height * 0.1;
  const boxW = w + gap * 2;
  const boxH = h + gap * 2;

  return (
    <div
      className="absolute"
      style={{
        left: `${screenPosition.x - boxW / 2}px`,
        top: `${screenPosition.y - boxH / 2}px`,
        width: `${boxW}px`,
        height: `${boxH}px`,
        pointerEvents: "none",
        opacity,
      }}
    >
      <svg
        width={boxW}
        height={boxH}
        viewBox={`0 0 ${boxW} ${boxH}`}
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        <g transform={`translate(${gap}, ${gap})`}>
          <polygon
            points={diamond(w, h)}
            fill={isAlive ? color : "none"}
            fillOpacity={isPlaying ? BOARD.socle.fillPlaying : BOARD.socle.fill}
            stroke={isAlive ? color : BOARD.socle.out}
            strokeWidth={BOARD.socle.stroke}
            /*
             * A broken line, not a faded one: a knocked-out fighter has to read
             * as out to anyone who cannot separate the colour from the ground.
             */
            strokeDasharray={isAlive ? undefined : `${Math.max(3, w * 0.06)}`}
          />
        </g>
        {isPlaying && isAlive && (
          <polygon
            points={diamond(boxW, boxH)}
            fill="none"
            stroke={BOARD.socle.turn}
            strokeWidth={BOARD.socle.turnStroke}
          />
        )}
      </svg>
    </div>
  );
};

export default Socle;
