export type Position = {
    x: number;
    y: number;
}

export type Character  = {
  name: string;
  color: string;
  symbol: string;
  position: Position;
  actionPoints: number;
  movementPoints: number;
  isCurrentTurn: boolean;
}
export interface Player { 
  messageId: string;
  timestamp: number;
  userId: string;
  userName: string;
  character: Character;
  isCurrentTurn: boolean;
}

export interface CreateCharacterAction extends Player {
  type: 'create_character';
  character: Character;
}

export interface StartGameAction extends Player {
  type: 'start_game';
  Players: { [key: string]: Player };
}

export interface EndTurnAction extends Player {
  type: 'end_turn';
}

export interface MoveAction extends Player {
  type: 'move';
  position: Position;
}
export interface ReadyToStartAction extends Player {
  type: 'ready_to_start';
}

export type GameAction = StartGameAction | EndTurnAction | MoveAction | CreateCharacterAction | ReadyToStartAction;

export type GameStatus = 'creating_player' | 'waiting' | 'in_progress' | 'game_over';

export type GameStatusRecord = (GameAction & {
  messageId: string;
  timestamp: number;
  gameStatus: GameStatus;
})[];