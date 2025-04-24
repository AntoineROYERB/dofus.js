export interface Position {
  x: number;
  y: number;
}

export interface Character {
  position: Position;
  color: string;
  symbol: string;
  movementPoints: number;
}

export interface Player {
  id: string;
  name: string;
  character: Character;
  isCurrentTurn: boolean;
}

export interface Players {
  [userId: string]: Player;
}
