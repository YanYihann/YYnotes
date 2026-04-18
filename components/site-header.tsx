import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-[20px] backdrop-saturate-[180%]">
      <div className="mx-auto flex h-12 max-w-[1100px] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="font-text text-[12px] font-medium tracking-[0.04em] text-white/95 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          YYnotes
          <span className="ui-en ml-1 text-white/80">YYNotes</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-4">
          <NavLinks />
          <LanguageToggle />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
