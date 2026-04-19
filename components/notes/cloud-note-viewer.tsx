"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LoginRequiredCard } from "@/components/auth/login-required-card";
import { useAuth } from "@/components/auth/auth-provider";
import { NoteView } from "@/components/notes/note-view";
import {
  normalizeCloudNote,
  normalizeCloudNoteRows,
  resolveAdjacentByOrder,
  type CloudNoteRecord,
} from "@/lib/cloud-note-normalizer";

type CloudNoteResponse = {
  success?: boolean;
  note?: CloudNoteRecord;
  error?: string;
};

type CloudListResponse = {
  success?: boolean;
  notes?: unknown;
  error?: string;
};

type AdjacentNav = {
  previousSlug?: string;
  nextSlug?: string;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function CloudStateCard({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 sm:px-6">
      <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
        <p
          className={
            error
              ? "rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]"
              : "font-text text-[15px] text-black/72 dark:text-white/75"
          }
        >
          {message}
        </p>
      </article>
    </div>
  );
}

export function CloudNoteViewer() {
  const { isReady, session } = useAuth();
  const authToken = session?.token ?? "";
  const searchParams = useSearchParams();
  const slug = (searchParams.get("slug") ?? "").trim();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState<CloudNoteRecord | null>(null);
  const [adjacentNav, setAdjacentNav] = useState<AdjacentNav>({});

  useEffect(() => {
    async function loadNote() {
      if (!slug) {
        setError("缺少 slug 参数，请从笔记列表重新打开。");
        setNote(null);
        setAdjacentNav({});
        return;
      }

      if (!CLOUD_API_BASE) {
        setError("未配置 NEXT_PUBLIC_NOTES_API_BASE，无法读取云端笔记。");
        setNote(null);
        setAdjacentNav({});
        return;
      }

      if (!isReady || !authToken) {
        setLoading(false);
        setNote(null);
        setAdjacentNav({});
        return;
      }

      setLoading(true);
      setError("");

      try {
        const apiBase = normalizeApiBase(CLOUD_API_BASE);

        const noteResponse = await fetch(`${apiBase}/notes/${encodeURIComponent(slug)}`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        const noteJson = (await noteResponse.json().catch(() => null)) as CloudNoteResponse | null;
        if (!noteResponse.ok || !noteJson?.success || !noteJson.note) {
          throw new Error(noteJson?.error || "加载云端笔记失败。");
        }

        setNote(noteJson.note);

        try {
          const listResponse = await fetch(`${apiBase}/notes?limit=200&include_content=1`, {
            method: "GET",
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });

          const listJson = (await listResponse.json().catch(() => null)) as CloudListResponse | null;
          if (!listResponse.ok || !listJson?.success) {
            setAdjacentNav({});
            return;
          }

          const normalizedRows = normalizeCloudNoteRows(listJson.notes);
          const mergedRows = normalizedRows.some((item) => item.slug === slug)
            ? normalizedRows
            : [...normalizedRows, normalizeCloudNote(noteJson.note)];

          setAdjacentNav(resolveAdjacentByOrder(slug, mergedRows));
        } catch {
          setAdjacentNav({});
        }
      } catch (loadError) {
        setNote(null);
        setAdjacentNav({});
        setError(loadError instanceof Error ? loadError.message : "加载云端笔记失败。");
      } finally {
        setLoading(false);
      }
    }

    loadNote();
  }, [isReady, authToken, slug]);

  const normalizedNote = useMemo(() => normalizeCloudNote(note), [note]);

  if (!isReady) {
    return <CloudStateCard message="正在检查登录状态..." />;
  }

  if (!authToken) {
    return (
      <div className="mx-auto w-full max-w-[1720px] px-4 sm:px-6">
        <LoginRequiredCard
          redirectTo={slug ? `/notes/cloud?slug=${encodeURIComponent(slug)}` : "/notes"}
          titleZh="登录后查看云端笔记"
          titleEn="Sign In to View Cloud Note"
        />
      </div>
    );
  }

  if (loading) {
    return <CloudStateCard message="正在加载云端笔记..." />;
  }

  if (error) {
    return <CloudStateCard message={error} error />;
  }

  if (!normalizedNote.noteContent) {
    return <CloudStateCard message="笔记内容为空。" />;
  }

  return (
    <NoteView
      headings={normalizedNote.headings}
      note={{
        slug: normalizedNote.slug || slug,
        topicZh: normalizedNote.topicZh,
        topicEn: normalizedNote.topicEn,
        zhTitle: normalizedNote.zhTitle,
        enTitle: normalizedNote.enTitle,
        descriptionZh: normalizedNote.descriptionZh,
        descriptionEn: normalizedNote.descriptionEn,
        tags: normalizedNote.tags,
        noteContent: normalizedNote.noteContent,
      }}
      nav={{
        left: adjacentNav.previousSlug
          ? {
              href: `/notes/cloud?slug=${encodeURIComponent(adjacentNav.previousSlug)}`,
              labelZh: "上一篇",
              labelEn: "Previous",
              leadingArrow: true,
            }
          : undefined,
        right: adjacentNav.nextSlug
          ? {
              href: `/notes/cloud?slug=${encodeURIComponent(adjacentNav.nextSlug)}`,
              labelZh: "下一篇",
              labelEn: "Next",
              trailingArrow: true,
            }
          : undefined,
      }}
    />
  );
}
