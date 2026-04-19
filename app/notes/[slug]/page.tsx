import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteView } from "@/components/notes/note-view";
import { getAdjacentWeeks, getWeekBySlug, getWeekNotes } from "@/lib/content";

type WeekPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const notes = await getWeekNotes();
  return notes.map((note) => ({ slug: note.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: WeekPageProps): Promise<Metadata> {
  const { slug } = await params;
  const note = await getWeekBySlug(slug);

  if (!note) {
    return {
      title: "Note Not Found",
    };
  }

  return {
    title: `${note.topicEn} - ${note.enTitle}`,
    description: note.descriptionEn,
  };
}

export default async function WeekPage({ params }: WeekPageProps) {
  const { slug } = await params;
  const note = await getWeekBySlug(slug);

  if (!note) {
    notFound();
  }

  const { previous, next } = await getAdjacentWeeks(note.slug);

  return (
    <div className="section-light py-12">
      <NoteView
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
          left: previous
            ? {
                href: `/notes/${previous.slug}`,
                labelZh: "上一篇",
                labelEn: "Previous",
                leadingArrow: true,
              }
            : undefined,
          right: next
            ? {
                href: `/notes/${next.slug}`,
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