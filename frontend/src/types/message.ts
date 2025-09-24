import { Player } from "./game";

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

export interface GameState {
  type: "game_state";
  players: { [key: string]: Player };
  turnNumber: number;
  status: string;
  spells: { [key: string]: any };
}

export interface GameStateMessage {
  type: "game_state";
  state: GameState;
}

export type MessageType = "chat" | "game_action" | "game_state" | "user_init";

export interface GameOverMessage {
  type: "game_over";
  winner: string;
}

export type Message =
  | UserInitMessage
  | ChatMessage
  | GameStateMessage
  | GameOverMessage;
