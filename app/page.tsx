import Link from "next/link";
import { WeekNoteGenerator } from "@/components/home/week-note-generator";
import { WeekCard } from "@/components/week-card";
import { getKeyTopics, getWeekNotes } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const notes = await getWeekNotes();
  const topics = await getKeyTopics();

  return (
    <>
      <section className="section-dark">
        <div className="mx-auto flex min-h-[70vh] w-full max-w-[1100px] flex-col justify-center px-4 py-20 text-center sm:px-6">
          <p className="mx-auto mb-5 rounded-capsule border border-white/30 px-4 py-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/75">
            YYNotes
            <span className="ui-en ml-1">Note Archive</span>
          </p>
          <h1 className="mx-auto max-w-[980px] font-display text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-white">
            YYNotes
            <span className="ui-en mt-2 block text-[0.54em] font-normal text-white/85">Bilingual Notes Across Subjects</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[760px] font-text text-[17px] leading-[1.47] tracking-tightBody text-white/85">
            面向长期积累的双语笔记空间，支持中文主线与英文对照阅读。
            <span className="ui-en ml-1">
              A long-term bilingual note space with Chinese-first flow and optional English line-by-line support.
            </span>
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center">
            <Link
              href="/notes"
              className="inline-flex items-center rounded-apple bg-[#0071e3] px-5 py-2 text-[17px] text-white transition hover:bg-[#0066cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              浏览笔记
              <span className="ui-en ml-1">Browse Notes</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section-light py-16">
        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[40px] font-semibold leading-[1.1] text-[#1d1d1f] dark:text-white">
                我的笔记
                <span className="ui-en mt-1 block text-[0.52em] font-normal text-black/70 dark:text-white/75">My Notes</span>
              </h2>
              <p className="mt-2 max-w-[720px] font-text text-[17px] leading-[1.47] text-black/75 dark:text-white/75">
                按时间顺序管理已有笔记，同时支持持续新增与归档。
                <span className="ui-en ml-1">Organized chronologically, with a structure that supports continuous note creation and archiving.</span>
              </p>
            </div>
            <Link
              href="/notes"
              className="hidden text-[14px] tracking-tightCaption text-[#0066cc] underline-offset-4 hover:underline dark:text-[#2997ff] sm:inline"
            >
              查看全部笔记
              <span className="ui-en ml-1">View all notes</span>
              <span className="ml-1">&gt;</span>
            </Link>
          </div>

          <WeekNoteGenerator
            existingWeeks={notes.map((note) => ({
              weekNumber: note.weekNumber,
              slug: note.slug,
            }))}
          />

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <WeekCard
                key={note.slug}
                href={`/notes/${note.slug}`}
                weekLabelZh={note.weekLabelZh}
                weekLabelEn={note.weekLabelEn}
                zhTitle={note.zhTitle}
                enTitle={note.enTitle}
                descriptionZh={note.descriptionZh}
                descriptionEn={note.descriptionEn}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="section-dark py-16">
        <div className="mx-auto grid w-full max-w-[1100px] gap-10 px-4 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="font-display text-[40px] font-semibold leading-[1.1] text-white">
              最近笔记主题
              <span className="ui-en mt-1 block text-[0.52em] font-normal text-white/80">Recent Note Topics</span>
            </h2>
            <p className="mt-3 font-text text-[17px] leading-[1.47] text-white/80">
              自动提取你最近笔记中的关键主题，帮助快速回顾与定位。
              <span className="ui-en ml-1">
                Automatically surfaced key topics from recent notes for faster review and navigation.
              </span>
            </p>
          </div>
          <ul className="space-y-2 rounded-apple bg-white/10 p-5">
            {topics.map((topic) => (
              <li key={topic} className="font-text text-[17px] leading-[1.47] text-white/88">
                {topic}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-light py-16">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6">
          <h2 className="font-display text-[40px] font-semibold leading-[1.1] text-[#1d1d1f] dark:text-white">
            双语笔记格式说明
            <span className="ui-en mt-1 block text-[0.52em] font-normal text-black/70 dark:text-white/75">Bilingual Format Principle</span>
          </h2>
          <p className="mt-4 font-text text-[17px] leading-[1.47] text-black/80 dark:text-white/80">
            笔记默认按“中文在上、英文在下”展示，并支持英文一键隐藏，便于快速记忆。
            <span className="ui-en ml-1">
              Notes are displayed Chinese-first with optional English below, and English can be hidden in one click.
            </span>
          </p>
          <div className="mt-6 rounded-apple bg-white p-6 shadow-card dark:bg-[#272729]">
            <p className="font-text text-[14px] leading-[1.43] tracking-tightCaption text-black/75 dark:text-white/75">
              建议学习路径：先看目标与定义，再跟推导，最后完成练习题。
              <span className="ui-en ml-1">
                Recommended workflow: skim objectives, review definitions, follow derivations, then complete practice prompts.
              </span>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
