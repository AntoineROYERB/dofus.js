import { useState, useEffect, useRef } from "react";
import { GameStateMessage } from "../../../types/message";
import { Position } from "../../../types/game";
import { calculatePath, getDirection } from "../utils/pathUtils";
import { isoToScreen } from "../utils/isoUtils";

interface AnimationState {
  [playerId: string]: {
    type: "move" | "attack";
    path?: Position[];
    step?: number;
    direction: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
    startTime: number;
  };
}

type CharacterRenderState = {
  [playerId: string]: {
    screenPosition: Position;
    direction: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
    animation: "idle" | "walk" | "attack";
  };
};

const ANIMATION_DURATION = 300; // ms per tile
const ATTACK_ANIMATION_DURATION = 500; // ms for attack animation

export const useCharacterAnimations = (
  latestGameState: GameStateMessage | null | undefined,
  tileSize: { width: number; height: number },
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const [animationState, setAnimationState] = useState<AnimationState>({});
  const [characterRenderState, setCharacterRenderState] =
    useState<CharacterRenderState>({});
  const prevGameState = useRef<GameStateMessage | undefined>();
  const players = latestGameState?.players;

  const getCharacterScreenPos = (
    position: Position,
    centerX: number,
    centerY: number
  ) => {
    return isoToScreen(position.x, position.y, tileSize, centerX, centerY);
  };

  // Detect movement and spell casts
  useEffect(() => {
    if (latestGameState && prevGameState.current) {
      const newAnimations: AnimationState = {};

      for (const playerId in latestGameState.players) {
        const oldPlayer = prevGameState.current.players[playerId];
        const newPlayer = latestGameState.players[playerId];

        // Detect movement
        if (
          oldPlayer?.character?.position &&
          newPlayer?.character?.position &&
          (oldPlayer.character.position.x !== newPlayer.character.position.x ||
            oldPlayer.character.position.y !== newPlayer.character.position.y)
        ) {
          const path = calculatePath(
            oldPlayer.character.position,
            newPlayer.character.position
          );
          if (path.length > 1) {
            newAnimations[playerId] = {
              type: "move",
              path,
              step: 0,
              direction: getDirection(path[0], path[1]),
              startTime: Date.now(),
            };
          }
        }

        // Detect spell cast
        if (
          oldPlayer?.character?.actionPoints &&
          newPlayer?.character?.actionPoints &&
          newPlayer.character.actionPoints < oldPlayer.character.actionPoints &&
          newPlayer.isCurrentTurn
        ) {
          let targetPlayer = null;
          for (const otherPlayerId in latestGameState.players) {
            if (playerId === otherPlayerId) continue;
            const oldOtherPlayer = prevGameState.current.players[otherPlayerId];
            const newOtherPlayer = latestGameState.players[otherPlayerId];
            if (
              newOtherPlayer.character.health <
              oldOtherPlayer.character.health
            ) {
              targetPlayer = newOtherPlayer;
              break;
            }
          }

          let direction: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" = "S";
          if (targetPlayer && newPlayer.character.position && targetPlayer.character.position) {
            direction = getDirection(
              newPlayer.character.position,
              targetPlayer.character.position
            );
          }

          newAnimations[playerId] = {
            type: "attack",
            startTime: Date.now(),
            direction: direction,
          };
        }
      }

      if (Object.keys(newAnimations).length > 0) {
        setAnimationState((prev) => ({ ...prev, ...newAnimations }));
      }
    }

    prevGameState.current = latestGameState ?? undefined;
  }, [latestGameState]);

  // Animation loop
  useEffect(() => {
    let animationFrameId: number;
    const centerX = containerRef.current
      ? containerRef.current.clientWidth / 2
      : 0;
    const centerY = containerRef.current
      ? containerRef.current.clientHeight / 2
      : 0;

    const animate = () => {
      const now = Date.now();
      const newRenderState: CharacterRenderState = { ...characterRenderState };
      let hasActiveAnimations = false;

      for (const playerId in animationState) {
        hasActiveAnimations = true;
        const anim = animationState[playerId];

        if (anim.type === "attack") {
          const elapsed = now - anim.startTime;
          if (elapsed < ATTACK_ANIMATION_DURATION) {
            if (newRenderState[playerId]) {
              newRenderState[playerId].animation = "attack";
              newRenderState[playerId].direction = anim.direction;
            }
          } else {
            setAnimationState((prev) => {
              const { [playerId]: _, ...rest } = prev;
              return rest;
            });
          }
        } else if (anim.type === "move" && anim.path && anim.step !== undefined) {
          const progress = (now - anim.startTime) / ANIMATION_DURATION;
          const startPos = anim.path[anim.step];
          const endPos = anim.path[anim.step + 1];

          if (progress >= 1) {
            if (anim.step < anim.path.length - 2) {
              const nextDirection = getDirection(
                anim.path[anim.step + 1],
                anim.path[anim.step + 2]
              );
              setAnimationState((prev) => ({
                ...prev,
                [playerId]: {
                  ...anim,
                  step: (anim.step ?? 0) + 1,
                  startTime: now,
                  direction: nextDirection,
                },
              }));
              newRenderState[playerId] = {
                screenPosition: getCharacterScreenPos(endPos, centerX, centerY),
                direction: nextDirection,
                animation: "walk",
              };
            } else {
              const lastDirection = anim.direction;
              setAnimationState((prev) => {
                const { [playerId]: _, ...rest } = prev;
                return rest;
              });
              if (players && players[playerId]?.character?.position) {
                newRenderState[playerId] = {
                  screenPosition: getCharacterScreenPos(
                    players[playerId].character.position,
                    centerX,
                    centerY
                  ),
                  direction: lastDirection,
                  animation: "idle",
                };
              }
            }
          } else {
            const startScreenPos = getCharacterScreenPos(
              startPos,
              centerX,
              centerY
            );
            const endScreenPos = getCharacterScreenPos(endPos, centerX, centerY);
            newRenderState[playerId] = {
              screenPosition: {
                x:
                  startScreenPos.x +
                  (endScreenPos.x - startScreenPos.x) * progress,
                y:
                  startScreenPos.y +
                  (endScreenPos.y - startScreenPos.y) * progress,
              },
              direction: anim.direction,
              animation: "walk",
            };
          }
        }
      }

      if (players) {
        for (const playerId in players) {
          if (
            !animationState[playerId] &&
            players[playerId].character?.position
          ) {
            newRenderState[playerId] = {
              screenPosition: getCharacterScreenPos(
                players[playerId].character.position,
                centerX,
                centerY
              ),
              direction: newRenderState[playerId]?.direction ?? "SE",
              animation: "idle",
            };
          }
        }
      }

      setCharacterRenderState(newRenderState);
      if (hasActiveAnimations || Object.keys(animationState).length > 0) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    if (
      Object.keys(animationState).length > 0 ||
      !prevGameState.current
    ) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animate(); // Run once to set initial idle positions
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [animationState, players, tileSize, containerRef]);

  return characterRenderState;
};