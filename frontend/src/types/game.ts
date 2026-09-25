import { Effect, SpellState } from "./message";

export type Position = {
  x: number;
  y: number;
};

export type Character = {
  name: string;
  color: string;
  symbol: string;
  /** The class id this character was built from; empty on old recordings. */
  class?: string;
  position?: Position;
  actionPoints: number;
  movementPoints: number;
  // What actionPoints/movementPoints refill to at the start of this
  // character's own next turn, once its active ap/mp effects have had their
  // say. What a hovering opponent should be shown instead of the leftover
  // 0 a fighter sits on between spending its last point and its next turn.
  maxActionPoints: number;
  maxMovementPoints: number;
  isCurrentTurn: boolean;
  initialPositions?: Position[];
  health: number;
  maxHealth: number;
  isAlive: boolean;
  /** Status effects currently riding on this character. */
  effects: Effect[] | null;
  /**
   * Hidden from this viewer — deep in tall grass, too far to see — so its
   * position has been withheld.
   */
  concealed?: boolean;
};

export interface Player {
  userId: string;
  userName: string;
  character: Character;
  isCurrentTurn: boolean;
  hasPositioned: boolean;
  /** False while a player is away; their character stays on the board. */
  connected: boolean;
  /** An opponent the server plays itself. */
  isBot: boolean;
  /**
   * A bot that will not fight back: it takes hits, never moves, never casts.
   * The tutorial opens against one, and wakes it when the tour ends.
   */
  isDummy?: boolean;
  /** Per-spell availability, keyed like the catalogue. */
  spells: { [spellId: string]: SpellState } | null;
  /** This player's spell ids in bar order, which number keys follow. */
  spellBar?: string[] | null;
}

/**
 * Everything a player chooses about their character. Stats are assigned by the
 * server, which is why they are absent here.
 */
export type CharacterAppearance = {
  name: string;
  color: string;
  symbol: string;
  /** A class id. Left out, the server deals the first class. */
  class?: string;
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

export interface CharacterPositionedAction extends ActionEnvelope {
  type: "character_positioned";
  position: Position;
}

export interface CreateRoomAction extends ActionEnvelope {
  type: "create_room";
  name: string;
  /** Open the room with a server-played opponent already in it. */
  withBot?: boolean;
  /** Which class's opponent the computer plays. */
  botClass?: string;
  /** How it behaves: "fight", the default, or "dummy", which stands still. */
  botMode?: "fight" | "dummy";
  /** The island to fight on, which decides the ground. Empty is a plain arena. */
  island?: string;
}

export interface WakeOpponentAction extends ActionEnvelope {
  type: "wake_opponent";
}

export interface JoinRoomAction extends ActionEnvelope {
  type: "join_room";
  roomId: string;
}

export interface LeaveRoomAction extends ActionEnvelope {
  type: "leave_room";
}

export interface PlayAgainAction extends ActionEnvelope {
  type: "play_again";
}

export type GameAction =
  | CreateRoomAction
  | JoinRoomAction
  | LeaveRoomAction
  | PlayAgainAction
  | CastSpellAction
  | CreateCharacterAction
  | EndTurnAction
  | MoveAction
  | WakeOpponentAction
  | CharacterPositionedAction;

export const GAME_STATUS = {
  CREATING_PLAYER: "creating_player",
  POSITION_CHARACTERS: "position_characters",
  PLAYING: "playing",
  GAME_OVER: "game_over",
} as const;

export type GameStatus = (typeof GAME_STATUS)[keyof typeof GAME_STATUS];
