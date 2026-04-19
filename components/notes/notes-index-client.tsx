"use client";

import { useEffect, useMemo, useState } from "react";
import { WeekCard } from "@/components/week-card";
import {
  normalizeCloudNote,
  type CloudNoteRecord,
} from "@/lib/cloud-note-normalizer";

type NoteListItem = {
  slug: string;
  viewHref: string;
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

type InitialNoteItem = Omit<NoteListItem, "viewHref">;

type NotesApiResponse = {
  success?: boolean;
  notes?: unknown;
  error?: string;
};

type NotesIndexClientProps = {
  initialNotes: InitialNoteItem[];
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";
const CLOUD_WRITE_KEY = process.env.NEXT_PUBLIC_NOTES_WRITE_KEY?.trim() ?? "";
const IS_CLOUD_MODE = CLOUD_API_BASE.length > 0;

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function toCloudNoteItem(row: CloudNoteRecord): NoteListItem | null {
  const normalized = normalizeCloudNote(row);
  if (!normalized.slug) {
    return null;
  }

  return {
    slug: normalized.slug,
    viewHref: `/notes/cloud?slug=${encodeURIComponent(normalized.slug)}`,
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

function sortNoteItems(rows: NoteListItem[]): NoteListItem[] {
  return [...rows].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

export function NotesIndexClient({ initialNotes }: NotesIndexClientProps) {
  const [notes, setNotes] = useState<NoteListItem[]>(() =>
    sortNoteItems(
      initialNotes.map((note, index) => ({
        ...note,
        viewHref: `/notes/${note.slug}`,
        order: Number.isFinite(note.order) ? note.order : index,
      })),
    ),
  );
  const [loadingRemoteNotes, setLoadingRemoteNotes] = useState(false);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [deletingSlug, setDeletingSlug] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!IS_CLOUD_MODE) {
      return;
    }

    let cancelled = false;

    async function loadCloudNotes() {
      setLoadingRemoteNotes(true);
      setError("");

      try {
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        const response = await fetch(`${apiBase}/notes?limit=200&include_content=1`, {
          method: "GET",
          cache: "no-store",
        });

        const json = (await response.json().catch(() => null)) as NotesApiResponse | null;
        if (!response.ok || !json?.success || !Array.isArray(json.notes)) {
          throw new Error(json?.error || "云端笔记列表加载失败。");
        }

        const mapped = json.notes
          .map((item) => toCloudNoteItem(item as CloudNoteRecord))
          .filter((item): item is NoteListItem => item !== null);

        if (!cancelled) {
          setNotes(sortNoteItems(mapped));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "云端笔记列表加载失败。");
        }
      } finally {
        if (!cancelled) {
          setLoadingRemoteNotes(false);
        }
      }
    }

    loadCloudNotes();

    return () => {
      cancelled = true;
    };
  }, []);

  const topicOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const note of notes) {
      const value = note.topicZh.trim();
      if (value) {
        unique.add(value);
      }
    }

    return Array.from(unique).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [notes]);

  const tagOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const note of notes) {
      for (const tag of note.tags) {
        const value = tag.trim();
        if (value) {
          unique.add(value);
        }
      }
    }

    return Array.from(unique).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return notes.filter((note) => {
      if (topicFilter && note.topicZh !== topicFilter) {
        return false;
      }

      if (tagFilter && !note.tags.includes(tagFilter)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystack = [note.zhTitle, note.enTitle, note.descriptionZh, note.descriptionEn, note.weekLabelZh, note.weekLabelEn, note.tags.join(" ")]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [notes, search, topicFilter, tagFilter]);

  async function handleDeleteNote(note: NoteListItem) {
    if (deletingSlug) {
      return;
    }

    const shouldDelete = window.confirm(`确认删除笔记“${note.zhTitle}”吗？该操作不可恢复。`);
    if (!shouldDelete) {
      return;
    }

    setError("");
    setDeletingSlug(note.slug);

    try {
      let response: Response;

      if (IS_CLOUD_MODE) {
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        const headers: Record<string, string> = {};
        if (CLOUD_WRITE_KEY) {
          headers["X-Notes-Write-Key"] = CLOUD_WRITE_KEY;
        }

        response = await fetch(`${apiBase}/notes/${encodeURIComponent(note.slug)}`, {
          method: "DELETE",
          headers,
        });
      } else {
        response = await fetch(`/api/notes?slug=${encodeURIComponent(note.slug)}`, {
          method: "DELETE",
        });
      }

      const json = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "删除失败，请稍后重试。");
      }

      setNotes((prev) => prev.filter((item) => item.slug !== note.slug));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后重试。");
    } finally {
      setDeletingSlug("");
    }
  }

  function resetFilters() {
    setSearch("");
    setTopicFilter("");
    setTagFilter("");
  }

  return (
    <>
      <section className="mb-6 rounded-apple bg-white p-4 shadow-card dark:bg-[#272729]">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 md:col-span-2">
            <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">关键词</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索标题、主题或标签"
              className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[14px] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
            />
          </label>

          <label className="space-y-1">
            <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">主题</span>
            <select
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
              className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[14px] text-black/85 outline-none transition focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86"
            >
              <option value="">全部主题</option>
              {topicOptions.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">标签</span>
            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[14px] text-black/85 outline-none transition focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86"
            >
              <option value="">全部标签</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center rounded-capsule border border-black/20 px-3 py-1.5 font-text text-[13px] tracking-tightCaption text-black/75 transition hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/22 dark:text-white/78 dark:hover:bg-white/[0.06]"
          >
            清空筛选
          </button>
          <p className="font-text text-[13px] text-black/65 dark:text-white/68">
            共 {filteredNotes.length} / {notes.length} 条
          </p>
          {loadingRemoteNotes ? <p className="font-text text-[13px] text-[#0066cc] dark:text-[#2997ff]">正在加载云端笔记...</p> : null}
        </div>

        {IS_CLOUD_MODE && !CLOUD_WRITE_KEY ? (
          <p className="mt-2 font-text text-[12px] leading-[1.45] text-black/58 dark:text-white/62">
            当前为云端模式。若 Worker 开启了 WRITE_API_KEY，请同步配置 NEXT_PUBLIC_NOTES_WRITE_KEY 以启用浏览器端删除。
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
            {error}
          </p>
        ) : null}
      </section>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {filteredNotes.map((note) => (
          <WeekCard
            key={note.slug}
            href={note.viewHref}
            weekLabelZh={note.weekLabelZh}
            weekLabelEn={note.weekLabelEn}
            zhTitle={note.zhTitle}
            enTitle={note.enTitle}
            descriptionZh={note.descriptionZh}
            descriptionEn={note.descriptionEn}
            tags={note.tags}
            footerAction={
              <button
                type="button"
                disabled={deletingSlug === note.slug}
                onClick={() => handleDeleteNote(note)}
                className="inline-flex items-center rounded-capsule border border-[#b4232f]/35 px-3 py-1.5 font-text text-[13px] tracking-tightCaption text-[#8f1d27] transition hover:bg-[#b4232f]/[0.08] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4232f] dark:border-[#ff6a77]/40 dark:text-[#ffc4cb] dark:hover:bg-[#ff6a77]/[0.12]"
              >
                {deletingSlug === note.slug ? "删除中..." : "删除"}
              </button>
            }
          />
        ))}
      </div>

      {!filteredNotes.length ? (
        <p className="mt-6 rounded-apple border border-black/12 bg-white px-4 py-3 font-text text-[14px] leading-[1.45] text-black/72 dark:border-white/15 dark:bg-[#272729] dark:text-white/74">
          没有匹配当前筛选条件的笔记，请调整关键词、主题或标签。
        </p>
      ) : null}
    </>
  );
}
