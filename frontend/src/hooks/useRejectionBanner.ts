import { useEffect, useRef, useState } from "react";

type Rejection = { reason: string; at: number } | null;

const VISIBLE_MS = 4000;

/**
 * The reason the server most recently refused an action — but only the ones
 * that happen while this page is open.
 *
 * `rejection` lives in WebSocketProvider, above the router, so it survives a
 * navigation. A page that showed it on every mount would flash whatever the
 * *previous* page's last rejection was the instant it came up — leaving the
 * lobby, say, announcing an out-of-AP spell cast from the match you just left.
 * `seenAt` is seeded with whatever was already there when this page mounted,
 * so only a rejection that arrives after that counts as news.
 */
export const useRejectionBanner = (rejection: Rejection): string | null => {
  const [message, setMessage] = useState<string | null>(null);
  const seenAt = useRef(rejection?.at ?? 0);

  useEffect(() => {
    if (!rejection || rejection.at <= seenAt.current) return;
    seenAt.current = rejection.at;
    setMessage(rejection.reason);
    const timer = setTimeout(() => setMessage(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [rejection]);

  return message;
};
