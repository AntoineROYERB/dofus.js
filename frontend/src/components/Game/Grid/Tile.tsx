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
  /**
   * Called with this cell. It takes the cell rather than closing over it so
   * the board can hand every tile the same function, which is what lets a
   * tile skip re-rendering (see the memo at the bottom).
   */
  onCellClick?: (cell: Position) => void;
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
  /**
   * Close enough for the selected spell, and kept out by the line of sight
   * alone. Not targetable, and drawn all the same — see BOARD.blind.
   */
  isOutOfSight?: boolean;
  /** In range only through the caster's relay: washed in the wind's green. */
  viaRelay?: boolean;
  /**
   * Whether the cell under the cursor — the blast's centre, not necessarily
   * this cell — is itself a legal cast. The server checks line of sight once,
   * against that centre, then hits the whole blast pattern regardless of what
   * each cell in it can individually see, so a splash cell is marked hit off
   * of this rather than its own line of sight.
   */
  canCastAtHovered: boolean;
  isInRange: boolean;
  /** The walkable wash only shows once the mouse has reached the board. */
  showMovementWash: boolean;
  /** Movement points this cell costs to reach, when it is reachable at all. */
  movementCost?: number;
  /** The character's movement points this turn — the gradient's far end. */
  maxMovementCost: number;
  isPathCell: boolean;
  /** Cover: nobody stands here and nothing is seen through it. */
  isObstacle: boolean;
  /** Cover a Stonewarden raised, drawn taller and in earth. */
  isPillar?: boolean;
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
};

const TileView: React.FC<TileProps> = ({
  x,
  y,
  tileSize,
  screenPosition,
  isHovered,
  isValidTarget,
  onCellClick,
  isPositioningPhase,
  awaitingPlacement,
  allPlayersInitialPositions,
  isCharacterTurn,
  selectedSpellId,
  isImpactedCell,
  isInSpellRange,
  isOutOfSight = false,
  viaRelay = false,
  canCastAtHovered,
  isInRange,
  showMovementWash,
  movementCost,
  maxMovementCost,
  isPathCell,
  isObstacle,
  isPillar = false,
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
    // Where your legs can take you. Filled, and green — the colour of the
    // points it spends.
    const walkable = (opacity: number): Wash => ({
      fill: BOARD.move,
      opacity,
      stroke: `${BOARD.move}73`,
      strokeWidth: BOARD.strokes.tile,
    });
    /*
     * Where a spell can land. Held well under the cell it would actually hit —
     * that one is nearly half — but no longer a whisper: a range you have to
     * hunt for is a range you end up counting by hand.
     */
    const reach = (): Wash => ({
      fill: BOARD.accent,
      opacity: 0.17,
      stroke: BOARD.accent,
      strokeWidth: BOARD.strokes.tile,
    });
    // In range, unseen: the faintest breath of the accent, a warm grey at
    // this strength. It says "there is something here" and nothing more.
    const blind = (): Wash => ({
      fill: BOARD.blind,
      opacity: 0.05,
      stroke: `${BOARD.blind}33`,
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
      if (isImpactedCell && canCastAtHovered) return marked(0.46);
      if (isInSpellRange && viaRelay) {
        return {
          fill: BOARD.relay,
          opacity: 0.2,
          stroke: BOARD.stroke,
          strokeWidth: BOARD.strokes.tile,
        };
      }
      if (isInSpellRange) return reach();
      if (isOutOfSight) return blind();
    }

    if (!selectedSpellId && isCharacterTurn && isInRange && showMovementWash) {
      /*
       * One flat green for everywhere you may go, and a stronger one for the
       * route you would actually take. The area used to deepen with distance,
       * which spent the whole range of the ink on a question nobody asks — a
       * player wants to know where they can go, not how much each cell costs
       * — and left nothing to say the walk itself with. Distance is still
       * there, in the order the cells arrive (see washStyle below).
       */
      if (isHovered) return walkable(0.5);
      if (isPathCell) return walkable(0.34);
      return walkable(0.13);
    }

    return null;
  };

  const overlay = wash();

  /*
   * A wash fades in rather than appearing, and it fades in from the fighter
   * outward: a cell waits in proportion to what it costs to reach, so the far
   * edge of the range is always the last to arrive and the sweep takes the
   * same time whether the character has two movement points or six. What the
   * eye gets is the green spreading from the feet outward, which is the shape
   * of the thing being said — and it is the only place distance is spoken of
   * now that the area itself is flat. Only the reachable area is staggered: a
   * spell's range has no near end, and the cell under the cursor must answer
   * at once.
   *
   * The polygon underneath is always mounted, even with nothing to show, so
   * there is something to transition from; an element that mounts already
   * wearing its colour cannot fade.
   */
  const lastFill = React.useRef(overlay?.fill ?? BOARD.move);
  if (overlay) lastFill.current = overlay.fill;
  const staggered =
    !!overlay &&
    !selectedSpellId &&
    !isHovered &&
    !isPathCell &&
    overlay.fill === BOARD.move;
  const share =
    maxMovementCost > 0 ? Math.min((movementCost ?? 0) / maxMovementCost, 1) : 0;
  const washStyle: React.CSSProperties = {
    transition: `fill ${BOARD.washIn.fade}ms ease-out, fill-opacity ${BOARD.washIn.fade}ms ease-out`,
    transitionDelay: staggered ? `${Math.round(share * BOARD.washIn.sweep)}ms` : "0ms",
  };

  // A colour alone would not say which side a cell belongs to for anyone who
  // reads red and green the same way, so the opponent's block is crossed out.
  const crossedOut =
    isPositioningPhase && !!initialPositionOwner && !initialPositionOwner.isCurrentPlayer;

  /*
   * Hovering already answers "this one", and answering it twice — a cell that
   * both brightens and keeps breathing — reads as a glitch. The cell under the
   * cursor holds still.
   */
  const isMyStartCell =
    awaitingPlacement && !!initialPositionOwner?.isCurrentPlayer;
  const breathes = isMyStartCell && !isHovered;

  /*
   * A cell this player could click right now: one to start on, one a chosen
   * spell can reach, or one their legs can reach. The tutorial reads these to
   * keep its card off them — a card sitting on the only cells it is asking
   * anyone to click teaches nothing. Movement is judged on reach rather than
   * on the wash, which only appears once the pointer is over the board.
   */
  const isLiveCell =
    isMyStartCell ||
    (!!isCharacterTurn && (selectedSpellId ? !!isInSpellRange : !!isInRange));

  // Playable cells are reachable with the keyboard: they take focus and answer
  // Enter and Space. The board was mouse-only, which left it unusable without
  // a pointing device.
  const interactive = !!isValidTarget;

  // A pillar comes up out of the ground the moment it is raised.
  const [grown, setGrown] = React.useState(isPillar ? 0 : 1);
  React.useEffect(() => {
    if (!isPillar) {
      setGrown(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / BOARD.pillar.grow);
      // Overshoots a little and settles, like rock shoved up from below.
      setGrown(p < 1 ? 1 - Math.pow(1 - p, 3) * Math.cos(p * 5) : 1);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [isPillar]);

  // Cover stands above the ground rather than lying flat on it, so a wall
  // reads as something to walk around and not as a differently coloured floor.
  const block = isPillar ? BOARD.pillar : BOARD.block;
  const rise = isObstacle ? h * block.rise * grown : 0;

  return (
    <div
      className="absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Cell ${x}, ${y}` : undefined}
      data-live-cell={isLiveCell || undefined}
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
      onClick={interactive ? () => onCellClick?.({ x, y }) : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onCellClick?.({ x, y });
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
              fill={block.left}
            />
            <polygon
              points={`${w},${h / 2} ${w / 2},${h} ${w / 2},${h - rise} ${w},${h / 2 - rise}`}
              fill={block.right}
            />
            <polygon
              points={points}
              transform={`translate(0, ${-rise})`}
              fill={block.top}
              stroke={block.stroke}
              strokeWidth={1}
            />
            {isPillar && (
              // Strata, so it reads as rock and not as a taller crate.
              <g stroke={block.stroke} strokeOpacity={0.45} strokeWidth={1}>
                <line x1={0} y1={h / 2 - rise * 0.35} x2={w / 2} y2={h - rise * 0.35} />
                <line x1={w / 2} y1={h - rise * 0.65} x2={w} y2={h / 2 - rise * 0.65} />
              </g>
            )}
          </g>
        ) : (
          <>
            <polygon points={points} fill={base} stroke="none" />
            <polygon
              className={breathes ? "animate-placeable" : undefined}
              points={points}
              fill={overlay ? overlay.fill : lastFill.current}
              fillOpacity={overlay ? overlay.opacity : 0}
              stroke="none"
              // The breathing cell animates this very property; a transition
              // on top of the keyframes would fight them.
              style={breathes ? undefined : washStyle}
            />
            {/* The outline goes on last, so a marked cell keeps a crisp edge. */}
            <polygon
              points={points}
              fill="none"
              stroke={overlay ? overlay.stroke : BOARD.stroke}
              strokeWidth={overlay ? overlay.strokeWidth : BOARD.strokes.tile}
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
              /*
               * The boundary is drawn in whatever the area inside it is drawn
               * in — green for where you may walk, vermilion for where a spell
               * may land. It used to be ink, which read as a third thing laid
               * on top of the board rather than as the edge of the one thing
               * it encloses, and fought the colour it was wrapped around.
               */
              <g
                stroke={selectedSpellId ? BOARD.accent : BOARD.move}
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

const sameEdges = (a?: boolean[], b?: boolean[]) =>
  a === b ||
  (!!a && !!b && a.length === b.length && a.every((edge, i) => edge === b[i]));

/*
 * The board re-renders on every frame of a walk, as the fighter's position is
 * interpolated, and on every pointer move. Redrawing all ~110 cells each time
 * is what made the board stutter on a phone; a cell now redraws only when
 * something about that cell changed. The board builds a fresh position object
 * and a fresh edge array per render, so those two are compared by value.
 */
export const Tile = React.memo(TileView, (prev, next) => {
  for (const key of Object.keys(next) as (keyof TileProps)[]) {
    if (key === "screenPosition") {
      if (
        prev.screenPosition.x !== next.screenPosition.x ||
        prev.screenPosition.y !== next.screenPosition.y
      ) {
        return false;
      }
    } else if (key === "zoneEdges") {
      if (!sameEdges(prev.zoneEdges, next.zoneEdges)) return false;
    } else if (prev[key] !== next[key]) {
      return false;
    }
  }
  return true;
});
