import React from "react";
import { Modal } from "../Overlay";

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
  /** A dream's floor: the party fights on, and a party all gone loses it. */
  dream?: boolean;
}

/**
 * Leaving mid-fight is a forfeit, and the button for it now sits one thumb
 * away from the board on a phone — so it asks once before it counts.
 */
export const LeaveDialog: React.FC<LeaveDialogProps> = ({
  onConfirm,
  onCancel,
  replay = false,
  dream = false,
}) => (
  <Modal
    onClose={onCancel}
    labelledBy="leave-dialog-title"
    dim="hard"
    className="max-w-sm rounded-3xl border-2 border-gold/70 bg-panel p-6 shadow-[0_0_40px_rgb(var(--night)/0.8)] short:p-5"
  >
    <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
      {replay ? "Replay tutorial" : "Leave"}
    </div>
    <h2
      id="leave-dialog-title"
      className="mt-2 pr-8 font-display text-[24px] font-bold leading-none tracking-tight"
    >
      {replay ? "Leave this fight for the tutorial?" : "Leave the fight?"}
    </h2>
    <p className="mt-3 text-[13.5px] text-graphite">
      {replay
        ? "It counts as a loss, and a fresh tutorial match opens against an opponent that stands still."
        : dream
          ? "Your party fights this floor without you; if nobody is left in it, the dream ends."
          : "It counts as a loss, and you go back to the lobby."}
    </p>
    <div className="mt-6 flex gap-3 short:mt-4">
      <button
        type="button"
        onClick={onConfirm}
        className="flex-1 btn-night px-3 py-3 font-display text-[15px] font-bold"
      >
        {replay ? "Start the tutorial" : "Leave"}
      </button>
      <button
        type="button"
        autoFocus
        onClick={onCancel}
        // Staying is the gold one: the forfeit is never the button that glows.
        className="flex-1 btn-gold px-3 py-3 font-display text-[15px] font-bold"
      >
        Keep fighting
      </button>
    </div>
  </Modal>
);

export default LeaveDialog;
