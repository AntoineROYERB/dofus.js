export type Position = {
    x: number;
    y: number;
}

export type Character = {
  name: string;
  color: string;
  symbol: string;
}


export type Player = {
  id: string;
  position: Position | null;
  character: Character;
  isCurrentTurn: boolean;
  actionPoints: number;
  movementPoints: number;
}

export type GameState = {
  players: { [key: string]: Player };
  currentTurn: string;
  turnNumber: number;
  status: GameStatus;
}

export type GameAction = { }
export type GameStatus = 'waiting' | 'playing' | 'finished';