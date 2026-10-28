import { useEffect, useRef, useState } from "react";
import { GameState } from "../types/message";
import { Cue, fightCues, panOf } from "./cues";
import { playMusic, playStinger, setIntensity } from "./music";
import {
  playCast,
  playDeath,
  playDrain,
  playHeal,
  playHurt,
  playImpact,
  playShield,
  playTurnChime,
  playWhoosh,
} from "./sfx";
import { onSettings, readSettings, SoundSettings, writeSettings } from "./settings";
import { TrackId } from "./score";

/** The music a screen wants, asked for on mount. */
export const useMusic = (track: TrackId | null) => {
  useEffect(() => {
    playMusic(track);
  }, [track]);
};

/** The player's sound settings, live, and a way to change them. */
export const useSoundSettings = (): [SoundSettings, (change: Partial<SoundSettings>) => void] => {
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => onSettings(setSettings), []);
  return [settings, writeSettings];
};

/**
 * How long a spell takes to cross the board before it lands — about what the
 * drawn projectile takes, so the blow is heard when it is seen.
 */
const FLIGHT = 0.28;
const HEAVY_FLIGHT = 0.5;

/** Below this share of their health, a fighter is about to fall. */
const DANGER = 0.3;

/**
 * Everything a fight sounds like: the battle music and how hard it plays, the
 * fanfare at the end, and a sound for every cast, blow, heal and fall.
 *
 * It lives with the board, so a replay sounds like the fight it records.
 */
export const useFightSounds = (state: GameState | null | undefined, userId: string) => {
  const before = useRef<GameState | null>(null);
  const seen = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const status = state?.status;

  // The battle plays from the placement on, and stops for the fanfare.
  useEffect(() => {
    if (!status) return;
    playMusic(status === "game_over" ? null : "battle");
  }, [status]);

  useEffect(() => {
    if (!state) return;
    const living = Object.values(state.players).filter((p) => p.character.isAlive);
    const close = living.some((p) => p.character.health / Math.max(1, p.character.maxHealth) <= DANGER);
    setIntensity(state.status !== "playing" ? 0 : close ? 2 : 1);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const previous = before.current;
    before.current = state;

    if (previous && previous.status !== "game_over" && state.status === "game_over") {
      const me = state.players[userId];
      // A spectator of a replay hears the fight won; a player, their own result.
      playStinger(!me || me.character.isAlive ? "victory" : "defeat");
    }

    const { cues, seen: next } = fightCues(previous, state, userId, seen.current);
    seen.current = next;
    if (cues.length === 0) return;

    // Whatever a cast did lands with it, not before it.
    const cast = cues.find((c): c is Extract<Cue, { kind: "cast" }> => c.kind === "cast");
    const landing = cast ? (cast.heavy ? HEAVY_FLIGHT : FLIGHT) : 0;
    const later = (seconds: number, run: () => void) => {
      if (seconds <= 0) return run();
      const id = window.setTimeout(() => {
        timers.current = timers.current.filter((t) => t !== id);
        run();
      }, seconds * 1000);
      timers.current.push(id);
    };

    for (const cue of cues) {
      switch (cue.kind) {
        case "fightStart":
          playStinger("fightStart");
          break;
        case "turn":
          playTurnChime();
          break;
        case "cast": {
          const sound = { element: cue.element, heavy: cue.heavy, pan: panOf(cue.from) };
          playCast(sound);
          const flight = cue.heavy ? HEAVY_FLIGHT : FLIGHT;
          later(flight, () => playImpact({ ...sound, pan: panOf(cue.to), damage: cue.damage, crit: cue.crit }));
          if (cue.moves) later(flight + 0.05, () => playWhoosh(panOf(cue.to)));
          break;
        }
        case "beat":
          playImpact({ element: cue.element, heavy: false, pan: panOf(cue.at), damage: 0, crit: false });
          break;
        case "hurt":
          later(landing + 0.03, () => playHurt(panOf(cue.at), cue.amount, cue.voice));
          break;
        case "heal":
          later(landing, () => playHeal(panOf(cue.at)));
          break;
        case "shield":
          later(landing, () => playShield(panOf(cue.at)));
          break;
        case "drain":
          later(landing + 0.1, () => playDrain(panOf(cue.at)));
          break;
        case "death":
          later(landing + 0.2, () => playDeath(panOf(cue.at), cue.voice));
          break;
      }
    }
  }, [state, userId]);

  // Leaving the board mid-fight must not leave a blow to land on the lobby.
  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    []
  );
};
