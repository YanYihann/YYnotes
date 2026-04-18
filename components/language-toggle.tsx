"use client";

import { useLanguage } from "@/components/language-provider";

export function LanguageToggle() {
  const { showEnglish, toggleShowEnglish } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleShowEnglish}
      className="inline-flex h-9 items-center rounded-capsule border border-white/30 bg-transparent px-4 text-[14px] tracking-tightCaption text-white transition hover:border-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#000000]"
      aria-label={showEnglish ? "Switch to Chinese only" : "Switch to bilingual"}
    >
      {showEnglish ? "中英" : "中文"}
      <span className="ui-en ml-2 text-white/80">{showEnglish ? "Bilingual" : "Chinese"}</span>
    </button>
  );
}
