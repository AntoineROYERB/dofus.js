import React, { useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/LandingPage.css";
import SpriteAnimation, { Direction } from "../components/Game/SpriteAnimation";
import { CharacterCreationForm } from "../components/Game/CharacterCreationForm";
import StarryBackground from "../components/StarryBackground";

const LandingPage: React.FC = () => {
  const [selectedColor, setSelectedColor] = useState("#FF0000");
  const [characterName, setCharacterName] = useState("");
  const [isNameValid, setIsNameValid] = useState(false);
  const navigate = useNavigate();

  const handleJoinMatch = () => {
    if (isNameValid) {
      // Navigate to the game page with character data
      navigate("/game", { state: { characterName, selectedColor } });
    } else {
      // Handle case where the name is not valid
      alert("Please enter a valid character name.");
    }
  };

  const [currentAnimationType, setCurrentAnimationType] = useState<
    "idle" | "walk" | "attack"
  >("idle");
  const [currentDirection, setCurrentDirection] = useState<Direction>("S");

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

  const currentAnimation = animationConfig[currentAnimationType];
  const directions: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  const handleRotate = (direction: "left" | "right") => {
    const currentIndex = directions.indexOf(currentDirection);
    let newIndex = currentIndex;
    if (direction === "left") {
      newIndex = (currentIndex - 1 + directions.length) % directions.length;
    } else {
      newIndex = (currentIndex + 1) % directions.length;
    }
    setCurrentDirection(directions[newIndex]);
  };

  const handleAnimationChange = (animationType: "idle" | "walk" | "attack") => {
    setCurrentAnimationType(animationType);
  };

  const animationContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const updateScale = () => {
      if (animationContainerRef.current) {
        const containerWidth = animationContainerRef.current.offsetWidth;
        const newScale = containerWidth / 384;
        setScale(newScale);
      }
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <div className="landing-page-new">
      <link
        href="https://fonts.googleapis.com/css?family=Lato:300,400,700"
        rel="stylesheet"
        type="text/css"
      />
      <StarryBackground />

      <div className="landing-grid-container">
        <div className="intro-section">
          <h1 className="game-title-new">Dofus.js</h1>
          <p className="intro-text">
            Welcome to Dofus.js, a reimagining of the combat system from Dofus.
          </p>
          <p className="intro-text">
            Built with cutting-edge technology, this project brings you a
            turn-based multiplayer game right in your browser.
          </p>
          <p className="intro-text">
            Featuring real-time WebSocket communication, isometric battle
            arenas, and animations, Dofus.js combines nostalgic gameplay with
            modern web technologies.
          </p>
        </div>

        <div className="center-section">
          <div className="character-display">
            <div className="text-center">
              <div className="relative inline-block">
                <div className="absolute -bottom-1 left-0 right-0 h-6 bg-black/50 blur"></div>
                <p
                  className={`relative text-lg font-medium ${
                    characterName ? "text-white" : "text-gray-400"
                  }`}
                >
                  {characterName ? characterName : "Enter your name below"}
                </p>
              </div>
            </div>
            <div
              className="character-animation-container"
              ref={animationContainerRef}
            >
              <SpriteAnimation
                spriteSheet={currentAnimation.spriteSheet}
                framesPerDirection={currentAnimation.framesPerDirection}
                frameWidth={currentAnimation.frameWidth}
                frameHeight={currentAnimation.frameHeight}
                direction={currentDirection}
                directionMap={currentAnimation.directionMap}
                scale={scale}
              />
            </div>
          </div>
          <div className="animation-controls">
            <div className="rotation-controls">
              <button
                className="rotate-arrow"
                onClick={() => handleRotate("right")}
              >
                &#x21BB;
              </button>
              <button
                className="rotate-arrow"
                onClick={() => handleRotate("left")}
              >
                &#x21BA;
              </button>
            </div>
            <div className="animation-type-controls">
              <button
                className="animation-button"
                onClick={() => handleAnimationChange("idle")}
              >
                Idle
              </button>
              <button
                className="animation-button"
                onClick={() => handleAnimationChange("walk")}
              >
                Walk
              </button>
              <button
                className="animation-button"
                onClick={() => handleAnimationChange("attack")}
              >
                Attack
              </button>
            </div>
          </div>
          <div className="character-creation-module">
            <CharacterCreationForm
              characterName={characterName}
              setCharacterName={setCharacterName}
              selectedColor={selectedColor}
              setSelectedColor={setSelectedColor}
              isNameValid={isNameValid}
              setIsNameValid={setIsNameValid}
            />
          </div>
        </div>

        <div className="right-section">
          <button
            className="join-match-button"
            onClick={handleJoinMatch}
          >
            Join Match
          </button>
          <div className="additional-elements">
            <h3>Quick Links</h3>
            <ul>
              <li>
                <a
                  href="https://github.com/AntoineROYERB/dofus.js"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Project
                </a>
              </li>
              <li>
                <a href="#" className="coming-soon">
                  Leaderboards (Coming Soon)
                </a>
              </li>
              <li>
                <a href="#" className="coming-soon">
                  Game Guide (Coming Soon)
                </a>
              </li>
            </ul>
            <h3>Current Features</h3>
            <ul className="feature-list">
              <li>⚔️ Turn-based combat system</li>
              <li>🎮 Character movement and positioning</li>
              <li>🌟 Real-time WebSocket communication</li>
              <li>🎲 Advanced game state management</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
