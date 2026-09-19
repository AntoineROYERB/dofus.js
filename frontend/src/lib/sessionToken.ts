/**
 * The resume token that lets a reload or a dropped connection come back as
 * the same anonymous player (see WebSocketProvider.tsx). Google sign-in
 * links to this same token rather than minting a second identity, so the
 * login button and the WebSocket connection need to agree on where it
 * lives — this is that one place.
 */
export const TOKEN_KEY = "dofusjs.sessionToken";

export const getResumeToken = (): string => localStorage.getItem(TOKEN_KEY) ?? "";
