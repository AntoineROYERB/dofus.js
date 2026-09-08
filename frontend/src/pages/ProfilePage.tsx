import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMyMatches, fetchSession, logout } from "../lib/api";
import { SessionInfo } from "../types/auth";
import MatchList from "../components/MatchList";

/**
 * A signed-in account's profile: who they are and the matches claimed to
 * their account. Anonymous play never routes here — reachable only via the
 * "Sign in with Google" link or its callback redirect.
 */
const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined);

  useEffect(() => {
    fetchSession()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    if (session === null) navigate("/", { replace: true });
  }, [session, navigate]);

  const handleSignOut = async () => {
    await logout().catch(() => undefined);
    navigate("/");
  };

  if (!session) return null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Dofus.js · profile
          </span>
          <button
            type="button"
            onClick={() => navigate("/lobby")}
            className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Back to lobby
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 sm:mt-7">
          <div>
            <h1 className="font-display text-[clamp(2rem,9vw,2.6rem)] font-bold leading-none tracking-tight">
              {session.displayName}
            </h1>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-label text-muted">
              {session.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="border border-ink px-4 py-2 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            Sign out
          </button>
        </div>

        <MatchList
          fetchFn={fetchMyMatches}
          onOpen={(id) => navigate(`/matches/${id}`)}
          emptyMessage="No matches claimed to this account yet — play a game while signed in, or sign in again after playing anonymously."
        />
      </div>
    </div>
  );
};

export default ProfilePage;
