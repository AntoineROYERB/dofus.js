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
  /** The board's current pinch-zoom, so a tap under a scaled/panned finger still finds the right cell. */
  zoom: { scale: number; pan: { x: number; y: number } };
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
  zoom,
}: UseGridInteractionProps) => {
  const [hoveredPosition, setHoveredPosition] = useState<Position | null>(null);
  /*
   * Where the stats card may peek, which is stricter than `hoveredPosition`:
   * that one legitimately survives a tap — it drives the move preview and the
   * confirm bubble — while the card is only ever a peek. It follows the mouse
   * and dies with it, and on a touch screen it lives only as long as the
   * finger stays down, so a tap that moves or casts leaves no card behind.
   */
  const [peekedPosition, setPeekedPosition] = useState<Position | null>(null);
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
  // The same, as state, for what the board draws only for a finger.
  const [touchMode, setTouchMode] = useState(false);
  const previewed = useRef<Position | null>(null);
  const armed = useRef(false);

  // Read inside listeners mounted once below, rather than a dependency that
  // would re-mount them on every frame a pinch reports a new scale.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // A second finger touching down mid-pinch must not land a move or a cast:
  // once two are on the board, every pointerdown is ignored until all lift.
  const activeTouchPointers = useRef(new Set<number>());
  const suppressTap = useRef(false);

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
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const { scale, pan } = zoomRef.current;
      // The board's own transform is scale-then-pan around its centre; undo
      // that here so a finger over a tile keeps finding that tile zoomed in.
      const relativeX = centerX + (mouseX - rect.left - pan.x - centerX) / scale;
      const relativeY = centerY + (mouseY - rect.top - pan.y - centerY) / scale;
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
      // Controls drawn over the board (the confirm bubble) are not cells.
      if ((e.target as Element | null)?.closest?.("[data-board-ui]")) return;

      if (e.pointerType === "touch") {
        activeTouchPointers.current.add(e.pointerId);
        if (activeTouchPointers.current.size > 1) {
          suppressTap.current = true;
          armed.current = false;
          previewed.current = null;
          setHoveredPosition(null);
          setPeekedPosition(null);
          return;
        }
      }
      if (suppressTap.current) return;

      usingTouch.current = true;
      setTouchMode(true);
      const tile = findTileUnderMouse(e.clientX, e.clientY);
      const before = previewed.current;
      armed.current =
        !!tile && !!before && before.x === tile.x && before.y === tile.y;
      previewed.current = tile;
      setHoveredPosition(tile);
      setPeekedPosition(tile);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      // The finger is off the fighter, so the card goes with it.
      setPeekedPosition(null);
      if (e.pointerType !== "touch") return;
      activeTouchPointers.current.delete(e.pointerId);
      if (activeTouchPointers.current.size === 0) suppressTap.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      // A tap also emits compatibility mouse events; they must not undo it.
      if (usingTouch.current) return;
      const tile = findTileUnderMouse(e.clientX, e.clientY);
      if (tile) {
        setHoveredPosition(tile);
        setPeekedPosition(tile);
      } else if (isMouseInContainer) {
        setHoveredPosition(null);
        setPeekedPosition(null);
      } else {
        // Off the board entirely: nothing to peek at any more.
        setPeekedPosition(null);
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
      setPeekedPosition(null);
      setPathCells([]);
    };

    document.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointercancel", handlePointerUp);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointercancel", handlePointerUp);
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

  /** Drops the tapped preview, once its action has been confirmed. */
  const clearPreview = useCallback(() => {
    previewed.current = null;
    armed.current = false;
    setHoveredPosition(null);
    setPeekedPosition(null);
    setPathCells([]);
    setImpactedCells([]);
  }, []);

  return {
    hoveredPosition,
    peekedPosition,
    pathCells,
    impactedCells,
    confirmsTap,
    touchMode,
    clearPreview,
  };
};
