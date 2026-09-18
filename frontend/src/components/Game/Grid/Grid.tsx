import React, { useRef } from "react";
import { Position } from "../../../types/game";
import {
  isoToScreen,
  generateIsometricCoordinates,
  sortCoordinates,
} from "../../../utils/isoUtils";
import { blockedBy, reachable, sightBlockedBy } from "../../../utils/board";
import { Tile } from "./Tile";
import { castOrigin, outOfSight } from "../../../utils/spellUtils";
import { BurnMarker } from "./BurnMarker";
import {
  isSolidTerrain,
  relayOf,
  RULES,
  withBonus,
  terrainIndex,
  TERRAIN_INFO,
  ZONE_INFO,
} from "../../../utils/terrain";
import { TerrainLayer } from "./TerrainLayer";
import { Character } from "./Character";
import { Socle } from "./Socle";
import { CharacterTooltip } from "./CharacterTooltip";
import { HitFeedback } from "./HitFeedback";
import { StatFeedback } from "./StatFeedback";
import { SpellFXLayer } from "./SpellFXLayer";
import { BOARD } from "../../../constants";
import { useCharacterAnimations } from "../../../hooks/useCharacterAnimations";
import { useHitFeedback } from "../../../hooks/useHitFeedback";
import { useGridInteraction } from "../../../hooks/useGridInteraction";
import { useTileSize } from "../../../hooks/useTileSize";
import { usePinchZoom } from "../../../hooks/usePinchZoom";
import { GameState } from "../../../types/message";
import { bubblePlacement, confirmActionFor } from "../../../utils/touchConfirm";

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
  /*
   * The board itself, separate from the container that measures it. Impacts
   * shake this one; the container keeps still, so pointer maths — which reads
   * the container's own box — is never thrown off by a spell going off.
   */
  const boardRef = useRef<HTMLDivElement>(null);
  /*
   * Pinch-zoom's own layer, wrapping the board rather than being it: impact
   * shake already writes its own transform straight onto boardRef, and the
   * two would fight over the same style property if zoom lived there too.
   */
  const zoomLayerRef = useRef<HTMLDivElement>(null);

  const players = latestGameState?.players;
  // Memoised: a fresh `?? []` on every render would defeat the memos below.
  const obstacles = React.useMemo(
    () => latestGameState?.obstacles ?? [],
    [latestGameState?.obstacles]
  );
  const terrain = React.useMemo(
    () => latestGameState?.terrain ?? [],
    [latestGameState?.terrain]
  );
  const zones = React.useMemo(
    () => latestGameState?.zones ?? [],
    [latestGameState?.zones]
  );
  const terrainAt = React.useMemo(() => terrainIndex(terrain), [terrain]);
  const relay = React.useMemo(() => relayOf(terrain, userId), [terrain, userId]);
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

  // What the board refuses: cover, craters and fissures, and everyone
  // standing on it. The server charges for the walk around all of it, so the
  // preview has to agree. Sight is stopped by cover, smoke and people instead.
  const occupied = React.useMemo(
    () =>
      Object.values(players ?? {})
        .map((p) => p.character.position)
        .filter((p): p is Position => !!p),
    [players]
  );
  const blocked = React.useMemo(
    () => blockedBy(obstacles, occupied, terrain),
    [obstacles, occupied, terrain]
  );
  const sightBlocked = React.useMemo(
    () => sightBlockedBy(obstacles, occupied, terrain),
    [obstacles, occupied, terrain]
  );

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

  const {
    tile: tileSize,
    size: boardSize,
    measured,
  } = useTileSize(containerRef, gridSize);
  const { scale, pan, isPinching, reset: resetZoom } = usePinchZoom(containerRef);

  const characterRenderState = useCharacterAnimations(
    latestGameState ?? null,
    tileSize,
    containerRef
  );

  // Who just lost health, PA or PM, and how much. Empty for most of a turn.
  const stats = useHitFeedback(latestGameState ?? null);

  const {
    hoveredPosition,
    pathCells,
    impactedCells,
    confirmsTap,
    touchMode,
    clearPreview,
  } =
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
    zoom: { scale, pan },
  });

  const centerX = boardSize.width / 2;
  const centerY = boardSize.height / 2;

  // Only worth showing where the spell can actually land: out of range, or
  // behind cover, the estimate would be a lie.
  const damagePreview = React.useMemo(() => {
    if (!selectedSpell || !characterPosition || !hoveredPosition) return null;
    if (!currentPlayer?.isCurrentTurn || selectedSpell.damage <= 0) return null;
    const origin = castOrigin(
      selectedSpell,
      hoveredPosition,
      characterPosition,
      sightBlocked,
      relay
    );
    if (!origin) return null;
    const throughRelay =
      !!relay && origin.x === relay.x && origin.y === relay.y && selectedSpell.relayed;
    let damage = selectedSpell.damage;
    if (throughRelay) damage = withBonus(damage, RULES.relayBonus);
    if (
      selectedSpell.conducts &&
      terrainAt.get(`${hoveredPosition.x},${hoveredPosition.y}`)?.kind === "water"
    ) {
      damage = withBonus(damage, RULES.conductBonus);
    }
    return {
      damage,
      throughRelay,
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
    sightBlocked,
    relay,
    terrainAt,
    tileSize,
    centerX,
    centerY,
  ]);

  // Cells the selected spell only reaches by going through the relay, and the
  // route a hovered cast would take: the caster, the relay, the target.
  const relayed = !!selectedSpell?.relayed && !!relay;
  const relayRoute = React.useMemo(() => {
    if (!relayed || !relay || !characterPosition || !hoveredPosition || !selectedSpell) {
      return null;
    }
    const origin = castOrigin(selectedSpell, hoveredPosition, characterPosition, sightBlocked, relay);
    if (!origin || origin.x !== relay.x || origin.y !== relay.y) return null;
    return [characterPosition, relay, hoveredPosition].map((p) =>
      isoToScreen(p.x, p.y, tileSize, centerX, centerY)
    );
  }, [relayed, relay, characterPosition, hoveredPosition, selectedSpell, sightBlocked, tileSize, centerX, centerY]);

  // What is lying on the cell under the pointer, when nobody is standing on
  // it: a scorch mark that means nothing reads as scenery, so ground that does
  // something says what.
  const hoveredTerrain = React.useMemo(() => {
    if (!hoveredPosition) return null;
    const cell = terrainAt.get(`${hoveredPosition.x},${hoveredPosition.y}`);
    const zone = zones.find((z) =>
      z.cells.some((c) => c.x === hoveredPosition.x && c.y === hoveredPosition.y)
    );
    if (!cell && !zone) return null;
    return {
      lines: [
        ...(cell
          ? [
              {
                title: `${TERRAIN_INFO[cell.kind].name}${
                  cell.kind === "relay" || cell.kind === "water" || cell.kind === "trap"
                    ? cell.owner === userId
                      ? " · yours"
                      : " · enemy"
                    : ""
                }`,
                text: TERRAIN_INFO[cell.kind].text,
              },
            ]
          : []),
        ...(zone
          ? [
              {
                title: `${ZONE_INFO[zone.kind].name} · ${zone.turnsLeft} turn${
                  zone.turnsLeft > 1 ? "s" : ""
                } left`,
                text: ZONE_INFO[zone.kind].text,
              },
            ]
          : []),
      ],
      screen: isoToScreen(
        hoveredPosition.x,
        hoveredPosition.y,
        tileSize,
        centerX,
        centerY
      ),
    };
  }, [hoveredPosition, terrainAt, zones, userId, tileSize, centerX, centerY]);

  // Whoever the pointer is over, keyed the same way as characterRenderState
  // — reusing hoveredPosition rather than a dedicated hitbox, so the card
  // never fights the tile underneath for clicks.
  const hoveredCharacterEntry = React.useMemo(() => {
    if (!hoveredPosition || !players) return null;
    return (
      Object.entries(players).find(
        ([, player]) =>
          player.character.isAlive &&
          player.character.position?.x === hoveredPosition.x &&
          player.character.position?.y === hoveredPosition.y
      ) ?? null
    );
  }, [hoveredPosition, players]);

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
  const sortedCoordinates = React.useMemo(
    () => sortCoordinates(generateIsometricCoordinates(gridSize)),
    [gridSize]
  );

  /*
   * One click handler for every cell, stable across renders, reading the
   * latest props through a ref. A fresh closure per cell per render would
   * defeat the tiles' memo on every animation frame.
   */
  const latestClick = useRef({ confirmsTap, onCellClick, isPositioningPhase });
  latestClick.current = { confirmsTap, onCellClick, isPositioningPhase };
  const handleTileClick = React.useCallback((cell: Position) => {
    // On a touch screen the first tap only previews the cell — except while
    // picking a starting cell, where the Fight button is the confirmation.
    const { confirmsTap, onCellClick, isPositioningPhase } = latestClick.current;
    if (confirmsTap(cell) || isPositioningPhase) onCellClick(cell);
  }, []);

  // Cells the selected spell can actually reach: in range, and seen from where
  // the caster stands — or from its relay, for a spell that can use one. A
  // cell it cannot reach must not look targetable. A spell that needs a free
  // cell only offers free ones, and one cast on yourself only your own.
  const castable = React.useMemo(() => {
    const inRange = new Set<string>();
    if (!characterPosition || !selectedSpell) return inRange;
    sortedCoordinates.forEach(({ x, y }) => {
      const cell = { x, y };
      if (!castOrigin(selectedSpell, cell, characterPosition, sightBlocked, relay)) {
        return;
      }
      if (
        selectedSpell.targeting === "empty" &&
        (blocked(cell) || isSolidTerrain(terrainAt.get(`${x},${y}`)?.kind))
      ) {
        return;
      }
      inRange.add(`${x},${y}`);
    });
    return inRange;
  }, [characterPosition, selectedSpell, blocked, sightBlocked, relay, terrainAt, sortedCoordinates]);

  /*
   * In range and unseen. Kept apart from `castable` rather than folded into
   * it: these cells are not targets, they are the answer to "why not?", and
   * the board owes the player that answer — the wall is the thing to walk
   * around, and it can only be walked around if it can be seen.
   */
  const blind = React.useMemo(() => {
    const out = new Set<string>();
    if (!characterPosition || !selectedSpell) return out;
    sortedCoordinates.forEach(({ x, y }) => {
      if (castable.has(`${x},${y}`)) return;
      if (outOfSight(selectedSpell, { x, y }, characterPosition, sightBlocked, relay)) {
        out.add(`${x},${y}`);
      }
    });
    return out;
  }, [characterPosition, selectedSpell, castable, sightBlocked, relay, sortedCoordinates]);

  /*
   * Only the centre a spell lands on needs a clear line to the caster — the
   * server checks line of sight once, against the target, and then hits
   * every cell the blast pattern covers regardless of what each of those
   * cells can individually see. So a splash cell must not be judged on its
   * own line of sight: it reads as hit whenever the cell under the cursor is
   * itself a legal cast.
   */
  // A spell cast on yourself lands on you wherever the click is, so its area
  // is shown wherever the pointer is.
  const hoveredCastable =
    !!hoveredPosition &&
    (selectedSpell?.targeting === "self" ||
      castable.has(`${hoveredPosition.x},${hoveredPosition.y}`));

  // The walkable wash is only worth showing once the player has actually
  // brought the mouse to the board — otherwise it is noise sitting on screen
  // between turns and clicks, telling a story nobody asked for yet.
  const showMovementWash = !!hoveredPosition;

  /*
   * The area you may act in this turn — where you can walk, or where the
   * selected spell can land. A wash alone was not enough to see it: grey on
   * grey at ten percent disappears against the board's own checker. It now
   * carries a drawn border, which is what makes a region read as a region.
   */
  const zone = currentPlayer?.isCurrentTurn
    ? selectedSpell
      ? castable
      : showMovementWash
        ? new Set(walkable.keys())
        : new Set<string>()
    : new Set<string>();

  /*
   * On a touch screen the first tap only previews a cell. Rather than asking
   * for a second tap on the same small diamond, the preview carries a large
   * bubble that says what confirming will do, and what it costs.
   */
  const confirmAction = confirmActionFor({
    touchMode,
    previewed: hoveredPosition,
    isPositioningPhase,
    isMyTurn: !!currentPlayer?.isCurrentTurn,
    selectedSpell,
    castable,
    walkable,
    characterPosition,
    standing: hoveredPosition
      ? findPlayerOnCell(hoveredPosition.x, hoveredPosition.y)
      : undefined,
    userId,
    expectedDamage: damagePreview?.damage,
    damageNote: damagePreview?.throughRelay ? `via relay` : undefined,
    ground: hoveredTerrain?.lines.map((line) => line.title).join(" · "),
  });

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
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden touch-none"
    >
      <div
        ref={zoomLayerRef}
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: isPinching ? "none" : "transform 150ms ease-out",
          /*
           * The board's centre is the container's, and until the container
           * has been measured that centre is a guess — one that puts the
           * whole fight in the top-left corner. Better an empty box for a
           * frame than a board nowhere near the middle of the screen.
           */
          visibility: measured ? undefined : "hidden",
        }}
      >
      <div ref={boardRef} className="absolute inset-0">
        {sortedCoordinates.map(({ x, y }) => {
          const isHovered = hoveredPosition?.x === x && hoveredPosition?.y === y;
          const isValidInitial = isPositioningPhase && isInitialPosition(x, y);

          const isPathCell = isInPathCells(x, y);
          const isObstacle = obstacleSet.has(`${x},${y}`);
          const isInRange = walkable.has(`${x},${y}`);

          const isInCastRange = castable.has(`${x},${y}`);
          const reachedViaRelay =
            isInCastRange &&
            relayed &&
            !!selectedSpell &&
            !!characterPosition &&
            (() => {
              const o = castOrigin(selectedSpell, { x, y }, characterPosition, sightBlocked, relay);
              return !!o && !!relay && o.x === relay.x && o.y === relay.y;
            })();

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
              isOutOfSight={blind.has(`${x},${y}`)}
              viaRelay={reachedViaRelay}
              canCastAtHovered={hoveredCastable}
              isObstacle={isObstacle}
              isPillar={isObstacle && terrainAt.get(`${x},${y}`)?.kind === "pillar"}
              isInRange={isInRange}
              showMovementWash={showMovementWash}
              movementCost={walkable.get(`${x},${y}`)}
              maxMovementCost={movementPoints ?? 0}
              isPathCell={isPathCell}
              zoneEdges={zoneEdges(x, y)}
              onCellClick={handleTileClick}
            />
          );
        })}
        {/*
          What spells left behind: fire, water, ice, cracks under the fighters;
          smoke, bubbles and storm clouds over them.
        */}
        <TerrainLayer
          terrain={terrain}
          zones={zones}
          tileSize={tileSize}
          centerX={centerX}
          centerY={centerY}
          containerRef={containerRef}
          userId={userId}
          relayActive={relayed && !!currentPlayer?.isCurrentTurn}
        />
        {/*
          Sits between the floor and the characters: its ground layer puts scars
          under whoever is standing on them, and its upper layer throws debris in
          front of them.
        */}
        <SpellFXLayer
          latestGameState={latestGameState}
          tileSize={tileSize}
          centerX={centerX}
          centerY={centerY}
          boardRef={boardRef}
          containerRef={containerRef}
        />
        {/*
          Above the scars rather than under them: a scorch mark is scenery, and
          the ring is the one thing on the board that says which fighter is
          which. Not drawn while starting cells are being picked, where the
          board is already carrying a green and a red of its own.
        */}
        {Object.entries(characterRenderState).map(([playerId, renderData]) => {
          const player = players?.[playerId];
          // A dying fighter still gets its ring while it fades, even past
          // the moment the next positioning phase has already started —
          // otherwise the ring vanishes a beat before the sprite does.
          if (!renderData || !player) return null;
          if (isPositioningPhase && renderData.animation !== "die") return null;
          return (
            <Socle
              key={`socle-${playerId}`}
              screenPosition={renderData.screenPosition}
              tileSize={tileSize}
              color={player.character.color}
              isPlaying={player.isCurrentTurn}
              isAlive={player.character.isAlive}
              opacity={renderData.opacity}
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
              color={players?.[playerId]?.character.color}
              opacity={renderData.opacity}
            />
          );
        })}
        {/* Burning fighters, burning where everyone can see it. */}
        {Object.entries(characterRenderState).map(([playerId, renderData]) => {
          const character = players?.[playerId]?.character;
          const burn = character?.effects?.find((e) => e.kind === "burn");
          if (!renderData || !character?.isAlive || !burn || isPositioningPhase) return null;
          return (
            <BurnMarker
              key={`burn-${playerId}`}
              screenPosition={renderData.screenPosition}
              tileSize={tileSize}
              stacks={burn.value}
              turnsLeft={burn.turnsLeft}
            />
          );
        })}
        {/*
          The fighter under the pointer's stats — HP, AP, MP and buffs — the
          same figures the bottom bar shows for the current player, but for
          whoever the mouse is over. Driven by hoveredPosition rather than a
          hitbox of its own, so it never steals a click meant for the tile.
        */}
        {!isPositioningPhase &&
          !confirmAction &&
          hoveredCharacterEntry &&
          characterRenderState[hoveredCharacterEntry[0]] && (
            <CharacterTooltip
              screenPosition={
                characterRenderState[hoveredCharacterEntry[0]]!.screenPosition
              }
              tileSize={tileSize}
              character={hoveredCharacterEntry[1].character}
              clipRef={containerRef}
            />
          )}
        {/*
          What the spell actually took off, over the fighter it took it off.
          Nothing is drawn over a character nobody has touched.
        */}
        {Object.entries(stats.health).map(([playerId, hit]) => {
          const renderData = characterRenderState[playerId];
          if (!renderData) return null;
          return (
            <HitFeedback
              key={`hit-${playerId}`}
              screenPosition={renderData.screenPosition}
              tileSize={tileSize}
              hit={hit}
            />
          );
        })}
        {Object.entries(stats.pa).map(([playerId, hit]) => {
          const renderData = characterRenderState[playerId];
          if (!renderData) return null;
          return (
            <StatFeedback
              key={`pa-${playerId}-${hit.hitId}`}
              screenPosition={renderData.screenPosition}
              tileSize={tileSize}
              hit={hit}
              color={BOARD.pa}
              label="PA"
              slot={playerId in stats.health ? 1 : 0}
            />
          );
        })}
        {Object.entries(stats.pm).map(([playerId, hit]) => {
          const renderData = characterRenderState[playerId];
          if (!renderData) return null;
          return (
            <StatFeedback
              key={`pm-${playerId}-${hit.hitId}`}
              screenPosition={renderData.screenPosition}
              tileSize={tileSize}
              hit={hit}
              color={BOARD.pm}
              label="PM"
              slot={
                (playerId in stats.health ? 1 : 0) +
                (playerId in stats.pa ? 1 : 0)
              }
            />
          );
        })}
        {/*
          What the spell would take off, before the click. The number is the
          catalogue's base damage: a critical or a shield will move it, which is
          why it is shown as an estimate and not as a result.
        */}
        {damagePreview && !confirmAction && (
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
            {damagePreview.throughRelay && (
              <span
                className="ml-1 align-middle font-mono text-[10px] font-semibold uppercase tracking-label"
                style={{ color: BOARD.relay }}
              >
                via relay +{RULES.relayBonus}%
              </span>
            )}
          </div>
        )}

        {confirmAction && hoveredPosition && (() => {
          const at = isoToScreen(
            hoveredPosition.x,
            hoveredPosition.y,
            tileSize,
            centerX,
            centerY
          );
          const cell = hoveredPosition;
          const { toLeft, left, top } = bubblePlacement(at, tileSize, boardSize);
          return (
            <div
              data-board-ui
              className={`absolute z-30 flex items-center gap-1.5 ${
                toLeft ? "flex-row-reverse" : ""
              }`}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                transform: `translate(${toLeft ? "-100%" : "0"}, -50%)`,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  clearPreview();
                  onCellClick(cell);
                }}
                className={`flex min-h-10 flex-col items-start justify-center rounded-2xl py-1.5 pl-4 pr-3 text-left text-white shadow-[0_4px_14px_rgba(23,24,26,0.18)] transition-transform active:scale-95 ${
                  confirmAction.kind === "cast" ? "bg-vermilion" : "bg-pm"
                }`}
              >
                <span className="flex items-center gap-2 font-display text-[15px] font-bold leading-tight">
                  {confirmAction.label}
                  <span className="rounded-full bg-white/20 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums">
                    {confirmAction.detail}
                  </span>
                </span>
                {confirmAction.target && (
                  <span className="mt-0.5 whitespace-nowrap font-mono text-[10px] tabular-nums text-white/85">
                    {confirmAction.target}
                  </span>
                )}
                {confirmAction.ground && (
                  <span className="mt-0.5 whitespace-nowrap font-mono text-[10px] text-white/85">
                    on {confirmAction.ground.toLowerCase()}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label="Cancel"
                onClick={clearPreview}
                className="grid h-8 w-8 place-items-center rounded-full border border-rule bg-panel text-graphite transition-transform active:scale-95"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          );
        })()}

                {/* The wind's route: from the caster, round the relay, to the target. */}
        {relayRoute && (
          <svg
            className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
            aria-hidden
          >
            <path
              d={`M ${relayRoute[0].x} ${relayRoute[0].y - tileSize.height * 0.9} Q ${
                (relayRoute[0].x + relayRoute[1].x) / 2
              } ${Math.min(relayRoute[0].y, relayRoute[1].y) - tileSize.height * 2.2} ${relayRoute[1].x} ${
                relayRoute[1].y - tileSize.height * 0.9
              } Q ${(relayRoute[1].x + relayRoute[2].x) / 2} ${
                Math.min(relayRoute[1].y, relayRoute[2].y) - tileSize.height * 2.2
              } ${relayRoute[2].x} ${relayRoute[2].y - tileSize.height * 0.5}`}
              fill="none"
              stroke={BOARD.relay}
              strokeWidth={3}
              strokeDasharray="10 7"
              strokeLinecap="round"
              className="animate-wind-dash"
            />
            <circle cx={relayRoute[2].x} cy={relayRoute[2].y - tileSize.height * 0.5} r={4} fill={BOARD.relay} />
          </svg>
        )}

                {!isPositioningPhase && !hoveredCharacterEntry && !confirmAction && hoveredTerrain && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 w-[200px] border-2 border-ink bg-paper px-2 py-1.5 text-ink shadow-md"
            style={{
              left: `${hoveredTerrain.screen.x}px`,
              top: `${hoveredTerrain.screen.y - tileSize.height * 0.9}px`,
              transform: "translate(-50%, -100%)",
            }}
          >
            {hoveredTerrain.lines.map((line) => (
              <div key={line.title} className="[&+&]:mt-1">
                <div className="font-display text-[12px] font-bold leading-tight">
                  {line.title}
                </div>
                <div className="font-sans text-[10.5px] leading-snug text-graphite">
                  {line.text}
                </div>
              </div>
            ))}
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
            color={currentPlayer?.character.color}
          />
        )}
      </div>
      </div>
      {scale > 1.02 && (
        <button
          type="button"
          onClick={resetZoom}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 border border-ink bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-label text-ink shadow-sm"
        >
          Reset zoom
        </button>
      )}
    </div>
  );
};
