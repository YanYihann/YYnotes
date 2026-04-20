import type { Metadata } from "next";
import { NotesIndexClient } from "@/components/notes/notes-index-client";
import { getWeekNotes } from "@/lib/content";

export const metadata: Metadata = {
  title: "My Notes",
  description: "Browse all archived notes.",
};

export default async function NotesIndexPage() {
  const notes = await getWeekNotes();
  const initialNotes = notes.map((note) => ({
    slug: note.slug,
    weekLabelZh: note.weekLabelZh,
    weekLabelEn: note.weekLabelEn,
    zhTitle: note.zhTitle,
    enTitle: note.enTitle,
    descriptionZh: note.descriptionZh,
    descriptionEn: note.descriptionEn,
    topicZh: note.topicZh,
    order: note.order,
  }));

  return (
    <div className="section-light min-h-[calc(100vh-3rem)] py-14">
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
        <header className="mb-10 max-w-[760px]">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.1em] text-black/55 dark:text-white/55">
            笔记索引
            <span className="ui-en ml-1">Notes Index</span>
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-[#1d1d1f] dark:text-white">
            我的笔记
            <span className="ui-en mt-1 block text-[0.52em] font-normal text-black/70 dark:text-white/75">My Notes</span>
          </h1>
          <p className="mt-4 font-text text-[17px] leading-[1.47] text-black/80 dark:text-white/80">
            按文件夹与主题组织笔记内容，保留公式细节与完整推导。
            <span className="ui-en ml-1">Organized by folders and topics with formula details and complete derivations.</span>
          </p>
        </header>

        <NotesIndexClient initialNotes={initialNotes} />
      </div>
    </div>
  );
}
