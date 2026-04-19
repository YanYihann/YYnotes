import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getWeekBySlug } from "@/lib/content";

const NOTES_DIR_PATH = path.resolve(path.join(process.cwd(), "笔记"));

function ensureInsideNotesDir(targetPath: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const prefix = NOTES_DIR_PATH.endsWith(path.sep) ? NOTES_DIR_PATH : `${NOTES_DIR_PATH}${path.sep}`;
  return normalizedTarget.startsWith(prefix);
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const rawSlug = url.searchParams.get("slug") ?? "";
    const slug = decodeURIComponent(String(rawSlug)).trim();

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
