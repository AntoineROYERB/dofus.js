export type Position = {
  x: number;
  y: number;
};

export type Character = {
  name: string;
  color: string;
  symbol: string;
  position?: Position;
  actionPoints: number;
  movementPoints: number;
  isCurrentTurn: boolean;
  initialPositions?: Position[];
};
export interface Player {
  messageId: string;
  timestamp: number;
  userId: string;
  userName: string;
  character: Character;
  isCurrentTurn: boolean;
}

export interface CastSpellAction {
  type: "spell_cast";
  userId: string;
  messageId: string;
  timestamp: number;
  spellId: number;
  TargetPosition: Position;
}
export interface CreateCharacterAction extends Player {
  type: "create_character";
  character: Character;
}

export interface StartGameAction extends Player {
  type: "start_game";
  Players: { [key: string]: Player };
}

export interface EndTurnAction extends Player {
  type: "end_turn";
}

export interface MoveAction {
  type: "move";
  position: Position;
  userId: string;
}
export interface ReadyToStartAction {
  type: "ready_to_start";
  userId: string;
  timestamp: number;
  messageId: string;
}

export interface CharacterPositionedAction {
  type: "character_positioned";
  userId: string;
  selectedPosition: Position | null;
  messageId: string;
  timestamp: number;
}

export type GameAction =
  | StartGameAction
  | EndTurnAction
  | MoveAction
  | CreateCharacterAction
  | ReadyToStartAction
  | CastSpellAction
  | CharacterPositionedAction;

// First, define the game status constants
export const GAME_STATUS = {
  CREATING_PLAYER: "creating_player",
  WAITING_FOR_PLAYERS: "waiting_for_players",
  PLAYING: "playing",
  IN_PROGRESS: "in_progress",
  GAME_OVER: "game_over",
} as const;

export type GameStatus = (typeof GAME_STATUS)[keyof typeof GAME_STATUS];

export type GameStatusRecord = (GameAction & {
  messageId: string;
  timestamp: number;
  gameStatus: GameStatus;
})[];
