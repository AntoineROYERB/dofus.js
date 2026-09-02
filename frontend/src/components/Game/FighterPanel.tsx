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
    <b className="font-display text-[19px] font-bold leading-none tabular-nums sm:text-[22px] lg:text-[26px] short:text-[17px]">
      {value}
    </b>
    <em className="ml-1 font-mono text-[9px] uppercase not-italic tracking-label text-muted sm:ml-1.5 sm:text-[9.5px]">
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
        <span className="font-mono text-[9.5px] uppercase tracking-label text-muted short:hidden">
          Fighter
        </span>
        {!connected && (
          <span className="font-mono text-[9.5px] uppercase tracking-label text-vermilion">
            offline
          </span>
        )}
      </div>

      <div className="mb-1.5 mt-1 truncate font-display text-[19px] font-bold leading-none tracking-tight sm:mb-2.5 sm:mt-1.5 sm:text-[23px] lg:text-[29px] short:mb-1 short:mt-0 short:text-[16px]">
        {character.name}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:gap-x-5 lg:gap-x-6">
        <Figure value={character.health} label="hp" />
        <Figure value={character.actionPoints} label="ap" />
        <Figure value={character.movementPoints} label="mp" />
      </div>

      <div className="mb-2 mt-2 h-1 bg-hairline sm:mt-3 short:mb-0 short:mt-2">
        <div
          className="h-full bg-vermilion transition-[width] duration-300"
          style={{ width: `${share * 100}%` }}
        />
      </div>

      <div className="mt-auto hidden min-h-[22px] items-center gap-2 border-t border-hairline pt-1.5 text-[11.5px] text-graphite sm:flex short:hidden">
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
