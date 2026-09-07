import {
  MatchPage,
  MatchRecording,
  MatchSnapshots,
  MatchSummary,
} from "../types/match";
import { SessionInfo } from "../types/auth";
import { getResumeToken } from "./sessionToken";

/**
 * Where the game server's REST API lives. Mirrors socketUrl() in
 * WebSocketProvider.tsx: the same VITE_WS_URL, the same "same origin unless
 * told otherwise" default, just http(s) instead of ws(s) and no /ws suffix.
 */
const apiBaseUrl = (): string => {
  const raw = import.meta.env.VITE_WS_URL?.trim();
  if (raw) {
    let url = raw.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    return url.replace(/\/+$/, "").replace(/\/ws$/, "");
  }

  if (import.meta.env.DEV) {
    // Same caveat as the WebSocket dev URL: "localhost" from a phone on the
    // same network would resolve back to the phone, not this machine.
    return `http://${window.location.hostname}:8080`;
  }
  return window.location.origin;
};

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`);
  if (!res.ok) {
    throw new Error(`${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const fetchMatches = (cursor?: string): Promise<MatchPage> => {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return getJSON<MatchPage>(`/api/matches${query}`);
};

export const fetchMatch = (id: string): Promise<MatchSummary> =>
  getJSON<MatchSummary>(`/api/matches/${encodeURIComponent(id)}`);

export const fetchMatchSnapshots = (id: string): Promise<MatchSnapshots> =>
  getJSON<MatchSnapshots>(`/api/matches/${encodeURIComponent(id)}/snapshots`);

export const fetchMatchRecording = (id: string): Promise<MatchRecording> =>
  getJSON<MatchRecording>(`/api/matches/${encodeURIComponent(id)}/recording`);

// --- Google sign-in ---------------------------------------------------
//
// These calls carry the session cookie set by /auth/google/callback, unlike
// everything above: match history stays public and cookie-free, only the
// account-linked endpoints need credentials.

async function authFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new Error(`${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Where "Sign in with Google" navigates to. Passing the browser's existing
 * resume token lets the server link the account to the match history this
 * browser already has, rather than starting a second identity.
 */
export const googleLoginUrl = (): string =>
  `${apiBaseUrl()}/auth/google/login?token=${encodeURIComponent(getResumeToken())}`;

/** null means this browser isn't signed in. */
export const fetchSession = (): Promise<SessionInfo | null> => authFetch<SessionInfo>("/auth/session");

export const logout = (): Promise<void> =>
  authFetch<void>("/auth/logout", { method: "POST" }).then(() => undefined);

export const fetchMyMatches = (cursor?: string): Promise<MatchPage> => {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authFetch<MatchPage>(`/auth/matches${query}`).then((page) => page ?? { matches: [], nextCursor: "" });
};
