import type { Metadata } from "next";
import { Suspense } from "react";
import { UiText } from "@/components/ui-text";
import { CloudNoteViewer } from "@/components/notes/cloud-note-viewer";

export const metadata: Metadata = {
  title: "Cloud Note",
  description: "Read and edit your saved notes.",
};

export default function CloudNotePage() {
  return (
    <div className="section-light py-12">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-[1720px] px-4 sm:px-6">
            <article className="rounded-apple bg-card px-5 py-8 text-card-foreground shadow-card sm:px-8 md:px-10">
              <p className="font-text text-[15px] text-black/72 dark:text-white/75"><UiText zh="正在加载笔记…" en="Loading note…" /></p>
            </article>
          </div>
        }
      >
        <CloudNoteViewer />
      </Suspense>
    </div>
  );
}