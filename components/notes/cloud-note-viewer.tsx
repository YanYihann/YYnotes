"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import GithubSlugger from "github-slugger";
import { NoteView } from "@/components/notes/note-view";
import type { Heading } from "@/lib/content";

type CloudNote = {
  slug: string;
  title: string;
  topic?: string;
  topic_zh?: string;
  topic_en?: string;
  tags?: string[] | string;
  mdx_content: string;
};

type CloudNoteResponse = {
  success?: boolean;
  note?: CloudNote;
  error?: string;
};

type FrontmatterData = {
  title?: string;
  enTitle?: string;
  zhTitle?: string;
  description?: string;
  descriptionEn?: string;
  descriptionZh?: string;
  topic?: string;
  topicEn?: string;
  topicZh?: string;
  tags?: string[] | string;
};

type NoteMeta = {
  slug: string;
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  topicZh: string;
  topicEn: string;
  tags: string[];
  noteContent: string;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseScalar(raw: string): string {
  const value = raw.trim();
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1).trim() : value;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[，,、|]/)
      .map((item) => item.trim().replace(/^#+/, ""))
      .filter(Boolean);
  }

  return [];
}

function parseFrontmatterAndBody(content: string): { body: string; data: FrontmatterData } {
  const source = normalizeNewlines(content).trim();
  if (!source.startsWith("---\n")) {
    return { body: source, data: {} };
  }

  const end = source.indexOf("\n---\n", 4);
  if (end === -1) {
    return { body: source, data: {} };
  }

  const frontmatterBlock = source.slice(4, end);
  const body = source.slice(end + 5).trim();
  const lines = frontmatterBlock.split("\n");

  const data: Record<string, unknown> = {};
  let currentArrayKey = "";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const itemMatch = trimmed.match(/^- (.+)$/);
    if (itemMatch && currentArrayKey) {
      const current = data[currentArrayKey];
      if (Array.isArray(current)) {
        current.push(parseScalar(itemMatch[1]));
      } else {
        data[currentArrayKey] = [parseScalar(itemMatch[1])];
      }
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kvMatch) {
      continue;
    }

    const key = kvMatch[1];
    const rawValue = kvMatch[2].trim();

    if (!rawValue) {
      data[key] = [];
      currentArrayKey = key;
      continue;
    }

    currentArrayKey = "";

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const items = rawValue
        .slice(1, -1)
        .split(/[，,]/)
        .map((item) => parseScalar(item))
        .filter(Boolean);
      data[key] = items;
      continue;
    }

    data[key] = parseScalar(rawValue);
  }

  return {
    body,
    data: data as FrontmatterData,
  };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveMeta(note: CloudNote | null): NoteMeta {
  if (!note) {
    return {
      slug: "",
      zhTitle: "云端笔记",
      enTitle: "Cloud Note",
      descriptionZh: "云端笔记内容。",
      descriptionEn: "Cloud note content.",
      topicZh: "未分类",
      topicEn: "General",
      tags: [],
      noteContent: "",
    };
  }

  const { body, data } = parseFrontmatterAndBody(note.mdx_content || "");
  const fallbackTitle = asText(note.title) || "未命名笔记";

  const zhTitle = asText(data.zhTitle) || asText(data.title) || fallbackTitle;
  const enTitle = asText(data.enTitle) || asText(data.title) || fallbackTitle;

  const descriptionZh =
    asText(data.descriptionZh) ||
    asText(data.description) ||
    `关于“${zhTitle}”的双语学习笔记。`;
  const descriptionEn =
    asText(data.descriptionEn) ||
    asText(data.description) ||
    `Bilingual study note on ${enTitle}.`;

  const topicZh =
    asText(data.topicZh) ||
    asText(data.topic) ||
    asText(note.topic_zh) ||
    "未分类";
  const topicEn =
    asText(data.topicEn) ||
    asText(data.topic) ||
    asText(note.topic_en) ||
    "General";

  const tags = normalizeTags(data.tags).length
    ? normalizeTags(data.tags)
    : normalizeTags(note.tags);

  return {
    slug: note.slug,
    zhTitle,
    enTitle,
    descriptionZh,
    descriptionEn,
    topicZh,
    topicEn,
    tags,
    noteContent: body,
  };
}

function normalizeHeadingText(rawTitle: string): string {
  return rawTitle
    .trim()
    .replace(/`/g, "")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

function extractHeadings(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  slugger.reset();

  const headings: Heading[] = [];
  const matches = markdown.matchAll(/^(#{2,3})\s+(.+)$/gm);

  for (const match of matches) {
    const level = match[1].length as 2 | 3;
    const title = normalizeHeadingText(match[2]);
    if (!title) {
      continue;
    }

    const id = slugger.slug(title);
    if (!id) {
      continue;
    }

    headings.push({ id, title, level });
  }

  return headings;
}

export function CloudNoteViewer() {
  const searchParams = useSearchParams();
  const slug = (searchParams.get("slug") ?? "").trim();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState<CloudNote | null>(null);

  useEffect(() => {
    async function loadNote() {
      if (!slug) {
        setError("缺少 slug 参数，请从笔记列表重新打开。");
        setNote(null);
        return;
      }

      if (!CLOUD_API_BASE) {
        setError("未配置 NEXT_PUBLIC_NOTES_API_BASE，无法读取云端笔记。");
        setNote(null);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const apiBase = normalizeApiBase(CLOUD_API_BASE);
        const response = await fetch(`${apiBase}/notes/${encodeURIComponent(slug)}`, {
          method: "GET",
          cache: "no-store",
        });

        const json = (await response.json().catch(() => null)) as CloudNoteResponse | null;
        if (!response.ok || !json?.success || !json.note) {
          throw new Error(json?.error || "加载云端笔记失败。");
        }

        setNote(json.note);
      } catch (loadError) {
        setNote(null);
        setError(loadError instanceof Error ? loadError.message : "加载云端笔记失败。");
      } finally {
        setLoading(false);
      }
    }

    loadNote();
  }, [slug]);

  const meta = useMemo(() => deriveMeta(note), [note]);
  const headings = useMemo(() => extractHeadings(meta.noteContent), [meta.noteContent]);

  if (loading) {
    return (
      <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
        <p className="font-text text-[15px] text-black/72 dark:text-white/75">正在加载云端笔记...</p>
      </article>
    );
  }

  if (error) {
    return (
      <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
        <p className="rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      </article>
    );
  }

  if (!meta.noteContent) {
    return (
      <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
        <p className="font-text text-[15px] text-black/72 dark:text-white/75">笔记内容为空。</p>
      </article>
    );
  }

  return (
    <NoteView
      headings={headings}
      note={{
        slug: meta.slug || slug,
        topicZh: meta.topicZh,
        topicEn: meta.topicEn,
        zhTitle: meta.zhTitle,
        enTitle: meta.enTitle,
        descriptionZh: meta.descriptionZh,
        descriptionEn: meta.descriptionEn,
        tags: meta.tags,
        noteContent: meta.noteContent,
      }}
      nav={{
        left: {
          href: "/notes",
          labelZh: "返回列表",
          labelEn: "All Notes",
          leadingArrow: true,
        },
        right: {
          href: `/notes/cloud?slug=${encodeURIComponent(slug)}`,
          labelZh: "重新加载",
          labelEn: "Reload",
          trailingArrow: true,
        },
      }}
    />
  );
}