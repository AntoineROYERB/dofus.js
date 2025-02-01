// src/types/websocket.ts
export interface Position {
    x: number;
    y: number;
}

export interface Player {
    id: string;
    position: Position;
    isCurrentTurn: boolean;
}

export interface GameState {
    players: Player[];
    currentTurn: string | null;
    status: 'waiting' | 'playing' | 'finished';
}

export type Message = 
    | { type: 'chat'; sender: string; content: string; }
    | { type: 'game_action'; action: string; playerId: string; position?: Position; }
    | { type: 'game_state'; state: GameState; };