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
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-[1720px] px-4 sm:px-6">
            <article className="rounded-apple bg-card px-5 py-8 text-card-foreground shadow-card sm:px-8 md:px-10">
              <p className="font-text text-[15px] text-muted-foreground">���ڼ����ƶ˱ʼ�...</p>
            </article>
          </div>
        }
      >
        <CloudNoteViewer />
      </Suspense>
    </div>
  );
}