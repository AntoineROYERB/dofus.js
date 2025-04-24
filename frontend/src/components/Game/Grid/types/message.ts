import { Players } from "./game";

export interface GameStateMessage {
  type: "gameState";
  players: Players;
  currentTurn: string;
}
