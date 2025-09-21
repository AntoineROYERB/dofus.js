import React, { useRef } from "react";
import { Position } from "../../../types/game";
import {
  isoToScreen,
  generateIsometricCoordinates,
  sortCoordinates,
} from "../utils/isoUtils";
import { isWithinRange } from "../utils/pathUtils";
import { Tile } from "./Tile";
import { isInSpellAffectedArea } from "../utils/spellUtils";
import { Character } from "./Character";
import { useCharacterAnimations } from "../hooks/useCharacterAnimations";
import { useGridInteraction } from "../hooks/useGridInteraction";
import { useTileSize } from "../hooks/useTileSize";
import { GameStateMessage } from "../../../types/message";

interface GridProps {
  gridSize: number;
  selectedPosition: Position | null;
  onCellClick: ({ x, y }: Position) => void;
  latestGameState?: GameStateMessage | null;
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

  const tileSize = useTileSize(containerRef, gridSize);

  const characterRenderState = useCharacterAnimations(
    latestGameState,
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
    selectedSpellId,
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
        const isInRange = !!(
          characterPosition &&
          movementPoints !== undefined &&
          isWithinRange(characterPosition, { x, y }, movementPoints)
        );

        const isInSpellRange = !!(
          characterPosition &&
          selectedSpellId &&
          isInSpellAffectedArea({ x, y }, characterPosition, selectedSpellId)
        );

        const isImpactedCell = impactedCells.some(
          (pos) => pos.x === x && pos.y === y
        );

        const isCharacterTurn = currentPlayer?.isCurrentTurn || false;

        // Determine if this tile is a valid movement target
        const isValidTarget = isPositioningPhase
          ? !!isValidInitial
          : !!(
              characterPosition &&
              currentPlayer?.isCurrentTurn &&
              movementPoints !== undefined &&
              isWithinRange(characterPosition, { x, y }, movementPoints) &&
              !findPlayerOnCell(x, y)
            ) ||
            !!(
              selectedSpellId &&
              characterPosition &&
              isInSpellAffectedArea(
                { x, y },
                characterPosition,
                selectedSpellId
              )
            );

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
            isInSpellRange={isInSpellRange}
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
