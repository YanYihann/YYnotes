"use client";

import Link from "next/link";
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

type NoteUpdateResponse = {
  success?: boolean;
  note?: {
    slug?: string;
    zhTitle?: string;
    enTitle?: string;
    weekLabelZh?: string;
    weekLabelEn?: string;
    topicZh?: string;
  };
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

type FolderFilterValue = "all" | "uncategorized" | `folder:${string}`;

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

function sanitizeEditableText(raw: string, maxLength: number): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLength);
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
  const [trashNotes, setTrashNotes] = useState<NoteListItem[]>([]);

  const [loadingRemoteNotes, setLoadingRemoteNotes] = useState(false);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState<FolderFilterValue>("all");
  const [deletingSlug, setDeletingSlug] = useState("");
  const [restoringSlug, setRestoringSlug] = useState("");
  const [permanentlyDeletingSlug, setPermanentlyDeletingSlug] = useState("");
  const [updatingSlug, setUpdatingSlug] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState("");
  const [draggingSlug, setDraggingSlug] = useState("");
  const [dragOverTarget, setDragOverTarget] = useState<string>("");
  const [error, setError] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);

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
      setTrashNotes([]);
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

        const [notesResponse, foldersResponse, trashResponse] = await Promise.all([
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
          fetch(`${apiBase}/notes?limit=200&include_content=1&trash=1`, {
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
        const trashJson = (await trashResponse.json().catch(() => null)) as NotesApiResponse | null;
        if (!trashResponse.ok || !trashJson?.success || !Array.isArray(trashJson.notes)) {
          throw new Error(trashJson?.error || "云端回收站加载失败。");
        }

        const mappedNotes = notesJson.notes
          .map((item) => toCloudNoteItem(item as CloudNoteRecord))
          .filter((item): item is NoteListItem => item !== null);
        const mappedTrashNotes = trashJson.notes
          .map((item) => toCloudNoteItem(item as CloudNoteRecord))
          .filter((item): item is NoteListItem => item !== null);
        const mappedFolders = foldersJson.folders
          .map((item) => toFolderItem(item as CloudFolderRecord))
          .filter((item): item is FolderItem => item !== null);

        const nextNoteFolderMap: Record<string, string> = {};
        for (const note of [...mappedNotes, ...mappedTrashNotes]) {
          if (note.folderId) {
            nextNoteFolderMap[note.slug] = note.folderId;
          }
        }

        if (!cancelled) {
          setNotes(sortNoteItems(mappedNotes));
          setTrashNotes(sortNoteItems(mappedTrashNotes));
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
    } else {
      setFolders(parsed.folders);
      setNoteFolderMap(parsed.noteFolderMap);
    }

    let cancelled = false;

    async function loadLocalTrash() {
      try {
        const response = await fetch("/api/notes?trash=1", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await response.json().catch(() => null)) as NotesApiResponse | null;
        if (!response.ok || !json?.success || !Array.isArray(json.notes)) {
          throw new Error(json?.error || "本地回收站加载失败。");
        }

        const rows = json.notes
          .map((item) => item as InitialNoteItem)
          .map((note, index) => ({
            ...note,
            viewHref: `/notes/${note.slug}`,
            folderId: "",
            order: Number.isFinite(note.order) ? note.order : index,
          }));

        if (!cancelled) {
          setTrashNotes(sortNoteItems(rows));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "本地回收站加载失败。");
        }
      }
    }

    void loadLocalTrash();

    return () => {
      cancelled = true;
    };
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
    const knownSlugs = new Set([...notes, ...trashNotes].map((note) => note.slug));
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
  }, [notes, trashNotes, folders]);

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
    if (folderFilter === "all") {
      return "全部笔记";
    }
    if (folderFilter === "uncategorized") {
      return "未归类";
    }
    if (folderFilter.startsWith("folder:")) {
      return folderById.get(folderFilter.slice("folder:".length))?.name ?? "文件夹";
    }
    return "全部笔记";
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

  function renameNoteFolderMapping(previousSlug: string, nextSlug: string) {
    if (previousSlug === nextSlug) {
      return;
    }

    setNoteFolderMap((previous) => {
      if (!(previousSlug in previous)) {
        return previous;
      }

      const next = { ...previous };
      next[nextSlug] = next[previousSlug];
      delete next[previousSlug];
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
      setFolderFilter("all");
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

  async function handleEditNote(note: NoteListItem) {
    if (deletingSlug || updatingSlug) {
      return;
    }

    const combinedInput = window.prompt("请输入“标题 | 主题”", `${note.zhTitle} | ${note.topicZh || note.weekLabelZh}`);
    if (combinedInput === null) {
      return;
    }

    const [titlePart, ...topicParts] = combinedInput.split("|");
    const nextTitle = sanitizeEditableText(titlePart ?? "", 80);
    if (!nextTitle) {
      setError("标题不能为空。");
      return;
    }

    const nextTopic = sanitizeEditableText(topicParts.join("|"), 64);
    if (!nextTopic) {
      setError("主题不能为空。");
      return;
    }

    setUpdatingSlug(note.slug);
    setError("");

    try {
      let response: Response;

      if (IS_CLOUD_MODE) {
        if (!authToken) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        response = await fetch(`${apiBase}/notes/${encodeURIComponent(note.slug)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            title: nextTitle,
            topic: nextTopic,
          }),
        });
      } else {
        response = await fetch(`/api/notes?slug=${encodeURIComponent(note.slug)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: nextTitle,
            topic: nextTopic,
          }),
        });
      }

      const json = (await response.json().catch(() => null)) as NoteUpdateResponse | null;
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "保存笔记信息失败。");
      }

      const resolvedTitle = sanitizeEditableText(String(json.note?.zhTitle ?? nextTitle), 80) || nextTitle;
      const resolvedEnTitle = sanitizeEditableText(String(json.note?.enTitle ?? resolvedTitle), 80) || resolvedTitle;
      const resolvedTopicZh = sanitizeEditableText(String(json.note?.topicZh ?? json.note?.weekLabelZh ?? nextTopic), 64) || nextTopic;
      const resolvedWeekLabelZh = sanitizeEditableText(String(json.note?.weekLabelZh ?? resolvedTopicZh), 64) || resolvedTopicZh;
      const resolvedWeekLabelEn =
        sanitizeEditableText(String(json.note?.weekLabelEn ?? note.weekLabelEn ?? resolvedWeekLabelZh), 64) || resolvedWeekLabelZh;

      setNotes((previous) =>
        previous.map((item) =>
          item.slug === note.slug
            ? {
                ...item,
                zhTitle: resolvedTitle,
                enTitle: resolvedEnTitle,
                topicZh: resolvedTopicZh,
                weekLabelZh: resolvedWeekLabelZh,
                weekLabelEn: resolvedWeekLabelEn,
              }
            : item,
        ),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "保存笔记信息失败。");
    } finally {
      setUpdatingSlug("");
    }
  }

  async function handleDeleteNote(note: NoteListItem) {
    if (deletingSlug || updatingSlug || restoringSlug || permanentlyDeletingSlug) {
      return;
    }

    const shouldDelete = window.confirm(`确认将笔记“${note.zhTitle}”移入回收站吗？之后仍可在回收站恢复。`);
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

      const nextSlug = typeof (json as { slug?: unknown }).slug === "string" ? String((json as { slug?: string }).slug) : note.slug;
      setNotes((previous) => previous.filter((item) => item.slug !== note.slug));
      setTrashNotes((previous) =>
        sortNoteItems([
          {
            ...note,
            slug: nextSlug,
            viewHref: IS_CLOUD_MODE ? `/notes/cloud?slug=${encodeURIComponent(nextSlug)}` : `/notes/${nextSlug}`,
          },
          ...previous.filter((item) => item.slug !== nextSlug),
        ]),
      );
      renameNoteFolderMapping(note.slug, nextSlug);
      setTrashOpen(true);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后重试。");
    } finally {
      setDeletingSlug("");
    }
  }

  async function handleRestoreNote(note: NoteListItem) {
    if (restoringSlug || deletingSlug || updatingSlug || permanentlyDeletingSlug) {
      return;
    }

    setRestoringSlug(note.slug);
    setError("");

    try {
      let response: Response;

      if (IS_CLOUD_MODE) {
        if (!authToken) {
          throw new Error("登录状态已失效，请重新登录。");
        }

        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        response = await fetch(`${apiBase}/notes/${encodeURIComponent(note.slug)}/restore`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
      } else {
        response = await fetch(`/api/notes?slug=${encodeURIComponent(note.slug)}&action=restore`, {
          method: "POST",
        });
      }

      const json = (await response.json().catch(() => null)) as { success?: boolean; error?: string; slug?: string } | null;
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "恢复失败，请稍后重试。");
      }

      const nextSlug = typeof json.slug === "string" && json.slug.trim() ? json.slug.trim() : note.slug;
      setTrashNotes((previous) => previous.filter((item) => item.slug !== note.slug));
      setNotes((previous) =>
        sortNoteItems([
          {
            ...note,
            slug: nextSlug,
            viewHref: IS_CLOUD_MODE ? `/notes/cloud?slug=${encodeURIComponent(nextSlug)}` : `/notes/${nextSlug}`,
          },
          ...previous.filter((item) => item.slug !== nextSlug),
        ]),
      );
      renameNoteFolderMapping(note.slug, nextSlug);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "恢复失败，请稍后重试。");
    } finally {
      setRestoringSlug("");
    }
  }

  async function handlePermanentDeleteNote(note: NoteListItem) {
    if (permanentlyDeletingSlug || deletingSlug || updatingSlug || restoringSlug) {
      return;
    }

    const shouldDelete = window.confirm(`确认从回收站彻底删除“${note.zhTitle}”吗？该操作将无法恢复。`);
    if (!shouldDelete) {
      return;
    }

    setPermanentlyDeletingSlug(note.slug);
    setError("");

    try {
      let response: Response;

      if (IS_CLOUD_MODE) {
        if (!authToken) {
          throw new Error("登录状态已失效，请重新登录。");
        }
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        response = await fetch(`${apiBase}/notes/${encodeURIComponent(note.slug)}?permanent=1`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
      } else {
        response = await fetch(`/api/notes?slug=${encodeURIComponent(note.slug)}&permanent=1`, {
          method: "DELETE",
        });
      }

      const json = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "彻底删除失败，请稍后重试。");
      }

      setTrashNotes((previous) => previous.filter((item) => item.slug !== note.slug));
      setNoteFolderMap((previous) => {
        if (!(note.slug in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[note.slug];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "彻底删除失败，请稍后重试。");
    } finally {
      setPermanentlyDeletingSlug("");
    }
  }

  function handleSelectFolder(next: FolderFilterValue) {
    setFolderFilter((current) => (next === "all" ? "all" : current === next ? "all" : next));
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
      <article className="rounded-apple bg-card p-6 text-card-foreground shadow-card">
        <p className="font-text text-[15px] text-muted-foreground">正在检查登录状态...</p>
      </article>
    );
  }

  if (IS_CLOUD_MODE && isReady && !authToken) {
    return <LoginRequiredCard redirectTo="/notes" />;
  }

  return (
    <>
      <div className="sticky top-[calc(3rem+0.75rem)] z-30 mb-6 space-y-4">
        <section className="rounded-apple bg-card p-4 text-card-foreground shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={creatingFolder}
              onClick={handleCreateFolderButtonClick}
              className="btn-apple-link inline-flex h-[38px] items-center px-4 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
            >
              {creatingFolder ? "创建中..." : "新建文件夹"}
            </button>
            <p className="font-text text-[13px] text-muted-foreground">当前笔记 {notes.length} 条</p>
            <p className="font-text text-[13px] text-muted-foreground">回收站 {trashNotes.length} 条</p>
            {loadingRemoteNotes ? <p className="font-text text-[13px] text-primary">正在加载云端数据...</p> : null}
          </div>

          {error ? (
            <p className="mt-3 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
              {error}
            </p>
          ) : null}

          <p className="mt-3 font-text text-[13px] text-muted-foreground">
            文件夹与筛选会固定在顶部导航下方；拖拽笔记卡片到文件夹可快速归类。
          </p>

          <div className="mt-4 max-h-[42vh] overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectFolder("all")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleSelectFolder("all");
                  }
                }}
                className={`rounded-apple border px-3 py-3 transition ${
                  folderFilter === "all" ? "border-primary/60 bg-primary/10" : "border-border bg-muted/40"
                }`}
              >
                <p className="font-text text-[13px] font-semibold text-foreground">
                  全部笔记
                  <span className="ui-en ml-1 text-muted-foreground">All Notes</span>
                </p>
                <p className="mt-1 font-text text-[12px] text-muted-foreground">{notes.length} 条笔记</p>
              </div>

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
                    ? "border-primary/60 bg-primary/10"
                    : dragOverTarget === "uncategorized"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-muted/40"
                }`}
              >
                <p className="font-text text-[13px] font-semibold text-foreground">
                  未归类
                  <span className="ui-en ml-1 text-muted-foreground">Uncategorized</span>
                </p>
                <p className="mt-1 font-text text-[12px] text-muted-foreground">{folderCounts.uncategorized ?? 0} 条笔记</p>
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
                      ? "border-primary/60 bg-primary/10"
                      : dragOverTarget === folder.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-text text-[13px] font-semibold text-foreground">{folder.name}</p>
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
                  <p className="mt-1 font-text text-[12px] text-muted-foreground">{folderCounts[folder.id] ?? 0} 条笔记</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-apple bg-card p-4 text-card-foreground shadow-card">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 md:col-span-2">
              <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">关键词</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索标题或主题"
                className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="space-y-1">
              <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">主题</span>
              <select
                value={topicFilter}
                onChange={(event) => setTopicFilter(event.target.value)}
                className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
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
            <p className="font-text text-[13px] text-muted-foreground">
              当前范围：{activeFolderLabel}，匹配 {filteredNotes.length} 条
            </p>
          </div>
        </section>
      </div>

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
                compact
                showOpenLink={false}
                headerRight={
                  <span className="font-text text-[11px] text-muted-foreground">
                    {noteFolderName ? noteFolderName : "未归类"}
                  </span>
                }
                footerAction={
                  <div className="w-full space-y-2.5 pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={updatingSlug === note.slug || deletingSlug === note.slug}
                        onClick={() => void handleEditNote(note)}
                        className="btn-apple-link inline-flex items-center px-3 py-1.5 font-text text-[12px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
                      >
                        {updatingSlug === note.slug ? "保存中..." : "编辑标题/主题"}
                      </button>
                      <button
                        type="button"
                        disabled={deletingSlug === note.slug || updatingSlug === note.slug}
                        onClick={() => void handleDeleteNote(note)}
                        className="inline-flex items-center rounded-capsule border border-[#b4232f]/30 px-3 py-1.5 font-text text-[12px] tracking-tightCaption text-[#8f1d27] transition hover:bg-[#b4232f]/[0.08] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4232f] dark:border-[#ff6a77]/35 dark:text-[#ffc4cb] dark:hover:bg-[#ff6a77]/[0.12]"
                      >
                        {deletingSlug === note.slug ? "移入中..." : "移入回收站"}
                      </button>
                      <Link
                        href={note.viewHref}
                        className="btn-apple-link ml-auto inline-flex items-center px-3 py-1.5 font-text text-[13px] tracking-tightCaption transition focus-visible:outline-none"
                      >
                        打开笔记
                        <span className="ml-1">&gt;</span>
                      </Link>
                    </div>
                  </div>
                }
              />
            </div>
          );
        })}
      </div>

      {!filteredNotes.length ? (
        <p className="mt-6 rounded-apple border border-border bg-card px-4 py-3 font-text text-[14px] leading-[1.45] text-muted-foreground">
          当前筛选下没有匹配的笔记，请调整关键词、主题或文件夹。
        </p>
      ) : null}

      <section className="mt-8 rounded-apple bg-card p-4 text-card-foreground shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              回收站
              <span className="ui-en ml-1">Recycle Bin</span>
            </p>
            <p className="mt-1 font-text text-[13px] text-muted-foreground">
              已移入回收站的笔记可恢复；只有在这里删除后才会真正移除。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTrashOpen((value) => !value)}
            className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[13px] tracking-tightCaption transition focus-visible:outline-none"
          >
            {trashOpen ? "收起回收站" : `展开回收站（${trashNotes.length}）`}
          </button>
        </div>

        {trashOpen ? (
          trashNotes.length ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {trashNotes.map((note) => (
                <WeekCard
                  key={note.slug}
                  href={note.viewHref}
                  weekLabelZh="回收站"
                  weekLabelEn="Trash"
                  zhTitle={note.zhTitle}
                  enTitle={note.enTitle}
                  descriptionZh={note.descriptionZh}
                  descriptionEn={note.descriptionEn}
                  tags={[]}
                  compact
                  showOpenLink={false}
                  footerAction={
                    <div className="w-full space-y-2.5 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={restoringSlug === note.slug || permanentlyDeletingSlug === note.slug}
                          onClick={() => void handleRestoreNote(note)}
                          className="btn-apple-link inline-flex items-center px-3 py-1.5 font-text text-[12px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
                        >
                          {restoringSlug === note.slug ? "恢复中..." : "恢复"}
                        </button>
                        <button
                          type="button"
                          disabled={permanentlyDeletingSlug === note.slug || restoringSlug === note.slug}
                          onClick={() => void handlePermanentDeleteNote(note)}
                          className="inline-flex items-center rounded-capsule border border-[#b4232f]/30 px-3 py-1.5 font-text text-[12px] tracking-tightCaption text-[#8f1d27] transition hover:bg-[#b4232f]/[0.08] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4232f] dark:border-[#ff6a77]/35 dark:text-[#ffc4cb] dark:hover:bg-[#ff6a77]/[0.12]"
                        >
                          {permanentlyDeletingSlug === note.slug ? "删除中..." : "彻底删除"}
                        </button>
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-apple border border-border bg-muted/40 px-4 py-3 font-text text-[14px] leading-[1.45] text-muted-foreground">
              回收站为空。
            </p>
          )
        ) : null}
      </section>
    </>
  );
}

