"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
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

type MetadataUpdateResult = {
  success: boolean;
  slug: string;
  note: GeneratedNote | null;
};

type GenerationSourcePayload = {
  sourceFile?: File;
  sourceText?: string;
  fileName: string;
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

function deriveTitleFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "";
  }

  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;

  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTagsInput(raw: string): string[] {
  const dedup = new Set<string>();
  for (const token of raw.split(/[，,、|]/)) {
    const cleaned = token.trim().replace(/^#+/, "");
    if (!cleaned) {
      continue;
    }
    dedup.add(cleaned);
    if (dedup.size >= 12) {
      break;
    }
  }

  return Array.from(dedup);
}

function buildNoteViewHref(slug: string): string {
  if (IS_CLOUD_MODE) {
    return `/notes/cloud?slug=${encodeURIComponent(slug)}`;
  }
  return `/notes/${slug}`;
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

async function extractPdfText(file: File): Promise<string> {
  const pdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const typedPdfJs = pdfJs as unknown as {
    version?: string;
    GlobalWorkerOptions: {
      workerSrc: string;
    };
    getDocument: (options: unknown) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
      }>;
    };
  };

  if (!typedPdfJs.GlobalWorkerOptions.workerSrc) {
    const version = typedPdfJs.version ?? "5.6.205";
    typedPdfJs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
  }

  const sourceData = new Uint8Array(await file.arrayBuffer());
  let pdf: {
    numPages: number;
    getPage: (pageNumber: number) => Promise<{
      getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    }>;
  };

  try {
    pdf = await typedPdfJs.getDocument({
      data: sourceData,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("GlobalWorkerOptions.workerSrc")) {
      throw error;
    }

    pdf = await typedPdfJs.getDocument({
      data: sourceData,
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
  }

  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    if (text) {
      pageTexts.push(text);
    }
  }

  return pageTexts.join("\n\n").trim();
}

async function resolveGenerationSourcePayload(sourceFile: File): Promise<GenerationSourcePayload> {
  const extension = fileExtension(sourceFile.name);
  if (extension === "doc" || extension === "ppt") {
    throw new Error("暂不支持旧版 .doc / .ppt，请先另存为 .docx / .pptx 后再上传。");
  }

  if (extension !== "pdf") {
    return {
      sourceFile,
      fileName: sourceFile.name,
    };
  }

  const sourceText = (await extractPdfText(sourceFile)).trim();
  if (!sourceText) {
    throw new Error("PDF 文件可读内容过少，请更换文件或转成 DOCX / TXT 后重试。");
  }

  return {
    sourceText,
    fileName: sourceFile.name,
  };
}

function appendGenerationSource(body: FormData, source: GenerationSourcePayload): void {
  if (source.sourceFile instanceof File) {
    body.append("sourceFile", source.sourceFile);
  }
  if (source.sourceText) {
    body.append("sourceText", source.sourceText);
  }
  body.append("fileName", source.fileName);
}

async function callLocalGenerator(params: {
  title: string;
  topic: string;
  tags: string;
  source: GenerationSourcePayload;
  overwrite: boolean;
  extraInstruction: string;
}): Promise<GenerationResult> {
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  appendGenerationSource(body, params.source);
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
  source: GenerationSourcePayload;
  overwrite: boolean;
  extraInstruction: string;
  authToken: string;
}): Promise<GenerationResult> {
  const promptTemplate = await loadPromptTemplateFromSite();
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  appendGenerationSource(body, params.source);
  body.append("overwrite", params.overwrite ? "true" : "false");
  body.append("promptTemplate", promptTemplate);
  if (params.extraInstruction) {
    body.append("extraInstruction", params.extraInstruction);
  }

  const response = await fetch(`${apiBase}/notes/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.authToken}`,
    },
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

async function callLocalMetadataUpdate(params: {
  slug: string;
  title: string;
  topic: string;
  tags: string[];
}): Promise<MetadataUpdateResult> {
  const response = await fetch("/api/note-generator", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<MetadataUpdateResult> | null;
  if (!response.ok || !json) {
    throw new Error(json?.error || "更新元信息失败，请稍后重试。");
  }

  if (!json.success || !json.slug) {
    throw new Error("元信息更新结果无效，请重试。");
  }

  return json as MetadataUpdateResult;
}

async function callCloudMetadataUpdate(params: {
  slug: string;
  title: string;
  topic: string;
  tags: string[];
  authToken: string;
}): Promise<MetadataUpdateResult> {
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.authToken}`,
  };

  const response = await fetch(`${apiBase}/notes/${encodeURIComponent(params.slug)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<MetadataUpdateResult> | null;
  if (!response.ok || !json) {
    throw new Error(json?.error || "云端元信息更新失败，请稍后重试。");
  }

  if (!json.success || !json.slug) {
    throw new Error("云端元信息更新结果无效，请重试。");
  }

  return json as MetadataUpdateResult;
}

export function WeekNoteGenerator({ existingNotes }: WeekNoteGeneratorProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [tags, setTags] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [extraInstruction, setExtraInstruction] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editTags, setEditTags] = useState("");

  const slugPreview = useMemo(() => {
    const manualTitle = title.trim();
    if (manualTitle) {
      return slugifyTitle(manualTitle);
    }

    if (sourceFile) {
      const guessedTitle = deriveTitleFromFileName(sourceFile.name);
      if (guessedTitle) {
        return slugifyTitle(guessedTitle);
      }
    }

    return "";
  }, [title, sourceFile]);

  const existingSlugSet = useMemo(() => {
    return new Set(existingNotes.map((note) => note.slug));
  }, [existingNotes]);

  const noteAlreadyExists = slugPreview ? existingSlugSet.has(slugPreview) : false;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sourceFile) {
      setError("请先上传原始资料文件。");
      return;
    }

    if (IS_CLOUD_MODE && !session?.token) {
      setError("请先登录后再生成云端笔记。");
      return;
    }

    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const source = await resolveGenerationSourcePayload(sourceFile);
      const payload = {
        title: title.trim(),
        topic: topic.trim(),
        tags: tags.trim(),
        source,
        overwrite,
        extraInstruction: extraInstruction.trim(),
        authToken: session?.token || "",
      };

      const generationResult = IS_CLOUD_MODE ? await callCloudGenerator(payload) : await callLocalGenerator(payload);

      setResult(generationResult);
      setEditTitle(generationResult.note?.zhTitle ?? payload.title);
      setEditTopic(generationResult.note?.weekLabelZh ?? payload.topic);
      setEditTags((generationResult.note?.tags ?? parseTagsInput(payload.tags)).join(", "));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "生成失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveMetadata() {
    if (!result?.slug) {
      return;
    }

    if (IS_CLOUD_MODE && !session?.token) {
      setError("登录状态已失效，请重新登录。");
      return;
    }

    setSavingMeta(true);
    setError("");

    try {
      const payload = {
        slug: result.slug,
        title: editTitle.trim(),
        topic: editTopic.trim(),
        tags: parseTagsInput(editTags),
        authToken: session?.token || "",
      };

      const updated = IS_CLOUD_MODE ? await callCloudMetadataUpdate(payload) : await callLocalMetadataUpdate(payload);

      if (updated.note) {
        setResult((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            note: updated.note,
          };
        });
        setEditTitle(updated.note.zhTitle);
        setEditTopic(updated.note.weekLabelZh);
        setEditTags((updated.note.tags ?? []).join(", "));
      }

      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "更新元信息失败，请稍后重试。");
    } finally {
      setSavingMeta(false);
    }
  }

  return (
    <section className="mb-8 rounded-apple bg-card p-5 text-card-foreground shadow-card">
      <div className="mb-4">
        <h3 className="font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-foreground">
          上传资料并生成笔记
        </h3>
        <p className="mt-2 max-w-[860px] font-text text-[14px] leading-[1.45] tracking-tightCaption text-muted-foreground">
          按“标题 + 主题 + 标签”方式生成通用 MDX 笔记，适用于任意学科。
          <span className="ui-en ml-1">Generate structured MDX notes using title, topic, and tags.</span>
        </p>
        {IS_CLOUD_MODE ? (
          <p className="mt-2 rounded-apple border border-primary/35 bg-primary/10 px-3 py-2 font-text text-[12px] leading-[1.4] text-muted-foreground">
            当前为云端模式：将请求远程笔记 API 并存储到 Neon 数据库，且只写入当前登录账号。
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            标题（可选，留空自动生成）
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：极限与连续性核心概念"
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="font-text text-[12px] leading-[1.4] text-muted-foreground">
            {slugPreview ? `预计 slug：${slugPreview}` : "留空时将自动生成标题、主题、标签和 slug。"}
          </p>
        </label>

        <label className="space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">主题（可选）</span>
          <input
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="例如：微积分基础"
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">标签（可选）</span>
          <input
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="例如：定义, 定理, 证明"
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">原始资料文件</span>
          <input
            type="file"
            accept=".txt,.md,.markdown,.doc,.docx,.ppt,.pptx,.pdf,.tex,.csv"
            onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none file:mr-3 file:rounded-capsule file:border-0 file:bg-primary file:px-3 file:py-1 file:text-[12px] file:text-primary-foreground hover:file:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">额外说明（可选）</span>
          <textarea
            value={extraInstruction}
            onChange={(event) => setExtraInstruction(event.target.value)}
            rows={3}
            placeholder="可填写特殊整理要求，如：强调考试易错点。"
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] leading-[1.45] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="md:col-span-2 inline-flex items-center gap-2 font-text text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
          />
          若 slug 已存在，允许覆盖已有笔记
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || (IS_CLOUD_MODE && !session?.token)}
            className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
          >
            {submitting ? "生成中..." : IS_CLOUD_MODE && !session?.token ? "请先登录" : "生成并保存笔记"}
          </button>

          <Link
            href="/notes"
            className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
          >
            查看笔记列表
          </Link>
        </div>
      </form>

      {noteAlreadyExists ? (
        <p className="mt-4 rounded-apple border border-border bg-muted/50 px-3 py-2 font-text text-[13px] leading-[1.45] text-muted-foreground">
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
          <div className="rounded-apple border border-primary/35 bg-primary/10 p-3">
            <p className="font-text text-[13px] leading-[1.45] text-foreground">
              已保存 {result.fileName}
              {result.replaced ? "（已覆盖原文件）。" : "。"}
            </p>
            <Link
              href={buildNoteViewHref(result.slug)}
              className="btn-apple-link mt-2 inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
            >
              打开生成结果
              <span className="ml-1">&gt;</span>
            </Link>
          </div>

          <section className="rounded-apple border border-border bg-card p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              生成后可修改元信息
              <span className="ui-en ml-1">Edit Metadata After Generation</span>
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="font-text text-[12px] text-black/62 dark:text-white/66">标题</span>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  placeholder="留空将保留当前标题"
                  className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <label className="space-y-1">
                <span className="font-text text-[12px] text-black/62 dark:text-white/66">主题</span>
                <input
                  type="text"
                  value={editTopic}
                  onChange={(event) => setEditTopic(event.target.value)}
                  placeholder="留空将自动兜底生成主题"
                  className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <label className="space-y-1">
                <span className="font-text text-[12px] text-black/62 dark:text-white/66">标签</span>
                <input
                  type="text"
                  value={editTags}
                  onChange={(event) => setEditTags(event.target.value)}
                  placeholder="用逗号分隔，如：定义, 推导, 例题"
                  className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>

            <div className="mt-3">
              <button
                type="button"
                disabled={savingMeta}
                onClick={onSaveMetadata}
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {savingMeta ? "保存中..." : "保存元信息修改"}
              </button>
            </div>
          </section>

          {result.note ? (
            <WeekCard
              href={buildNoteViewHref(result.note.slug)}
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

          <details className="rounded-apple border border-border bg-card px-4 py-3">
            <summary className="cursor-pointer font-text text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              预览前几行
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-apple bg-muted p-3 font-mono text-[12px] leading-[1.45] text-muted-foreground">
              {result.preview}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
