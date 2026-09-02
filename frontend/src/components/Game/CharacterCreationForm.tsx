import React from "react";
import { PLAYER_COLORS } from "../../constants";

interface CharacterCreationFormProps {
  characterName: string;
  setCharacterName: (name: string) => void;
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  isNameValid: boolean;
  setIsNameValid: (isValid: boolean) => void;
  /** Enter sends you to the lobby, the same as the button does. */
  onSubmit: () => void;
}

const NAME_RULE = /^[a-zA-Z0-9 ]{3,20}$/;

export const CharacterCreationForm: React.FC<CharacterCreationFormProps> = ({
  characterName,
  setCharacterName,
  selectedColor,
  setSelectedColor,
  isNameValid,
  setIsNameValid,
  onSubmit,
}) => {
  const showError = characterName.length > 0 && !isNameValid;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        id="characterName"
        type="text"
        value={characterName}
        maxLength={20}
        onChange={(event) => {
          const name = event.target.value;
          setCharacterName(name);
          setIsNameValid(NAME_RULE.test(name));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
        }}
        placeholder="Your name"
        aria-label="Fighter name"
        aria-invalid={showError}
        className={`mt-1 w-full border-b bg-transparent pb-1 font-display text-[29px] font-bold tracking-tight text-ink placeholder:font-sans placeholder:text-[18px] placeholder:font-normal placeholder:tracking-normal placeholder:text-muted focus:outline-none ${
          showError ? "border-vermilion" : "border-rule focus:border-ink"
        }`}
      />

      <p
        className={`mt-1 font-mono text-[9.5px] uppercase tracking-label ${
          showError ? "text-vermilion" : "text-muted"
        }`}
      >
        {showError ? "3 to 20 letters, digits or spaces" : "Colour"}
      </p>

      <div className="mt-auto flex flex-wrap gap-1.5">
        {PLAYER_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Colour ${color}`}
            aria-pressed={color === selectedColor}
            onClick={() => setSelectedColor(color)}
            className={`h-[18px] w-[18px] transition-transform hover:scale-110 ${
              color === selectedColor
                ? "outline outline-2 outline-offset-2 outline-ink"
                : ""
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
};
