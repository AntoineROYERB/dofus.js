import { useState, useEffect, useRef, useCallback } from "react";
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

  /*
   * There is no hovering on a touch screen, and acting on the first tap would
   * mean casting a spell before ever seeing where it lands. A tap previews the
   * cell instead — range, walk, area of effect, estimated damage — and a second
   * tap on the same cell commits it. `armed` is what the tap that is about to
   * be handled found already previewed.
   */
  const usingTouch = useRef(false);
  const previewed = useRef<Position | null>(null);
  const armed = useRef(false);

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

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      usingTouch.current = true;
      const tile = findTileUnderMouse(e.clientX, e.clientY);
      const before = previewed.current;
      armed.current =
        !!tile && !!before && before.x === tile.x && before.y === tile.y;
      previewed.current = tile;
      setHoveredPosition(tile);
    };

    const handleMouseMove = (e: MouseEvent) => {
      // A tap also emits compatibility mouse events; they must not undo it.
      if (usingTouch.current) return;
      const tile = findTileUnderMouse(e.clientX, e.clientY);
      if (tile) {
        setHoveredPosition(tile);
      } else if (isMouseInContainer) {
        setHoveredPosition(null);
      }
    };

    const handleMouseEnter = () => {
      if (usingTouch.current) return;
      setIsMouseInContainer(true);
    };
    const handleMouseLeave = () => {
      if (usingTouch.current) return;
      setIsMouseInContainer(false);
      setHoveredPosition(null);
      setPathCells([]);
    };

    document.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("pointerdown", handlePointerDown);
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

  /**
   * Whether a click on this cell should act, or only preview it. Always true
   * for a mouse, which has already shown the player what the click would do.
   */
  const confirmsTap = useCallback((cell: Position) => {
    if (!usingTouch.current) return true;
    const ready =
      armed.current &&
      !!previewed.current &&
      previewed.current.x === cell.x &&
      previewed.current.y === cell.y;
    armed.current = false;
    return ready;
  }, []);

  return { hoveredPosition, pathCells, impactedCells, confirmsTap };
};
