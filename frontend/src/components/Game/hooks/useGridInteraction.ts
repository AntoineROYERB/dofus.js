import { useState, useEffect } from "react";
import { Position, Player } from "../../../types/game";
import { screenToIso, generateIsometricCoordinates } from "../utils/isoUtils";
import { calculatePath, isWithinRange } from "../utils/pathUtils";
import { calculateImpactedCells } from "../utils/spellUtils";

interface UseGridInteractionProps {
  containerRef: React.RefObject<HTMLDivElement>;
  gridSize: number;
  tileSize: { width: number; height: number };
  isPositioningPhase: boolean;
  characterPosition: Position | undefined;
  movementPoints: number | undefined;
  isCurrentTurn: boolean;
  selectedSpellId: number | null;
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
  selectedSpellId,
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
      if (
        movementPoints !== undefined &&
        isWithinRange(characterPosition, hoveredPosition, movementPoints)
      ) {
        const path = calculatePath(characterPosition, hoveredPosition);
        const filteredPath = path.slice(
          1,
          movementPoints !== undefined ? movementPoints + 1 : undefined
        );
        setPathCells(filteredPath);
      } else {
        setPathCells([]);
      }

      if (selectedSpellId) {
        const impacted = calculateImpactedCells(
          selectedSpellId,
          hoveredPosition,
          characterPosition
        );
        setImpactedCells(impacted);
      } else {
        setImpactedCells([]);
      }
    }
  }, [
    hoveredPosition,
    characterPosition,
    movementPoints,
    isCurrentTurn,
    selectedSpellId,
    isPositioningPhase,
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
        centerY
      );
      const coordinates = generateIsometricCoordinates(gridSize);
      return (
        coordinates.find(
          (coord) => coord.x === isoPos.x && coord.y === isoPos.y
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
    selectedSpellId,
  ]);

  return { hoveredPosition, pathCells, impactedCells };
};
