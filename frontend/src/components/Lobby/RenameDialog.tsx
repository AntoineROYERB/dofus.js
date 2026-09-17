import React, { useState } from "react";
import { NAME_RULE } from "../../utils/characterStorage";

interface RenameDialogProps {
  name: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/**
 * Renaming without leaving the home screen: a small box over it, the same
 * rule the server applies, and Enter to save.
 */
export const RenameDialog: React.FC<RenameDialogProps> = ({
  name,
  onSave,
  onCancel,
}) => {
  const [value, setValue] = useState(name);
  const trimmed = value.trim();
  const valid = NAME_RULE.test(trimmed);
  const showError = value.length > 0 && !valid;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (valid) onSave(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
      onClick={onCancel}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        onSubmit={save}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xs border border-rule bg-panel p-5"
      >
        <label
          id="rename-title"
          htmlFor="rename-input"
          className="font-mono text-[9.5px] uppercase tracking-label text-muted"
        >
          Your name
        </label>
        <input
          id="rename-input"
          autoFocus
          value={value}
          maxLength={20}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          aria-invalid={showError}
          className={`mt-1 w-full border-b bg-transparent pb-1 font-display text-[24px] font-bold tracking-tight text-ink focus:outline-none ${
            showError ? "border-vermilion" : "border-rule focus:border-ink"
          }`}
        />
        <p
          className={`mt-1.5 h-4 font-mono text-[9.5px] uppercase tracking-label ${
            showError ? "text-vermilion" : "text-transparent"
          }`}
        >
          3 to 20 letters, digits or spaces
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={!valid}
            className="flex-1 bg-vermilion py-2.5 font-display text-[14px] font-bold text-white transition-colors hover:bg-[#b93a25] disabled:bg-hairline disabled:text-muted"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-rule py-2.5 font-display text-[14px] font-bold text-ink transition-colors hover:border-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default RenameDialog;
