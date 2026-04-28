import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { NextResponse } from "next/server";
import { getTrashedWeekBySlug, getTrashedWeekNotes, getWeekBySlug, getWeekNotes } from "@/lib/content";
import { extractDynamicDemoSpecsFromContent, normalizeDynamicDemoMarkup } from "@/lib/dynamic-demo-components";
import { materializeGeneratedDemoFiles } from "@/lib/generated-demo-files";
import { injectInteractiveDemosIntoNoteContent, selectInteractiveDemos } from "@/lib/interactive-demos";
import { extractResponseText } from "@/lib/ai/note-assistant";

const NOTES_DIR_PATH = path.resolve(path.join(process.cwd(), "\u7B14\u8BB0"));
const TRASH_DIR_PATH = path.resolve(path.join(process.cwd(), "\u7B14\u8BB0\u56DE\u6536\u7AD9"));
const DEFAULT_DESCRIPTION_ZH = "\u5BFC\u5165\u7684 Markdown \u7B14\u8BB0\u3002";
const IMPORT_METADATA_MODEL = "deepseek-v4-flash";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.openai.com/v1";
const MAX_IMPORT_METADATA_SOURCE_CHARS = 8_000;

type ImportedCardMetadata = {
  topicZh?: string;
  topicEn?: string;
  descriptionZh?: string;
  descriptionEn?: string;
};

async function materializeLocalDynamicDemos(source: string): Promise<string> {
  const specs = extractDynamicDemoSpecsFromContent(source);
  if (!specs.length) {
    return source;
  }

  try {
    await materializeGeneratedDemoFiles(specs);
  } catch (error) {
    console.error("Failed to materialize generated demo files:", error);
  }

  return normalizeDynamicDemoMarkup(source);
}

function ensureInsideDir(targetPath: string, rootDir: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedRoot = path.resolve(rootDir);
  const prefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;
  return normalizedTarget.startsWith(prefix);
}

function parseSlugFromRequest(request: Request): string {
  const url = new URL(request.url);
  const rawSlug = url.searchParams.get("slug") ?? "";
  return decodeURIComponent(String(rawSlug)).trim();
}

function parseBooleanFlag(request: Request, key: string): boolean {
  const url = new URL(request.url);
  const raw = String(url.searchParams.get(key) ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizeEditableText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeEditableContent(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function hasCompleteFrontmatterBlock(value: string): boolean {
  return /^---\n[\s\S]*?\n---\n/.test(value);
}

function extractMarkdownFromAssistantResponse(value: string): string {
  const normalized = normalizeEditableContent(value);
  if (!normalized) {
    return "";
  }

  const wholeMarkdownFenceMatch = normalized.match(/^```(?:md|mdx|markdown)\s*\n([\s\S]*?)\n```$/i);
  if (wholeMarkdownFenceMatch?.[1]?.trim()) {
    return wholeMarkdownFenceMatch[1].trim();
  }

  const frontmatterIndex = normalized.indexOf("---\n");
  if (frontmatterIndex > 0) {
    const possibleFrontmatter = normalized.slice(frontmatterIndex).trim();
    if (hasCompleteFrontmatterBlock(possibleFrontmatter)) {
      return possibleFrontmatter;
    }
  }

  return normalized;
}

function slugifyTitle(input: string): string {
  const normalized = String(input ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `note-${Date.now()}`;
}

function resolveUniqueSlug(baseSlug: string, takenSlugs: Iterable<string>): string {
  const taken = new Set(Array.from(takenSlugs, (slug) => String(slug ?? "").trim()).filter(Boolean));
  if (!taken.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (taken.has(`${baseSlug}-${counter}`)) {
    counter += 1;
  }

  return `${baseSlug}-${counter}`;
}

function extractDescriptionFromBody(markdown: string): string {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(#{1,6}\s|>\s|```|\$\$|---$)/.test(line));

  const firstLine = lines[0] ?? "";
  if (!firstLine) {
    return DEFAULT_DESCRIPTION_ZH;
  }

  return firstLine
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .trim()
    .slice(0, 140) || DEFAULT_DESCRIPTION_ZH;
}

function clampImportMetadataSource(value: string): string {
  const normalized = normalizeEditableContent(value);
  return normalized.length > MAX_IMPORT_METADATA_SOURCE_CHARS
    ? `${normalized.slice(0, MAX_IMPORT_METADATA_SOURCE_CHARS)}\n...[truncated]`
    : normalized;
}

function extractChatCompletionText(payload: unknown): string {
  const choices = (payload as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(choices) || choices.length < 1) {
    return "";
  }

  const content = (choices[0] as { message?: { content?: unknown } } | null)?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => (typeof (item as { text?: unknown } | null)?.text === "string" ? String((item as { text: string }).text) : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function parseImportedCardMetadata(raw: string): ImportedCardMetadata {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const topicZh = String(parsed.topicZh ?? parsed.topic ?? "").replace(/\s+/g, " ").trim().slice(0, 64);
    const topicEn = String(parsed.topicEn ?? "").replace(/\s+/g, " ").trim().slice(0, 64);
    const descriptionZh = String(parsed.subtitleZh ?? parsed.descriptionZh ?? parsed.subtitle ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const descriptionEn = String(parsed.subtitleEn ?? parsed.descriptionEn ?? "").replace(/\s+/g, " ").trim().slice(0, 180);

    return {
      topicZh: topicZh || undefined,
      topicEn: topicEn || undefined,
      descriptionZh: descriptionZh || undefined,
      descriptionEn: descriptionEn || undefined,
    };
  } catch {
    return {};
  }
}

async function inferImportedCardMetadata(params: {
  title: string;
  topicInput: string;
  fileName: string;
  markdown: string;
}): Promise<ImportedCardMetadata> {
  if (!process.env.OPENAI_API_KEY) {
    return {};
  }

  const systemPrompt = [
    "You generate metadata for imported Markdown note cards.",
    "Return JSON only. Do not return markdown or explanations.",
    'Schema: {"topicZh":"...","topicEn":"...","subtitleZh":"...","subtitleEn":"..."}',
    "Rules:",
    "- Do not rewrite the card title.",
    "- topicZh must be a concise Chinese knowledge domain, no more than 16 Chinese characters.",
    "- topicEn must be the aligned English topic, no more than 5 words.",
    "- subtitleZh must summarize what this note helps the student learn, no more than 48 Chinese characters.",
    "- subtitleEn must be the aligned English subtitle, no more than 90 English characters.",
  ].join("\n");
  const userPrompt = [
    `Fixed card title: ${params.title}`,
    `Imported file name: ${params.fileName || params.title}`,
    params.topicInput ? `User-provided topic hint: ${params.topicInput}` : "User-provided topic hint: none",
    "",
    "Markdown note content:",
    clampImportMetadataSource(params.markdown),
  ].join("\n");
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const input = messages.map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }));
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 25_000);

  try {
    const responsesResponse = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMPORT_METADATA_MODEL,
        input,
      }),
      signal: abortController.signal,
    });
    const responsesJson = await responsesResponse.json().catch(() => null);
    if (responsesResponse.ok) {
      const text = extractResponseText(responsesJson);
      if (text) {
        const parsed = parseImportedCardMetadata(text);
        if (parsed.topicZh || parsed.descriptionZh) {
          return parsed;
        }
      }
    }

    const chatResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMPORT_METADATA_MODEL,
        messages,
      }),
      signal: abortController.signal,
    });
    const chatJson = await chatResponse.json().catch(() => null);
    if (!chatResponse.ok) {
      return {};
    }

    return parseImportedCardMetadata(extractChatCompletionText(chatJson));
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

function buildNoteListPayload(notes: Awaited<ReturnType<typeof getWeekNotes>>, trashed: boolean) {
  return notes.map((note) => ({
    slug: note.slug,
    weekLabelZh: note.weekLabelZh,
    weekLabelEn: note.weekLabelEn,
    zhTitle: note.zhTitle,
    enTitle: note.enTitle,
    descriptionZh: note.descriptionZh,
    descriptionEn: note.descriptionEn,
    topicZh: note.topicZh,
    order: note.order,
    trashed,
  }));
}

async function moveNoteBetweenDirs(params: {
  slug: string;
  fromTrash: boolean;
  destinationDir: string;
}) {
  const note = params.fromTrash ? await getTrashedWeekBySlug(params.slug) : await getWeekBySlug(params.slug);
  if (!note) {
    return null;
  }

  const sourceRoot = params.fromTrash ? TRASH_DIR_PATH : NOTES_DIR_PATH;
  if (!ensureInsideDir(note.filePath, sourceRoot)) {
    throw new Error("Refusing to move file outside the expected note directory.");
  }

  const rawSource = await fs.readFile(note.filePath, "utf8");
  const parsed = matter(rawSource);
  const destinationNotes = params.destinationDir === TRASH_DIR_PATH ? await getTrashedWeekNotes() : await getWeekNotes();
  const nextSlug = resolveUniqueSlug(
    note.slug,
    destinationNotes.map((item) => item.slug),
  );

  const frontmatter = { ...(parsed.data as Record<string, unknown>), slug: nextSlug };
  const targetFilePath = path.join(params.destinationDir, `${nextSlug}.mdx`);
  await fs.mkdir(params.destinationDir, { recursive: true });
  await fs.writeFile(targetFilePath, matter.stringify(parsed.content, frontmatter), "utf8");
  await fs.unlink(note.filePath);

  return {
    previousSlug: note.slug,
    nextSlug,
    fileName: path.basename(targetFilePath),
  };
}

async function createImportedNote(params: {
  title: string;
  topic?: string;
  fileName?: string;
  content: string;
  generateInteractiveDemo?: boolean;
}) {
  const normalizedTitle = normalizeEditableText(params.title, 80);
  const normalizedTopicInput = normalizeEditableText(params.topic, 64);
  const normalizedContent = extractMarkdownFromAssistantResponse(String(params.content ?? ""));

  if (!normalizedTitle) {
    throw new Error("Title is required.");
  }

  if (!normalizedContent) {
    throw new Error("Markdown content cannot be empty.");
  }

  const parsed = matter(normalizedContent);
  let cleanedBody = normalizeEditableContent(parsed.content);
  if (!cleanedBody) {
    throw new Error("Markdown content cannot be empty.");
  }

  const inferredMetadata = await inferImportedCardMetadata({
    title: normalizedTitle,
    topicInput: normalizedTopicInput,
    fileName: String(params.fileName ?? ""),
    markdown: cleanedBody,
  });
  const normalizedTopic = normalizedTopicInput || normalizeEditableText(inferredMetadata.topicZh, 64) || normalizedTitle;
  const normalizedTopicEn = normalizeEditableText(inferredMetadata.topicEn, 64) || normalizedTopic;

  if (params.generateInteractiveDemo) {
    const demos = selectInteractiveDemos({
      title: normalizedTitle,
      topic: normalizedTopic,
      tags: [],
      sourceText: cleanedBody,
      generatedContent: cleanedBody,
    });
    cleanedBody = injectInteractiveDemosIntoNoteContent(cleanedBody, demos, {
      title: normalizedTitle,
      topic: normalizedTopic,
    });
  }

  cleanedBody = await materializeLocalDynamicDemos(cleanedBody);

  const [existingNotes, trashedNotes] = await Promise.all([getWeekNotes(), getTrashedWeekNotes()]);
  const slug = resolveUniqueSlug(
    slugifyTitle(normalizedTitle),
    [...existingNotes, ...trashedNotes].map((note) => note.slug),
  );
  const description = normalizeEditableText(inferredMetadata.descriptionZh, 140) || extractDescriptionFromBody(cleanedBody);
  const descriptionEn = normalizeEditableText(inferredMetadata.descriptionEn, 180) || description;
  const highestOrder = Math.max(
    0,
    ...existingNotes.map((note) => (Number.isFinite(note.order) ? note.order : 0)),
  );
  const filePath = path.join(NOTES_DIR_PATH, `${slug}.mdx`);
  const nextSource = matter.stringify(`${cleanedBody.trimEnd()}\n`, {
    slug,
    title: normalizedTitle,
    zhTitle: normalizedTitle,
    enTitle: normalizedTitle,
    description,
    descriptionZh: description,
    descriptionEn,
    topic: normalizedTopic,
    topicZh: normalizedTopic,
    topicEn: normalizedTopicEn,
    tags: [],
    order: highestOrder + 1,
  });

  await fs.mkdir(NOTES_DIR_PATH, { recursive: true });
  await fs.writeFile(filePath, nextSource, "utf8");

  return {
    slug,
    fileName: path.basename(filePath),
    note: {
      slug,
      weekLabelZh: normalizedTopic,
      weekLabelEn: normalizedTopicEn,
      zhTitle: normalizedTitle,
      enTitle: normalizedTitle,
      descriptionZh: description,
      descriptionEn,
      topicZh: normalizedTopic,
      order: highestOrder + 1,
    },
  };
}

export async function GET(request: Request) {
  try {
    const includeTrash = parseBooleanFlag(request, "trash");
    const notes = includeTrash ? await getTrashedWeekNotes() : await getWeekNotes();
    return NextResponse.json({
      success: true,
      notes: buildNoteListPayload(notes, includeTrash),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = parseSlugFromRequest(request);
    const action = url.searchParams.get("action") ?? "";

    if (action === "restore") {
      if (!slug) {
        return NextResponse.json({ error: "Missing slug." }, { status: 400 });
      }

      const restored = await moveNoteBetweenDirs({
        slug,
        fromTrash: true,
        destinationDir: NOTES_DIR_PATH,
      });

      if (!restored) {
        return NextResponse.json({ error: "Note not found in trash." }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        slug: restored.nextSlug,
        restoredFrom: restored.previousSlug,
        fileName: restored.fileName,
      });
    }

    const body = (await request.json().catch(() => null)) as {
      title?: unknown;
      topic?: unknown;
      fileName?: unknown;
      content?: unknown;
      generateInteractiveDemo?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const created = await createImportedNote({
      title: String(body.title ?? ""),
      topic: String(body.topic ?? ""),
      fileName: String(body.fileName ?? ""),
      content: String(body.content ?? ""),
      generateInteractiveDemo: Boolean(body.generateInteractiveDemo),
    });

    return NextResponse.json({ success: true, ...created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create failed.";
    const status = /required|empty/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const slug = parseSlugFromRequest(request);
    if (!slug) {
      return NextResponse.json({ error: "Missing slug." }, { status: 400 });
    }

    const note = await getWeekBySlug(slug);
    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    if (!ensureInsideDir(note.filePath, NOTES_DIR_PATH)) {
      return NextResponse.json({ error: "Refusing to update file outside notes directory." }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { title?: unknown; topic?: unknown; content?: unknown } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
    const hasTopic = Object.prototype.hasOwnProperty.call(body, "topic");
    const hasContent = Object.prototype.hasOwnProperty.call(body, "content");
    if (!hasTitle && !hasTopic && !hasContent) {
      return NextResponse.json({ error: "No update field provided." }, { status: 400 });
    }

    const nextTitle = hasTitle ? normalizeEditableText(body.title, 80) : note.zhTitle;
    const nextTopic = hasTopic ? normalizeEditableText(body.topic, 64) : note.topicZh;
    const nextContent = hasContent ? normalizeEditableContent(body.content) : null;

    if (!nextTitle) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    if (!nextTopic) {
      return NextResponse.json({ error: "Topic cannot be empty." }, { status: 400 });
    }
    if (hasContent && !nextContent) {
      return NextResponse.json({ error: "Content cannot be empty." }, { status: 400 });
    }

    const rawSource = await fs.readFile(note.filePath, "utf8");
    const parsed = matter(rawSource);
    const frontmatter = { ...(parsed.data as Record<string, unknown>) };

    frontmatter.title = nextTitle;
    frontmatter.zhTitle = nextTitle;
    frontmatter.enTitle = nextTitle;
    frontmatter.topic = nextTopic;
    frontmatter.topicZh = nextTopic;
    frontmatter.topicEn = nextTopic;

    const nextBody = hasContent && nextContent ? `${(await materializeLocalDynamicDemos(nextContent)).trimEnd()}\n` : parsed.content;
    const nextSource = matter.stringify(nextBody, frontmatter);
    await fs.writeFile(note.filePath, nextSource, "utf8");

    return NextResponse.json({
      success: true,
      slug,
      note: {
        slug,
        zhTitle: nextTitle,
        enTitle: nextTitle,
        weekLabelZh: nextTopic,
        weekLabelEn: String(frontmatter.topicEn ?? nextTopic).trim() || nextTopic,
        topicZh: nextTopic,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const slug = parseSlugFromRequest(request);
    const permanent = parseBooleanFlag(request, "permanent");

    if (!slug) {
      return NextResponse.json({ error: "Missing slug." }, { status: 400 });
    }

    if (permanent) {
      const note = await getTrashedWeekBySlug(slug);
      if (!note) {
        return NextResponse.json({ error: "Note not found in trash." }, { status: 404 });
      }

      if (!ensureInsideDir(note.filePath, TRASH_DIR_PATH)) {
        return NextResponse.json({ error: "Refusing to delete file outside trash directory." }, { status: 400 });
      }

      await fs.unlink(note.filePath);
      return NextResponse.json({
        success: true,
        slug,
        deletedFile: path.basename(note.filePath),
        permanentlyDeleted: true,
      });
    }

    const trashed = await moveNoteBetweenDirs({
      slug,
      fromTrash: false,
      destinationDir: TRASH_DIR_PATH,
    });

    if (!trashed) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      slug: trashed.nextSlug,
      trashedFrom: trashed.previousSlug,
      deletedFile: trashed.fileName,
      movedToTrash: true,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "File does not exist." }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : "Delete failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
