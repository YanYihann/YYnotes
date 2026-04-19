"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import allComponents from "@/components/mdx/mdx-components";

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

function parseTags(tags: CloudNote["tags"]): string[] {
  if (Array.isArray(tags)) {
    return tags.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof tags === "string") {
    return tags
      .split(/[，,、|]/)
      .map((item) => item.trim().replace(/^#+/, ""))
      .filter(Boolean);
  }

  return [];
}

function stripFrontmatter(content: string): string {
  const source = content.trim();
  if (!source.startsWith("---\n")) {
    return source;
  }

  const closingIndex = source.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return source;
  }

  return source.slice(closingIndex + 5).trim();
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

  const renderedContent = useMemo(() => {
    if (!note?.mdx_content) {
      return "";
    }
    return stripFrontmatter(note.mdx_content);
  }, [note]);

  const tags = useMemo(() => parseTags(note?.tags), [note]);
  const topicZh = note?.topic_zh?.trim() || "未分类";
  const topicEn = note?.topic_en?.trim() || "General";

  return (
    <article className="rounded-apple bg-white px-5 py-8 shadow-card dark:bg-[#272729] sm:px-8 md:px-10">
      <header className="mb-8 border-b border-black/10 pb-6 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/notes"
            className="inline-flex rounded-capsule border border-[#0066cc] px-4 py-1.5 text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff]"
          >
            返回列表
          </Link>
          {slug ? (
            <span className="rounded-capsule border border-black/15 px-3 py-1 text-[12px] text-black/62 dark:border-white/18 dark:text-white/66">
              slug: {slug}
            </span>
          ) : null}
        </div>

        <p className="mt-4 font-text text-[12px] font-semibold uppercase tracking-[0.1em] text-black/55 dark:text-white/55">
          {topicZh}
          <span className="ui-en ml-1">{topicEn} - Cloud Note</span>
        </p>

        <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-[#1d1d1f] dark:text-white">
          {note?.title || "云端笔记"}
        </h1>

        {tags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-capsule border border-black/15 px-2 py-0.5 font-text text-[12px] tracking-tightCaption text-black/63 dark:border-white/20 dark:text-white/66"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {loading ? <p className="font-text text-[15px] text-black/72 dark:text-white/75">正在加载云端笔记...</p> : null}

      {error ? (
        <p className="rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}

      {!loading && !error && renderedContent ? (
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
            {renderedContent}
          </ReactMarkdown>
        </div>
      ) : null}
    </article>
  );
}
