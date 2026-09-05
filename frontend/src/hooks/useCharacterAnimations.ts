import { useState, useEffect, useRef } from "react";
import { GameState } from "../types/message";
import { Position } from "../types/game";
import { getDirection } from "../utils/pathUtils";
import { blockedBy, findPath } from "../utils/board";
import { isoToScreen } from "../utils/isoUtils";

type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

// Only tracks active animations
interface AnimationState {
  [playerId: string]: {
    type: "move" | "attack" | "die";
    path?: Position[];
    step?: number;
    direction: Direction;
    startTime: number;
    /** Where a dying (or vanishing) fighter was standing, frozen for the fade. */
    position?: Position;
    /**
     * An attack the server has already resolved, waiting for the walk still
     * playing to reach its last cell before it takes over. The bot can move
     * into range and cast in the same turn faster than the walk plays out;
     * without this the cast bumped the still-moving character straight to
     * "attack" wherever it happened to be, and it only reappeared at its real
     * cell once that finished — a second, larger snap right after the first.
     */
    pendingAttack?: { direction: Direction };
  };
}
// What the UI actually renders
type CharacterRenderState = {
  [playerId: string]: {
    screenPosition: Position;
    direction: Direction;
    animation: "idle" | "walk" | "attack" | "die";
    /** Fades out over the death animation; absent (1) the rest of the time. */
    opacity?: number;
  };
};

const ANIMATION_DURATION = 300; // ms per tile
const ATTACK_ANIMATION_DURATION = 500; // ms for attack animation
const DEATH_ANIMATION_DURATION = 500; // ms for the death/vanish fade

export const useCharacterAnimations = (
  latestGameState: GameState | null,
  tileSize: { width: number; height: number },
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const [animationState, setAnimationState] = useState<AnimationState>({});
  const [characterRenderState, setCharacterRenderState] =
    useState<CharacterRenderState>({});
  const prevGameState = useRef<GameState | undefined>();
  const players = latestGameState?.players;

  /*
   * Detecting a move and running the animation loop are two separate effects,
   * and React can run both within the same commit before either one's state
   * update has actually landed. When that happens, the loop still sees the
   * OLD (empty) `animationState` from the render that scheduled it, treats
   * the player as idle, and jumps their sprite straight to the server's true
   * position — one frame before the walk it should have played takes over
   * and pulls it back to the start of the path. That round trip is the snap.
   * A ref sidesteps it: it is written synchronously in the same call that
   * starts a new animation, so whichever effect reads it next always sees
   * the truth, never a stale render's copy of it.
   */
  const animationStateRef = useRef<AnimationState>({});
  const updateAnimationState = (
    updater: (prev: AnimationState) => AnimationState
  ) => {
    animationStateRef.current = updater(animationStateRef.current);
    setAnimationState(animationStateRef.current);
  };

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

        /*
         * Detect a fighter leaving the board: knocked out, or reset by a
         * rematch (which clears every position back to null so the next
         * placement phase can start clean). Either way the sprite was there
         * a moment ago and now has nowhere valid to stand, so fade it out
         * from its last known cell instead of leaving it frozen on screen or
         * snapping it away instantly.
         */
        const justDied =
          oldPlayer?.character?.isAlive === true &&
          newPlayer?.character?.isAlive === false;
        const justVanished =
          !!oldPlayer?.character?.position && !newPlayer?.character?.position;
        if (justDied || justVanished) {
          newAnimations[playerId] = {
            type: "die",
            position: oldPlayer.character.position!,
            direction: animationStateRef.current[playerId]?.direction ?? "S",
            startTime: Date.now(),
          };
          continue;
        }

        // Detect movement
        if (
          oldPlayer?.character?.position &&
          newPlayer?.character?.position &&
          (oldPlayer.character.position.x !== newPlayer.character.position.x ||
            oldPlayer.character.position.y !== newPlayer.character.position.y)
        ) {
          // Walk the route the server actually took, so a character no longer
          // slides through cover on its way.
          const others = Object.entries(latestGameState.players)
            .filter(([id]) => id !== playerId)
            .map(([, p]) => p.character.position)
            .filter((p): p is Position => !!p);
          const steps = findPath(
            oldPlayer.character.position,
            newPlayer.character.position,
            blockedBy(latestGameState.obstacles, others)
          );
          const path = [oldPlayer.character.position, ...(steps ?? [])];
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
              newOtherPlayer.character.health < oldOtherPlayer.character.health
            ) {
              targetPlayer = newOtherPlayer;
              break;
            }
          }

          let direction: Direction = "S";
          if (
            targetPlayer &&
            newPlayer.character.position &&
            targetPlayer.character.position
          ) {
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
        updateAnimationState((prev) => {
          const next = { ...prev };
          for (const playerId in newAnimations) {
            const incoming = newAnimations[playerId];
            const current = prev[playerId];

            /*
             * The bot can spend its whole turn's worth of movement points in
             * one server move, and its next action can follow only 700ms
             * later — faster than a multi-tile walk (300ms a tile) finishes.
             * Without this, the second move's path started from scratch at
             * the server's already-current position, and the sprite snapped
             * there mid-stride before setting off again. Splicing the new
             * legs onto whatever is left of the walk in progress, instead of
             * replacing it, keeps the current leg's own timer and direction
             * untouched — only the path grows.
             */
            if (
              incoming.type === "move" &&
              incoming.path &&
              current?.type === "move" &&
              current.path &&
              current.step !== undefined
            ) {
              const soFar = current.path.slice(current.step);
              const joint = soFar[soFar.length - 1];
              if (joint.x === incoming.path[0].x && joint.y === incoming.path[0].y) {
                next[playerId] = {
                  ...current,
                  path: [...soFar, ...incoming.path.slice(1)],
                  step: 0,
                };
                continue;
              }
            }

            /*
             * The bot routinely walks into range and casts in the same turn,
             * faster than the walk plays out. Cutting the walk short here and
             * jumping straight to "attack" is what produced the second snap —
             * the character reappeared at its true cell the moment the attack
             * finished, because the walk had never actually finished playing.
             * Queue the attack on the move already running instead, and let
             * the walk itself hand off once it reaches its last cell.
             */
            if (incoming.type === "attack" && current?.type === "move") {
              next[playerId] = {
                ...current,
                pendingAttack: { direction: incoming.direction },
              };
              continue;
            }

            next[playerId] = incoming;
          }
          return next;
        });
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
      // Through the ref, not the `animationState` closure — see the note by
      // animationStateRef above for why the closure can be a tick behind.
      const currentAnimations = animationStateRef.current;

      for (const playerId in currentAnimations) {
        hasActiveAnimations = true;
        const anim = currentAnimations[playerId];

        if (anim.type === "attack") {
          const elapsed = now - anim.startTime;
          if (elapsed < ATTACK_ANIMATION_DURATION) {
            if (newRenderState[playerId]) {
              newRenderState[playerId].animation = "attack";
              newRenderState[playerId].direction = anim.direction;
            }
          } else {
            updateAnimationState((prev) => {
              const newPrev = { ...prev };
              delete newPrev[playerId];
              return newPrev;
            });
          }
        } else if (anim.type === "die") {
          const elapsed = now - anim.startTime;
          if (elapsed >= DEATH_ANIMATION_DURATION) {
            updateAnimationState((prev) => {
              const newPrev = { ...prev };
              delete newPrev[playerId];
              return newPrev;
            });
            delete newRenderState[playerId];
          } else if (anim.position) {
            newRenderState[playerId] = {
              screenPosition: getCharacterScreenPos(
                anim.position,
                centerX,
                centerY
              ),
              direction: anim.direction,
              animation: "die",
              opacity: 1 - elapsed / DEATH_ANIMATION_DURATION,
            };
          }
        } else if (
          anim.type === "move" &&
          anim.path &&
          anim.step !== undefined
        ) {
          const progress = (now - anim.startTime) / ANIMATION_DURATION;
          const startPos = anim.path[anim.step];
          const endPos = anim.path[anim.step + 1];

          if (progress >= 1) {
            if (anim.step < anim.path.length - 2) {
              const nextDirection = getDirection(
                anim.path[anim.step + 1],
                anim.path[anim.step + 2]
              );
              updateAnimationState((prev) => ({
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
              // A cast queued while this leg was still walking takes over
              // right where the walk lands, instead of the walk simply
              // ending here and an "idle" snap standing in for it.
              const attack = anim.pendingAttack;
              const lastDirection = attack ? attack.direction : anim.direction;
              updateAnimationState((prev) => {
                const newPrev = { ...prev };
                if (attack) {
                  newPrev[playerId] = {
                    type: "attack",
                    startTime: now,
                    direction: attack.direction,
                  };
                } else {
                  delete newPrev[playerId];
                }
                return newPrev;
              });
              if (players && players[playerId]?.character?.position) {
                newRenderState[playerId] = {
                  screenPosition: getCharacterScreenPos(
                    players[playerId].character.position,
                    centerX,
                    centerY
                  ),
                  direction: lastDirection,
                  animation: attack ? "attack" : "idle",
                };
              }
            }
          } else {
            const startScreenPos = getCharacterScreenPos(
              startPos,
              centerX,
              centerY
            );
            const endScreenPos = getCharacterScreenPos(
              endPos,
              centerX,
              centerY
            );
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
          if (currentAnimations[playerId]) continue;

          if (players[playerId].character?.position) {
            newRenderState[playerId] = {
              screenPosition: getCharacterScreenPos(
                players[playerId].character.position,
                centerX,
                centerY
              ),
              direction: newRenderState[playerId]?.direction ?? "SE",
              animation: "idle",
            };
          } else {
            // No position and nothing animating it out (a rematch's fade
            // already ran its course, say) — nothing should linger on the
            // board where this fighter used to stand.
            delete newRenderState[playerId];
          }
        }
      }

      setCharacterRenderState(newRenderState);
      if (
        hasActiveAnimations ||
        Object.keys(animationStateRef.current).length > 0
      ) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    if (
      Object.keys(animationStateRef.current).length > 0 ||
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
