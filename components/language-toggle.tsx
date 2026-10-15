"use client";
import { useLanguage } from "@/components/language-provider";

export function LanguageToggle() {
  const { locale, toggleShowEnglish, t } = useLanguage();
  return <button type="button" onClick={toggleShowEnglish} className="header-language" aria-label={t("切换为英文", "Switch to Chinese")} title={t("切换为英文", "Switch to Chinese")}><span className={locale === "en" ? "language-active" : ""}>EN</span><span>/</span><span className={locale === "zh" ? "language-active" : ""}>中文</span></button>;
}
