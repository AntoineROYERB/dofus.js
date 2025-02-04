import { Position, Character, GameState } from './game';

export type BaseMessage = {
    messageId: string;
    timestamp: number;
    userId: string;
    type: MessageType;
    userName: string;
}


export interface UserInitMessage extends BaseMessage {
    type: 'user_init';
    userId: string;
    userName: string;
 }
 
export interface ChatMessage extends BaseMessage {
    type: 'chat';
    content: string;
}

export interface GameActionMessage extends BaseMessage {
    type: 'game_action';
    action: GameActionType;
    playerId: string;
    position?: Position;
    character?: Character;
}

export interface GameStateMessage extends BaseMessage {
    type: 'game_state';
    state: GameState;
}

export type Message = ChatMessage | GameActionMessage | GameStateMessage;

export type MessageType = 'chat' | 'game_action' | 'game_state' | 'user_init';
export type GameActionType = 'create_character' | 'start_game' | 'end_turn' | 'move';