import { useState, useEffect } from "react";
import { Position, Player } from "../types/game";
import { Spell } from "../types/message";
import { screenToIso, generateIsometricCoordinates } from "../utils/isoUtils";
import { findPath } from "../utils/board";
import { calculateImpactedCells } from "../utils/spellUtils";

interface UseGridInteractionProps {
  containerRef: React.RefObject<HTMLDivElement>;
  gridSize: number;
  tileSize: { width: number; height: number };
  isPositioningPhase: boolean;
  characterPosition: Position | undefined;
  movementPoints: number | undefined;
  isCurrentTurn: boolean;
  selectedSpell: Spell | undefined;
  /** What the board refuses, cover and characters alike. */
  blocked: (p: Position) => boolean;
  players: { [id: string]: Player } | undefined;
  initialPositions: Position[];
}

export const useGridInteraction = ({
  containerRef,
  gridSize,
  tileSize,
  isPositioningPhase,
  characterPosition,
  movementPoints,
  isCurrentTurn,
  selectedSpell,
  blocked,
  players,
  initialPositions,
}: UseGridInteractionProps) => {
  const [hoveredPosition, setHoveredPosition] = useState<Position | null>(null);
  const [pathCells, setPathCells] = useState<Position[]>([]);
  const [impactedCells, setImpactedCells] = useState<Position[]>([]);
  const [isMouseInContainer, setIsMouseInContainer] = useState(false);

  // Update path and spell impact on hover
  useEffect(() => {
    if (
      characterPosition &&
      hoveredPosition &&
      isCurrentTurn &&
      !isPositioningPhase
    ) {
      // The walk the server would actually charge for, not a straight L.
      const path =
        movementPoints === undefined
          ? null
          : findPath(characterPosition, hoveredPosition, blocked);
      setPathCells(
        path && movementPoints !== undefined && path.length <= movementPoints
          ? path
          : [],
      );

      if (selectedSpell) {
        setImpactedCells(
          calculateImpactedCells(selectedSpell, hoveredPosition, characterPosition),
        );
      } else {
        setImpactedCells([]);
      }
    }
  }, [
    hoveredPosition,
    characterPosition,
    movementPoints,
    isCurrentTurn,
    selectedSpell,
    isPositioningPhase,
    blocked,
  ]);

  // Mouse and click handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const findTileUnderMouse = (mouseX: number, mouseY: number) => {
      const rect = container.getBoundingClientRect();
      const relativeX = mouseX - rect.left;
      const relativeY = mouseY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const isoPos = screenToIso(
        relativeX,
        relativeY,
        tileSize,
        centerX,
        centerY,
      );
      const coordinates = generateIsometricCoordinates(gridSize);
      return (
        coordinates.find(
          (coord) => coord.x === isoPos.x && coord.y === isoPos.y,
        ) || null
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      const tile = findTileUnderMouse(e.clientX, e.clientY);
      if (tile) {
        setHoveredPosition(tile);
      } else if (isMouseInContainer) {
        setHoveredPosition(null);
      }
    };

    const handleMouseEnter = () => setIsMouseInContainer(true);
    const handleMouseLeave = () => {
      setIsMouseInContainer(false);
      setHoveredPosition(null);
      setPathCells([]);
    };

    document.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [
    containerRef,
    gridSize,
    tileSize,
    isMouseInContainer,
    characterPosition,
    movementPoints,
    isCurrentTurn,
    isPositioningPhase,
    players,
    initialPositions,
    selectedSpell,
  ]);

  return { hoveredPosition, pathCells, impactedCells };
};
