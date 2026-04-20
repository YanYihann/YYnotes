"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLanguage } from "@/components/language-provider";
import { ReadingWorkspace } from "@/components/notes/reading-workspace";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import type { Heading } from "@/lib/content";
import { prepareNoteMarkdown } from "@/lib/mdx";

type NoteViewNavLink = {
  href: string;
  labelZh: string;
  labelEn: string;
  leadingArrow?: boolean;
  trailingArrow?: boolean;
};

type NoteViewProps = {
  note: {
    slug: string;
    topicZh: string;
    topicEn: string;
    zhTitle: string;
    enTitle: string;
    descriptionZh: string;
    descriptionEn: string;
    tags: string[];
    noteContent: string;
  };
  headings: Heading[];
  nav?: {
    left?: NoteViewNavLink;
    right?: NoteViewNavLink;
  };
};

function NoteNavLink({ link }: { link: NoteViewNavLink }) {
  return (
    <Link
      href={link.href}
      className="inline-flex rounded-capsule border border-[#0066cc] px-4 py-1.5 text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff]"
    >
      {link.leadingArrow ? <span className="mr-1">{"<"}</span> : null}
      {link.labelZh}
      <span className="ui-en ml-1">{link.labelEn}</span>
      {link.trailingArrow ? <span className="ml-1">{">"}</span> : null}
    </Link>
  );
}

export function NoteView({ note, headings, nav }: NoteViewProps) {
  const { showEnglish } = useLanguage();
  const renderedSource = useMemo(
    () => prepareNoteMarkdown(note.noteContent, { showEnglish }),
    [note.noteContent, showEnglish],
  );

  return (
    <ReadingWorkspace
      headings={headings}
      noteContext={{
        slug: note.slug,
        weekLabelZh: note.topicZh,
        weekLabelEn: note.topicEn,
        zhTitle: note.zhTitle,
        enTitle: note.enTitle,
        noteContent: note.noteContent,
      }}
    >
      <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
        <header className="mb-8 border-b border-black/10 pb-6 dark:border-white/10">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.1em] text-black/55 dark:text-white/55">
            {note.topicZh}
            <span className="ui-en ml-1">{note.topicEn} - Note</span>
          </p>
          {note.tags.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-capsule border border-black/15 px-2 py-0.5 font-text text-[12px] tracking-tightCaption text-black/63 dark:border-white/20 dark:text-white/66"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
          <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-[#1d1d1f] dark:text-white">
            {note.zhTitle}
            <span className="ui-en mt-1 block font-text text-[0.36em] font-normal leading-[1.35] tracking-tightBody text-black/72 dark:text-white/74">
              {note.enTitle}
            </span>
          </h1>
          <p className="mt-3 font-text text-[17px] leading-[1.47] tracking-tightBody text-black/80 dark:text-white/80">
            {note.descriptionZh}
            <span className="ui-en mt-1 block text-black/68 dark:text-white/72">{note.descriptionEn}</span>
          </p>
        </header>

        <div className="note-prose drake-theme" data-note-content>
          <NoteMarkdown source={renderedSource} />
        </div>

        {nav?.left || nav?.right ? (
          <nav className="mt-14 grid gap-4 border-t border-black/10 pt-6 dark:border-white/10 sm:grid-cols-2">
            <div>{nav.left ? <NoteNavLink link={nav.left} /> : null}</div>
            <div className="sm:text-right">{nav.right ? <NoteNavLink link={nav.right} /> : null}</div>
          </nav>
        ) : null}
      </article>
    </ReadingWorkspace>
  );
}
