export interface Message {
    type: 'system' | 'chat' | 'game';
    sender: string;
    content: string;
}
