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

  const { hoveredPosition, pathCells, impactedCells } = useGridInteraction({
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

  const centerX = containerRef.current
    ? containerRef.current.clientWidth / 2
    : 0;
  const centerY = containerRef.current
    ? containerRef.current.clientHeight / 2
    : 0;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {sortedCoordinates.map(({ x, y }) => {
        const isHovered = hoveredPosition?.x === x && hoveredPosition?.y === y;
        const isValidInitial = isPositioningPhase && isInitialPosition(x, y);

        const isPathCell = isInPathCells(x, y);
        const isObstacle = obstacleSet.has(`${x},${y}`);
        const isInRange = walkable.has(`${x},${y}`);

        // A cell the spell cannot actually reach must not look targetable.
        const isInCastRange = !!(
          characterPosition &&
          selectedSpell &&
          isInSpellRange({ x, y }, characterPosition, selectedSpell) &&
          (!selectedSpell.needsLineOfSight ||
            hasLineOfSight(characterPosition, { x, y }, blocked))
        );

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
            allPlayersInitialPositions={allPlayersInitialPositions}
            isCharacterTurn={isCharacterTurn}
            selectedSpellId={selectedSpellId}
            isImpactedCell={isImpactedCell}
            isInSpellRange={isInCastRange}
            isObstacle={isObstacle}
            isInRange={isInRange}
            isPathCell={isPathCell}
            hoveredPosition={hoveredPosition}
            onClick={() => onCellClick({ x, y })}
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
