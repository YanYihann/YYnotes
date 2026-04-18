"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className="inline-flex h-9 w-[84px] rounded-capsule bg-white/10" aria-hidden />;
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-9 items-center rounded-capsule border border-white/30 bg-transparent px-4 text-[14px] tracking-tightCaption text-white transition hover:border-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#000000]"
      aria-label="Toggle theme"
    >
      {isDark ? "浅色" : "深色"}
      <span className="ui-en ml-1 text-white/80">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
