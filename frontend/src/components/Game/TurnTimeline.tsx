import React from "react";
import { Player } from "../../types/game";
import { GameState } from "../../types/message";
import { EffectBadges } from "./EffectBadges";
import { TurnClock } from "./TurnClock";

interface TurnTimelineProps {
  latestGameState: GameState | null;
  userId: string;
}

/**
 * Who plays, in what order, and how long the current turn has left. The old
 * screen said "Turn: 3" in the corner and listed opponents in a separate
 * panel; reading the two together took a deliberate effort. Here the order is
 * the thing being drawn, and everything else hangs off it.
 */
export const TurnTimeline: React.FC<TurnTimelineProps> = ({
  latestGameState,
  userId,
}) => {
  const players = latestGameState?.players ?? {};
  const order = latestGameState?.turnOrder ?? [];

  // Before the fight starts the server has no order yet, so fall back to
  // whoever is in the room rather than rendering an empty rail.
  const stops: Player[] = (order.length > 0 ? order : Object.keys(players))
    .map((id) => players[id])
    .filter((player): player is Player => !!player);

  if (stops.length === 0) return null;

  return (
    <div className="pointer-events-auto select-none">
      <div className="flex items-baseline justify-between border-b-2 border-ink pb-1.5">
        <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          Turn order
        </span>
        <span className="font-mono text-[10px] uppercase tracking-label text-muted">
          Turn <b className="font-medium text-ink">{latestGameState?.turnNumber ?? 0}</b>
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 pt-2">
        {stops.map((player) => {
          const isYou = player.userId === userId;
          const isPlaying = player.isCurrentTurn;
          const dead = !player.character.isAlive;

          return (
            <div
              key={player.userId}
              className={`flex items-baseline gap-2 ${dead ? "opacity-40" : ""}`}
            >
              <span
                aria-hidden
                className={`h-[9px] w-[9px] flex-none -translate-y-px border-[1.5px] ${
                  isPlaying
                    ? "border-vermilion bg-vermilion"
                    : "border-ink bg-transparent"
                }`}
              />
              <b
                className={`font-display text-[15px] font-bold ${
                  isPlaying ? "text-ink" : "text-muted"
                }`}
              >
                {player.character.name}
              </b>
              <span className="font-mono text-[9.5px] text-muted">
                {isYou ? "you" : `${player.character.health} HP`}
                {player.isBot && !isYou ? " · cpu" : ""}
                {!player.isBot && !player.connected ? " · away" : ""}
                {dead ? " · out" : ""}
              </span>
              {isPlaying && (
                <TurnClock
                  turnEndsAt={latestGameState?.turnEndsAt ?? 0}
                  isMyTurn={isYou}
                />
              )}
              <EffectBadges effects={player.character.effects} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TurnTimeline;
