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

  // Best-effort fallback for unknown text-ish formats.
  const fallback = normalizeNewlines(await file.text());
  if (!looksLikeReadableText(fallback)) {
    throw new Error("无法解析该文件类型。当前建议上传 txt / md / markdown / docx。");
  }
  return clampText(fallback, MAX_SOURCE_CHARS);
}

function buildStyleContext(
  notes: Array<{
    weekLabelZh: string;
    weekLabelEn: string;
    enTitle: string;
    zhTitle: string;
    source: string;
  }>,
): string {
  const sampled = notes.slice(-4);
  const chunks = sampled.map((note) => {
    const snippet = clampText(note.source, 3600);
    return [
      `### ${note.weekLabelZh} / ${note.weekLabelEn}`,
      `Title EN: ${note.enTitle}`,
      `Title ZH: ${note.zhTitle}`,
      "Sample MDX:",
      snippet,
    ].join("\n");
  });

  return clampText(chunks.join("\n\n---\n\n"), MAX_STYLE_CONTEXT_CHARS);
}

function buildSystemPrompt(): string {
  return [
    "You generate MDX study notes for a bilingual note website.",
    "Output only valid MDX content, no explanations and no code fences.",
    "Must follow the project's style: academic, clear hierarchy, formula-friendly, bilingual learning flow.",
    "Bilingual rule: Chinese line first, then English line directly below for prose points.",
    "Do not duplicate formulas in both languages. For formulas, render once with LaTeX.",
    "Use markdown lists where helpful to improve structure.",
    "Keep terminology consistent with the uploaded source material.",
    "Use these allowed MDX blocks when useful: TheoremBlock, DefinitionBlock, ExampleBlock, WarningBlock, SummaryBlock, FormulaBlock, PracticeQuestionBlock.",
    "Include frontmatter with keys: title, description, descriptionZh, descriptionEn, week, order, slug.",
    "Slug must be week-{n}.",
  ].join("\n");
}

function buildUserPrompt(args: {
  weekNumber: number;
  extractedSource: string;
  styleContext: string;
  extraInstruction?: string;
}): string {
  const extra = args.extraInstruction ? clampText(args.extraInstruction, MAX_EXTRA_INSTRUCTION_CHARS) : "";

  return [
    `Generate week ${args.weekNumber} MDX notes from the uploaded source.`,
    "",
    "Hard constraints:",
    `- week: ${args.weekNumber}`,
    `- order: ${args.weekNumber}`,
    `- slug: week-${args.weekNumber}`,
    "- Keep a strong section hierarchy with H2/H3 headings.",
    "- Add concise summaries and at least one practice question block when relevant.",
    "- Keep formulas in proper LaTeX ($...$ or $$...$$).",
    "",
    "Reference style from existing project notes:",
    args.styleContext || "(No style context available)",
    "",
    "Uploaded source material:",
    args.extractedSource,
    "",
    extra ? `Extra user instruction:\n${extra}\n` : "",
    "Return only final MDX text.",
  ].join("\n");
}

function buildFrontmatter(weekNumber: number, data: Record<string, unknown>) {
  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : `Week ${weekNumber} - Study Notes`;

  const descriptionEn =
    typeof data.descriptionEn === "string" && data.descriptionEn.trim()
      ? data.descriptionEn.trim()
      : `Bilingual study notes for week ${weekNumber}.`;

  const descriptionZh =
    typeof data.descriptionZh === "string" && data.descriptionZh.trim()
      ? data.descriptionZh.trim()
      : `第${weekNumber}周双语学习笔记。`;

  const description =
    typeof data.description === "string" && data.description.trim() ? data.description.trim() : descriptionEn;

  return {
    title,
    description,
    descriptionZh,
    descriptionEn,
    week: weekNumber,
    order: weekNumber,
    slug: `week-${weekNumber}`,
  };
}

function normalizeGeneratedMdx(raw: string, weekNumber: number): string {
  const cleaned = normalizeNewlines(stripCodeFence(raw));
  const parsed = matter(cleaned);
  const content = parsed.content.trim();

  if (!content) {
    throw new Error("AI 返回内容为空，无法生成 MDX。");
  }

  const frontmatter = buildFrontmatter(weekNumber, parsed.data as Record<string, unknown>);
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
    const weekRaw = String(formData.get("weekNumber") ?? "").trim();
    const weekNumber = Number.parseInt(weekRaw, 10);

    if (!Number.isFinite(weekNumber) || weekNumber < 1 || weekNumber > 99) {
      return NextResponse.json({ error: "请输入有效周次（1-99）。" }, { status: 400 });
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

    const targetFilePath = path.join(process.cwd(), `week${weekNumber}.mdx`);
    const targetSlug = `week-${weekNumber}`;

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
          error: `week${weekNumber}.mdx 已存在。若要覆盖，请勾选“允许覆盖已有周”。`,
        },
        { status: 409 },
      );
    }

    const extractedSource = await extractSourceText(sourceFile);
    if (!extractedSource || extractedSource.length < 40) {
      return NextResponse.json({ error: "文档可解析内容过少，无法生成有效笔记。" }, { status: 400 });
    }

    const existingNotes = await getWeekNotes();
    const styleContext = buildStyleContext(existingNotes);

    const messages: OpenAIInputItem[] = [
      toInputItem("system", buildSystemPrompt()),
      toInputItem(
        "user",
        buildUserPrompt({
          weekNumber,
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

    const normalizedMdx = normalizeGeneratedMdx(generated, weekNumber);
    await fs.writeFile(targetFilePath, normalizedMdx, "utf8");

    const createdNotes = await getWeekNotes();
    const created = createdNotes.find((note) => note.slug === targetSlug);
    const preview = normalizedMdx.split(/\r?\n/).slice(0, 28).join("\n");

    return NextResponse.json({
      success: true,
      weekNumber,
      slug: targetSlug,
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
