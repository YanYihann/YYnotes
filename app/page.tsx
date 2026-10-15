import { HomeWorkspace } from "@/components/home/home-workspace";
import { getWeekNotes } from "@/lib/content";

export default async function HomePage() {
  const notes = await getWeekNotes();
  return <HomeWorkspace publicNotes={notes.map((note) => ({
    slug: note.slug, href: `/notes/${encodeURIComponent(note.slug)}`,
    title: note.zhTitle, englishTitle: note.enTitle,
    description: note.descriptionZh, englishDescription: note.descriptionEn, topic: note.topicZh, englishTopic: note.topicEn, tags: note.tags,
  }))} />;
}
