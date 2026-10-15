"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type InterfaceLanguage = "en" | "zh";

type LanguageContextValue = {
  locale: InterfaceLanguage;
  t: (zh: string, en: string) => string;
  showEnglish: boolean;
  setShowEnglish: (value: boolean) => void;
  toggleShowEnglish: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "yynotes.interface-language.v2";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<InterfaceLanguage>("en");
  const showEnglish = locale === "en";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLocale(window.localStorage.getItem(STORAGE_KEY) === "zh" ? "zh" : "en");
    } catch { /* Browsers with storage disabled still support the language toggle. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(STORAGE_KEY, locale); } catch { /* Optional preference persistence. */ }
    document.documentElement.classList.toggle("hide-english", !showEnglish);
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.language = locale;
  }, [showEnglish, locale, ready]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      t: (zh, en) => locale === "zh" ? zh : en,
      showEnglish,
      setShowEnglish: (value) => setLocale(value ? "en" : "zh"),
      toggleShowEnglish: () => setLocale((prev) => prev === "en" ? "zh" : "en"),
    }),
    [showEnglish, locale],
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
