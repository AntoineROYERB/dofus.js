import { Player, Position } from "./game";

export type UserInfo = {
  id: string;
  name: string;
};

export interface UserInitMessage {
  type: "user_init";
  messageId: string;
  timestamp: number;
  user: UserInfo;
  /** Resume token: present it on reconnect to come back as the same player. */
  token: string;
  resumed: boolean;
}

export type RoomSummary = {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  status: string;
};

export interface LobbyStateMessage {
  type: "lobby_state";
  rooms: RoomSummary[];
}

/** Which room this client is in. An empty roomId means back in the lobby. */
export interface RoomJoinedMessage {
  type: "room_joined";
  roomId: string;
  roomName: string;
}

export interface ChatMessage {
  type: "chat";
  messageId: string;
  timestamp: number;
  userId: string;
  userName: string;
  content: string;
}

/**
 * A spell, as broadcast by the Go server. This is the only spell catalogue:
 * the client used to ship its own copy in data/spells.ts, and the two had
 * already drifted apart.
 *
 * `color` is a hex value rather than a CSS class. Class names arriving at
 * runtime would be stripped by Tailwind's build, which is how the old
 * bg-brown-100 ended up rendering as nothing.
 */
export type Spell = {
  id: number;
  name: string;
  color: string;
  icon: string;
  APCost: number;
  range: number;
  damage: number;
  areaOfEffect: "none" | "circle" | "cross" | "line";
  element: string;
  description: string;
  needsLineOfSight: boolean;
  maxCastsPerTurn: number;
  cooldown: number;
  criticalChance: number;
  criticalDamage: number;
  /** Status effect left behind on top of the damage, when the spell has one. */
  effect: SpellEffect | null;
};

export type SpellEffect = {
  kind: EffectKind;
  value: number;
  duration: number;
  /** Applies to the caster instead of what it hit. */
  onSelf: boolean;
};

export type EffectKind = "poison" | "regen" | "ap" | "mp" | "shield";

/** A status effect riding on a character. */
export type Effect = {
  kind: EffectKind;
  value: number;
  turnsLeft: number;
  source: string;
};

/** One spell's availability for one player, as the server tracks it. */
export type SpellState = {
  castsThisTurn: number;
  cooldownLeft: number;
};

/** One line of the combat log. */
export type LogEntry = {
  turn: number;
  actor: string;
  kind: "cast" | "death" | "turn" | "end" | "effect";
  text: string;
  damage?: number;
  crit?: boolean;
};

export type SpellBook = { [spellId: string]: Spell };

export interface GameState {
  type: "game_state";
  players: { [userId: string]: Player };
  turnNumber: number;
  status: string;
  spells: SpellBook | null;
  turnOrder: string[];
  /** Unix time in ms when the current turn is passed on; 0 outside play. */
  turnEndsAt: number;
  /** Recent combat history, oldest first. */
  log: LogEntry[] | null;
  /** Cells nobody can stand on and nothing can be seen through. */
  obstacles: Position[] | null;
}

export interface GameStateMessage {
  type: "game_state";
  state: GameState;
}

export interface GameOverMessage {
  type: "game_over";
  winner: string;
}

/**
 * Sent to the one client whose action the server refused. Without it a
 * rejected action would vanish into the server log and the player would wait
 * for a state update that is never coming.
 */
export interface ActionRejectedMessage {
  type: "action_rejected";
  messageId: string;
  action: string;
  reason: string;
}

export type Message =
  | UserInitMessage
  | ChatMessage
  | GameStateMessage
  | GameOverMessage
  | ActionRejectedMessage
  | LobbyStateMessage
  | RoomJoinedMessage;
