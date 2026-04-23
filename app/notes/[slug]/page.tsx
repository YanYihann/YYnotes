import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteView } from "@/components/notes/note-view";
import { getAdjacentWeeks, getWeekBySlug, getWeekNotes } from "@/lib/content";

export const dynamicParams = false;

const EMPTY_EXPORT_SLUG = "__empty-notes__";

type NotePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const notes = await getWeekNotes();
  const params = notes.map((note) => ({
    slug: note.slug,
  }));

  if (params.length === 0 && process.env.DEPLOY_TARGET === "cloudflare-pages") {
    return [{ slug: EMPTY_EXPORT_SLUG }];
  }

  return params;
}

export async function generateMetadata({ params }: NotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const note = decodedSlug === EMPTY_EXPORT_SLUG ? null : await getWeekBySlug(decodedSlug);

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
  const decodedSlug = decodeURIComponent(slug);

  if (decodedSlug === EMPTY_EXPORT_SLUG) {
    return (
      <div className="section-light min-h-[calc(100vh-3rem)] py-14">
        <div className="mx-auto w-full max-w-[900px] px-4 sm:px-6">
          <article className="rounded-apple bg-card px-5 py-8 text-card-foreground shadow-card sm:px-8 md:px-10">
            <p className="font-text text-[15px] leading-[1.5] text-muted-foreground">
              No local MDX notes are available in this static export.
            </p>
          </article>
        </div>
      </div>
    );
  }

  const note = await getWeekBySlug(decodedSlug);

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
