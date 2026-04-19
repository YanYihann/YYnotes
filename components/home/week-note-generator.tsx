"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { WeekCard } from "@/components/week-card";

type ExistingNote = {
  slug: string;
};

type GeneratedNote = {
  slug: string;
  weekLabelZh: string;
  weekLabelEn: string;
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  tags?: string[];
};

type GenerationResult = {
  success: boolean;
  slug: string;
  replaced: boolean;
  note: GeneratedNote | null;
  fileName: string;
  preview: string;
};

type WeekNoteGeneratorProps = {
  existingNotes: ExistingNote[];
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";
const IS_CLOUD_MODE = CLOUD_API_BASE.length > 0;

function slugifyTitle(input: string): string {
  const base = input
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base) {
    return base;
  }

  return "new-note";
}

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  if (index === -1) {
    return "";
  }
  return fileName.slice(index + 1).toLowerCase();
}

function buildPromptCandidates(): string[] {
  const candidates = new Set<string>(["./prompt.md"]);

  if (typeof window !== "undefined") {
    const { origin, pathname } = window.location;
    const segments = pathname.split("/").filter(Boolean);
    const repoSegment = segments[0];

    if (repoSegment) {
      candidates.add(`/${repoSegment}/prompt.md`);
    }

    const currentDir = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
    if (currentDir) {
      candidates.add(`${currentDir}prompt.md`);
    }

    // Keep absolute root as a final fallback to avoid noisy 404 on project pages.
    candidates.add("/prompt.md");

    for (const candidate of Array.from(candidates)) {
      try {
        candidates.add(new URL(candidate, origin).toString());
      } catch {
        // Ignore malformed URL candidates.
      }
    }
  }

  return Array.from(candidates);
}

async function loadPromptTemplateFromSite(): Promise<string> {
  const candidates = buildPromptCandidates();

  for (const candidate of candidates) {
    const response = await fetch(candidate, { cache: "no-store" });
    if (!response.ok) {
      continue;
    }

    const content = (await response.text()).trim();
    if (content) {
      return content;
    }
  }

  throw new Error(`无法读取 prompt.md，请确认该文件已发布到站点根目录。已尝试路径：${candidates.join("，")}`);
}

async function callLocalGenerator(params: {
  title: string;
  topic: string;
  tags: string;
  sourceFile: File;
  overwrite: boolean;
  extraInstruction: string;
}): Promise<GenerationResult> {
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  body.append("sourceFile", params.sourceFile);
  body.append("overwrite", params.overwrite ? "true" : "false");
  if (params.extraInstruction) {
    body.append("extraInstruction", params.extraInstruction);
  }

  const response = await fetch("/api/note-generator", {
    method: "POST",
    body,
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<GenerationResult> | null;

  if (!response.ok || !json) {
    throw new Error(json?.error || "生成失败，请稍后重试。");
  }

  if (!json.success || !json.slug) {
    throw new Error("生成结果无效，请重试。");
  }

  return json as GenerationResult;
}

async function callCloudGenerator(params: {
  title: string;
  topic: string;
  tags: string;
  sourceFile: File;
  overwrite: boolean;
  extraInstruction: string;
}): Promise<GenerationResult> {
  const extension = fileExtension(params.sourceFile.name);
  if (extension === "doc" || extension === "ppt") {
    throw new Error("暂不支持旧版 .doc / .ppt，请先另存为 .docx / .pptx 后再上传。");
  }

  const promptTemplate = await loadPromptTemplateFromSite();
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  body.append("sourceFile", params.sourceFile);
  body.append("overwrite", params.overwrite ? "true" : "false");
  body.append("promptTemplate", promptTemplate);
  if (params.extraInstruction) {
    body.append("extraInstruction", params.extraInstruction);
  }

  const response = await fetch(`${apiBase}/notes/generate`, {
    method: "POST",
    body,
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<GenerationResult> | null;

  if (!response.ok || !json) {
    throw new Error(json?.error || "云端生成失败，请稍后重试。");
  }

  if (!json.success || !json.slug) {
    throw new Error("云端返回了无效结果，请重试。");
  }

  return json as GenerationResult;
}

export function WeekNoteGenerator({ existingNotes }: WeekNoteGeneratorProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [tags, setTags] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [extraInstruction, setExtraInstruction] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);

  const slugPreview = useMemo(() => slugifyTitle(title), [title]);

  const existingSlugSet = useMemo(() => {
    return new Set(existingNotes.map((note) => note.slug));
  }, [existingNotes]);

  const noteAlreadyExists = existingSlugSet.has(slugPreview);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setError("请先填写笔记标题。");
      return;
    }

    if (!sourceFile) {
      setError("请先上传原始资料文件。");
      return;
    }

    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const payload = {
        title: title.trim(),
        topic: topic.trim(),
        tags: tags.trim(),
        sourceFile,
        overwrite,
        extraInstruction: extraInstruction.trim(),
      };

      const generationResult = IS_CLOUD_MODE ? await callCloudGenerator(payload) : await callLocalGenerator(payload);

      setResult(generationResult);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "生成失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mb-8 rounded-apple bg-white p-5 shadow-card dark:bg-[#272729]">
      <div className="mb-4">
        <h3 className="font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-[#1d1d1f] dark:text-white">
          上传资料并生成笔记
        </h3>
        <p className="mt-2 max-w-[860px] font-text text-[14px] leading-[1.45] tracking-tightCaption text-black/75 dark:text-white/75">
          按“标题 + 主题 + 标签”方式生成通用 MDX 笔记，适用于任意学科。
          <span className="ui-en ml-1">Generate structured MDX notes using title, topic, and tags.</span>
        </p>
        {IS_CLOUD_MODE ? (
          <p className="mt-2 rounded-apple border border-[#0071e3]/30 bg-[#0071e3]/[0.06] px-3 py-2 font-text text-[12px] leading-[1.4] text-black/75 dark:border-[#2997ff]/45 dark:bg-[#2997ff]/[0.1] dark:text-white/80">
            当前为云端模式：将请求远程笔记 API 并存储到 Neon 数据库。
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
            标题（必填）
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：极限与连续性核心概念"
            className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[15px] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
          />
          <p className="font-text text-[12px] leading-[1.4] text-black/55 dark:text-white/58">将生成 slug：{slugPreview}</p>
        </label>

        <label className="space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">主题（可选）</span>
          <input
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="例如：微积分基础"
            className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[15px] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
          />
        </label>

        <label className="space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">标签（可选）</span>
          <input
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="例如：定义, 定理, 证明"
            className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[15px] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">原始资料文件</span>
          <input
            type="file"
            accept=".txt,.md,.markdown,.doc,.docx,.ppt,.pptx,.tex,.csv"
            onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[14px] text-black/80 outline-none file:mr-3 file:rounded-capsule file:border-0 file:bg-[#0071e3] file:px-3 file:py-1 file:text-[12px] file:text-white hover:file:bg-[#0066cc] focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/82"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">额外说明（可选）</span>
          <textarea
            value={extraInstruction}
            onChange={(event) => setExtraInstruction(event.target.value)}
            rows={3}
            placeholder="可填写特殊整理要求，如：强调考试易错点。"
            className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-[14px] leading-[1.45] text-black/85 outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
          />
        </label>

        <label className="md:col-span-2 inline-flex items-center gap-2 font-text text-[13px] text-black/72 dark:text-white/76">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
            className="h-4 w-4 rounded border-black/25 text-[#0071e3] focus:ring-[#0071e3] dark:border-white/30"
          />
          若 slug 已存在，允许覆盖已有笔记
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-apple bg-[#0071e3] px-5 py-2 font-text text-[15px] text-white transition hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            {submitting ? "生成中..." : "生成并保存笔记"}
          </button>

          <Link
            href="/notes"
            className="inline-flex items-center rounded-capsule border border-[#0066cc] px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff]"
          >
            查看笔记列表
          </Link>
        </div>
      </form>

      {noteAlreadyExists ? (
        <p className="mt-4 rounded-apple border border-black/15 bg-black/[0.03] px-3 py-2 font-text text-[13px] leading-[1.45] text-black/72 dark:border-white/16 dark:bg-white/[0.06] dark:text-white/74">
          该标题对应的 slug 已存在，若要覆盖请勾选“允许覆盖”。
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-apple border border-[#0071e3]/30 bg-[#0071e3]/[0.06] p-3 dark:border-[#2997ff]/45 dark:bg-[#2997ff]/[0.08]">
            <p className="font-text text-[13px] leading-[1.45] text-black/82 dark:text-white/84">
              已保存 {result.fileName}
              {result.replaced ? "（已覆盖原文件）。" : "。"}
            </p>
            <Link
              href={`/notes/${result.slug}`}
              className="mt-2 inline-flex items-center rounded-capsule border border-[#0066cc] px-4 py-1.5 font-text text-[14px] tracking-tightCaption text-[#0066cc] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-[#2997ff] dark:text-[#2997ff]"
            >
              打开生成结果
              <span className="ml-1">&gt;</span>
            </Link>
          </div>

          {result.note ? (
            <WeekCard
              href={`/notes/${result.note.slug}`}
              weekLabelZh={result.note.weekLabelZh}
              weekLabelEn={result.note.weekLabelEn}
              zhTitle={result.note.zhTitle}
              enTitle={result.note.enTitle}
              descriptionZh={result.note.descriptionZh}
              descriptionEn={result.note.descriptionEn}
              tags={result.note.tags}
              className="max-w-[420px]"
            />
          ) : null}

          <details className="rounded-apple border border-black/12 bg-white px-4 py-3 dark:border-white/12 dark:bg-[#1f1f21]">
            <summary className="cursor-pointer font-text text-[13px] font-semibold uppercase tracking-[0.08em] text-black/62 dark:text-white/64">
              预览前几行
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-apple bg-black/[0.04] p-3 font-mono text-[12px] leading-[1.45] text-black/75 dark:bg-white/[0.08] dark:text-white/80">
              {result.preview}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
