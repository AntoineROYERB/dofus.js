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

/**
 * Spell as serialised by the Go backend (internal/types/games.go).
 * Kept separate from the client-side `Spell` in data/spells.ts: the server
 * sends plain strings where the client narrows to unions.
 */
export type ServerSpell = {
  id: number;
  name: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  APCost: number;
  range: number;
  needsLineOfSight: boolean;
  maxCastsPerTurn: number;
  damage: number;
  areaOfEffect: string;
  type: string;
  description?: string;
  criticalChance?: number;
  criticalDamage?: number;
  castInLineOnly?: boolean;
  castOnEmptyCell?: boolean;
  cooldown?: number;
  isWeapon?: boolean;
};

export interface GameState {
  type: "game_state";
  players: { [key: string]: Player };
  turnNumber: number;
  status: string;
  spells: { [key: string]: ServerSpell } | null;
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
