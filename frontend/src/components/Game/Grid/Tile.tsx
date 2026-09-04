import React from "react";
import { Position } from "../../../types/game";
import { BOARD } from "../../../constants";

interface TileProps {
  x: number;
  y: number;
  tileSize: {
    width: number;
    height: number;
  };
  screenPosition: Position;
  isHovered: boolean;
  isValidTarget?: boolean;
  onClick?: () => void;
  isPositioningPhase: boolean;
  /**
   * True while the player still owes the game a starting cell. The cells they
   * may pick breathe until then, and stop the moment the choice is made:
   * movement that outlives the question it was asking is just noise.
   */
  awaitingPlacement: boolean;
  allPlayersInitialPositions: Array<{
    position: Position;
    playerId: string;
    color: string;
    isCurrentPlayer: boolean;
  }>;
  isCharacterTurn: boolean;
  selectedSpellId: number | null;
  isImpactedCell: boolean;
  isInSpellRange: boolean;
  /** In range, but the caster can't actually see it — cover is in the way. */
  isLosBlocked: boolean;
  isInRange: boolean;
  /** The walkable wash only shows once the mouse has reached the board. */
  showMovementWash: boolean;
  /** Movement points this cell costs to reach, when it is reachable at all. */
  movementCost?: number;
  /** The character's movement points this turn — the gradient's far end. */
  maxMovementCost: number;
  isPathCell: boolean;
  hoveredPosition: Position | null;
  /** Cover: nobody stands here and nothing is seen through it. */
  isObstacle: boolean;
  /**
   * For a cell inside the area you may act in: which of its four edges face
   * out of that area, up-left, up-right, down-right, down-left. Undefined for
   * a cell outside it.
   */
  zoneEdges?: boolean[];
}

/**
 * What is laid over a cell's paper: a wash, never a solid colour, so the
 * board's own checker still shows through everything the game marks.
 */
type Wash = {
  fill: string;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  /** A cell you can see but not act on wears a broken line, not a solid one. */
  dashed?: boolean;
};

/**
 * Near is barely tinted, far is unmistakable — a cell one point away should
 * not read the same as one that spends every point the turn has left.
 */
const costOpacity = (cost: number | undefined, maxCost: number): number => {
  if (!cost || maxCost <= 0) return 0.14;
  const share = Math.min(cost / maxCost, 1);
  return 0.08 + share * 0.22;
};

export const Tile: React.FC<TileProps> = ({
  x,
  y,
  tileSize,
  screenPosition,
  isHovered,
  isValidTarget,
  onClick,
  isPositioningPhase,
  awaitingPlacement,
  allPlayersInitialPositions,
  isCharacterTurn,
  selectedSpellId,
  isImpactedCell,
  isInSpellRange,
  isLosBlocked,
  isInRange,
  showMovementWash,
  movementCost,
  maxMovementCost,
  isPathCell,
  hoveredPosition,
  isObstacle,
  zoneEdges,
}) => {
  const { width: w, height: h } = tileSize;
  const points = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;

  // Alternating paper, so the grid reads without needing a heavy outline.
  const base = (Math.abs(x) + Math.abs(y)) % 2 === 0 ? BOARD.tile : BOARD.tileAlt;

  const initialPositionOwner =
    isPositioningPhase && allPlayersInitialPositions
      ? allPlayersInitialPositions.find(
          (item) => item.position.x === x && item.position.y === y
        )
      : undefined;

  const wash = (): Wash | null => {
    const graphite = (opacity: number): Wash => ({
      fill: BOARD.wash,
      opacity,
      stroke: BOARD.stroke,
      strokeWidth: BOARD.strokes.tile,
    });
    // Vermilion means one thing only: this is what the click is about to do.
    const marked = (opacity: number): Wash => ({
      fill: BOARD.accent,
      opacity,
      stroke: BOARD.accent,
      strokeWidth: BOARD.strokes.marked,
    });
    // Green means you may start here — a different question from targeting,
    // so it keeps a colour vermilion never wears during positioning.
    const placeable = (opacity: number): Wash => ({
      fill: BOARD.place,
      opacity,
      stroke: BOARD.place,
      strokeWidth: BOARD.strokes.marked,
    });
    // Seen, not reachable: a heavier wash than the ordinary range, and a
    // broken outline — the one border on the board that isn't a promise.
    const hidden = (opacity: number): Wash => ({
      fill: BOARD.wash,
      opacity,
      stroke: BOARD.zoneEdge,
      strokeWidth: BOARD.strokes.tile,
      dashed: true,
    });

    if (isPositioningPhase && initialPositionOwner) {
      if (initialPositionOwner.isCurrentPlayer) {
        return placeable(isHovered ? 0.5 : 0.26);
      }
      // The opponent's block, in red and crossed out below: not a cell you are
      // choosing between, a cell you cannot have.
      return {
        fill: BOARD.foe,
        opacity: 0.12,
        stroke: BOARD.foe,
        strokeWidth: BOARD.strokes.tile,
      };
    }

    if (isCharacterTurn && selectedSpellId) {
      if (isImpactedCell && hoveredPosition && isInSpellRange) return marked(0.3);
      if (isLosBlocked) return hidden(0.22);
      if (isInSpellRange) return graphite(0.14);
    }

    if (!selectedSpellId && isCharacterTurn && isInRange && showMovementWash) {
      // The walk itself is a consequence of the click, so it is vermilion —
      // grey on grey made the path indistinguishable from the range around it.
      if (isHovered) return marked(0.44);
      if (isPathCell) return marked(0.26);
      return graphite(costOpacity(movementCost, maxMovementCost));
    }

    return null;
  };

  const overlay = wash();

  // A colour alone would not say which side a cell belongs to for anyone who
  // reads red and green the same way, so the opponent's block is crossed out.
  const crossedOut =
    isPositioningPhase && !!initialPositionOwner && !initialPositionOwner.isCurrentPlayer;

  /*
   * Hovering already answers "this one", and answering it twice — a cell that
   * both brightens and keeps breathing — reads as a glitch. The cell under the
   * cursor holds still.
   */
  const breathes =
    awaitingPlacement &&
    !!initialPositionOwner?.isCurrentPlayer &&
    !isHovered;

  // Playable cells are reachable with the keyboard: they take focus and answer
  // Enter and Space. The board was mouse-only, which left it unusable without
  // a pointing device.
  const interactive = !!isValidTarget;

  // Cover stands above the ground rather than lying flat on it, so a wall
  // reads as something to walk around and not as a differently coloured floor.
  const rise = isObstacle ? h * BOARD.block.rise : 0;

  return (
    <div
      className="absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Cell ${x}, ${y}` : undefined}
      style={{
        left: `${screenPosition.x - w / 2}px`,
        top: `${screenPosition.y - h / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "pointer" : "default",
        // Clipping to the diamond keeps clicks off the corners of the box, but
        // it would also cut off the raised faces of cover.
        clipPath: isObstacle ? undefined : "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
      }}
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        {isObstacle ? (
          <g>
            <polygon
              points={`0,${h / 2} ${w / 2},${h} ${w / 2},${h - rise} 0,${h / 2 - rise}`}
              fill={BOARD.block.left}
            />
            <polygon
              points={`${w},${h / 2} ${w / 2},${h} ${w / 2},${h - rise} ${w},${h / 2 - rise}`}
              fill={BOARD.block.right}
            />
            <polygon
              points={points}
              transform={`translate(0, ${-rise})`}
              fill={BOARD.block.top}
              stroke={BOARD.block.stroke}
              strokeWidth={1}
            />
          </g>
        ) : (
          <>
            <polygon points={points} fill={base} stroke="none" />
            {overlay && (
              <polygon
                className={breathes ? "animate-placeable" : undefined}
                points={points}
                fill={overlay.fill}
                fillOpacity={overlay.opacity}
                stroke="none"
              />
            )}
            {/* The outline goes on last, so a marked cell keeps a crisp edge. */}
            <polygon
              points={points}
              fill="none"
              stroke={overlay ? overlay.stroke : BOARD.stroke}
              strokeWidth={overlay ? overlay.strokeWidth : BOARD.strokes.tile}
              strokeDasharray={overlay?.dashed ? "4 3" : undefined}
            />
            {crossedOut && (
              <g
                stroke={BOARD.foe}
                strokeWidth={BOARD.strokes.marked}
                strokeLinecap="round"
                opacity={0.75}
              >
                <line
                  x1={w / 2 - w * 0.16}
                  y1={h / 2 - h * 0.16}
                  x2={w / 2 + w * 0.16}
                  y2={h / 2 + h * 0.16}
                />
                <line
                  x1={w / 2 + w * 0.16}
                  y1={h / 2 - h * 0.16}
                  x2={w / 2 - w * 0.16}
                  y2={h / 2 + h * 0.16}
                />
              </g>
            )}
            {zoneEdges && (
              <g
                stroke={BOARD.zoneEdge}
                strokeWidth={BOARD.strokes.zone}
                strokeLinecap="square"
              >
                {zoneEdges[0] && <line x1={0} y1={h / 2} x2={w / 2} y2={0} />}
                {zoneEdges[1] && <line x1={w / 2} y1={0} x2={w} y2={h / 2} />}
                {zoneEdges[2] && <line x1={w} y1={h / 2} x2={w / 2} y2={h} />}
                {zoneEdges[3] && <line x1={w / 2} y1={h} x2={0} y2={h / 2} />}
              </g>
            )}
          </>
        )}
      </svg>
    </div>
  );
};
