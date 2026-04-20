"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", zh: "��ҳ", en: "Home" },
  { href: "/notes", zh: "�ʼ�", en: "Notes" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navItems.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-capsule px-3 py-1 font-text text-[12px] tracking-[0.02em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black",
              isActive ? "text-white underline decoration-white/70 underline-offset-4" : "text-white/85 hover:text-white",
            )}
          >
            {item.zh}
            <span className="ui-en ml-1 text-white/80">{item.en}</span>
          </Link>
        );
      })}
    </>
  );
}
