import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { getWeekNotes } from "@/lib/content";
import { extractResponseText } from "@/lib/ai/note-assistant";

export const runtime = "nodejs";

const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.openai.com/v1";
const RESPONSES_ENDPOINT = `${OPENAI_BASE_URL}/responses`;
const CHAT_COMPLETIONS_ENDPOINT = `${OPENAI_BASE_URL}/chat/completions`;
const PROMPT_TEMPLATE_PATH = path.join(process.cwd(), "prompt.md");
const NOTES_DIR_PATH = path.join(process.cwd(), "笔记");

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_CHARS = 35_000;
const MAX_STYLE_CONTEXT_CHARS = 16_000;
const MAX_EXTRA_INSTRUCTION_CHARS = 1_500;
const SUPPORTED_TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "tex", "csv", "rst"]);
const SUPPORTED_DOC_EXTENSIONS = new Set(["docx"]);

type AssistantRole = "system" | "user" | "assistant";

type OpenAIInputItem = {
  role: AssistantRole;
  content: Array<{ type: "input_text"; text: string }>;
};

type ProviderAttempt = {
  ok: boolean;
  content?: string;
  status?: number;
  message?: string;
  provider: "responses" | "chat_completions";
};

function toInputItem(role: AssistantRole, text: string): OpenAIInputItem {
  return {
    role,
    content: [{ type: "input_text", text }],
  };
}

function extractProviderMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "No detail from provider.";
  }

  const errorMessage = (payload as { error?: { message?: unknown } }).error?.message;
  if (typeof errorMessage === "string" && errorMessage.trim()) {
    return errorMessage.trim();
  }

  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 360 ? `${serialized.slice(0, 360)}...` : serialized;
  } catch {
    return "Unable to serialize provider error payload.";
  }
}

function flattenMessages(input: OpenAIInputItem[]): Array<{ role: AssistantRole; content: string }> {
  return input.map((item) => ({
    role: item.role,
    content: item.content.map((part) => part.text).join("\n\n").trim(),
  }));
}

function extractChatCompletionsText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

async function attemptResponses(input: OpenAIInputItem[], signal: AbortSignal): Promise<ProviderAttempt> {
  const response = await fetch(RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      input,
    }),
    signal,
  });

  const json = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: extractProviderMessage(json),
      provider: "responses",
    };
  }

  const content = extractResponseText(json);
  if (!content) {
    return {
      ok: false,
      status: response.status,
      message: "Responses API returned success but no readable text.",
      provider: "responses",
    };
  }

  return { ok: true, content, provider: "responses" };
}

async function attemptChatCompletions(input: OpenAIInputItem[], signal: AbortSignal): Promise<ProviderAttempt> {
  const response = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: flattenMessages(input),
    }),
    signal,
  });

  const json = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: extractProviderMessage(json),
      provider: "chat_completions",
    };
  }

  const content = extractChatCompletionsText(json);
  if (!content) {
    return {
      ok: false,
      status: response.status,
      message: "Chat Completions API returned success but no readable text.",
      provider: "chat_completions",
    };
  }

  return { ok: true, content, provider: "chat_completions" };
}

function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) {
    return "";
  }
  return name.slice(idx + 1).toLowerCase();
}

function clampText(value: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.length > max ? `${trimmed.slice(0, max)}\n...[truncated]` : trimmed;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:md|mdx|markdown)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function looksLikeReadableText(value: string): boolean {
  const text = value.replace(/\s+/g, "");
  if (!text) {
    return false;
  }

  const sample = text.slice(0, 800);
  const readable = sample.match(/[A-Za-z0-9\u4e00-\u9fff.,;:!?()[\]{}'"`~+\-*/=<>_%$#@&\\|]/g)?.length ?? 0;
  return readable / sample.length > 0.45;
}

function detectLanguage(text: string): "zh" | "en" | "mixed" {
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);

  if (hasChinese && !hasEnglish) {
    return "zh";
  }

  if (hasEnglish && !hasChinese) {
    return "en";
  }

  return "mixed";
}

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

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `note-${stamp}`;
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

function extractFrontmatterText(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function splitTopic(topicInput: string, title: string): { topicZh: string; topicEn: string; topic: string } {
  const normalized = topicInput.trim();

  if (!normalized) {
    return {
      topicZh: "未分类",
      topicEn: "General",
      topic: "未分类 / General",
    };
  }

  const lang = detectLanguage(normalized);
  const topicZh = lang === "en" ? "未分类" : normalized;
  const topicEn = lang === "zh" ? title : normalized;

  return {
    topicZh,
    topicEn,
    topic: `${topicZh} / ${topicEn}`,
  };
}

async function extractSourceText(file: File): Promise<string> {
  const extension = fileExtension(file.name);

  if (SUPPORTED_DOC_EXTENSIONS.has(extension)) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const extracted = await mammoth.extractRawText({ buffer: bytes });
    const text = normalizeNewlines(extracted.value || "");
    return clampText(text, MAX_SOURCE_CHARS);
  }

  if (SUPPORTED_TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
    const text = normalizeNewlines(await file.text());
    return clampText(text, MAX_SOURCE_CHARS);
  }

  const fallback = normalizeNewlines(await file.text());
  if (!looksLikeReadableText(fallback)) {
    throw new Error("无法解析该文件类型。当前建议上传 txt / md / markdown / docx。");
  }
  return clampText(fallback, MAX_SOURCE_CHARS);
}

function buildStyleContext(
  notes: Array<{
    topicZh: string;
    topicEn: string;
    enTitle: string;
    zhTitle: string;
    source: string;
  }>,
): string {
  const sampled = notes.slice(-4);
  const chunks = sampled.map((note) => {
    const snippet = clampText(note.source, 3600);
    return [
      `### ${note.topicZh} / ${note.topicEn}`,
      `Title EN: ${note.enTitle}`,
      `Title ZH: ${note.zhTitle}`,
      "Sample MDX:",
      snippet,
    ].join("\n");
  });

  return clampText(chunks.join("\n\n---\n\n"), MAX_STYLE_CONTEXT_CHARS);
}

async function loadPromptTemplate(): Promise<string> {
  const content = await fs.readFile(PROMPT_TEMPLATE_PATH, "utf8");
  const normalized = content.trim();

  if (!normalized) {
    throw new Error("prompt.md 为空，无法生成笔记。");
  }

  return normalized;
}

function buildSystemPrompt(promptTemplate: string): string {
  return [
    promptTemplate,
    "",
    "你必须严格遵守以上全部要求。",
    "你只能输出最终 MDX 内容，不要输出解释、分析、前言或后记。",
  ].join("\n");
}

function buildUserPrompt(args: {
  title: string;
  topic: string;
  tags: string[];
  extractedSource: string;
  styleContext: string;
  extraInstruction?: string;
}): string {
  const extra = args.extraInstruction ? clampText(args.extraInstruction, MAX_EXTRA_INSTRUCTION_CHARS) : "";

  return [
    "请基于以下材料生成最终笔记，严格执行系统提示词中的全部规范。",
    "",
    `目标标题：${args.title}`,
    `目标主题：${args.topic || "未指定"}`,
    `目标标签：${args.tags.length ? args.tags.join("、") : "未指定"}`,
    "",
    "参考站内笔记风格样本：",
    args.styleContext || "(暂无样本)",
    "",
    "原始笔记材料：",
    args.extractedSource,
    "",
    extra ? `补充要求：\n${extra}\n` : "",
    "请直接输出最终 MDX 内容。",
  ].join("\n");
}

function buildFrontmatter(args: {
  title: string;
  slug: string;
  topic: string;
  topicZh: string;
  topicEn: string;
  tags: string[];
  data: Record<string, unknown>;
}) {
  const descriptionEn =
    extractFrontmatterText(args.data, "descriptionEn") ??
    extractFrontmatterText(args.data, "description") ??
    `Bilingual study notes on ${args.title}.`;

  const descriptionZh =
    extractFrontmatterText(args.data, "descriptionZh") ??
    extractFrontmatterText(args.data, "description") ??
    `关于“${args.title}”的双语学习笔记。`;

  const description = extractFrontmatterText(args.data, "description") ?? descriptionEn;

  return {
    title: args.title,
    description,
    descriptionZh,
    descriptionEn,
    slug: args.slug,
    topic: args.topic,
    topicZh: args.topicZh,
    topicEn: args.topicEn,
    tags: args.tags,
    order: Date.now(),
  };
}

function normalizeGeneratedMdx(raw: string, args: {
  title: string;
  slug: string;
  topic: string;
  topicZh: string;
  topicEn: string;
  tags: string[];
}): string {
  const cleaned = normalizeNewlines(stripCodeFence(raw));
  const parsed = matter(cleaned);
  const content = parsed.content.trim();

  if (!content) {
    throw new Error("AI 返回内容为空，无法生成 MDX。");
  }

  const frontmatter = buildFrontmatter({
    ...args,
    data: parsed.data as Record<string, unknown>,
  });

  return `${matter.stringify(`${content}\n`, frontmatter).trimEnd()}\n`;
}

function asBoolean(value: FormDataEntryValue | null): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY 未配置。请先在 .env.local 中配置。" }, { status: 500 });
    }

    const formData = await request.formData();
    const title = String(formData.get("title") ?? "").trim();
    const topicInput = String(formData.get("topic") ?? "").trim();
    const tagsInput = String(formData.get("tags") ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "请先填写笔记标题。" }, { status: 400 });
    }

    const sourceFile = formData.get("sourceFile");
    if (!(sourceFile instanceof File)) {
      return NextResponse.json({ error: "请先上传文档文件。" }, { status: 400 });
    }

    if (sourceFile.size <= 0) {
      return NextResponse.json({ error: "上传文件为空，请检查后重试。" }, { status: 400 });
    }

    if (sourceFile.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "文件过大，请控制在 4MB 以内。" }, { status: 400 });
    }

    const overwrite = asBoolean(formData.get("overwrite"));
    const extraInstruction = String(formData.get("extraInstruction") ?? "");

    const slug = slugifyTitle(title);
    const tags = parseTagsInput(tagsInput);
    const topicParts = splitTopic(topicInput, title);

    const existingNotes = await getWeekNotes();
    const existedBySlug = existingNotes.find((note) => note.slug === slug) ?? null;

    const targetFilePath = existedBySlug?.filePath ?? path.join(NOTES_DIR_PATH, `${slug}.mdx`);

    let fileExists = false;
    try {
      await fs.access(targetFilePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    if (fileExists && !overwrite) {
      return NextResponse.json(
        {
          error: `slug 为 ${slug} 的笔记已存在。若要覆盖，请勾选“允许覆盖”。`,
        },
        { status: 409 },
      );
    }

    const extractedSource = await extractSourceText(sourceFile);
    if (!extractedSource || extractedSource.length < 40) {
      return NextResponse.json({ error: "文档可解析内容过少，无法生成有效笔记。" }, { status: 400 });
    }

    const promptTemplate = await loadPromptTemplate();
    const styleContext = buildStyleContext(existingNotes);

    const messages: OpenAIInputItem[] = [
      toInputItem("system", buildSystemPrompt(promptTemplate)),
      toInputItem(
        "user",
        buildUserPrompt({
          title,
          topic: topicInput,
          tags,
          extractedSource,
          styleContext,
          extraInstruction,
        }),
      ),
    ];

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 70_000);

    const responsesAttempt = await attemptResponses(messages, abortController.signal);
    let generated = responsesAttempt.ok ? responsesAttempt.content ?? "" : "";

    if (!generated) {
      const chatAttempt = await attemptChatCompletions(messages, abortController.signal);
      clearTimeout(timeout);

      if (!chatAttempt.ok) {
        const fallbackError = [
          `responses: HTTP ${responsesAttempt.status ?? "?"} - ${responsesAttempt.message ?? "unknown error"}`,
          `chat_completions: HTTP ${chatAttempt.status ?? "?"} - ${chatAttempt.message ?? "unknown error"}`,
        ].join(" | ");

        return NextResponse.json(
          {
            error: `AI provider returned an error. ${fallbackError}`,
          },
          { status: 502 },
        );
      }

      generated = chatAttempt.content ?? "";
    } else {
      clearTimeout(timeout);
    }

    const normalizedMdx = normalizeGeneratedMdx(generated, {
      title,
      slug,
      topic: topicParts.topic,
      topicZh: topicParts.topicZh,
      topicEn: topicParts.topicEn,
      tags,
    });

    await fs.mkdir(NOTES_DIR_PATH, { recursive: true });
    await fs.writeFile(targetFilePath, normalizedMdx, "utf8");

    const createdNotes = await getWeekNotes();
    const created = createdNotes.find((note) => note.slug === slug);
    const preview = normalizedMdx.split(/\r?\n/).slice(0, 28).join("\n");

    return NextResponse.json({
      success: true,
      slug,
      replaced: fileExists,
      note: created
        ? {
            slug: created.slug,
            weekLabelZh: created.weekLabelZh,
            weekLabelEn: created.weekLabelEn,
            zhTitle: created.zhTitle,
            enTitle: created.enTitle,
            descriptionZh: created.descriptionZh,
            descriptionEn: created.descriptionEn,
            tags: created.tags,
          }
        : null,
      fileName: path.basename(targetFilePath),
      preview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
