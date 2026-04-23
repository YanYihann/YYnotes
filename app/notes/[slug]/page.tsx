import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteView } from "@/components/notes/note-view";
import { getAdjacentWeeks, getWeekBySlug, getWeekNotes } from "@/lib/content";

type NotePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const notes = await getWeekNotes();
  return notes.map((note) => ({
    slug: note.slug,
  }));
}

export async function generateMetadata({ params }: NotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const note = await getWeekBySlug(decodeURIComponent(slug));

  if (!note) {
    return {
      title: "Note Not Found",
    };
  }

  return {
    title: note.zhTitle,
    description: note.descriptionZh || note.descriptionEn,
  };
}

export default async function LocalNotePage({ params }: NotePageProps) {
  const { slug } = await params;
  const note = await getWeekBySlug(decodeURIComponent(slug));

  if (!note) {
    notFound();
  }

  const adjacent = await getAdjacentWeeks(note.slug);

  return (
    <div className="section-light min-h-[calc(100vh-3rem)] py-8">
      <NoteView
        storageMode="local"
        headings={note.headings}
        note={{
          slug: note.slug,
          topicZh: note.topicZh,
          topicEn: note.topicEn,
          zhTitle: note.zhTitle,
          enTitle: note.enTitle,
          descriptionZh: note.descriptionZh,
          descriptionEn: note.descriptionEn,
          tags: note.tags,
          noteContent: note.source,
        }}
        nav={{
          left: adjacent.previous
            ? {
                href: `/notes/${encodeURIComponent(adjacent.previous.slug)}`,
                labelZh: "上一篇",
                labelEn: "Previous",
                leadingArrow: true,
              }
            : undefined,
          right: adjacent.next
            ? {
                href: `/notes/${encodeURIComponent(adjacent.next.slug)}`,
                labelZh: "下一篇",
                labelEn: "Next",
                trailingArrow: true,
              }
            : undefined,
        }}
      />
    </div>
  );
}
