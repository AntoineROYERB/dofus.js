import React from "react";
import { GameState } from "../../types/message";
import { CombatLog } from "./CombatLog";
import { Chat } from "../Chat/Chat";

interface SideRailProps {
  roomName: string;
  latestGameState: GameState | null;
  onLeave: () => void;
  /** Only on the small-screen sheet, where the rail can be dismissed. */
  onClose?: () => void;
}

/**
 * Room, log and chat. It is a column beside the board on a wide screen and the
 * same column in a sheet on a narrow one — the board never gives up its space
 * to it, which is the whole point of the layout.
 */
export const SideRail: React.FC<SideRailProps> = ({
  roomName,
  latestGameState,
  onLeave,
  onClose,
}) => (
  <>
    <div className="flex flex-none items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
      <span className="truncate font-display text-[15px] font-bold">
        {roomName}
      </span>
      <div className="flex flex-none items-baseline gap-4">
        <button
          type="button"
          onClick={onLeave}
          className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
        >
          Leave
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[9.5px] uppercase tracking-label text-ink transition-colors hover:text-vermilion"
          >
            Close
          </button>
        )}
      </div>
    </div>

    <div className="mb-1.5 mt-4 flex-none font-mono text-[9.5px] uppercase tracking-label text-muted">
      Log
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <CombatLog entries={latestGameState?.log ?? []} />
    </div>

    <Chat />
  </>
);

export default SideRail;
