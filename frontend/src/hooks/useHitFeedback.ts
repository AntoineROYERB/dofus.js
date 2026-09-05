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
 * A change to a stat that has no pool to drain — action points, movement
 * points. Just a number and a reason to restart its flight.
 */
export type StatHit = {
  /** Negative when it was taken, positive when it was given back. */
  delta: number;
  hitId: number;
};

type Stats = {
  health: Record<string, Hit>;
  pa: Record<string, StatHit>;
  pm: Record<string, StatHit>;
};

const EMPTY_STATS: Stats = { health: {}, pa: {}, pm: {} };

/**
 * Who just lost — or gained — health, action points or movement points, and
 * how much.
 *
 * The board says nothing about an opponent's stats today, and a permanent
 * readout over every head would be four more things to ignore. So the answer
 * is only drawn at the moment it is being asked: a spell lands, the number
 * appears on the fighter it landed on, and goes away again.
 *
 * The server sends whole game states rather than events, so a change is a
 * difference between two of them. That is the same trick useCharacterAnimations
 * uses to work out which way a caster should turn, kept separate here so the
 * two do not share a state machine: one is about where a sprite is, this one is
 * about what a number did.
 *
 * PA and PM both refill at the start of a turn, and that refill is not a
 * spell's doing — it would otherwise flash as a large, misleading gain the
 * moment a fighter's turn begins. That refill is swallowed the same way the
 * very first reading of a stat is: as a baseline, not a hit.
 */
export const useHitFeedback = (latestGameState: GameState | null) => {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const previous = useRef<
    Record<string, { health: number; pa: number; pm: number; isCurrentTurn: boolean }>
  >({});
  const timers = useRef<Record<string, number>>({});
  const nextId = useRef(0);

  useEffect(() => {
    const players = latestGameState?.players;
    if (!players) return;

    const freshHealth: Record<string, Hit> = {};
    const freshPa: Record<string, StatHit> = {};
    const freshPm: Record<string, StatHit> = {};
    const touched = new Set<string>();

    for (const playerId in players) {
      const character = players[playerId].character;
      const before = previous.current[playerId];
      const turnJustStarted = character.isCurrentTurn && !before?.isCurrentTurn;

      previous.current[playerId] = {
        health: character.health,
        pa: character.actionPoints,
        pm: character.movementPoints,
        isCurrentTurn: character.isCurrentTurn,
      };

      // The first state a player appears in is a starting point, not a hit.
      if (!before) continue;

      if (before.health !== character.health) {
        nextId.current += 1;
        freshHealth[playerId] = {
          health: character.health,
          maxHealth: Math.max(1, character.maxHealth),
          from: before.health,
          delta: character.health - before.health,
          hitId: nextId.current,
        };
        touched.add(playerId);
      }

      // A turn's own refill is not a spell's doing.
      if (!turnJustStarted && before.pa !== character.actionPoints) {
        nextId.current += 1;
        freshPa[playerId] = {
          delta: character.actionPoints - before.pa,
          hitId: nextId.current,
        };
        touched.add(playerId);
      }

      if (!turnJustStarted && before.pm !== character.movementPoints) {
        nextId.current += 1;
        freshPm[playerId] = {
          delta: character.movementPoints - before.pm,
          hitId: nextId.current,
        };
        touched.add(playerId);
      }
    }

    // Whoever left the room takes their history with them.
    for (const playerId in previous.current) {
      if (!players[playerId]) delete previous.current[playerId];
    }

    if (touched.size === 0) return;

    setStats((current) => ({
      health: { ...current.health, ...freshHealth },
      pa: { ...current.pa, ...freshPa },
      pm: { ...current.pm, ...freshPm },
    }));

    for (const playerId of touched) {
      window.clearTimeout(timers.current[playerId]);
      timers.current[playerId] = window.setTimeout(() => {
        delete timers.current[playerId];
        setStats((current) => {
          const health = { ...current.health };
          const pa = { ...current.pa };
          const pm = { ...current.pm };
          delete health[playerId];
          delete pa[playerId];
          delete pm[playerId];
          return { health, pa, pm };
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

  return stats;
};
