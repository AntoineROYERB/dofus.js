import {
  MatchPage,
  MatchRecording,
  MatchSnapshots,
  MatchSummary,
} from "../types/match";

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
