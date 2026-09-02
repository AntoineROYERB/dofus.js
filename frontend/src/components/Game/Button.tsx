import { Position } from "../../types/game";

interface mainButtonProps {
  gameStatus: string;
  connected: boolean;
  handleReadyClick: () => void;
  handleEndTurnClick: () => void;
  handleFightClick: () => void;
  isPlayerReady: boolean | undefined;
  isMyTurn: boolean | undefined;
  userHasCharacter: boolean;
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
  handleReadyClick,
  handleEndTurnClick,
  isPlayerReady,
  isMyTurn,
  handleFightClick,
  userHasCharacter,
  selectedPosition,
  isPlayerPositioned,
}) => {
  if (gameStatus === "creating_player" && userHasCharacter) {
    return (
      <button
        className={style}
        disabled={!connected || isPlayerReady}
        onClick={handleReadyClick}
      >
        {isPlayerReady ? "Waiting for others…" : "Ready"}
      </button>
    );
  }

  if (gameStatus === "position_characters") {
    return (
      <button
        className={style}
        disabled={!selectedPosition || isPlayerPositioned}
        onClick={handleFightClick}
      >
        {isPlayerPositioned ? "Waiting for others…" : "Fight"}
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

  // The character is created automatically on entering a room, so there is
  // nothing for the player to click here.
  return (
    <p className="py-3 text-center text-xs text-muted">
      {connected ? "Joining the game…" : "Reconnecting…"}
    </p>
  );
};
