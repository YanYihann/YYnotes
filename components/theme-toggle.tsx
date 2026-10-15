"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export function ThemeToggle() {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? t("切换浅色主题", "Switch to light mode") : t("切换深色主题", "Switch to dark mode");
  return <button type="button" className="header-icon-button" onClick={() => setTheme(isDark ? "light" : "dark")} disabled={!mounted} aria-label={label} title={label}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}
