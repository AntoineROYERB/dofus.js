import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CharacterCreationForm } from "../components/Game/CharacterCreationForm";
import { CharacterShowcase } from "../components/Game/CharacterShowcase";
import { AboutDialog } from "../components/AboutDialog";
import { HowToPlayDialog } from "../components/HowToPlayDialog";
import { NAME_RULE, readCharacter, saveCharacter } from "../utils/characterStorage";
import { armTutorialMatch } from "../utils/tutorialStorage";
import { ClassPicker } from "../components/Game/ClassPicker";
import { useContent } from "../hooks/useContent";
import { PLAYER_COLORS } from "../constants";
import { fetchSession, googleLoginUrl } from "../lib/api";
import { SessionInfo } from "../types/auth";
import { isNativeApp } from "../lib/native";

/**
 * One column, in the same order at every size: what the game is called, the
 * character you are about to name, the three things to choose, and the way in.
 * Everything else — the pitch, the stack, the numbers — is behind "What is
 * this?", because none of it is needed to start playing.
 */
const LandingPage: React.FC = () => {
  // Coming back to change a character starts from the one already saved.
  const [saved] = useState(readCharacter);
  const [selectedColor, setSelectedColor] = useState(
    saved?.color ?? PLAYER_COLORS[0]
  );
  const [characterName, setCharacterName] = useState(saved?.name ?? "");
  const [isNameValid, setIsNameValid] = useState(!!saved);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const navigate = useNavigate();

  // Signing in is entirely optional: this only decides which link to show
  // in the header, and a failed or slow check never blocks "Find a game".
  useEffect(() => {
    fetchSession()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  // Classes come from the server. Until they arrive — or if they never do —
  // the way in stays open, and the server deals its default class.
  const { content } = useContent();
  const [selectedClass, setSelectedClass] = useState<string | null>(
    () => readCharacter()?.class ?? null
  );
  const classes = content?.classes ?? [];
  const chosenClass =
    classes.find((c) => c.id === selectedClass)?.id ?? classes[0]?.id;

  const handleJoinMatch = () => {
    if (!isNameValid) return;
    // Stored rather than passed through router state so it survives a reload.
    saveCharacter(characterName, selectedColor, chosenClass);
    navigate("/lobby");
  };

  // Learning the game should not require naming a fighter first: an unnamed
  // visitor gets one, and can rename it afterwards from the home screen.
  const handlePlayTutorial = () => {
    const typed = characterName.trim();
    saveCharacter(
      NAME_RULE.test(typed) ? typed : "Rookie",
      selectedColor,
      chosenClass
    );
    armTutorialMatch();
    setHowToPlayOpen(false);
    navigate("/lobby");
  };

  const infoLinks = (
    <>
      <button
        type="button"
        onClick={() => setHowToPlayOpen(true)}
        className="font-mono text-[9.5px] uppercase tracking-label text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
      >
        How to play
      </button>
      <button
        type="button"
        onClick={() => setAboutOpen(true)}
        className="font-mono text-[9.5px] uppercase tracking-label text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
      >
        What is this?
      </button>
      {session ? (
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="font-mono text-[9.5px] uppercase tracking-label text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
        >
          {session.displayName}
        </button>
      ) : (
        <a
          href={googleLoginUrl()}
          className="font-mono text-[9.5px] uppercase tracking-label text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
        >
          Sign in with Google
        </a>
      )}
    </>
  );

  // The app opens on its home screen, the way a phone game does: the form is
  // for making a fighter, and one already exists — the home screen renames it
  // and changes its class in place.
  if (isNativeApp && saved) {
    return <Navigate to="/lobby" replace />;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-ink">
      {/*
        The strip says where you are — a game, in a browser. Inside the iOS
        app neither needs saying, and on a phone held sideways its row is
        what pushed the button off the screen; the two links it carries move
        under the title instead.
      */}
      {!isNativeApp && (
        <header className="flex flex-none items-baseline justify-between gap-4 border-b-2 border-ink px-5 pb-1.5 pt-4 sm:px-6 sm:pt-5">
          <span className="truncate font-mono text-[9.5px] uppercase tracking-label text-muted">
            Turn-based arena<span className="hidden sm:inline"> · in the browser</span>
          </span>
          <div className="flex flex-none items-baseline gap-4">{infoLinks}</div>
        </header>
      )}

      {/*
        One column at every size — except on a screen too short for it, a phone
        held sideways, where the same pieces sit down beside each other rather
        than pushing the button off the bottom.
      */}
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-6 sm:gap-5 sm:px-6 short:flex-row short:items-center short:gap-10 short:py-3">
        <div className="flex flex-col items-center gap-4 short:gap-2">
          <h1 className="font-display text-[clamp(3rem,13vw,4rem)] font-bold leading-[0.9] tracking-tight short:text-[2.6rem]">
            Dofus.js
          </h1>

          <CharacterShowcase
            color={selectedColor}
            className="w-full max-w-[270px] sm:max-w-[330px] short:max-w-[230px]"
          />
          {isNativeApp && (
            <div className="flex items-baseline gap-4">{infoLinks}</div>
          )}
        </div>

        <div className="w-full max-w-[380px]">
          <CharacterCreationForm
            characterName={characterName}
            setCharacterName={setCharacterName}
            selectedColor={selectedColor}
            setSelectedColor={setSelectedColor}
            isNameValid={isNameValid}
            setIsNameValid={setIsNameValid}
            onSubmit={handleJoinMatch}
          />
          {content && classes.length > 0 && (
            <ClassPicker
              classes={classes}
              spells={content.spells}
              selected={chosenClass ?? null}
              onSelect={setSelectedClass}
            />
          )}
          <button
            type="button"
            onClick={handleJoinMatch}
            disabled={!isNameValid}
            className="mt-5 w-full bg-vermilion px-2 py-4 short:mt-3 short:py-3 font-display text-[17px] font-bold text-white transition-colors hover:bg-[#b93a25] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Find a game
          </button>
        </div>
      </main>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <HowToPlayDialog
        open={howToPlayOpen}
        onClose={() => setHowToPlayOpen(false)}
        onPlayTutorial={handlePlayTutorial}
      />
    </div>
  );
};

export default LandingPage;
