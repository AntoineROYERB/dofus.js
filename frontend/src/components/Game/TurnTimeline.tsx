import React from "react";
import { Player } from "../../types/game";
import { GameState } from "../../types/message";
import { EffectBadges } from "./EffectBadges";
import { TurnClock } from "./TurnClock";
import { KitTag } from "./KitTag";
import { useContent } from "../../hooks/useContent";
import { t } from "../../i18n/lang";

interface TurnTimelineProps {
  latestGameState: GameState | null;
  userId: string;
  /**
   * Opens the menu sheet — log, chat and the ways out — on the screens too
   * narrow to keep the rail. Leave used to sit beside it as a word of its
   * own, a forfeit one slip from the log; the sheet now ends on it, as a
   * button that says what it does.
   */
  onOpenRail?: () => void;
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
  onOpenRail,
}) => {
  const { content } = useContent();
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
          {t("Turn order")}
        </span>
        <span className="flex flex-none items-baseline gap-4">
          <span className="font-mono text-[10px] uppercase tracking-label text-muted">
            {t("Turn")}{" "}
            <b className="font-medium text-ink">
              {latestGameState?.turnNumber ?? 0}
            </b>
          </span>
          {onOpenRail && (
            <button
              type="button"
              onClick={onOpenRail}
              aria-label={t("Menu: log, chat and leave")}
              className="-my-2 flex items-center gap-1.5 py-2 pl-2 font-mono text-[10px] uppercase tracking-label text-ink lg:hidden"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              </svg>
              {t("Menu")}
            </button>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 pt-2 sm:gap-x-8">
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
              {/* An opponent's kit is the first thing worth knowing about them. */}
              <KitTag
                loadout={player.character.loadout}
                content={content}
                className="hidden sm:inline-flex short:hidden"
              />
              {/* Held upright, the opponent's health is the one fact kept. */}
              <span className="font-mono text-[9.5px] text-muted">
                {isYou ? <span className="hidden sm:inline">{t("you")}</span> : t("{n} HP", { n: player.character.health })}
                <span className="hidden sm:inline">
                  {player.isBot && !isYou ? ` · ${t("cpu")}` : ""}
                </span>
                {!player.isBot && !player.connected ? ` · ${t("away")}` : ""}
                {dead ? ` · ${t("out")}` : ""}
              </span>
              {isPlaying && (
                <TurnClock
                  turnEndsAt={latestGameState?.turnEndsAt ?? 0}
                  isMyTurn={isYou}
                />
              )}
              <span className="hidden sm:inline">
                <EffectBadges effects={player.character.effects} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TurnTimeline;
