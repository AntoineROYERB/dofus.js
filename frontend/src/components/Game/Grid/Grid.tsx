import React, { useRef } from "react";
import { Position } from "../../../types/game";
import {
  isoToScreen,
  generateIsometricCoordinates,
  sortCoordinates,
} from "../../../utils/isoUtils";
import { blockedBy, hasLineOfSight, reachable } from "../../../utils/board";
import { Tile } from "./Tile";
import { isInSpellRange } from "../../../utils/spellUtils";
import { Character } from "./Character";
import { useCharacterAnimations } from "../../../hooks/useCharacterAnimations";
import { useGridInteraction } from "../../../hooks/useGridInteraction";
import { useTileSize } from "../../../hooks/useTileSize";
import { GameState } from "../../../types/message";

interface GridProps {
  gridSize: number;
  selectedPosition: Position | null;
  onCellClick: ({ x, y }: Position) => void;
  latestGameState?: GameState | null;
  userId: string;
  selectedSpellId: number | null;
}

export const Grid: React.FC<GridProps> = ({
  gridSize,
  selectedPosition,
  onCellClick,
  latestGameState,
  userId,
  selectedSpellId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const players = latestGameState?.players;
  // Memoised: a fresh `?? []` on every render would defeat the memos below.
  const obstacles = React.useMemo(
    () => latestGameState?.obstacles ?? [],
    [latestGameState?.obstacles]
  );
  // The spell catalogue is broadcast with the game state; the client keeps no copy.
  const selectedSpell =
    selectedSpellId === null
      ? undefined
      : latestGameState?.spells?.[String(selectedSpellId)];
  const currentPlayer = players?.[userId];
  const movementPoints = currentPlayer?.character.movementPoints;
  const characterPosition = currentPlayer?.character.position;

  // Get initial positions from the current player's character
  const initialPositions = currentPlayer?.character.initialPositions || [];

  // Check if we're in the positioning phase
  const isPositioningPhase = latestGameState?.status === "position_characters";
  // Whether the board is still waiting on this player for a starting cell.
  const awaitingPlacement = isPositioningPhase && !currentPlayer?.hasPositioned;

  // Collect all players' initial positions for rendering
  const allPlayersInitialPositions = React.useMemo(() => {
    if (!players || !isPositioningPhase) return [];

    const positionsWithOwners: Array<{
      position: Position;
      playerId: string;
      color: string;
      isCurrentPlayer: boolean;
    }> = [];

    Object.entries(players).forEach(([playerId, playerData]) => {
      const isCurrentPlayer = playerId === userId;
      const playerColor = playerData?.character.color;

      playerData?.character.initialPositions?.forEach((position) => {
        positionsWithOwners.push({
          position,
          playerId,
          color: playerColor,
          isCurrentPlayer,
        });
      });
    });

    return positionsWithOwners;
  }, [players, userId, isPositioningPhase]);

  // What the board refuses: cover, and everyone standing on it. The server
  // charges for the walk around all of it, so the preview has to agree.
  const blocked = React.useMemo(() => {
    const occupied = Object.values(players ?? {})
      .map((p) => p.character.position)
      .filter((p): p is Position => !!p);
    return blockedBy(obstacles, occupied);
  }, [players, obstacles]);

  const obstacleSet = React.useMemo(
    () => new Set(obstacles.map((o) => `${o.x},${o.y}`)),
    [obstacles]
  );

  // Reachability, not a Manhattan radius: cover makes some near cells
  // unreachable and some far ones cost more than they look.
  const walkable = React.useMemo(() => {
    if (!characterPosition || movementPoints === undefined) return new Map();
    return reachable(characterPosition, movementPoints, (p) =>
      blocked(p) && !(p.x === characterPosition.x && p.y === characterPosition.y)
    );
  }, [characterPosition, movementPoints, blocked]);

  const tileSize = useTileSize(containerRef, gridSize);

  const characterRenderState = useCharacterAnimations(
    latestGameState ?? null,
    tileSize,
    containerRef
  );

  const { hoveredPosition, pathCells, impactedCells, confirmsTap } =
    useGridInteraction({
    containerRef,
    gridSize,
    tileSize,
    isPositioningPhase,
    characterPosition,
    movementPoints,
    isCurrentTurn: currentPlayer?.isCurrentTurn || false,
    selectedSpell,
    blocked,
    players,
    initialPositions,
  });

  const centerX = containerRef.current
    ? containerRef.current.clientWidth / 2
    : 0;
  const centerY = containerRef.current
    ? containerRef.current.clientHeight / 2
    : 0;

  // Only worth showing where the spell can actually land: out of range, or
  // behind cover, the estimate would be a lie.
  const damagePreview = React.useMemo(() => {
    if (!selectedSpell || !characterPosition || !hoveredPosition) return null;
    if (!currentPlayer?.isCurrentTurn || selectedSpell.damage <= 0) return null;
    if (!isInSpellRange(hoveredPosition, characterPosition, selectedSpell)) {
      return null;
    }
    if (
      selectedSpell.needsLineOfSight &&
      !hasLineOfSight(characterPosition, hoveredPosition, blocked)
    ) {
      return null;
    }
    return {
      damage: selectedSpell.damage,
      screen: isoToScreen(
        hoveredPosition.x,
        hoveredPosition.y,
        tileSize,
        centerX,
        centerY
      ),
    };
  }, [
    selectedSpell,
    characterPosition,
    hoveredPosition,
    currentPlayer,
    blocked,
    tileSize,
    centerX,
    centerY,
  ]);

  const findPlayerOnCell = (x: number, y: number) => {
    return (
      players &&
      Object.values(players).find(
        (player) =>
          player.character?.position?.x === x &&
          player.character?.position?.y === y
      )
    );
  };

  // Check if a position is one of the initial positions for the current player
  const isInitialPosition = (x: number, y: number): boolean => {
    return initialPositions.some((pos) => pos.x === x && pos.y === y);
  };

  const isInPathCells = (x: number, y: number): boolean => {
    return pathCells.some((pos) => pos.x === x && pos.y === y);
  };

  // Sort coordinates for rendering order (back to front)
  const sortedCoordinates = sortCoordinates(
    generateIsometricCoordinates(gridSize)
  );

  // Cells the selected spell can actually reach: in range, and seen from where
  // the caster stands. A cell it cannot reach must not look targetable.
  const castable = React.useMemo(() => {
    const cells = new Set<string>();
    if (!characterPosition || !selectedSpell) return cells;
    sortedCoordinates.forEach(({ x, y }) => {
      if (!isInSpellRange({ x, y }, characterPosition, selectedSpell)) return;
      if (
        selectedSpell.needsLineOfSight &&
        !hasLineOfSight(characterPosition, { x, y }, blocked)
      ) {
        return;
      }
      cells.add(`${x},${y}`);
    });
    return cells;
    // sortedCoordinates is derived from gridSize alone and is stable enough.
  }, [characterPosition, selectedSpell, blocked, gridSize]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * The area you may act in this turn — where you can walk, or where the
   * selected spell can land. A wash alone was not enough to see it: grey on
   * grey at ten percent disappears against the board's own checker. It now
   * carries a drawn border, which is what makes a region read as a region.
   */
  const zone = currentPlayer?.isCurrentTurn
    ? selectedSpell
      ? castable
      : new Set(walkable.keys())
    : new Set<string>();

  /** Which of a cell's four edges face out of the zone. */
  const zoneEdges = (x: number, y: number): boolean[] | undefined => {
    if (!zone.has(`${x},${y}`)) return undefined;
    return [
      !zone.has(`${x - 1},${y}`), // up-left
      !zone.has(`${x},${y - 1}`), // up-right
      !zone.has(`${x + 1},${y}`), // down-right
      !zone.has(`${x},${y + 1}`), // down-left
    ];
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {sortedCoordinates.map(({ x, y }) => {
        const isHovered = hoveredPosition?.x === x && hoveredPosition?.y === y;
        const isValidInitial = isPositioningPhase && isInitialPosition(x, y);

        const isPathCell = isInPathCells(x, y);
        const isObstacle = obstacleSet.has(`${x},${y}`);
        const isInRange = walkable.has(`${x},${y}`);

        const isInCastRange = castable.has(`${x},${y}`);

        const isImpactedCell = impactedCells.some(
          (pos) => pos.x === x && pos.y === y
        );

        const isCharacterTurn = currentPlayer?.isCurrentTurn || false;

        // Determine if this tile is a valid movement target
        const isValidTarget = isPositioningPhase
          ? !!isValidInitial
          : !!(currentPlayer?.isCurrentTurn && isInRange && !findPlayerOnCell(x, y)) ||
            isInCastRange;

        const screenPosition = isoToScreen(x, y, tileSize, centerX, centerY);

        return (
          <Tile
            key={`${x}-${y}`}
            x={x}
            y={y}
            tileSize={tileSize}
            screenPosition={screenPosition}
            isHovered={isHovered}
            isValidTarget={isValidTarget}
            isPositioningPhase={isPositioningPhase}
            awaitingPlacement={awaitingPlacement}
            allPlayersInitialPositions={allPlayersInitialPositions}
            isCharacterTurn={isCharacterTurn}
            selectedSpellId={selectedSpellId}
            isImpactedCell={isImpactedCell}
            isInSpellRange={isInCastRange}
            isObstacle={isObstacle}
            isInRange={isInRange}
            isPathCell={isPathCell}
            hoveredPosition={hoveredPosition}
            zoneEdges={zoneEdges(x, y)}
            // On a touch screen the first tap only previews the cell.
            onClick={() => confirmsTap({ x, y }) && onCellClick({ x, y })}
          />
        );
      })}
      {Object.entries(characterRenderState).map(([playerId, renderData]) => {
        if (!renderData) return null;
        return (
          <Character
            key={playerId}
            screenPosition={renderData.screenPosition}
            animation={renderData.animation}
            direction={renderData.direction}
            scale={tileSize.width / 256}
          />
        );
      })}
      {/*
        What the spell would take off, before the click. The number is the
        catalogue's base damage: a critical or a shield will move it, which is
        why it is shown as an estimate and not as a result.
      */}
      {damagePreview && (
        <div
          className="absolute pointer-events-none font-display font-bold tabular-nums text-vermilion"
          style={{
            left: `${damagePreview.screen.x}px`,
            top: `${damagePreview.screen.y - tileSize.height * 1.7}px`,
            transform: "translate(-50%, -50%)",
            fontSize: `${Math.max(14, tileSize.width * 0.22)}px`,
            textShadow:
              "0 1px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff",
          }}
        >
          &minus;{damagePreview.damage}
        </div>
      )}

      {isPositioningPhase && selectedPosition && (
        <Character
          key={`${userId}-preview`}
          screenPosition={isoToScreen(
            selectedPosition.x,
            selectedPosition.y,
            tileSize,
            centerX,
            centerY
          )}
          animation="idle"
          direction="S"
          scale={tileSize.width / 256}
        />
      )}
    </div>
  );
};
