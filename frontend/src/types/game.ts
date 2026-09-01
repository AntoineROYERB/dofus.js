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
  health: number;
  maxHealth: number;
  isAlive: boolean;
};

export interface Player {
  userId: string;
  userName: string;
  character: Character;
  isCurrentTurn: boolean;
  isReady: boolean;
  hasPositioned: boolean;
}

/**
 * Everything a player chooses about their character. Stats are assigned by the
 * server, which is why they are absent here.
 */
export type CharacterAppearance = {
  name: string;
  color: string;
  symbol: string;
};

/**
 * Actions carry no user id: the server derives the sender's identity from the
 * WebSocket connection and ignores anything the payload might claim.
 */
type ActionEnvelope = {
  messageId: string;
  timestamp: number;
};

export interface CastSpellAction extends ActionEnvelope {
  type: "cast_spell";
  spellId: number;
  targetPosition: Position;
}

export interface CreateCharacterAction extends ActionEnvelope {
  type: "create_character";
  character: CharacterAppearance;
}

export interface EndTurnAction extends ActionEnvelope {
  type: "end_turn";
}

export interface MoveAction extends ActionEnvelope {
  type: "move";
  position: Position;
}

export interface ReadyToStartAction extends ActionEnvelope {
  type: "ready_to_start";
}

export interface CharacterPositionedAction extends ActionEnvelope {
  type: "character_positioned";
  position: Position;
}

export type GameAction =
  | CastSpellAction
  | CreateCharacterAction
  | EndTurnAction
  | MoveAction
  | ReadyToStartAction
  | CharacterPositionedAction;

export const GAME_STATUS = {
  CREATING_PLAYER: "creating_player",
  POSITION_CHARACTERS: "position_characters",
  PLAYING: "playing",
  GAME_OVER: "game_over",
} as const;

export type GameStatus = (typeof GAME_STATUS)[keyof typeof GAME_STATUS];
