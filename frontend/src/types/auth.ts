/** Who, if anyone, this browser is signed in as (GET /auth/session). */
export type SessionInfo = {
  id: number;
  email: string;
  displayName: string;
};
