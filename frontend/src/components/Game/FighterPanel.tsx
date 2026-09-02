import React from "react";
import { Player } from "../../types/game";
import { EffectBadges } from "./EffectBadges";

interface FighterPanelProps {
  currentPlayer: Player | undefined;
  connected: boolean;
}

const Figure: React.FC<{ value: number | string; label: string }> = ({
  value,
  label,
}) => (
  <div className="flex items-baseline">
    <b className="font-display text-[26px] font-bold leading-none tabular-nums">
      {value}
    </b>
    <em className="ml-1.5 font-mono text-[9.5px] uppercase not-italic tracking-label text-muted">
      {label}
    </em>
  </div>
);

/**
 * The fighter zone of the bar. Health, action and movement points used to be
 * three lines of 12px text sharing a panel with the room name; here they are
 * the largest thing in their zone, because they are what a turn is spent on.
 */
export const FighterPanel: React.FC<FighterPanelProps> = ({
  currentPlayer,
  connected,
}) => {
  const character = currentPlayer?.character;

  if (!character) {
    return (
      <div className="flex h-full flex-col">
        <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          Fighter
        </div>
        <p className="mt-2 text-sm text-graphite">
          {connected ? "Joining the game…" : "Reconnecting…"}
        </p>
      </div>
    );
  }

  const share = Math.max(
    0,
    Math.min(1, character.health / Math.max(1, character.maxHealth))
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          Fighter
        </span>
        {!connected && (
          <span className="font-mono text-[9.5px] uppercase tracking-label text-vermilion">
            offline
          </span>
        )}
      </div>

      <div className="mb-2.5 mt-1.5 truncate font-display text-[29px] font-bold leading-none tracking-tight">
        {character.name}
      </div>

      <div className="flex items-baseline gap-6">
        <Figure value={character.health} label="hp" />
        <Figure value={character.actionPoints} label="ap" />
        <Figure value={character.movementPoints} label="mp" />
      </div>

      <div className="mb-2 mt-3 h-1 bg-hairline">
        <div
          className="h-full bg-vermilion transition-[width] duration-300"
          style={{ width: `${share * 100}%` }}
        />
      </div>

      <div className="mt-auto flex min-h-[22px] items-center gap-2 border-t border-hairline pt-1.5 text-[11.5px] text-graphite">
        {character.effects && character.effects.length > 0 ? (
          <EffectBadges effects={character.effects} />
        ) : (
          <span className="text-muted">No effect running</span>
        )}
      </div>
    </div>
  );
};

export default FighterPanel;
