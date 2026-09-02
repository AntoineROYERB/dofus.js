import React, { useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import SpriteAnimation, { Direction } from "../components/Game/SpriteAnimation";
import { CharacterCreationForm } from "../components/Game/CharacterCreationForm";
import { CharacterStand } from "../components/Game/CharacterStand";
import { saveCharacter } from "../utils/characterStorage";

const animationConfig = {
  idle: {
    spriteSheet: "/animation/Idle.png",
    framesPerDirection: 23,
    frameWidth: 256,
    frameHeight: 256,
    directionMap: { NW: 0, W: 1, SW: 2, S: 3, SE: 4, E: 5, NE: 6, N: 7 },
  },
  walk: {
    spriteSheet: "/animation/Walk.png",
    framesPerDirection: 7,
    frameWidth: 256,
    frameHeight: 256,
    directionMap: { NW: 0, W: 1, SW: 2, S: 3, SE: 4, E: 5, NE: 6, N: 7 },
  },
  attack: {
    spriteSheet: "/animation/Attack.png",
    framesPerDirection: 7,
    frameWidth: 384,
    frameHeight: 384,
    directionMap: { N: 0, NW: 1, W: 2, SW: 3, S: 4, SE: 5, E: 6, NE: 7 },
  },
};

const directions: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

type Pose = "idle" | "walk" | "attack";

const poseButton =
  "border px-3 py-1.5 font-mono text-[10px] uppercase tracking-label transition-colors";

/**
 * The same furniture as the arena: a rule at the top, a rail on the right, and
 * one bar at the bottom in three zones. Naming a fighter here should feel like
 * the first move of a match, not like filling in a form on another website.
 */
const LandingPage: React.FC = () => {
  const [selectedColor, setSelectedColor] = useState("#ff0000");
  const [characterName, setCharacterName] = useState("");
  const [isNameValid, setIsNameValid] = useState(false);
  const [pose, setPose] = useState<Pose>("idle");
  const [direction, setDirection] = useState<Direction>("S");
  const navigate = useNavigate();

  const handleJoinMatch = () => {
    if (!isNameValid) return;
    // Stored rather than passed through router state so it survives a reload.
    saveCharacter(characterName, selectedColor);
    navigate("/lobby");
  };

  const rotate = (towards: "left" | "right") => {
    const at = directions.indexOf(direction);
    const next =
      towards === "left"
        ? (at - 1 + directions.length) % directions.length
        : (at + 1) % directions.length;
    setDirection(directions[next]);
  };

  const animation = animationConfig[pose];

  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const update = () => {
      if (!stageRef.current) return;
      // The stand is drawn 340 units wide; the sprite is sized against it so
      // the character keeps its feet on the tiles at any window size.
      const width = Math.min(stageRef.current.offsetWidth, 460);
      setScale((width / 340) * 0.62);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-paper text-ink">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col px-6 pt-5">
          <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
              Turn-based arena · in the browser
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-label text-ink">
              New fighter
            </span>
          </div>

          <div className="flex min-h-0 flex-1 gap-10 pt-7">
            <div className="w-[290px] flex-none">
              <h1 className="font-display text-[58px] font-bold leading-[0.9] tracking-tight">
                Dofus.js
              </h1>
              <p className="mt-5 max-w-[34ch] text-[13.5px] leading-relaxed text-graphite">
                A reimagining of the combat system from Dofus: an isometric
                board, action and movement points, line of sight, cover, and a
                catalogue of spells that each answer a different question.
              </p>
              <p className="mt-3 max-w-[34ch] text-[13.5px] leading-relaxed text-graphite">
                Two players, or one and the computer. Nothing to install.
              </p>
              <dl className="mt-7 border-t border-ink pt-2.5">
                {[
                  ["Board", "15 × 15 isometric, 113 cells"],
                  ["Spells", "8, across four elements"],
                  ["Turn", "45 seconds"],
                ].map(([term, value]) => (
                  <div
                    key={term}
                    className="flex items-baseline justify-between gap-4 border-b border-hairline py-1.5"
                  >
                    <dt className="font-mono text-[9.5px] uppercase tracking-label text-muted">
                      {term}
                    </dt>
                    <dd className="font-mono text-[11px] tabular-nums text-graphite">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div
              ref={stageRef}
              className="relative flex min-h-0 flex-1 items-center justify-center pb-8"
            >
              <CharacterStand className="max-h-full w-full max-w-[460px]" />
              <div
                className="pointer-events-none absolute"
                style={{
                  // Sitting the sprite on the middle tile rather than in the
                  // middle of the box, which is a good deal lower.
                  transform: `translateY(${-animation.frameHeight * scale * 0.18}px)`,
                }}
              >
                <SpriteAnimation
                  spriteSheet={animation.spriteSheet}
                  framesPerDirection={animation.framesPerDirection}
                  frameWidth={animation.frameWidth}
                  frameHeight={animation.frameHeight}
                  direction={direction}
                  directionMap={animation.directionMap}
                  scale={scale}
                />
              </div>
              <p className="absolute bottom-0 font-display text-[15px] font-bold">
                {characterName || (
                  <span className="font-sans text-[12.5px] font-normal text-muted">
                    Name your fighter below
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <aside className="flex w-[300px] flex-none flex-col px-5 pt-5">
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
            <span className="font-display text-[15px] font-bold">
              The project
            </span>
            <a
              href="https://github.com/AntoineROYERB/dofus.js"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-none font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
            >
              GitHub
            </a>
          </div>

          <div className="mb-1.5 mt-4 font-mono text-[9.5px] uppercase tracking-label text-muted">
            What works today
          </div>
          <ul className="text-[12.5px] leading-snug text-graphite">
            {[
              "Turn-based combat over WebSocket",
              "Movement with A* around cover",
              "Line of sight, cooldowns, critical hits",
              "Status effects: poison, shield, regen",
              "A computer opponent that plays properly",
            ].map((line) => (
              <li key={line} className="border-t border-hairline py-[7px]">
                {line}
              </li>
            ))}
          </ul>

          <div className="mb-1.5 mt-6 font-mono text-[9.5px] uppercase tracking-label text-muted">
            Later
          </div>
          <ul className="text-[12.5px] leading-snug text-muted">
            {["Leaderboards", "Game guide"].map((line) => (
              <li key={line} className="border-t border-hairline py-[7px]">
                {line}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="flex h-[168px] flex-none overflow-hidden border-t-2 border-ink bg-panel">
        <div className="flex w-[336px] flex-none flex-col px-5 py-3">
          <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Fighter
          </div>
          <CharacterCreationForm
            characterName={characterName}
            setCharacterName={setCharacterName}
            selectedColor={selectedColor}
            setSelectedColor={setSelectedColor}
            isNameValid={isNameValid}
            setIsNameValid={setIsNameValid}
            onSubmit={handleJoinMatch}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col border-l border-ink px-5 py-3">
          <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Appearance
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["idle", "walk", "attack"] as Pose[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPose(option)}
                className={`${poseButton} ${
                  pose === option
                    ? "border-ink bg-ink text-paper"
                    : "border-rule text-graphite hover:border-graphite"
                }`}
              >
                {option}
              </button>
            ))}
            <span className="mx-1 h-7 w-px self-center bg-hairline" />
            <button
              type="button"
              onClick={() => rotate("right")}
              aria-label="Turn right"
              className={`${poseButton} border-rule text-graphite hover:border-graphite`}
            >
              &#x21BB;
            </button>
            <button
              type="button"
              onClick={() => rotate("left")}
              aria-label="Turn left"
              className={`${poseButton} border-rule text-graphite hover:border-graphite`}
            >
              &#x21BA;
            </button>
          </div>
          <div className="mt-auto font-mono text-[9.5px] uppercase tracking-label text-muted">
            Facing {direction}
          </div>
        </div>

        <div className="flex w-[248px] flex-none flex-col border-l border-ink px-5 py-3">
          <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Start
          </div>
          <p className="mt-2 text-[12.5px] leading-snug text-graphite">
            Pick an opponent on the next screen, or play the computer.
          </p>
          <div className="mt-auto">
            <button
              type="button"
              onClick={handleJoinMatch}
              disabled={!isNameValid}
              className="w-full bg-vermilion px-2 py-3.5 font-display text-[16px] font-bold text-white transition-colors hover:bg-[#b93a25] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Find a game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
