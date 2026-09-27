import React from "react";
import { NAME_RULE } from "../../utils/characterStorage";

interface CharacterCreationFormProps {
  characterName: string;
  setCharacterName: (name: string) => void;
  isNameValid: boolean;
  setIsNameValid: (isValid: boolean) => void;
  /** Enter sends you to the lobby, the same as the button does. */
  onSubmit: () => void;
}


export const CharacterCreationForm: React.FC<CharacterCreationFormProps> = ({
  characterName,
  setCharacterName,
  isNameValid,
  setIsNameValid,
  onSubmit,
}) => {
  const showError = characterName.length > 0 && !isNameValid;
  const [isFocused, setIsFocused] = React.useState(false);
  // Nothing on the page says "start here" in words; the field says it by
  // pulsing until either a name is typed or the player has found it themselves.
  const hints = characterName.length === 0 && !isFocused;

  return (
    <div>
      <label
        htmlFor="characterName"
        className="font-mono text-[9.5px] uppercase tracking-label text-muted"
      >
        Your name
      </label>
      <input
        id="characterName"
        type="text"
        value={characterName}
        maxLength={20}
        autoComplete="off"
        onChange={(event) => {
          const name = event.target.value;
          setCharacterName(name);
          setIsNameValid(NAME_RULE.test(name));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Your name"
        aria-invalid={showError}
        className={`mt-1 w-full border-b bg-transparent pb-1.5 font-display text-[29px] short:pb-1 short:text-[22px] font-bold tracking-tight text-ink placeholder:font-sans placeholder:text-[18px] placeholder:font-normal placeholder:tracking-normal placeholder:text-muted focus:outline-none ${
          showError
            ? "border-vermilion"
            : hints
              ? "animate-hint"
              : "border-rule focus:border-ink"
        }`}
      />

      {showError && (
        <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-label text-vermilion">
          3 to 20 letters, digits or spaces
        </p>
      )}
    </div>
  );
};
