import Link from "next/link";
import type { MouseEvent } from "react";
import type { Heading } from "@/lib/content";

type TocProps = {
  items: Heading[];
  sticky?: boolean;
};

function normalizeHeadingText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveHeadingElement(item: Heading): HTMLElement | null {
  const exactMatch = document.getElementById(item.id);
  if (exactMatch) {
    return exactMatch;
  }

  const decodedId = decodeURIComponent(item.id);
  if (decodedId !== item.id) {
    const decodedMatch = document.getElementById(decodedId);
    if (decodedMatch) {
      return decodedMatch;
    }
  }

  const normalizedZh = normalizeHeadingText(item.title);
  const normalizedEn = normalizeHeadingText(item.enTitle ?? "");
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(".note-prose h2[id], .note-prose h3[id]"));

  return (
    candidates.find((element) => {
      const text = normalizeHeadingText(element.textContent ?? "");
      if (!text) {
        return false;
      }
      if (text === normalizedZh || text.startsWith(normalizedZh)) {
        return true;
      }
      if (normalizedEn && (text === normalizedEn || text.startsWith(normalizedEn))) {
        return true;
      }
      return false;
    }) ?? null
  );
}

export function TableOfContents({ items, sticky = true }: TocProps) {
  if (!items.length) {
    return null;
  }

  const handleTocClick = (event: MouseEvent<HTMLAnchorElement>, item: Heading) => {
    event.preventDefault();
    const target = resolveHeadingElement(item);
    if (!target) {
      window.location.hash = item.id;
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const nextHash = target.id || item.id;
    window.history.replaceState(null, "", `#${nextHash}`);
  };

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
              onClick={(event) => handleTocClick(event, item)}
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
