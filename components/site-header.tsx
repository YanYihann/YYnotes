"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { AuthNavControls } from "@/components/auth/auth-nav-controls";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandSearch } from "@/components/command-search";
import type { WorkspaceNote } from "@/components/home/workspace-types";
import { useLanguage } from "@/components/language-provider";

export function SiteHeader({ publicNotes }: { publicNotes: WorkspaceNote[] }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menu.current) menu.current.open = false; }, [pathname]);
  return <header className="workspace-header">
    <a href="#workspace-main" className="skip-link">{t("跳到主要内容", "Skip to content")}</a>
    <div className="header-inner">
      <Link href="/" className="brand" aria-label={t("YYNotes 首页", "YYNotes home")}><Image src="/icon.svg" alt="" width={28} height={28} unoptimized />YYNotes</Link>
      <nav className="header-nav" aria-label={t("主导航", "Main navigation")}><Link href="/" aria-current={pathname === "/" ? "page" : undefined}>{t("首页", "Home")}</Link><Link href="/notes" aria-current={pathname.startsWith("/notes") ? "page" : undefined}>{t("笔记", "Notes")}</Link></nav>
      <div className="header-actions"><CommandSearch publicNotes={publicNotes} /><div className="header-preferences"><LanguageToggle /><ThemeToggle /></div><AuthNavControls /><details ref={menu} className="mobile-nav"><summary aria-label={t("打开导航菜单", "Open navigation")}><Menu size={20} /></summary><div className="mobile-nav-content"><Link href="/" onClick={() => { if (menu.current) menu.current.open = false; }}>{t("首页", "Home")}</Link><Link href="/notes" onClick={() => { if (menu.current) menu.current.open = false; }}>{t("笔记", "Notes")}</Link><Link href="/#create" onClick={() => { if (menu.current) menu.current.open = false; }}><Plus size={15} />{t("生成笔记", "Generate notes")}</Link><div><LanguageToggle /><ThemeToggle /></div></div></details></div>
    </div>
  </header>;
}
