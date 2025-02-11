import { GameAction, Player } from './game';


export type UserInfo = {
    id: string;
    name: string;
}

export type BaseMessage = {
    messageId: string;
    timestamp: number;
    user: UserInfo;
    type: MessageType;
    gameStatus: gameStatus;
    
}
export interface UserInitMessage extends BaseMessage {
    type: 'user_init';
    gameStatus: 'create_character';
    }
 
export interface ChatMessage extends BaseMessage {
    type: 'chat';
    content: string;
}

export interface PlayerMessage extends Player {
    status: string,
}

export interface GameStateMessage extends BaseMessage {
    type: 'game_state';
    turnNumber: number;
    state: GameAction[];
    players: { [key: string]: PlayerMessage };
}



export type MessageType = 'chat' | 'game_action' | 'game_state' | 'user_init';
export type gameStatus = 'create_character' | 'start_game' | 'end_turn' | 'move';