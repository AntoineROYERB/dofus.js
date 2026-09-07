import { GameState } from "./message";

/** Who was in a finished match, independent of the room's current members. */
export type MatchPlayer = {
  userId: string;
  userName: string;
  isBot: boolean;
};

/** A finished match's result, as listed and shown on its own page. */
export type MatchSummary = {
  id: string;
  roomId: string;
  roomName: string;
  startedAt: string;
  endedAt: string;
  winner: string;
  turns: number;
  durationMs: number;
  players: MatchPlayer[];
};

/** One page of GET /api/matches. */
export type MatchPage = {
  matches: MatchSummary[];
  nextCursor: string;
};

/**
 * The board state after each accepted command, in order — what a replay
 * view steps through. The server computes these by replaying the match
 * through the same rules that played it the first time, rather than the
 * client reimplementing them.
 */
export type MatchSnapshots = GameState[];

/** One accepted command, as the server logged it. */
export type MatchCommand = {
  seq: number;
  /** Milliseconds since the match started — used to pace replay playback. */
  at: number;
  userId: string;
  kind: string;
};

/** A whole match written down: what Replay (and ReplaySnapshots) consume. */
export type MatchRecording = {
  version: number;
  seed: number;
  startedAt: number;
  turnDurationMs: number;
  rules: string;
  commands: MatchCommand[];
};
