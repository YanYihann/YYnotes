"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import GithubSlugger from "github-slugger";
import ReactMarkdown from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import allComponents from "@/components/mdx/mdx-components";
import { ReadingWorkspace } from "@/components/notes/reading-workspace";
import { prepareNoteMarkdown } from "@/lib/mdx";

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
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  topicZh: string;
  topicEn: string;
  tags: string[];
  source: string;
};

type Heading = {
  id: string;
  title: string;
  level: 2 | 3;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";

const markdownComponents = {
  p: allComponents.p,
  h2: allComponents.h2,
  h3: allComponents.h3,
  h4: allComponents.h4,
  ul: allComponents.ul,
  ol: allComponents.ol,
  li: allComponents.li,
  a: allComponents.a,
  blockquote: allComponents.blockquote,
  pre: allComponents.pre,
  code: allComponents.code,
  table: allComponents.table,
  th: allComponents.th,
  td: allComponents.td,
};

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
      zhTitle: "云端笔记",
      enTitle: "Cloud Note",
      descriptionZh: "云端笔记内容。",
      descriptionEn: "Cloud note content.",
      topicZh: "未分类",
      topicEn: "General",
      tags: [],
      source: "",
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
    zhTitle,
    enTitle,
    descriptionZh,
    descriptionEn,
    topicZh,
    topicEn,
    tags,
    source: body,
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
  const renderedSource = useMemo(() => prepareNoteMarkdown(meta.source), [meta.source]);
  const headings = useMemo(() => extractHeadings(meta.source), [meta.source]);

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

  if (!renderedSource) {
    return (
      <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
        <p className="font-text text-[15px] text-black/72 dark:text-white/75">笔记内容为空。</p>
      </article>
    );
  }

  return (
    <ReadingWorkspace
      headings={headings}
      noteContext={{
        slug: slug || "",
        weekLabelZh: meta.topicZh,
        weekLabelEn: meta.topicEn,
        zhTitle: meta.zhTitle,
        enTitle: meta.enTitle,
        noteContent: meta.source,
      }}
    >
      <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
        <header className="mb-8 border-b border-black/10 pb-6 dark:border-white/10">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.1em] text-black/55 dark:text-white/55">
            {meta.topicZh}
            <span className="ui-en ml-1">{meta.topicEn} - Note</span>
          </p>
          {meta.tags.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {meta.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-capsule border border-black/15 px-2 py-0.5 font-text text-[12px] tracking-tightCaption text-black/63 dark:border-white/20 dark:text-white/66"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
          <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-[#1d1d1f] dark:text-white">
            {meta.zhTitle}
            <span className="ui-en mt-1 block font-text text-[0.36em] font-normal leading-[1.35] tracking-tightBody text-black/72 dark:text-white/74">
              {meta.enTitle}
            </span>
          </h1>
          <p className="mt-3 font-text text-[17px] leading-[1.47] tracking-tightBody text-black/80 dark:text-white/80">
            {meta.descriptionZh}
            <span className="ui-en mt-1 block text-black/68 dark:text-white/72">{meta.descriptionEn}</span>
          </p>
        </header>

        <div className="note-prose" data-note-content>
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
              rehypeKatex,
              rehypeSlug,
              [
                rehypeAutolinkHeadings,
                {
                  behavior: "append",
                  properties: {
                    className: ["anchor-link"],
                    "aria-label": "Anchor",
                  },
                },
              ],
            ]}
          >
            {renderedSource}
          </ReactMarkdown>
        </div>

        <nav className="mt-14 grid gap-4 border-t border-black/10 pt-6 dark:border-white/10 sm:grid-cols-2">
          <div>
            <Link
              href="/notes"
              className="inline-flex rounded-capsule border border-[#0066cc] px-4 py-1.5 text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff]"
            >
              ← 返回列表
              <span className="ui-en ml-1">All Notes</span>
            </Link>
          </div>
          <div className="sm:text-right">
            <Link
              href={`/notes/cloud?slug=${encodeURIComponent(slug)}`}
              className="inline-flex rounded-capsule border border-[#0066cc] px-4 py-1.5 text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff]"
            >
              重新加载
              <span className="ui-en ml-1">Reload</span>
              <span className="ml-1">→</span>
            </Link>
          </div>
        </nav>
      </article>
    </ReadingWorkspace>
  );
}
