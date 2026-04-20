"use client";

import { useEffect, useMemo, useState } from "react";
import { LoginRequiredCard } from "@/components/auth/login-required-card";
import { useAuth } from "@/components/auth/auth-provider";
import { WeekNoteGenerator } from "@/components/home/week-note-generator";
import { WeekCard } from "@/components/week-card";
import { normalizeCloudNote, type CloudNoteRecord } from "@/lib/cloud-note-normalizer";

type NotesApiResponse = {
  success?: boolean;
  notes?: unknown;
  error?: string;
};

type HomeCloudNoteItem = {
  slug: string;
  href: string;
  weekLabelZh: string;
  weekLabelEn: string;
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  tags: string[];
  topicZh: string;
  order: number;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function toHomeCloudNoteItem(row: CloudNoteRecord): HomeCloudNoteItem | null {
  const normalized = normalizeCloudNote(row);
  if (!normalized.slug) {
    return null;
  }

  return {
    slug: normalized.slug,
    href: `/notes/cloud?slug=${encodeURIComponent(normalized.slug)}`,
    weekLabelZh: normalized.topicZh,
    weekLabelEn: normalized.topicEn,
    zhTitle: normalized.zhTitle,
    enTitle: normalized.enTitle,
    descriptionZh: normalized.descriptionZh,
    descriptionEn: normalized.descriptionEn,
    tags: normalized.tags,
    topicZh: normalized.topicZh,
    order: normalized.order,
  };
}

function sortRows(rows: HomeCloudNoteItem[]): HomeCloudNoteItem[] {
  return [...rows].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

export function HomeCloudNotesSections() {
  const { isReady, session } = useAuth();
  const authToken = session?.token ?? "";
  const [notes, setNotes] = useState<HomeCloudNoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CLOUD_API_BASE) {
      setError("未配置 NEXT_PUBLIC_NOTES_API_BASE，无法读取云端笔记。");
      setNotes([]);
      return;
    }

    if (!isReady) {
      return;
    }

    if (!authToken) {
      setNotes([]);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;

    async function loadCloudNotes() {
      setLoading(true);
      setError("");
      try {
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        const response = await fetch(`${apiBase}/notes?limit=200&include_content=1`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        const json = (await response.json().catch(() => null)) as NotesApiResponse | null;
        if (!response.ok || !json?.success || !Array.isArray(json.notes)) {
          throw new Error(json?.error || "云端笔记加载失败。");
        }

        const mapped = json.notes
          .map((row) => toHomeCloudNoteItem(row as CloudNoteRecord))
          .filter((row): row is HomeCloudNoteItem => row !== null);

        if (!cancelled) {
          setNotes(sortRows(mapped));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "云端笔记加载失败。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCloudNotes();

    return () => {
      cancelled = true;
    };
  }, [isReady, authToken]);

  const topics = useMemo(() => {
    const unique = new Set<string>();
    for (const note of notes) {
      const topic = note.topicZh.trim();
      if (topic) {
        unique.add(topic);
      }
    }
    return Array.from(unique).slice(0, 12);
  }, [notes]);

  if (!isReady) {
    return (
      <section className="section-light py-16">
        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
          <article className="rounded-apple bg-card p-6 text-card-foreground shadow-card">
            <p className="font-text text-[15px] text-muted-foreground">正在检查登录状态...</p>
          </article>
        </div>
      </section>
    );
  }

  if (!session?.token) {
    return (
      <section className="section-light py-16">
        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
          <LoginRequiredCard
            redirectTo="/"
            titleZh="登录后查看我的笔记"
            titleEn="Sign In to Open My Notes"
            descriptionZh="首页的“我的笔记”仅展示当前账号创建的云端笔记。"
            descriptionEn="The homepage note archive only shows cloud notes created by your current account."
          />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="section-light py-16">
        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[40px] font-semibold leading-[1.1] text-foreground">
                我的笔记
                <span className="ui-en mt-1 block text-[0.52em] font-normal text-muted-foreground">My Notes</span>
              </h2>
              <p className="mt-2 max-w-[720px] font-text text-[17px] leading-[1.47] text-muted-foreground">
                仅展示当前账号生成和管理的云端笔记。
                <span className="ui-en ml-1">Showing only cloud notes that belong to your account.</span>
              </p>
            </div>
          </div>

          <WeekNoteGenerator existingNotes={notes.map((note) => ({ slug: note.slug }))} />

          {loading ? (
            <p className="mb-4 font-text text-[14px] text-primary">正在加载云端笔记...</p>
          ) : null}

          {error ? (
            <p className="mb-4 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-4 py-3 font-text text-[14px] leading-[1.45] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
              {error}
            </p>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <WeekCard
                key={note.slug}
                href={note.href}
                weekLabelZh={note.weekLabelZh}
                weekLabelEn={note.weekLabelEn}
                zhTitle={note.zhTitle}
                enTitle={note.enTitle}
                descriptionZh={note.descriptionZh}
                descriptionEn={note.descriptionEn}
                tags={note.tags}
              />
            ))}
          </div>

          {!loading && !error && notes.length === 0 ? (
            <p className="mt-5 rounded-apple border border-border bg-card px-4 py-3 font-text text-[14px] leading-[1.45] text-muted-foreground">
              你还没有云端笔记，先在上方生成第一篇笔记。
            </p>
          ) : null}
        </div>
      </section>

      <section className="section-dark py-16">
        <div className="mx-auto grid w-full max-w-[1100px] gap-10 px-4 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="font-display text-[40px] font-semibold leading-[1.1] text-white">
              最近笔记主题
              <span className="ui-en mt-1 block text-[0.52em] font-normal text-white/80">Recent Topics</span>
            </h2>
            <p className="mt-3 font-text text-[17px] leading-[1.47] text-white/80">
              自动从你的云端笔记提取主题，用于快速定位与复习。
              <span className="ui-en ml-1">Auto-extracted from your own notes for quick navigation.</span>
            </p>
          </div>
          <ul className="space-y-2 rounded-apple bg-card/20 p-5">
            {topics.map((topic) => (
              <li key={topic} className="font-text text-[17px] leading-[1.47] text-white/88">
                {topic}
              </li>
            ))}
            {!topics.length ? (
              <li className="font-text text-[15px] leading-[1.45] text-white/75">暂无主题，生成笔记后会自动出现。</li>
            ) : null}
          </ul>
        </div>
      </section>
    </>
  );
}
