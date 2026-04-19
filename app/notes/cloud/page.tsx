import type { Metadata } from "next";
import { Suspense } from "react";
import { CloudNoteViewer } from "@/components/notes/cloud-note-viewer";

export const metadata: Metadata = {
  title: "Cloud Note",
  description: "View notes stored in Neon from GitHub Pages.",
};

export default function CloudNotePage() {
  return (
    <div className="section-light py-12">
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6">
        <Suspense
          fallback={
            <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
              <p className="font-text text-[15px] text-black/72 dark:text-white/75">正在加载云端笔记...</p>
            </article>
          }
        >
          <CloudNoteViewer />
        </Suspense>
      </div>
    </div>
  );
}
