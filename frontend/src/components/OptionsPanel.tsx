import React from "react";
import { LANGS } from "../i18n/lang";
import { useLang, useT } from "../i18n/LanguageProvider";
import { SoundToggle } from "../audio/SoundToggle";

/**
 * The game's options: the language, and whether there is sound. The
 * language is the one thing a player may need to change before reading
 * anything else, so it sits in the menu rather than behind a settings page;
 * sound joined it here when the home screen lost its corner of small words.
 */
export const OptionsPanel: React.FC = () => {
  const { t } = useT();
  const { lang, setLang } = useLang();
  return (
    <section className="mt-3">
      <h3 id="options-language" className="font-mono text-[9.5px] uppercase tracking-label text-muted">
        {t("Language")}
      </h3>
      <div role="radiogroup" aria-labelledby="options-language" className="mt-2 flex flex-col gap-2">
        {LANGS.map((option) => {
          const checked = option.id === lang;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={checked}
              // Each language is named in itself: someone who cannot read the
              // current one still finds their own.
              lang={option.id}
              onClick={() => setLang(option.id)}
              className={`flex items-center justify-between rounded-2xl px-3.5 py-3 text-left transition-transform active:scale-[0.98] ${
                checked
                  ? "bg-panel shadow-[inset_0_0_0_2px_rgb(var(--gold))]"
                  : "bg-panel/70 shadow-[inset_0_0_0_1px_rgb(var(--rule))]"
              }`}
            >
              <span className="font-display text-[16px]">{option.name}</span>
              <span
                aria-hidden
                className={`h-3 w-3 rounded-full ${checked ? "bg-gold" : "shadow-[inset_0_0_0_1.5px_rgb(var(--rule))]"}`}
              />
            </button>
          );
        })}
      </div>
      <h3 className="mt-4 font-mono text-[9.5px] uppercase tracking-label text-muted">
        {t("Sound")}
      </h3>
      <SoundToggle className="mt-2 w-full rounded-2xl bg-panel/70 px-3.5 py-3 text-left font-display text-[16px] shadow-[inset_0_0_0_1px_rgb(var(--rule))] transition-transform active:scale-[0.98]" />
    </section>
  );
};

export default OptionsPanel;
