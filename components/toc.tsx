import Link from "next/link";
import type { Heading } from "@/lib/content";

type TocProps = {
  items: Heading[];
  sticky?: boolean;
};

export function TableOfContents({ items, sticky = true }: TocProps) {
  if (!items.length) {
    return null;
  }

  return (
    <nav
      aria-label="Table of contents"
      className={`${sticky ? "sticky top-24" : ""} rounded-apple bg-white/80 p-4 shadow-card dark:bg-[#272729]`}
    >
      <p className="mb-3 font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/55">
        本页目录
        <span className="ui-en ml-1">On this page</span>
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`#${item.id}`}
              className={`block rounded px-2 py-1 font-text text-[14px] leading-[1.4] tracking-tightCaption text-black/75 transition hover:text-[#0066cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:text-white/75 dark:hover:text-[#2997ff] ${
                item.level === 3 ? "pl-5" : "pl-2"
              }`}
            >
              {item.title}
              {item.enTitle ? <span className="ui-en ml-1 text-black/60 dark:text-white/60">{item.enTitle}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
