import { GameAction, Player } from "./game";

export type UserInfo = {
  id: string;
  name: string;
};

export type BaseMessage = {
  messageId: string;
  timestamp: number;
  userId: string;
  userName: string;
  type: MessageType;
};
export interface UserInitMessage extends BaseMessage {
  type: "user_init";
  user: UserInfo;
  gameStatus: "create_character";
}

export interface ChatMessage extends BaseMessage {
  type: "chat";
  content: string;
}

export interface PlayerMessage extends Player {
  status: string;
  isReady: boolean;
  hasPositioned: boolean;
}

export interface GameStateMessage extends BaseMessage {
  type: "game_state";
  turnNumber: number;
  state: GameAction[];
  status: gameStatus;

  players: { [key: string]: PlayerMessage };
}

export type MessageType = "chat" | "game_action" | "game_state" | "user_init";

export type gameStatus =
  | "create_character"
  | "start_game"
  | "end_turn"
  | "move"
  | "position_characters";

export interface GameOverMessage {
  type: "game_over";
  winner: string;
}
