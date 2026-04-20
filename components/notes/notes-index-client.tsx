"use client";

import { useEffect, useMemo, useState } from "react";
import { LoginRequiredCard } from "@/components/auth/login-required-card";
import { useAuth } from "@/components/auth/auth-provider";
import { WeekCard } from "@/components/week-card";
import { normalizeCloudNote, type CloudNoteRecord } from "@/lib/cloud-note-normalizer";

type NoteListItem = {
  slug: string;
  viewHref: string;
  folderId: string;
  weekLabelZh: string;
  weekLabelEn: string;
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  topicZh: string;
  order: number;
};

type InitialNoteItem = Omit<NoteListItem, "viewHref" | "folderId">;

type NotesApiResponse = {
  success?: boolean;
  notes?: unknown;
  error?: string;
};

type CloudFolderRecord = {
  id?: unknown;
  name?: unknown;
  sort_order?: unknown;
};

type FoldersApiResponse = {
  success?: boolean;
  folders?: unknown;
  folder?: unknown;
  error?: string;
};

type NotesIndexClientProps = {
  initialNotes: InitialNoteItem[];
};

type FolderItem = {
  id: string;
  name: string;
  order: number;
};

type FolderStorePayload = {
  version: 1;
  folders: FolderItem[];
  noteFolderMap: Record<string, string>;
};

type FolderFilterValue = "" | "uncategorized" | `folder:${string}`;

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";
const IS_CLOUD_MODE = CLOUD_API_BASE.length > 0;
const FOLDER_STORE_VERSION = 1;
const FOLDER_NAME_MAX_LENGTH = 24;

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function sortNoteItems(rows: NoteListItem[]): NoteListItem[] {
  return [...rows].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

function sortFolders(rows: FolderItem[]): FolderItem[] {
  return [...rows].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function sanitizeFolderName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function buildFolderStorageKey(params: { cloudMode: boolean; userId?: number }): string {
  const scope = params.cloudMode ? `cloud:${params.userId ?? "anonymous"}` : "local";
  return `yynotes.note-folders.v1:${scope}`;
}

function parseFolderStore(raw: string | null): FolderStorePayload | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<FolderStorePayload> | null;
    if (!parsed || parsed.version !== FOLDER_STORE_VERSION) {
      return null;
    }

    const folders = Array.isArray(parsed.folders)
      ? parsed.folders
          .map((folder, index) => {
            const id = String(folder?.id ?? "").trim();
            const name = sanitizeFolderName(String(folder?.name ?? ""));
            const order = Number.isFinite(folder?.order) ? Number(folder?.order) : index;
            if (!id || !name) {
              return null;
            }
            return { id, name, order };
          })
          .filter((item): item is FolderItem => item !== null)
      : [];

    const noteFolderMap: Record<string, string> = {};
    if (parsed.noteFolderMap && typeof parsed.noteFolderMap === "object") {
      for (const [slug, folderId] of Object.entries(parsed.noteFolderMap)) {
        const safeSlug = String(slug).trim();
        const safeFolderId = String(folderId ?? "").trim();
        if (!safeSlug || !safeFolderId) {
          continue;
        }
        noteFolderMap[safeSlug] = safeFolderId;
      }
    }

    return {
      version: FOLDER_STORE_VERSION,
      folders: sortFolders(folders),
      noteFolderMap,
    };
  } catch {
    return null;
  }
}

function createFolderId(name: string): string {
  const safePart = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const stamp = Date.now().toString(36);
  return safePart ? `folder-${safePart}-${stamp}` : `folder-${stamp}`;
}

function extractDraggedSlug(event: React.DragEvent<HTMLElement>, fallback: string): string {
  const custom = event.dataTransfer.getData("text/yynotes-note-slug").trim();
  if (custom) {
    return custom;
  }

  const plain = event.dataTransfer.getData("text/plain").trim();
  if (plain) {
    return plain;
  }

  return fallback;
}

function toCloudNoteItem(row: CloudNoteRecord): NoteListItem | null {
  const normalized = normalizeCloudNote(row);
  if (!normalized.slug) {
    return null;
  }

  const folderIdParsed = Number(row.folder_id);
  const folderId = Number.isInteger(folderIdParsed) && folderIdParsed > 0 ? String(folderIdParsed) : "";

  return {
    slug: normalized.slug,
    viewHref: `/notes/cloud?slug=${encodeURIComponent(normalized.slug)}`,
    folderId,
    weekLabelZh: normalized.topicZh,
    weekLabelEn: normalized.topicEn,
    zhTitle: normalized.zhTitle,
    enTitle: normalized.enTitle,
    descriptionZh: normalized.descriptionZh,
    descriptionEn: normalized.descriptionEn,
    topicZh: normalized.topicZh,
    order: normalized.order,
  };
}

function toFolderItem(row: CloudFolderRecord): FolderItem | null {
  const idNumber = Number(row.id);
  const id = Number.isInteger(idNumber) && idNumber > 0 ? String(idNumber) : "";
  const name = sanitizeFolderName(String(row.name ?? ""));
  const orderNumber = Number(row.sort_order);
  const order = Number.isFinite(orderNumber) ? Math.max(0, Math.floor(orderNumber)) : 0;

  if (!id || !name) {
    return null;
  }

  return { id, name, order };
}

export function NotesIndexClient({ initialNotes }: NotesIndexClientProps) {
  const { isReady, session } = useAuth();
  const authToken = session?.token ?? "";

  const [notes, setNotes] = useState<NoteListItem[]>(() =>
    IS_CLOUD_MODE
      ? []
      : sortNoteItems(
          initialNotes.map((note, index) => ({
            ...note,
            viewHref: `/notes/${note.slug}`,
            folderId: "",
            order: Number.isFinite(note.order) ? note.order : index,
          })),
        ),
  );
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [noteFolderMap, setNoteFolderMap] = useState<Record<string, string>>({});

  const [loadingRemoteNotes, setLoadingRemoteNotes] = useState(false);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState<FolderFilterValue>("");
  const [deletingSlug, setDeletingSlug] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [assigningSlug, setAssigningSlug] = useState("");
  const [deletingFolderId, setDeletingFolderId] = useState("");
  const [draggingSlug, setDraggingSlug] = useState("");
  const [dragOverTarget, setDragOverTarget] = useState<string>("");
  const [error, setError] = useState("");

  const folderStorageKey = useMemo(
    () =>
      buildFolderStorageKey({
        cloudMode: IS_CLOUD_MODE,
        userId: session?.user?.id,
      }),
    [session?.user?.id],
  );

  useEffect(() => {
    if (!IS_CLOUD_MODE) {
      return;
    }

    if (!isReady) {
      return;
    }

    if (!authToken) {
      setNotes([]);
      setFolders([]);
      setNoteFolderMap({});
      setError("");
      setLoadingRemoteNotes(false);
      return;
    }

    let cancelled = false;

    async function loadCloudData() {
      setLoadingRemoteNotes(true);
      setError("");

      try {
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        const headers = {
          Authorization: `Bearer ${authToken}`,
        };

        const [notesResponse, foldersResponse] = await Promise.all([
          fetch(`${apiBase}/notes?limit=200&include_content=1`, {
            method: "GET",
            cache: "no-store",
            headers,
          }),
          fetch(`${apiBase}/folders`, {
            method: "GET",
            cache: "no-store",
            headers,
          }),
        ]);

        const notesJson = (await notesResponse.json().catch(() => null)) as NotesApiResponse | null;
        if (!notesResponse.ok || !notesJson?.success || !Array.isArray(notesJson.notes)) {
          throw new Error(notesJson?.error || "云端笔记列表加载失败。");
        }

        const foldersJson = (await foldersResponse.json().catch(() => null)) as FoldersApiResponse | null;
        if (!foldersResponse.ok || !foldersJson?.success || !Array.isArray(foldersJson.folders)) {
          throw new Error(foldersJson?.error || "云端文件夹列表加载失败。");
        }

        const mappedNotes = notesJson.notes
          .map((item) => toCloudNoteItem(item as CloudNoteRecord))
          .filter((item): item is NoteListItem => item !== null);
        const mappedFolders = foldersJson.folders
          .map((item) => toFolderItem(item as CloudFolderRecord))
          .filter((item): item is FolderItem => item !== null);

        const nextNoteFolderMap: Record<string, string> = {};
        for (const note of mappedNotes) {
          if (note.folderId) {
            nextNoteFolderMap[note.slug] = note.folderId;
          }
        }

        if (!cancelled) {
          setNotes(sortNoteItems(mappedNotes));
          setFolders(sortFolders(mappedFolders));
          setNoteFolderMap(nextNoteFolderMap);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "云端数据加载失败。");
        }
      } finally {
        if (!cancelled) {
          setLoadingRemoteNotes(false);
        }
      }
    }

    loadCloudData();

    return () => {
      cancelled = true;
    };
  }, [isReady, authToken]);

  useEffect(() => {
    if (typeof window === "undefined" || IS_CLOUD_MODE) {
      return;
    }

    const parsed = parseFolderStore(window.localStorage.getItem(folderStorageKey));
    if (!parsed) {
      setFolders([]);
      setNoteFolderMap({});
      return;
    }

    setFolders(parsed.folders);
    setNoteFolderMap(parsed.noteFolderMap);
  }, [folderStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || IS_CLOUD_MODE) {
      return;
    }

    const payload: FolderStorePayload = {
      version: FOLDER_STORE_VERSION,
      folders: sortFolders(folders),
      noteFolderMap,
    };
    window.localStorage.setItem(folderStorageKey, JSON.stringify(payload));
  }, [folders, noteFolderMap, folderStorageKey]);

  useEffect(() => {
    const knownSlugs = new Set(notes.map((note) => note.slug));
    const knownFolderIds = new Set(folders.map((folder) => folder.id));

    setNoteFolderMap((previous) => {
      let changed = false;
      const next: Record<string, string> = {};

      for (const [slug, folderId] of Object.entries(previous)) {
        if (!knownSlugs.has(slug) || !knownFolderIds.has(folderId)) {
          changed = true;
          continue;
        }
        next[slug] = folderId;
      }

      return changed ? next : previous;
    });
  }, [notes, folders]);

  const folderById = useMemo(() => {
    const map = new Map<string, FolderItem>();
    for (const folder of folders) {
      map.set(folder.id, folder);
    }
    return map;
  }, [folders]);

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

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of notes) {
      const folderId = noteFolderMap[note.slug] ?? "";
      const key = folderId || "uncategorized";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [notes, noteFolderMap]);

  const filteredNotes = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!folderFilter) {
      return [];
    }

    return notes.filter((note) => {
      const noteFolderId = noteFolderMap[note.slug] ?? "";

      if (folderFilter === "uncategorized" && noteFolderId) {
        return false;
      }

      if (folderFilter.startsWith("folder:") && noteFolderId !== folderFilter.slice("folder:".length)) {
        return false;
      }

      if (topicFilter && note.topicZh !== topicFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const folderName = noteFolderId ? folderById.get(noteFolderId)?.name ?? "" : "";
      const haystack = [
        note.zhTitle,
        note.enTitle,
        note.descriptionZh,
        note.descriptionEn,
        note.weekLabelZh,
        note.weekLabelEn,
        folderName,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [notes, noteFolderMap, folderFilter, topicFilter, search, folderById]);

  const activeFolderLabel = useMemo(() => {
    if (folderFilter === "uncategorized") {
      return "未归类";
    }
    if (folderFilter.startsWith("folder:")) {
      return folderById.get(folderFilter.slice("folder:".length))?.name ?? "文件夹";
    }
    return "";
  }, [folderFilter, folderById]);

  function updateLocalFolderMapping(noteSlug: string, folderId: string) {
    setNoteFolderMap((previous) => {
      const current = previous[noteSlug] ?? "";
      if (current === folderId) {
        return previous;
      }

      const next = { ...previous };
      if (!folderId) {
        delete next[noteSlug];
      } else {
        next[noteSlug] = folderId;
      }
      return next;
    });
  }

  async function assignFolder(noteSlug: string, folderId: string | null) {
    const normalized = folderId?.trim() ?? "";
    const previousFolderId = noteFolderMap[noteSlug] ?? "";
    if (previousFolderId === normalized) {
      return;
    }

    if (!IS_CLOUD_MODE) {
      updateLocalFolderMapping(noteSlug, normalized);
      return;
    }

    if (!authToken) {
      setError("登录状态已失效，请重新登录。");
      return;
    }

    setAssigningSlug(noteSlug);
    setError("");
    updateLocalFolderMapping(noteSlug, normalized);

    try {
      const apiBase = normalizeApiBase(CLOUD_API_BASE);
      const response = await fetch(`${apiBase}/notes/${encodeURIComponent(noteSlug)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          folderId: normalized ? Number(normalized) : null,
        }),
      });

      const json = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "保存文件夹归类失败。");
      }
    } catch (assignError) {
      updateLocalFolderMapping(noteSlug, previousFolderId);
      setError(assignError instanceof Error ? assignError.message : "保存文件夹归类失败。");
    } finally {
      setAssigningSlug("");
    }
  }

  async function handleCreateFolder(rawName: string) {
    const name = sanitizeFolderName(rawName);
    if (!name) {
      setError("请输入文件夹名称。");
      return;
    }

    if (name.length > FOLDER_NAME_MAX_LENGTH) {
      setError(`文件夹名称最多 ${FOLDER_NAME_MAX_LENGTH} 个字符。`);
      return;
    }

    if (folders.some((folder) => folder.name.toLowerCase() === name.toLowerCase())) {
      setError("该文件夹名称已存在。");
      return;
    }

    if (!IS_CLOUD_MODE) {
      setError("");
      setFolders((previous) =>
        sortFolders([
          ...previous,
          {
            id: createFolderId(name),
            name,
            order: previous.length ? Math.max(...previous.map((item) => item.order)) + 1 : 0,
          },
        ]),
      );
      return;
    }

    if (!authToken) {
      setError("登录状态已失效，请重新登录。");
      return;
    }

    setCreatingFolder(true);
    setError("");

    try {
      const apiBase = normalizeApiBase(CLOUD_API_BASE);
      const response = await fetch(`${apiBase}/folders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name }),
      });

      const json = (await response.json().catch(() => null)) as FoldersApiResponse | null;
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "创建云端文件夹失败。");
      }

      const folder = toFolderItem((json.folder ?? null) as CloudFolderRecord);
      if (!folder) {
        throw new Error("云端返回了无效的文件夹数据。");
      }

      setFolders((previous) => sortFolders([...previous, folder]));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建云端文件夹失败。");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleDeleteFolder(folder: FolderItem) {
    const shouldDelete = window.confirm(`确认删除文件夹“${folder.name}”吗？该文件夹下笔记将变为未归类。`);
    if (!shouldDelete) {
      return;
    }

    if (IS_CLOUD_MODE) {
      if (!authToken) {
        setError("登录状态已失效，请重新登录。");
        return;
      }

      setDeletingFolderId(folder.id);
      setError("");
      try {
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        const response = await fetch(`${apiBase}/folders/${encodeURIComponent(folder.id)}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        const json = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!response.ok || !json?.success) {
          throw new Error(json?.error || "删除云端文件夹失败。");
        }
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "删除云端文件夹失败。");
        setDeletingFolderId("");
        return;
      } finally {
        setDeletingFolderId("");
      }
    }

    setFolders((previous) => previous.filter((item) => item.id !== folder.id));
    setNoteFolderMap((previous) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [slug, folderId] of Object.entries(previous)) {
        if (folderId === folder.id) {
          changed = true;
          continue;
        }
        next[slug] = folderId;
      }
      return changed ? next : previous;
    });

    if (folderFilter === `folder:${folder.id}`) {
      setFolderFilter("");
    }
  }

  async function handleFolderDrop(folderId: string | null, event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const slug = extractDraggedSlug(event, draggingSlug);
    if (!slug) {
      return;
    }

    await assignFolder(slug, folderId);
    setDragOverTarget("");
    setDraggingSlug("");
  }

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
        if (!authToken) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        response = await fetch(`${apiBase}/notes/${encodeURIComponent(note.slug)}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
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

      setNotes((previous) => previous.filter((item) => item.slug !== note.slug));
      setNoteFolderMap((previous) => {
        if (!(note.slug in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[note.slug];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后重试。");
    } finally {
      setDeletingSlug("");
    }
  }

  function resetFilters() {
    setSearch("");
    setTopicFilter("");
  }

  function handleSelectFolder(next: FolderFilterValue) {
    setFolderFilter((current) => (current === next ? "" : next));
  }

  function handleCreateFolderButtonClick() {
    if (creatingFolder) {
      return;
    }

    const input = window.prompt(`请输入文件夹名称（最多 ${FOLDER_NAME_MAX_LENGTH} 个字符）`, "");
    if (input === null) {
      return;
    }

    void handleCreateFolder(input);
  }

  if (IS_CLOUD_MODE && !isReady) {
    return (
      <article className="rounded-apple bg-white p-6 shadow-card dark:bg-[#272729]">
        <p className="font-text text-[15px] text-black/72 dark:text-white/75">正在检查登录状态...</p>
      </article>
    );
  }

  if (IS_CLOUD_MODE && isReady && !authToken) {
    return <LoginRequiredCard redirectTo="/notes" />;
  }

  return (
    <>
      <section className="mb-6 rounded-apple bg-white p-4 shadow-card dark:bg-[#272729]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={creatingFolder}
            onClick={handleCreateFolderButtonClick}
            className="inline-flex h-[38px] items-center rounded-capsule border border-[#0066cc] px-4 font-text text-[14px] tracking-tightCaption text-[#0066cc] transition hover:bg-[#0066cc]/[0.08] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff] dark:hover:bg-[#2997ff]/[0.14]"
          >
            {creatingFolder ? "创建中..." : "新建文件夹"}
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center rounded-capsule border border-black/20 px-3 py-1.5 font-text text-[13px] tracking-tightCaption text-black/75 transition hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/22 dark:text-white/78 dark:hover:bg-white/[0.06]"
          >
            清空关键词/主题
          </button>
          <p className="font-text text-[13px] text-black/65 dark:text-white/68">
            总笔记 {notes.length} 条
          </p>
          {loadingRemoteNotes ? <p className="font-text text-[13px] text-[#0066cc] dark:text-[#2997ff]">正在加载云端数据...</p> : null}
        </div>

        {error ? (
          <p className="mt-3 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
            {error}
          </p>
        ) : null}
        <p className="mt-3 font-text text-[13px] text-black/65 dark:text-white/70">点击文件夹即可在下方查看对应笔记，点击同一文件夹可收起。</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleSelectFolder("uncategorized")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelectFolder("uncategorized");
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverTarget("uncategorized");
            }}
            onDragLeave={() => setDragOverTarget((previous) => (previous === "uncategorized" ? "" : previous))}
            onDrop={(event) => void handleFolderDrop(null, event)}
            className={`rounded-apple border px-3 py-3 transition ${
              folderFilter === "uncategorized"
                ? "border-[#0071e3] bg-[#0071e3]/[0.1] dark:border-[#2997ff] dark:bg-[#2997ff]/[0.18]"
                : dragOverTarget === "uncategorized"
                ? "border-[#0071e3] bg-[#0071e3]/[0.08] dark:border-[#2997ff] dark:bg-[#2997ff]/[0.16]"
                : "border-black/12 bg-black/[0.02] dark:border-white/16 dark:bg-white/[0.04]"
            }`}
          >
            <p className="font-text text-[13px] font-semibold text-black/80 dark:text-white/84">
              未归类
              <span className="ui-en ml-1 text-black/62 dark:text-white/66">Uncategorized</span>
            </p>
            <p className="mt-1 font-text text-[12px] text-black/62 dark:text-white/68">{folderCounts.uncategorized ?? 0} 条笔记</p>
          </div>

          {folders.map((folder) => (
            <div
              key={folder.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectFolder(`folder:${folder.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelectFolder(`folder:${folder.id}`);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverTarget(folder.id);
              }}
              onDragLeave={() => setDragOverTarget((previous) => (previous === folder.id ? "" : previous))}
              onDrop={(event) => void handleFolderDrop(folder.id, event)}
              className={`rounded-apple border px-3 py-3 transition ${
                folderFilter === `folder:${folder.id}`
                  ? "border-[#0071e3] bg-[#0071e3]/[0.1] dark:border-[#2997ff] dark:bg-[#2997ff]/[0.18]"
                  : dragOverTarget === folder.id
                  ? "border-[#0071e3] bg-[#0071e3]/[0.08] dark:border-[#2997ff] dark:bg-[#2997ff]/[0.16]"
                  : "border-black/12 bg-black/[0.02] dark:border-white/16 dark:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-text text-[13px] font-semibold text-black/80 dark:text-white/84">{folder.name}</p>
                <button
                  type="button"
                  disabled={deletingFolderId === folder.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteFolder(folder);
                  }}
                  className="inline-flex items-center rounded-capsule border border-[#b4232f]/35 px-2 py-0.5 font-text text-[11px] tracking-tightCaption text-[#8f1d27] transition hover:bg-[#b4232f]/[0.08] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4232f] dark:border-[#ff6a77]/40 dark:text-[#ffc4cb] dark:hover:bg-[#ff6a77]/[0.12]"
                >
                  {deletingFolderId === folder.id ? "删除中..." : "删除"}
                </button>
              </div>
              <p className="mt-1 font-text text-[12px] text-black/62 dark:text-white/68">{folderCounts[folder.id] ?? 0} 条笔记</p>
            </div>
          ))}
        </div>
      </section>

      {folderFilter ? (
        <>
          <section className="mb-6 rounded-apple bg-white p-4 shadow-card dark:bg-[#272729]">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 md:col-span-2">
                <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">关键词</span>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索标题、主题或文件夹"
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
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="font-text text-[13px] text-black/65 dark:text-white/68">
                当前文件夹：{activeFolderLabel}，共 {filteredNotes.length} 条
              </p>
            </div>
          </section>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredNotes.map((note) => {
              const noteFolderId = noteFolderMap[note.slug] ?? "";
              const noteFolderName = noteFolderId ? folderById.get(noteFolderId)?.name ?? "" : "";
              const isDragging = draggingSlug === note.slug;

              return (
                <div
                  key={note.slug}
                  draggable
                  onDragStart={(event) => {
                    setDraggingSlug(note.slug);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/yynotes-note-slug", note.slug);
                    event.dataTransfer.setData("text/plain", note.slug);
                  }}
                  onDragEnd={() => {
                    setDraggingSlug("");
                    setDragOverTarget("");
                  }}
                  className={`transition ${isDragging ? "opacity-60" : ""}`}
                  title="拖拽到上方文件夹可归类"
                >
                  <WeekCard
                    href={note.viewHref}
                    weekLabelZh={note.weekLabelZh}
                    weekLabelEn={note.weekLabelEn}
                    zhTitle={note.zhTitle}
                    enTitle={note.enTitle}
                    descriptionZh={note.descriptionZh}
                    descriptionEn={note.descriptionEn}
                    tags={[]}
                    footerAction={
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={noteFolderId}
                          disabled={assigningSlug === note.slug}
                          onChange={(event) => void assignFolder(note.slug, event.target.value || null)}
                          onClick={(event) => event.stopPropagation()}
                          className="max-w-[180px] rounded-capsule border border-black/20 bg-white px-3 py-1.5 font-text text-[12px] text-black/78 outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/22 dark:bg-[#202022] dark:text-white/80"
                        >
                          <option value="">未归类</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={deletingSlug === note.slug}
                          onClick={() => handleDeleteNote(note)}
                          className="inline-flex items-center rounded-capsule border border-[#b4232f]/35 px-3 py-1.5 font-text text-[13px] tracking-tightCaption text-[#8f1d27] transition hover:bg-[#b4232f]/[0.08] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4232f] dark:border-[#ff6a77]/40 dark:text-[#ffc4cb] dark:hover:bg-[#ff6a77]/[0.12]"
                        >
                          {deletingSlug === note.slug ? "删除中..." : "删除"}
                        </button>
                        <span className="font-text text-[12px] text-black/60 dark:text-white/66">
                          {noteFolderName ? `文件夹：${noteFolderName}` : "文件夹：未归类"}
                        </span>
                      </div>
                    }
                  />
                </div>
              );
            })}
          </div>

          {!filteredNotes.length ? (
            <p className="mt-6 rounded-apple border border-black/12 bg-white px-4 py-3 font-text text-[14px] leading-[1.45] text-black/72 dark:border-white/15 dark:bg-[#272729] dark:text-white/74">
              当前文件夹下没有匹配条件的笔记，请调整关键词或主题。
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 rounded-apple border border-black/12 bg-white px-4 py-3 font-text text-[14px] leading-[1.45] text-black/72 dark:border-white/15 dark:bg-[#272729] dark:text-white/74">
          请先点击上方文件夹（或未归类）查看对应笔记。
        </p>
      )}
    </>
  );
}

