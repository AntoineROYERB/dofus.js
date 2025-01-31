export interface Message {
    type: 'system' | 'chat' | 'game';
    sender: string;
    content: string;
}

interface GameMessage {
    type: 'game_action' | 'game_state_update';
    payload: GameAction | GameState;
}