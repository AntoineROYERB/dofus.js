import React from "react";
import { GameState } from "../../types/message";
import { CombatLog } from "./CombatLog";
import { Chat } from "../Chat/Chat";
import { t } from "../../i18n/lang";
import { SoundToggle } from "../../audio/SoundToggle";

interface SideRailProps {
  roomName: string;
  latestGameState: GameState | null;
  onLeave: () => void;
  onReplayTutorial: () => void;
}

/**
 * The log and the chat under it: the rail's body, beside the board or in a
 * sheet. In the sheet it also carries the sound switch: on a phone the menu
 * is the only control left in the fight's corners, so the switch lives in it.
 */
export const RailBody: React.FC<{
  latestGameState: GameState | null;
  withSound?: boolean;
}> = ({ latestGameState, withSound = false }) => (
  <div className="flex h-full min-h-0 flex-col">
    <div className="mb-1.5 mt-4 flex flex-none items-baseline justify-between gap-3 font-mono text-[9.5px] uppercase tracking-label text-muted">
      {t("Log")}
      {withSound && <SoundToggle />}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <CombatLog
        entries={latestGameState?.log ?? []}
        spellBook={latestGameState?.spells}
      />
    </div>

    <Chat />
  </div>
);

/**
 * The ways out of a fight, as buttons a thumb can find. In the sheet they
 * used to sit in its header as nine-pixel words, Leave right beside Close —
 * one slip from a forfeit.
 */
export const RailExits: React.FC<{
  onLeave: () => void;
  onReplayTutorial: () => void;
}> = ({ onLeave, onReplayTutorial }) => (
  <>
    <button
      type="button"
      onClick={onReplayTutorial}
      className="rounded-full h-10 flex-1 whitespace-nowrap border border-rule px-2 font-mono text-[10px] uppercase tracking-label text-graphite transition-colors hover:border-ink active:scale-[0.98]"
    >
      {t("Replay tutorial")}
    </button>
    <button
      type="button"
      onClick={onLeave}
      className="rounded-full h-10 flex-1 whitespace-nowrap border border-ink px-2 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper active:scale-[0.98]"
    >
      {t("Leave fight")}
    </button>
  </>
);

/**
 * Room, log and chat, as a column beside the board on a wide screen. On a
 * narrow one the same log and chat go in a sheet (GamePage), the board never
 * giving up its space to them, which is the whole point of the layout.
 */
export const SideRail: React.FC<SideRailProps> = ({
  roomName,
  latestGameState,
  onLeave,
  onReplayTutorial,
}) => (
  <>
    <div className="flex flex-none items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
      <span className="truncate font-display text-[15px] font-bold">
        {roomName}
      </span>
      <div className="flex flex-none items-baseline gap-4">
        <button
          type="button"
          onClick={onReplayTutorial}
          className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
        >
          {t("Replay tutorial")}
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
        >
          {t("Leave")}
        </button>
      </div>
    </div>

    <div className="min-h-0 flex-1">
      <RailBody latestGameState={latestGameState} />
    </div>
  </>
);

export default SideRail;
