"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AIModelSelector, NOTE_GENERATION_MODEL_OPTIONS } from "@/components/ui/animated-ai-input";
import { WeekCard } from "@/components/week-card";

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
  note: GeneratedNote | null;
  fileName: string;
  preview: string;
};

type MetadataUpdateResult = {
  success: boolean;
  slug: string;
  note: (GeneratedNote & { tags?: string[] }) | null;
};

type GenerationSourcePayload = {
  sourceFile?: File;
  sourceText?: string;
  fileName: string;
};

type GeneratorMode = "direct" | "chatgpt";
type PromptPreset = "standard" | "detailed";

type ImportedNoteResult = {
  success?: boolean;
  slug?: string;
  note?: GeneratedNote | null;
  error?: string;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";
const IS_CLOUD_MODE = CLOUD_API_BASE.length > 0;
const PROMPT_PRESET_OPTIONS: Array<{ value: PromptPreset; label: string; description: string }> = [
  {
    value: "standard",
    label: "标准版",
    description: "使用现有 prompt.md，适合常规结构化笔记生成。",
  },
  {
    value: "detailed",
    label: "详细版",
    description: "使用 prompt2.md，适合更细致、更严格的排版与讲解。",
  },
];

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

function deriveMetadataFromFileName(fileName: string): { title: string; topic: string } {
  const baseName = String(fileName ?? "")
    .replace(/\.(txt|md|markdown|doc|docx|ppt|pptx|pdf|tex|csv)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/[.]+/g, " ")
    .replace(/\s*[-|]+\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  if (!baseName) {
    return { title: "", topic: "" };
  }

  const topic = baseName.split(/\s+-\s+|：|:/).map((part) => part.trim()).find(Boolean) ?? baseName;
  return {
    title: baseName.slice(0, 80),
    topic: topic.slice(0, 64),
  };
}

function buildNoteViewHref(slug: string): string {
  if (IS_CLOUD_MODE) {
    return `/notes/cloud?slug=${encodeURIComponent(slug)}`;
  }
  return `/notes/${slug}`;
}

function resolvePromptTemplateFileName(preset: PromptPreset): string {
  return preset === "detailed" ? "prompt2.md" : "prompt.md";
}

function buildPromptCandidates(fileName: string): string[] {
  const candidates = new Set<string>([`./${fileName}`]);

  if (typeof window !== "undefined") {
    const { origin, pathname } = window.location;
    const segments = pathname.split("/").filter(Boolean);
    const repoSegment = segments[0];

    if (repoSegment) {
      candidates.add(`/${repoSegment}/${fileName}`);
    }

    const currentDir = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
    if (currentDir) {
      candidates.add(`${currentDir}${fileName}`);
    }

    candidates.add(`/${fileName}`);

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

async function loadPromptTemplateFromSite(preset: PromptPreset): Promise<string> {
  const candidates = buildPromptCandidates(resolvePromptTemplateFileName(preset));

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

function resolvePdfWorkerSrcFromCurrentOrigin(): string {
  if (typeof window === "undefined") {
    return "/pdf.worker.min.mjs";
  }

  const scriptEl = document.querySelector<HTMLScriptElement>('script[src*="/_next/"]');
  let prefix = "";

  if (scriptEl?.src) {
    try {
      const scriptUrl = new URL(scriptEl.src, window.location.origin);
      const nextIndex = scriptUrl.pathname.indexOf("/_next/");
      if (nextIndex > 0) {
        prefix = scriptUrl.pathname.slice(0, nextIndex);
      }
    } catch {
      prefix = "";
    }
  }

  const normalized = `${prefix}/pdf.worker.min.mjs`.replace(/\/{2,}/g, "/");
  return new URL(normalized, window.location.origin).toString();
}

async function extractPdfText(file: File): Promise<string> {
  const pdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const typedPdfJs = pdfJs as unknown as {
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

  typedPdfJs.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrcFromCurrentOrigin();

  const sourceData = new Uint8Array(await file.arrayBuffer());
  const pdf: {
    numPages: number;
    getPage: (pageNumber: number) => Promise<{
      getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    }>;
  } = await typedPdfJs.getDocument({
    data: sourceData,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

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
  extraInstruction: string;
  model: string;
  promptPreset: PromptPreset;
  generateInteractiveDemo: boolean;
}): Promise<GenerationResult> {
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  appendGenerationSource(body, params.source);
  body.append("model", params.model);
  body.append("promptPreset", params.promptPreset);
  body.append("generateInteractiveDemo", String(params.generateInteractiveDemo));
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
  extraInstruction: string;
  model: string;
  promptPreset: PromptPreset;
  authToken: string;
  generateInteractiveDemo: boolean;
}): Promise<GenerationResult> {
  const promptTemplate = await loadPromptTemplateFromSite(params.promptPreset);
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  appendGenerationSource(body, params.source);
  body.append("promptTemplate", promptTemplate);
  body.append("model", params.model);
  body.append("generateInteractiveDemo", String(params.generateInteractiveDemo));
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

async function createImportedLocalNote(params: {
  title: string;
  topic: string;
  content: string;
}): Promise<ImportedNoteResult> {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => null)) as ImportedNoteResult | null;
  if (!response.ok || !json?.success || !json.slug) {
    throw new Error(json?.error || "保存 ChatGPT 结果失败，请稍后重试。");
  }

  return json;
}

async function createImportedCloudNote(params: {
  title: string;
  topic: string;
  content: string;
  authToken: string;
}): Promise<ImportedNoteResult> {
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const response = await fetch(`${apiBase}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.authToken}`,
    },
    body: JSON.stringify({
      title: params.title,
      topic: params.topic,
      content: params.content,
    }),
  });

  const json = (await response.json().catch(() => null)) as ImportedNoteResult | null;
  if (!response.ok || !json?.success || !json.slug) {
    throw new Error(json?.error || "保存 ChatGPT 结果失败，请稍后重试。");
  }

  return json;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring ${props.className ?? ""}`}
    />
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] leading-[1.45] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring ${props.className ?? ""}`}
    />
  );
}

export function WeekNoteGenerator() {
  const router = useRouter();
  const { session } = useAuth();
  const [mode, setMode] = useState<GeneratorMode>("direct");
  const [selectedPromptPreset, setSelectedPromptPreset] = useState<PromptPreset>("standard");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [tags, setTags] = useState("");
  const [extraInstruction, setExtraInstruction] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4.1-mini");
  const [generateInteractiveDemo, setGenerateInteractiveDemo] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [buildingChatGptPrompt, setBuildingChatGptPrompt] = useState(false);
  const [chatGptPrompt, setChatGptPrompt] = useState("");
  const [copiedChatGptPrompt, setCopiedChatGptPrompt] = useState(false);
  const [chatGptMarkdown, setChatGptMarkdown] = useState("");
  const [savingChatGptMarkdown, setSavingChatGptMarkdown] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editTags, setEditTags] = useState("");

  function handleSourceFileChange(file: File | null) {
    setSourceFile(file);
    if (!file) {
      return;
    }

    const derived = deriveMetadataFromFileName(file.name);
    setTitle((current) => (current.trim() ? current : derived.title));
    setTopic((current) => (current.trim() ? current : derived.topic));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
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
        extraInstruction: extraInstruction.trim(),
        model: selectedModel,
        promptPreset: selectedPromptPreset,
        authToken: session?.token || "",
        generateInteractiveDemo,
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

  async function onBuildChatGptPrompt() {
    if (!sourceFile) {
      setError("请先上传原始资料文件。");
      return;
    }

    setBuildingChatGptPrompt(true);
    setError("");
    setCopiedChatGptPrompt(false);

    try {
      const promptTemplate = await loadPromptTemplateFromSite(selectedPromptPreset);
      const derived = deriveMetadataFromFileName(sourceFile.name);
      const resolvedTitle = title.trim() || derived.title || "请根据上传资料自动生成标题";
      const resolvedTopic = topic.trim() || derived.topic || "请根据上传资料自动生成主题";
      const resolvedTags = parseTagsInput(tags).join("、") || "未指定，可根据资料补全";
      const prompt = [
        promptTemplate.trim(),
        "",
        "---",
        "",
        "以下是本次生成任务的补充上下文，请与系统要求一起严格执行：",
        `- 目标标题：${resolvedTitle}`,
        `- 目标主题：${resolvedTopic}`,
        `- 目标标签：${resolvedTags}`,
        `- 原始资料文件名：${sourceFile.name}`,
        `- 需要交互 Demo：${generateInteractiveDemo ? "是" : "否"}`,
        "- 我会在当前 ChatGPT 对话中上传同一份原始资料文件，请以该文件为主要内容来源。",
        "- 请直接输出最终 Markdown / MDX 笔记，不要输出解释、分析、前言、后记或代码围栏。",
        "- 输出内容需要可以直接粘贴回 YYNotes 保存。",
        extraInstruction.trim() ? `- 额外说明：${extraInstruction.trim()}` : "- 额外说明：无",
      ].join("\n");

      setChatGptPrompt(prompt);
    } catch (promptError) {
      setError(promptError instanceof Error ? promptError.message : "生成 ChatGPT Prompt 失败。");
    } finally {
      setBuildingChatGptPrompt(false);
    }
  }

  async function onCopyChatGptPrompt() {
    if (!chatGptPrompt.trim()) {
      setError("请先生成 ChatGPT Prompt。");
      return;
    }

    try {
      await navigator.clipboard.writeText(chatGptPrompt);
      setCopiedChatGptPrompt(true);
    } catch {
      setError("复制 Prompt 失败，请手动复制。");
    }
  }

  function onOpenChatGpt() {
    if (typeof window === "undefined") {
      return;
    }

    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  }

  async function onSaveChatGptResult() {
    const derived = deriveMetadataFromFileName(sourceFile?.name ?? "");
    const resolvedTitle = title.trim() || derived.title;
    const resolvedTopic = topic.trim() || derived.topic;
    const resolvedMarkdown = chatGptMarkdown.trim();

    if (!resolvedTitle) {
      setError("请先填写或确认笔记标题。");
      return;
    }

    if (!resolvedTopic) {
      setError("请先填写或确认笔记主题。");
      return;
    }

    if (!resolvedMarkdown) {
      setError("请先粘贴 ChatGPT 生成的 Markdown / MDX。");
      return;
    }

    if (IS_CLOUD_MODE && !session?.token) {
      setError("请先登录后再保存云端笔记。");
      return;
    }

    setSavingChatGptMarkdown(true);
    setError("");

    try {
      const saved = IS_CLOUD_MODE
        ? await createImportedCloudNote({
            title: resolvedTitle,
            topic: resolvedTopic,
            content: resolvedMarkdown,
            authToken: session?.token || "",
          })
        : await createImportedLocalNote({
            title: resolvedTitle,
            topic: resolvedTopic,
            content: resolvedMarkdown,
          });

      if (!saved.slug) {
        throw new Error("保存成功，但未返回笔记链接。");
      }

      router.push(buildNoteViewHref(saved.slug));
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 ChatGPT 结果失败，请稍后重试。");
    } finally {
      setSavingChatGptMarkdown(false);
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

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("direct")}
          className={`inline-flex items-center rounded-capsule px-4 py-2 font-text text-[13px] transition focus-visible:outline-none ${
            mode === "direct" ? "bg-primary text-primary-foreground" : "border border-input bg-background text-foreground"
          }`}
        >
          站内直接生成
        </button>
        <button
          type="button"
          onClick={() => setMode("chatgpt")}
          className={`inline-flex items-center rounded-capsule px-4 py-2 font-text text-[13px] transition focus-visible:outline-none ${
            mode === "chatgpt" ? "bg-primary text-primary-foreground" : "border border-input bg-background text-foreground"
          }`}
        >
          ChatGPT 辅助生成
        </button>
      </div>

      <div className="mb-4 rounded-apple border border-input bg-background p-3">
        <div className="flex flex-wrap items-center gap-3">
          <SectionLabel>Prompt 预设</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {PROMPT_PRESET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedPromptPreset(option.value)}
                className={`inline-flex items-center rounded-capsule px-3 py-1.5 font-text text-[12px] transition focus-visible:outline-none ${
                  selectedPromptPreset === option.value
                    ? "bg-primary text-primary-foreground"
                    : "border border-input bg-card text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 font-text text-[12px] leading-[1.45] text-muted-foreground">
          {PROMPT_PRESET_OPTIONS.find((option) => option.value === selectedPromptPreset)?.description}
        </p>
      </div>

      {mode === "direct" ? (
        <>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <SectionLabel>AI Model</SectionLabel>
              <div className="flex flex-wrap items-center gap-3 rounded-apple border border-input bg-background px-3 py-2">
                <AIModelSelector
                  models={NOTE_GENERATION_MODEL_OPTIONS}
                  value={selectedModel}
                  onValueChange={setSelectedModel}
                  disabled={submitting}
                  triggerClassName="h-8 rounded-full px-2 text-[12px] text-foreground dark:text-foreground"
                  contentClassName="font-text"
                />
                <p className="font-text text-[12px] leading-[1.4] text-muted-foreground">
                  GPT-4.1 Mini is selected by default for stable note generation; switch to Qwen3.6 Flash if you want a lower-cost Chinese-first option.
                </p>
              </div>
            </div>

            <label className="space-y-2 md:col-span-2">
              <SectionLabel>标题（可选，留空自动生成）</SectionLabel>
              <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：极限与连续性核心概念" />
              <p className="font-text text-[12px] leading-[1.4] text-muted-foreground">留空时将自动生成标题、主题和标签。</p>
            </label>

            <label className="space-y-2">
              <SectionLabel>主题（可选）</SectionLabel>
              <TextInput value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：微积分基础" />
            </label>

            <label className="space-y-2">
              <SectionLabel>标签（可选）</SectionLabel>
              <TextInput value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：定义, 定理, 证明" />
            </label>

            <label className="space-y-2 md:col-span-2">
              <SectionLabel>原始资料文件</SectionLabel>
              <TextInput
                type="file"
                accept=".txt,.md,.markdown,.doc,.docx,.ppt,.pptx,.pdf,.tex,.csv"
                onChange={(event) => handleSourceFileChange(event.target.files?.[0] ?? null)}
                className="file:mr-3 file:rounded-capsule file:border-0 file:bg-primary file:px-3 file:py-1 file:text-[12px] file:text-primary-foreground hover:file:bg-primary/90"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <SectionLabel>额外说明（可选）</SectionLabel>
              <TextArea
                value={extraInstruction}
                onChange={(event) => setExtraInstruction(event.target.value)}
                rows={3}
                placeholder="可填写特殊整理要求，如：强调考试易错点。"
              />
            </label>

            <label className="md:col-span-2 inline-flex items-start gap-3 rounded-apple border border-input bg-background px-3 py-3">
              <input
                type="checkbox"
                checked={generateInteractiveDemo}
                onChange={(event) => setGenerateInteractiveDemo(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <span className="font-text text-[13px] leading-[1.45] text-muted-foreground">
                生成交互 demo（可选）
                <span className="ui-en ml-1">Add interactive demos if the note contains supported interactive concepts.</span>
              </span>
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

          {result ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-apple border border-primary/35 bg-primary/10 p-3">
                <p className="font-text text-[13px] leading-[1.45] text-foreground">已保存 {result.fileName}。</p>
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
                    <TextInput value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="留空将保留当前标题" className="text-[14px]" />
                  </label>

                  <label className="space-y-1">
                    <span className="font-text text-[12px] text-black/62 dark:text-white/66">主题</span>
                    <TextInput value={editTopic} onChange={(event) => setEditTopic(event.target.value)} placeholder="留空将自动兜底生成主题" className="text-[14px]" />
                  </label>

                  <label className="space-y-1">
                    <span className="font-text text-[12px] text-black/62 dark:text-white/66">标签</span>
                    <TextInput value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="用逗号分隔，如：定义, 推导, 例题" className="text-[14px]" />
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
        </>
      ) : (
        <div className="space-y-4">
          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              步骤 1：整理输入
              <span className="ui-en ml-1">Prepare Inputs</span>
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <SectionLabel>标题</SectionLabel>
                <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：死锁与资源分配图" />
              </label>

              <label className="space-y-2">
                <SectionLabel>主题</SectionLabel>
                <TextInput value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：操作系统 / Operating Systems" />
              </label>

              <label className="space-y-2">
                <SectionLabel>标签（可选）</SectionLabel>
                <TextInput value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：死锁, 资源分配图, 同步" />
              </label>

              <label className="space-y-2 md:col-span-2">
                <SectionLabel>原始资料文件</SectionLabel>
                <TextInput
                  type="file"
                  accept=".txt,.md,.markdown,.doc,.docx,.ppt,.pptx,.pdf,.tex,.csv"
                  onChange={(event) => handleSourceFileChange(event.target.files?.[0] ?? null)}
                  className="file:mr-3 file:rounded-capsule file:border-0 file:bg-primary file:px-3 file:py-1 file:text-[12px] file:text-primary-foreground hover:file:bg-primary/90"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <SectionLabel>额外说明（可选）</SectionLabel>
                <TextArea
                  value={extraInstruction}
                  onChange={(event) => setExtraInstruction(event.target.value)}
                  rows={3}
                  placeholder="可填写特殊整理要求，如：更适合考试复习，保留关键例题。"
                />
              </label>

              <label className="md:col-span-2 inline-flex items-start gap-3 rounded-apple border border-input bg-card px-3 py-3">
                <input
                  type="checkbox"
                  checked={generateInteractiveDemo}
                  onChange={(event) => setGenerateInteractiveDemo(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="font-text text-[13px] leading-[1.45] text-muted-foreground">
                  生成交互 demo（可选）
                  <span className="ui-en ml-1">The generated prompt will ask ChatGPT to include interactive demo content when applicable.</span>
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onBuildChatGptPrompt()}
                disabled={buildingChatGptPrompt}
                className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {buildingChatGptPrompt ? "生成 Prompt 中..." : "生成 ChatGPT Prompt"}
              </button>
            </div>
          </section>

          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              步骤 2：发送到 ChatGPT
              <span className="ui-en ml-1">Send to ChatGPT</span>
            </p>

            <p className="mt-3 font-text text-[13px] leading-[1.45] text-muted-foreground">
              推荐流程：打开 ChatGPT，选择 GPT-5.4，上传同一份原始资料文件，再粘贴下面的 Prompt。
            </p>

            <TextArea
              value={chatGptPrompt}
              readOnly
              rows={12}
              placeholder="点击上方“生成 ChatGPT Prompt”后，这里会出现完整 Prompt。"
              className="mt-3 font-mono text-[12px] leading-[1.5]"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onCopyChatGptPrompt()}
                disabled={!chatGptPrompt.trim()}
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {copiedChatGptPrompt ? "已复制 Prompt" : "复制 Prompt"}
              </button>

              <button
                type="button"
                onClick={onOpenChatGpt}
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
              >
                打开 ChatGPT
              </button>
            </div>
          </section>

          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              步骤 3：粘贴结果并保存
              <span className="ui-en ml-1">Paste Result and Save</span>
            </p>

            <TextArea
              value={chatGptMarkdown}
              onChange={(event) => setChatGptMarkdown(event.target.value)}
              rows={14}
              placeholder="把 ChatGPT 返回的 Markdown / MDX 结果粘贴到这里，然后保存为笔记。"
              className="mt-3 font-mono text-[12px] leading-[1.5]"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onSaveChatGptResult()}
                disabled={savingChatGptMarkdown}
                className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {savingChatGptMarkdown ? "保存中..." : "保存为笔记"}
              </button>

              <Link
                href="/notes"
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
              >
                查看笔记列表
              </Link>
            </div>
          </section>
        </div>
      )}

      {error ? (
        <p className="mt-4 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
