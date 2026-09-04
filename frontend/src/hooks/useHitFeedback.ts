import { useEffect, useRef, useState } from "react";
import { GameState } from "../types/message";

/** How long a bar stays up after the last change, and how long it takes to go. */
export const HIT_HOLD = 2500;
export const HIT_FADE = 400;
export const HIT_LIFETIME = HIT_HOLD + HIT_FADE;

export type Hit = {
  /** Health after the change, and the pool it is measured against. */
  health: number;
  maxHealth: number;
  /** Health before it, so a bar can mount where it was and slide from there. */
  from: number;
  /** Negative when it hurt, positive when it healed. */
  delta: number;
  /** Bumped on every change, so a second hit restarts the flight of the number. */
  hitId: number;
};

/**
 * Who just lost — or gained — health, and how much.
 *
 * The board says nothing about an opponent's health today, and a permanent bar
 * over every head would be four more things to ignore. So the answer is only
 * drawn at the moment it is being asked: a spell lands, the bar appears on the
 * fighter it landed on, drains, and goes away again.
 *
 * The server sends whole game states rather than events, so a hit is a
 * difference between two of them. That is the same trick useCharacterAnimations
 * uses to work out which way a caster should turn, kept separate here so the
 * two do not share a state machine: one is about where a sprite is, this one is
 * about what a number did.
 */
export const useHitFeedback = (latestGameState: GameState | null) => {
  const [hits, setHits] = useState<Record<string, Hit>>({});
  const health = useRef<Record<string, number>>({});
  const timers = useRef<Record<string, number>>({});
  const nextId = useRef(0);

  useEffect(() => {
    const players = latestGameState?.players;
    if (!players) return;

    const fresh: Record<string, Hit> = {};
    for (const playerId in players) {
      const character = players[playerId].character;
      const before = health.current[playerId];
      health.current[playerId] = character.health;

      // The first state a player appears in is a starting point, not a hit.
      if (before === undefined || before === character.health) continue;

      nextId.current += 1;
      fresh[playerId] = {
        health: character.health,
        maxHealth: Math.max(1, character.maxHealth),
        from: before,
        delta: character.health - before,
        hitId: nextId.current,
      };
    }

    // Whoever left the room takes their history with them.
    for (const playerId in health.current) {
      if (!players[playerId]) delete health.current[playerId];
    }

    if (Object.keys(fresh).length === 0) return;

    setHits((previous) => ({ ...previous, ...fresh }));

    for (const playerId in fresh) {
      window.clearTimeout(timers.current[playerId]);
      timers.current[playerId] = window.setTimeout(() => {
        delete timers.current[playerId];
        setHits((previous) => {
          const next = { ...previous };
          delete next[playerId];
          return next;
        });
      }, HIT_LIFETIME);
    }
  }, [latestGameState]);

  // Leaving the board mid-fight must not leave a timer running behind it.
  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const playerId in running) window.clearTimeout(running[playerId]);
    };
  }, []);

  return hits;
};
