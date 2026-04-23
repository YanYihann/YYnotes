import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { NextResponse } from "next/server";
import { getWeekBySlug } from "@/lib/content";

const NOTES_DIR_PATH = path.resolve(path.join(process.cwd(), "笔记"));

function ensureInsideNotesDir(targetPath: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const prefix = NOTES_DIR_PATH.endsWith(path.sep) ? NOTES_DIR_PATH : `${NOTES_DIR_PATH}${path.sep}`;
  return normalizedTarget.startsWith(prefix);
}

function parseSlugFromRequest(request: Request): string {
  const url = new URL(request.url);
  const rawSlug = url.searchParams.get("slug") ?? "";
  return decodeURIComponent(String(rawSlug)).trim();
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

    if (!ensureInsideNotesDir(note.filePath)) {
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
    frontmatter.topic = nextTopic;
    frontmatter.topicZh = nextTopic;
    if (typeof frontmatter.topicEn !== "string" || !frontmatter.topicEn.trim()) {
      frontmatter.topicEn = nextTopic;
    }

    const nextBody = hasContent && nextContent ? `${nextContent.trimEnd()}\n` : parsed.content;
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

    if (!slug) {
      return NextResponse.json({ error: "Missing slug." }, { status: 400 });
    }

    const note = await getWeekBySlug(slug);
    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    if (!ensureInsideNotesDir(note.filePath)) {
      return NextResponse.json({ error: "Refusing to delete file outside notes directory." }, { status: 400 });
    }

    await fs.unlink(note.filePath);

    return NextResponse.json({
      success: true,
      slug,
      deletedFile: path.basename(note.filePath),
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "File does not exist." }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : "Delete failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
