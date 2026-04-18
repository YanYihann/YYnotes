"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type LanguageContextValue = {
  showEnglish: boolean;
  setShowEnglish: (value: boolean) => void;
  toggleShowEnglish: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "na_show_english";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [showEnglish, setShowEnglish] = useState(true);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "0") {
      setShowEnglish(false);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, showEnglish ? "1" : "0");
    document.documentElement.classList.toggle("hide-english", !showEnglish);
  }, [showEnglish]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      showEnglish,
      setShowEnglish,
      toggleShowEnglish: () => setShowEnglish((prev) => !prev),
    }),
    [showEnglish],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);

  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return ctx;
}
