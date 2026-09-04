import React, { useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import SpriteAnimation from "../components/Game/SpriteAnimation";
import { CharacterCreationForm } from "../components/Game/CharacterCreationForm";
import { CharacterStand, STAND } from "../components/Game/CharacterStand";
import { AboutDialog } from "../components/AboutDialog";
import { saveCharacter } from "../utils/characterStorage";
import { PLAYER_COLORS } from "../constants";

const idle = {
  spriteSheet: "/animation/Idle.png",
  framesPerDirection: 23,
  frameWidth: 256,
  frameHeight: 256,
  directionMap: { NW: 0, W: 1, SW: 2, S: 3, SE: 4, E: 5, NE: 6, N: 7 },
} as const;

/**
 * One column, in the same order at every size: what the game is called, the
 * character you are about to name, the two things to choose, and the way in.
 * Everything else — the pitch, the stack, the numbers — is behind "What is
 * this?", because none of it is needed to start playing.
 */
const LandingPage: React.FC = () => {
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0]);
  const [characterName, setCharacterName] = useState("");
  const [isNameValid, setIsNameValid] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const navigate = useNavigate();

  const handleJoinMatch = () => {
    if (!isNameValid) return;
    // Stored rather than passed through router state so it survives a reload.
    saveCharacter(characterName, selectedColor);
    navigate("/lobby");
  };

  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = () => {
      const tile = (STAND.tileWidth * stage.offsetWidth) / STAND.viewBox.width;
      if (tile > 0) setScale((tile / 256) * 1.7);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <header className="flex flex-none items-baseline justify-between gap-4 border-b-2 border-ink px-5 pb-1.5 pt-4 sm:px-6 sm:pt-5">
        <span className="truncate font-mono text-[9.5px] uppercase tracking-label text-muted">
          Turn-based arena<span className="hidden sm:inline"> · in the browser</span>
        </span>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="flex-none font-mono text-[9.5px] uppercase tracking-label text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
        >
          What is this?
        </button>
      </header>

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

          <div
            ref={stageRef}
            className="relative w-full max-w-[270px] sm:max-w-[330px] short:max-w-[230px]"
          >
            <CharacterStand className="block w-full" />
            <div
              className="pointer-events-none absolute"
              style={{
                // Feet on the middle tile, by the board's own arithmetic.
                left: `${STAND.origin.x * 100}%`,
                top: `${STAND.origin.y * 100}%`,
                transform: `translate(-50%, -${STAND.feet * 100}%)`,
              }}
            >
              <SpriteAnimation
                {...idle}
                direction="S"
                scale={scale}
                color={selectedColor}
              />
            </div>
          </div>
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
          <button
            type="button"
            onClick={handleJoinMatch}
            disabled={!isNameValid}
            className="mt-5 w-full bg-vermilion px-2 py-4 font-display text-[17px] font-bold text-white transition-colors hover:bg-[#b93a25] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Find a game
          </button>
        </div>
      </main>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
};

export default LandingPage;
