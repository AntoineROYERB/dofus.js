import { Player, Position } from "../types/game";

/**
 * The fighter the stats card should peek at, keyed the same way as the
 * board's render state, or null when there is nothing to show.
 *
 * The card is a peek, never a selection: the caller passes the cell the
 * pointer is *currently* on — the mouse's tile, or the cell under a finger
 * still held down — rather than the previewed cell a tap leaves behind, so
 * moving or casting never pins a card to the board.
 */
export const peekedFighter = (
  players: { [id: string]: Player } | undefined,
  position: Position | null
): [string, Player] | null => {
  if (!position || !players) return null;
  for (const id of Object.keys(players)) {
    const { character } = players[id];
    if (
      character.isAlive &&
      character.position?.x === position.x &&
      character.position?.y === position.y
    ) {
      return [id, players[id]];
    }
  }
  return null;
};
