import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { NextResponse } from "next/server";
import { getTrashedWeekBySlug, getTrashedWeekNotes, getWeekBySlug, getWeekNotes } from "@/lib/content";

const NOTES_DIR_PATH = path.resolve(path.join(process.cwd(), "笔记"));
const TRASH_DIR_PATH = path.resolve(path.join(process.cwd(), "笔记回收站"));

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

function buildNoteListPayload(
  notes: Awaited<ReturnType<typeof getWeekNotes>>,
  trashed: boolean,
) {
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
    const slug = parseSlugFromRequest(request);
    const action = new URL(request.url).searchParams.get("action") ?? "";

    if (!slug) {
      return NextResponse.json({ error: "Missing slug." }, { status: 400 });
    }

    if (action !== "restore") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restore failed.";
    return NextResponse.json({ error: message }, { status: 500 });
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
