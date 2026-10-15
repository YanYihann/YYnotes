import Link from "next/link";
import { Plus } from "lucide-react";
import { UiText } from "@/components/ui-text";
import type { Metadata } from "next";
import { NotesIndexClient } from "@/components/notes/notes-index-client";
import { getWeekNotes } from "@/lib/content";

export const metadata: Metadata = { title: "Notes · YYNotes", description: "Organize notes by folder and topic." };
export default async function NotesIndexPage() {
  const notes = await getWeekNotes();
  const initialNotes = notes.map((note) => ({ slug: note.slug, weekLabelZh: note.weekLabelZh, weekLabelEn: note.weekLabelEn, zhTitle: note.zhTitle, enTitle: note.enTitle, descriptionZh: note.descriptionZh, descriptionEn: note.descriptionEn, topicZh: note.topicZh, tags: note.tags, order: note.order }));
  return <div className="notes-page"><header className="notes-page-heading"><h1><UiText zh="笔记" en="Notes" /></h1><Link className="text-action" href="/#create"><Plus size={16} /><UiText zh="生成笔记" en="Generate notes" /></Link></header><NotesIndexClient initialNotes={initialNotes} /></div>;
}
