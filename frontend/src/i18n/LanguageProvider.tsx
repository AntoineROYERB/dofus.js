import React, { createContext, useCallback, useContext, useState } from "react";
import { Lang, currentLang, saveLang, setCurrentLang, t, tLoose, tn } from "./lang";

const LanguageContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: "fr",
  setLang: () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    setCurrentLang(currentLang());
    return currentLang();
  });
  const setLang = useCallback((next: Lang) => {
    // The module's language first, so whatever re-renders reads the new one.
    setCurrentLang(next);
    saveLang(next);
    setLangState(next);
  }, []);
  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
};

export const useLang = () => useContext(LanguageContext);

/**
 * The translation functions, for a component that shows text. Calling it is
 * what makes the component draw again when the language changes; the
 * functions themselves are the module's.
 */
export const useT = () => {
  const { lang } = useLang();
  return { t, tn, tLoose, lang };
};
