import React from "react";

interface LeaveDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * The door out is "Replay tutorial": the fight is still being left, and it
   * still counts, but what is on the other side of it is a new tutorial match
   * rather than the room list. Saying so is the difference between a player
   * pressing Leave and a player pressing something that turned out to.
   */
  replay?: boolean;
}

/**
 * Leaving mid-fight is a forfeit, and the button for it now sits one thumb
 * away from the board on a phone — so it asks once before it counts.
 */
export const LeaveDialog: React.FC<LeaveDialogProps> = ({
  onConfirm,
  onCancel,
  replay = false,
}) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="leave-dialog-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-6"
    onClick={onCancel}
  >
    <div
      className="w-full max-w-sm border-2 border-ink bg-panel p-6"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
        {replay ? "Replay tutorial" : "Leave"}
      </div>
      <h2
        id="leave-dialog-title"
        className="mt-2 font-display text-[24px] font-bold leading-none tracking-tight"
      >
        {replay ? "Leave this fight for the tutorial?" : "Leave the fight?"}
      </h2>
      <p className="mt-3 text-[13.5px] text-graphite">
        {replay
          ? "It counts as a loss, and a fresh tutorial match opens against an opponent that stands still."
          : "It counts as a loss, and you go back to the lobby."}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 bg-vermilion px-3 py-3 font-display text-[15px] font-bold text-white transition-colors hover:bg-[#b93a25]"
        >
          {replay ? "Start the tutorial" : "Leave"}
        </button>
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="flex-1 border border-ink px-3 py-3 font-display text-[15px] font-bold text-ink transition-colors hover:bg-hairline"
        >
          Keep fighting
        </button>
      </div>
    </div>
  </div>
);

export default LeaveDialog;
