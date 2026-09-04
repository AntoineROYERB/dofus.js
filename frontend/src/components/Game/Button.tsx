import { Position } from "../../types/game";

interface mainButtonProps {
  gameStatus: string;
  connected: boolean;
  handleEndTurnClick: () => void;
  handleFightClick: () => void;
  isMyTurn: boolean | undefined;
  selectedPosition: Position | undefined;
  isPlayerPositioned: boolean | undefined;
}

// The one filled colour on the screen, so the only thing it can mean is
// "this is the action".
const style =
  "w-full bg-vermilion px-2 py-3 font-display text-[13px] font-bold text-white sm:py-3.5 sm:text-[15px] lg:text-[16px] short:py-2.5 transition-colors hover:bg-[#b93a25] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export const MainButton: React.FC<mainButtonProps> = ({
  gameStatus,
  connected,
  handleEndTurnClick,
  isMyTurn,
  handleFightClick,
  selectedPosition,
  isPlayerPositioned,
}) => {
  /*
   * There is no "ready" step. Joining a room says everything a Ready button
   * used to say, so the only thing left to decide is where to stand, and
   * Fight is the one button that says it.
   */
  if (gameStatus === "position_characters") {
    return (
      <button
        className={style}
        disabled={!connected || !selectedPosition || isPlayerPositioned}
        onClick={handleFightClick}
      >
        {isPlayerPositioned ? "Waiting for your opponent…" : "Fight"}
      </button>
    );
  }

  if (gameStatus === "playing") {
    return (
      <button className={style} disabled={!isMyTurn} onClick={handleEndTurnClick}>
        End turn
      </button>
    );
  }

  // The winner's modal owns the screen once the fight is over; a button
  // underneath it would only be something to click by mistake.
  if (gameStatus === "game_over") return null;

  /*
   * Before a duel is complete there is nothing to click: the character is
   * created on entering the room, and the fight opens by itself the moment an
   * opponent arrives. All this state has to do is say what is being waited on.
   */
  return (
    <p className="py-3 text-center text-xs text-muted">
      {!connected ? "Reconnecting…" : "Waiting for an opponent…"}
    </p>
  );
};
