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
  areaOfEffect: "none" | "circle" | "cross" | "line" | "wall";
  element: string;
  description: string;
  needsLineOfSight: boolean;
  maxCastsPerTurn: number;
  cooldown: number;
  criticalChance: number;
  criticalDamage: number;
  /** Status effect left behind on top of the damage, when the spell has one. */
  effect: SpellEffect | null;
  /** The one word the bar shows for what this spell is for. */
  role: string;
  /** Cast once a fight, and not before turn 2. */
  ultimate: boolean;
  /** Any cell in range, the caster's own, or a cell with nothing on it. */
  targeting: "any" | "self" | "empty";
  /** Cells everyone hit is thrown back; negative drags them in. */
  push: number;
  /** Terrain left on the covered cells for the rest of the fight. */
  terrain: SpreadTerrain | "";
  /** Weather the spell leaves over the covered cells for a few turns. */
  zone: { kind: ZoneKind; duration: number } | null;
  /** Movement points the caster gains on the spot. */
  grantMP: number;
  special: SpellSpecial | "";
  /** May be cast from the caster's relay. */
  relayed: boolean;
  /** Double damage on a target standing in water. */
  conducts: boolean;
};

export type SpellSpecial =
  | "detonate"
  | "leap"
  | "relay"
  | "pillar"
  | "crater"
  | "quake";

/** Terrain a spell spreads over its area. */
export type SpreadTerrain = "fire" | "smoke" | "water" | "ice" | "trap";

/** Everything that can be lying on a cell. */
export type TerrainKind =
  | SpreadTerrain
  | "relay"
  | "crater"
  | "fissure"
  /** A raised pillar: the obstacle itself is in `obstacles`. */
  | "pillar";

export type TerrainCell = {
  position: Position;
  kind: TerrainKind;
  /** Who made it: water heals only its owner, traps never catch theirs. */
  owner: string;
};

export type ZoneKind = "storm" | "maelstrom";

export type Zone = {
  kind: ZoneKind;
  owner: string;
  center: Position;
  cells: Position[];
  /** Counts down at the start of each of its owner's turns. */
  turnsLeft: number;
};

export type SpellEffect = {
  kind: EffectKind;
  value: number;
  duration: number;
  /** Applies to the caster instead of what it hit. */
  onSelf: boolean;
};

export type EffectKind =
  | "poison"
  | "regen"
  | "ap"
  | "mp"
  | "shield"
  | "burn"
  | "root";

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
  /** An ultimate already cast this fight. */
  spent?: boolean;
};

/** One line of the combat log. */
export type LogEntry = {
  /**
   * A per-game counter that never repeats. The log is a bounded tail resent
   * whole with every state, so this is how the spell effects tell an entry
   * they have already played from one that just happened.
   */
  seq: number;
  turn: number;
  actor: string;
  kind: "cast" | "death" | "turn" | "end" | "effect";
  text: string;
  damage?: number;
  crit?: boolean;
  /** The AP/MP a cast's own effect left behind — negative on a debuff. */
  apChange?: number;
  mpChange?: number;
  shieldChange?: number;
  /** What a cast was, for drawing it. Absent on every other kind of entry. */
  spellId?: number;
  origin?: Position;
  target?: Position;
  /** The relay an air spell went out from, when it did. */
  via?: Position;
};

export type SpellBook = { [spellId: string]: Spell };

/**
 * A playable class, as loaded by the server from config/classes.json. Like
 * spells, the client keeps no copy: it fetches them from /api/classes. The
 * palette is hex for the same reason a spell's colour is.
 */
export type CharacterClass = {
  id: string;
  name: string;
  element: string;
  symbol: string;
  palette: { primary: string; secondary: string };
  lore: string;
  /** The class's standing rule, one sentence. */
  passive: string;
  /** Extra damage, in percent, against a target standing next to it. */
  meleeBonus?: number;
  /** How many cells shorter every push against the class is. */
  pushResist?: number;
  health: number;
  actionPoints: number;
  movementPoints: number;
  /** Spell ids, in bar order. */
  spells: string[];
  /** Who stands for this class in solo play: a challenge line, a defeat line. */
  opponent: { name: string; lines: string[] };
  /** The class whose opponent has to be beaten first; empty when open. */
  unlockedBy: string;
};

/**
 * One kind of special cell, from the terrain library in config/islands.json.
 * Its rule lives on the server; this is what a player is told about it.
 */
export type Terrain = {
  id: string;
  name: string;
  icon: string;
  /** The one sentence a player reads on tapping a cell of it. */
  rule: string;
  /** Drawn in the open world as a still pool: lagoon, ice, acid, lava. */
  liquid: boolean;
};

/** One sheet of the bestiary, by the name of its sprite. */
export type Monster = { id: string; name: string; rank: "monster" | "boss" | "legend" };

export type Armour = { id: string; name: string; element: string };

/**
 * The colours an island's ground is painted in. The palette's id is also the
 * look of its scenery: an island painted "ice" gets frosted ground.
 */
export type IslandPalette = {
  ground: string[];
  path: string;
  stone: string[];
  wood: string[];
  leaves: string[];
  pine: string[];
  grass: string;
  flowers: string[];
  shadow: string;
  earth: string[];
  outline: string;
  liquid: string[];
  /** The island's own glow: magma, runes, crystals. */
  accent: string;
  /** The liquid gives its own light, and keeps its colour at night. */
  glow: boolean;
};

/** One chapter of the campaign: a recipe over the elements and the terrains. */
export type Island = {
  id: string;
  name: string;
  element: string;
  /** Terrain ids, one or two. */
  terrains: string[];
  palette: string;
  /** Who lives there: bestiary sheets. */
  lineage: string[];
  /** Who rules it; empty for an island with nobody to beat. */
  boss: string;
  /** What finishing it unlocks. */
  armour: string;
  fights: number;
};

export type ContentResponse = {
  classes: CharacterClass[];
  spells: SpellBook;
  terrains: Terrain[];
  bestiary: Monster[];
  armours: Armour[];
  palettes: { [id: string]: IslandPalette };
  /** In campaign order: the first is the Prairie in the middle of the world. */
  islands: Island[];
};

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
  /** What spells have left on the board, for the rest of the fight. */
  terrain?: TerrainCell[] | null;
  /** Areas ultimates keep acting on for a few turns. */
  zones?: Zone[] | null;
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
