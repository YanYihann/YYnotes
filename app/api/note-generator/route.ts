import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import JSZip from "jszip";
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { getWeekNotes } from "@/lib/content";
import { splitBilingualNoteSections } from "@/lib/bilingual-note";
import { extractResponseText } from "@/lib/ai/note-assistant";

export const runtime = "nodejs";

const DEFAULT_MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ALLOWED_MODEL_NAMES = new Set([
  "qwen3.6-flash",
  "gpt-4.1-mini",
]);
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.openai.com/v1";
const RESPONSES_ENDPOINT = `${OPENAI_BASE_URL}/responses`;
const CHAT_COMPLETIONS_ENDPOINT = `${OPENAI_BASE_URL}/chat/completions`;
const PROMPT_TEMPLATE_PATH = path.join(process.cwd(), "prompt.md");
const NOTES_DIR_PATH = path.join(process.cwd(), "笔记");

const MAX_SOURCE_CHARS = 35_000;
const MAX_STYLE_CONTEXT_CHARS = 16_000;
const MAX_METADATA_SOURCE_CHARS = 8_000;
const MAX_EXTRA_INSTRUCTION_CHARS = 1_500;
const SUPPORTED_TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "tex", "csv", "rst"]);

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

type InferredMetadata = {
  title: string;
  topic: string;
  tags: string[];
};

function toInputItem(role: AssistantRole, text: string): OpenAIInputItem {
  return {
    role,
    content: [{ type: "input_text", text }],
  };
}

function resolveModelName(requestedModel?: string): string {
  const normalized = String(requestedModel ?? "").trim();
  if (normalized && ALLOWED_MODEL_NAMES.has(normalized)) {
    return normalized;
  }
  return DEFAULT_MODEL_NAME;
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

async function attemptResponses(input: OpenAIInputItem[], modelName: string, signal: AbortSignal): Promise<ProviderAttempt> {
  const response = await fetch(RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
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

async function attemptChatCompletions(input: OpenAIInputItem[], modelName: string, signal: AbortSignal): Promise<ProviderAttempt> {
  const response = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
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

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function compressBlankLines(text: string): string {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractPptxText(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const aNum = Number.parseInt(a.match(/slide(\d+)\.xml/i)?.[1] ?? "0", 10);
      const bNum = Number.parseInt(b.match(/slide(\d+)\.xml/i)?.[1] ?? "0", 10);
      return aNum - bNum;
    });

  const slides: string[] = [];

  for (const slideName of slideNames) {
    const file = zip.file(slideName);
    if (!file) {
      continue;
    }

    const xml = await file.async("string");
    const plain = decodeXmlEntities(
      xml
        .replace(/<a:tab[^>]*\/>/gi, "\t")
        .replace(/<a:br[^>]*\/>/gi, "\n")
        .replace(/<\/a:p>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    );

    const cleaned = compressBlankLines(normalizeNewlines(plain));
    if (cleaned) {
      slides.push(cleaned);
    }
  }

  if (!slides.length) {
    throw new Error("未能从 PPTX 中提取到文本内容，请检查文件是否为可编辑的 .pptx。");
  }

  return clampText(slides.join("\n\n"), MAX_SOURCE_CHARS);
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

function parseTagsUnknown(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof raw === "string") {
    return parseTagsInput(raw);
  }

  return [];
}

function hasChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function extractChinesePhrases(value: string): string[] {
  return (value.match(/[\u4e00-\u9fff]{2,}/g) ?? []).map((item) => item.trim()).filter(Boolean);
}

function deriveTitleFromFileName(fileName: string): string {
  const normalized = fileName.trim();
  if (!normalized) {
    return "";
  }

  const dotIndex = normalized.lastIndexOf(".");
  const base = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;

  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function deriveTitleFromSource(source: string): string {
  const lines = normalizeNewlines(source)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$([^$]+)\$/g, "$1")
      .trim();

    if (normalized.length < 2 || !hasChinese(normalized)) {
      continue;
    }

    return normalized.slice(0, 80);
  }

  for (const line of lines) {
    const normalized = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$([^$]+)\$/g, "$1")
      .trim();

    if (normalized.length >= 2) {
      return normalized.slice(0, 80);
    }
  }

  return "";
}

function fallbackTagsFromMetadata(title: string, topic: string): string[] {
  const candidates = [
    ...extractChinesePhrases(topic),
    ...extractChinesePhrases(title),
    ...[topic, title].flatMap((value) => value.split(/[\/|,，、]+/)),
  ]
    .map((value) => value.trim().replace(/^#+/, ""))
    .filter((value) => value.length >= 2 && value.length <= 24 && hasChinese(value));

  const dedup = new Set<string>();
  for (const candidate of candidates) {
    dedup.add(candidate);
    if (dedup.size >= 6) {
      break;
    }
  }

  return Array.from(dedup);
}

function parseMetadataResponse(raw: string): Partial<InferredMetadata> {
  const cleaned = stripCodeFence(raw).trim();
  if (!cleaned) {
    return {};
  }

  let jsonText = cleaned;
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonText = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      title?: unknown;
      topic?: unknown;
      tags?: unknown;
    };

    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const topic = typeof parsed.topic === "string" ? parsed.topic.trim() : "";
    const tags = parseTagsUnknown(parsed.tags);

    return {
      title: title || undefined,
      topic: topic || undefined,
      tags: tags.length ? tags : undefined,
    };
  } catch {
    return {};
  }
}

function deriveTopicFromSource(source: string): string {
  const lines = normalizeNewlines(source)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s+/, "")
      .trim();

    if (!normalized) {
      continue;
    }

    const phrases = extractChinesePhrases(normalized);
    const candidate = phrases.find((item) => item.length >= 2 && item.length <= 16);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function deriveTopicFromTitleOrTags(title: string, tags: string[]): string {
  const titlePhrases = extractChinesePhrases(title);
  const titleCandidate = titlePhrases.find((item) => item.length >= 2 && item.length <= 16);
  if (titleCandidate) {
    return titleCandidate;
  }

  const tagCandidate = tags
    .map((item) => item.trim())
    .find((item) => item.length >= 2 && item.length <= 16 && hasChinese(item));
  if (tagCandidate) {
    return tagCandidate;
  }

  return "学习笔记";
}

async function inferMissingMetadata(args: {
  sourceText: string;
  fileName: string;
  modelName: string;
}): Promise<Partial<InferredMetadata>> {
  const systemPrompt = [
    "你是学习笔记元信息生成器。",
    "必须返回 JSON，不要输出 markdown 和解释文字。",
    'Schema: {"title":"...","topic":"...","tags":["...","..."]}',
    "规则：",
    "- title/topic/tags 必须是中文",
    "- title 要具体、简洁，长度不超过 24 字",
    "- topic 是更高层级分类，长度不超过 16 字",
    "- tags 返回 3 到 6 个中文标签",
  ].join("\n");

  const userPrompt = [
    "请根据以下文件内容推断笔记元信息，并严格按 JSON 返回。",
    `文件名：${args.fileName || "unknown"}`,
    "",
    "资料内容：",
    clampText(args.sourceText, MAX_METADATA_SOURCE_CHARS),
  ].join("\n");

  const input: OpenAIInputItem[] = [toInputItem("system", systemPrompt), toInputItem("user", userPrompt)];
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 25_000);

  try {
    const responsesAttempt = await attemptResponses(input, args.modelName, abortController.signal);
    if (responsesAttempt.ok && responsesAttempt.content) {
      return parseMetadataResponse(responsesAttempt.content);
    }

    const chatAttempt = await attemptChatCompletions(input, args.modelName, abortController.signal);
    if (chatAttempt.ok && chatAttempt.content) {
      return parseMetadataResponse(chatAttempt.content);
    }

    return {};
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveGenerationMetadata(args: {
  titleInput: string;
  topicInput: string;
  tagsInput: string[];
  sourceText: string;
  fileName: string;
  modelName: string;
}): Promise<InferredMetadata> {
  const hasManualTitle = args.titleInput.trim().length > 0;
  const hasManualTopic = args.topicInput.trim().length > 0;
  const hasManualTags = args.tagsInput.length > 0;

  let title = args.titleInput.trim();
  let topic = args.topicInput.trim();
  let tags = args.tagsInput.slice(0, 12);

  if (!title || !topic || !tags.length) {
    try {
      const inferred = await inferMissingMetadata({
        sourceText: args.sourceText,
        fileName: args.fileName,
        modelName: args.modelName,
      });

      if (!title && inferred.title) {
        title = inferred.title.trim();
      }

      if (!topic && inferred.topic) {
        topic = inferred.topic.trim();
      }

      if (!tags.length && inferred.tags?.length) {
        tags = inferred.tags.slice(0, 12);
      }
    } catch {
      // Best effort. Fall through to deterministic heuristics below.
    }
  }

  if (!title) {
    title = deriveTitleFromSource(args.sourceText) || deriveTitleFromFileName(args.fileName) || "未命名笔记";
  }

  if (!hasManualTitle && !hasChinese(title)) {
    title = deriveTitleFromSource(args.sourceText) || "未命名笔记";
  }

  if (!topic) {
    topic = deriveTopicFromSource(args.sourceText) || deriveTopicFromTitleOrTags(title, tags);
  }

  if (!hasManualTopic && !hasChinese(topic)) {
    topic = deriveTopicFromSource(args.sourceText) || deriveTopicFromTitleOrTags(title, tags);
  }

  if (!hasManualTags) {
    tags = tags.filter((tag) => hasChinese(tag));
    if (!tags.length) {
      tags = fallbackTagsFromMetadata(title, topic);
    }

    if (!tags.length) {
      tags = ["学习笔记", "知识整理"];
    }
  }

  return {
    title: title.trim(),
    topic: topic.trim(),
    tags: tags.slice(0, 12),
  };
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
    const topicZh = deriveTopicFromTitleOrTags(title, []);
    return {
      topicZh,
      topicEn: "General",
      topic: `${topicZh} / General`,
    };
  }

  const lang = detectLanguage(normalized);
  const topicZh = lang === "en" ? deriveTopicFromTitleOrTags(title, []) : normalized;
  const topicEn = lang === "zh" ? title || "General" : normalized;

  return {
    topicZh,
    topicEn,
    topic: `${topicZh} / ${topicEn}`,
  };
}

async function extractSourceText(file: File): Promise<string> {
  const extension = fileExtension(file.name);

  if (extension === "docx") {
    const bytes = Buffer.from(await file.arrayBuffer());
    const extracted = await mammoth.extractRawText({ buffer: bytes });
    const text = normalizeNewlines(extracted.value || "");
    return clampText(text, MAX_SOURCE_CHARS);
  }

  if (extension === "pptx") {
    const bytes = Buffer.from(await file.arrayBuffer());
    return extractPptxText(bytes);
  }

  if (extension === "doc" || extension === "ppt") {
    throw new Error("暂不支持旧版 .doc / .ppt，请先另存为 .docx / .pptx 后再上传。");
  }

  if (SUPPORTED_TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
    const text = normalizeNewlines(await file.text());
    return clampText(text, MAX_SOURCE_CHARS);
  }

  const fallback = normalizeNewlines(await file.text());
  if (!looksLikeReadableText(fallback)) {
    throw new Error("无法解析该文件类型。当前支持 txt / md / markdown / docx / pptx。");
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

function normalizeMathDelimiters(text: string): string {
  let output = text;

  output = output.replace(/```(?:math|latex|tex)\s*\n([\s\S]*?)\n```/gi, (_match, body: string) => {
    const normalized = body.trim();
    if (!normalized) {
      return "";
    }
    return `$$\n${normalized}\n$$`;
  });

  output = output.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, body: string) => {
    const normalized = body.trim();
    if (!normalized) {
      return "";
    }
    return `$$\n${normalized}\n$$`;
  });

  output = output.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, body: string) => {
    const normalized = body.trim();
    if (!normalized) {
      return "";
    }
    return `$${normalized}$`;
  });

  output = output.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, (segment) => segment.replace(/\\\\([A-Za-z])/g, "\\$1"));
  return output;
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
  const content = normalizeMathDelimiters(parsed.content.trim());

  if (!content) {
    throw new Error("AI 返回内容为空，无法生成 MDX。");
  }

  const sections = splitBilingualNoteSections(content);
  if (!sections.hasStructuredSections) {
    throw new Error('AI 输出不符合新模板：必须包含“## 中文版笔记”与“## English Version”两个完整分段。');
  }

  const canonicalContent = [
    "## 中文版笔记",
    "",
    sections.zhBody.trim(),
    "",
    "---",
    "",
    "## English Version",
    "",
    sections.enBody.trim(),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const frontmatter = buildFrontmatter({
    ...args,
    data: parsed.data as Record<string, unknown>,
  });

  return `${matter.stringify(`${canonicalContent}\n`, frontmatter).trimEnd()}\n`;
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
    const titleInput = String(formData.get("title") ?? "").trim();
    const topicInput = String(formData.get("topic") ?? "").trim();
    const tagsInput = String(formData.get("tags") ?? "").trim();

    const sourceFileEntry = formData.get("sourceFile");
    const sourceTextInput = normalizeNewlines(String(formData.get("sourceText") ?? ""));
    const fileNameInput = String(formData.get("fileName") ?? "").trim();
    const sourceFile = sourceFileEntry instanceof File ? sourceFileEntry : null;

    const overwrite = asBoolean(formData.get("overwrite"));
    const extraInstruction = String(formData.get("extraInstruction") ?? "");
    const modelName = resolveModelName(String(formData.get("model") ?? ""));

    let extractedSource = "";
    let resolvedFileName = fileNameInput;

    if (sourceFile) {
      if (sourceFile.size <= 0) {
        return NextResponse.json({ error: "上传文件为空，请检查后重试。" }, { status: 400 });
      }
      extractedSource = await extractSourceText(sourceFile);
      resolvedFileName = sourceFile.name;
    } else {
      extractedSource = clampText(sourceTextInput, MAX_SOURCE_CHARS);
      if (!extractedSource) {
        return NextResponse.json({ error: "请先上传文档文件，或提供可解析的文本内容。" }, { status: 400 });
      }
    }

    if (!extractedSource || extractedSource.length < 40) {
      return NextResponse.json({ error: "文档可解析内容过少，无法生成有效笔记。" }, { status: 400 });
    }

    const resolvedMeta = await resolveGenerationMetadata({
      titleInput,
      topicInput,
      tagsInput: parseTagsInput(tagsInput),
      sourceText: extractedSource,
      fileName: resolvedFileName,
      modelName,
    });

    const title = resolvedMeta.title;
    const slug = slugifyTitle(title);
    const tags = resolvedMeta.tags;
    const topicParts = splitTopic(resolvedMeta.topic, title);

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

    const promptTemplate = await loadPromptTemplate();
    const styleContext = buildStyleContext(existingNotes);

    const messages: OpenAIInputItem[] = [
      toInputItem("system", buildSystemPrompt(promptTemplate)),
      toInputItem(
        "user",
        buildUserPrompt({
          title,
          topic: resolvedMeta.topic,
          tags,
          extractedSource,
          styleContext,
          extraInstruction,
        }),
      ),
    ];

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 70_000);

    const responsesAttempt = await attemptResponses(messages, modelName, abortController.signal);
    let generated = responsesAttempt.ok ? responsesAttempt.content ?? "" : "";

    if (!generated) {
      const chatAttempt = await attemptChatCompletions(messages, modelName, abortController.signal);
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

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          slug?: unknown;
          title?: unknown;
          topic?: unknown;
          tags?: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "请求体格式无效。" }, { status: 400 });
    }

    const slug = String(body.slug ?? "").trim();
    if (!slug) {
      return NextResponse.json({ error: "缺少 slug。" }, { status: 400 });
    }

    const allNotes = await getWeekNotes();
    const target = allNotes.find((note) => note.slug === slug);
    if (!target) {
      return NextResponse.json({ error: "未找到对应笔记。" }, { status: 404 });
    }

    const titleInput = typeof body.title === "string" ? body.title.trim() : "";
    const topicInput = typeof body.topic === "string" ? body.topic.trim() : "";
    const tagsInput =
      typeof body.tags === "string"
        ? parseTagsInput(body.tags)
        : Array.isArray(body.tags)
          ? parseTagsUnknown(body.tags)
          : [];

    const nextTitle = titleInput || target.zhTitle || target.enTitle || "未命名笔记";
    const nextTags = tagsInput.length ? tagsInput.slice(0, 12) : target.tags.slice(0, 12);
    const topicSeed = topicInput || target.topicZh || deriveTopicFromTitleOrTags(nextTitle, nextTags);
    const topicParts = splitTopic(topicSeed, nextTitle);

    const raw = await fs.readFile(target.filePath, "utf8");
    const parsed = matter(raw);
    const data = { ...(parsed.data as Record<string, unknown>) };
    const content = normalizeNewlines(parsed.content).trimEnd();

    data.title = nextTitle;
    data.topic = topicParts.topic;
    data.topicZh = topicParts.topicZh;
    data.topicEn = topicParts.topicEn;
    data.tags = nextTags;

    const updatedRaw = `${matter.stringify(`${content}\n`, data).trimEnd()}\n`;
    await fs.writeFile(target.filePath, updatedRaw, "utf8");

    const refreshed = (await getWeekNotes()).find((note) => note.slug === slug);

    return NextResponse.json({
      success: true,
      slug,
      note: refreshed
        ? {
            slug: refreshed.slug,
            weekLabelZh: refreshed.weekLabelZh,
            weekLabelEn: refreshed.weekLabelEn,
            zhTitle: refreshed.zhTitle,
            enTitle: refreshed.enTitle,
            descriptionZh: refreshed.descriptionZh,
            descriptionEn: refreshed.descriptionEn,
            tags: refreshed.tags,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新元信息失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
