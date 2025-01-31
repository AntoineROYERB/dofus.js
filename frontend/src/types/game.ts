// frontend/src/types/game.ts
interface Position {
    x: number;
    y: number;
}

interface Player {
    id: string;
    position: Position;
    health: number;
    actionPoints: number;
    movementPoints: number;
    isCurrentTurn: boolean;
}

interface GameState {
    players: Map<string, Player>;
    currentTurn: string;  // Player ID
    turnOrder: string[];  // Array of Player IDs
    turnNumber: number;
    gameStatus: 'waiting' | 'playing' | 'finished';
}

// Game action types
type GameAction = 
    | { type: 'MOVE', playerId: string, position: Position }
    | { type: 'ATTACK', fromId: string, targetId: string }
    | { type: 'END_TURN', playerId: string }