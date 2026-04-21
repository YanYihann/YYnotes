"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { ReadingWorkspace } from "@/components/notes/reading-workspace";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import type { Heading } from "@/lib/content";
import { prepareNoteMarkdown } from "@/lib/mdx";

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";

type NoteViewNavLink = {
  href: string;
  labelZh: string;
  labelEn: string;
  leadingArrow?: boolean;
  trailingArrow?: boolean;
};

type NoteViewProps = {
  note: {
    slug: string;
    topicZh: string;
    topicEn: string;
    zhTitle: string;
    enTitle: string;
    descriptionZh: string;
    descriptionEn: string;
    tags: string[];
    noteContent: string;
  };
  headings: Heading[];
  nav?: {
    left?: NoteViewNavLink;
    right?: NoteViewNavLink;
  };
};

type NoteHighlight = {
  id: number;
  noteSlug: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

type HighlightSelection = {
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

type HighlightApiResponse = {
  success?: boolean;
  highlights?: unknown;
  highlight?: unknown;
  error?: string;
};

type TextNodeEntry = {
  node: Text;
  start: number;
  end: number;
};

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function buildCloudApiUrl(path: string): string {
  return `${normalizeApiBase(CLOUD_API_BASE)}${path}`;
}

function toNoteHighlight(input: unknown): NoteHighlight | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const row = input as Record<string, unknown>;
  const id = Number(row.id);
  const startOffset = Number(row.startOffset);
  const endOffset = Number(row.endOffset);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
    return null;
  }

  return {
    id,
    noteSlug: String(row.noteSlug ?? ""),
    startOffset,
    endOffset,
    selectedText: String(row.selectedText ?? ""),
    color: String(row.color ?? "yellow"),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function sortHighlights(rows: NoteHighlight[]): NoteHighlight[] {
  return [...rows].sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset || a.id - b.id);
}

function collectTextNodes(root: HTMLElement): TextNodeEntry[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries: TextNodeEntry[] = [];
  let offset = 0;
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const parent = node.parentElement;
    const value = node.nodeValue ?? "";
    if (value.length > 0 && (!parent || !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName))) {
      entries.push({ node, start: offset, end: offset + value.length });
      offset += value.length;
    }
    current = walker.nextNode();
  }
  return entries;
}

function findTextPosition(entries: TextNodeEntry[], absoluteOffset: number): { node: Text; offset: number } | null {
  if (!entries.length) {
    return null;
  }

  const maxOffset = entries[entries.length - 1].end;
  const clamped = Math.max(0, Math.min(absoluteOffset, maxOffset));

  for (const entry of entries) {
    if (clamped >= entry.start && clamped <= entry.end) {
      return { node: entry.node, offset: clamped - entry.start };
    }
  }

  const last = entries[entries.length - 1];
  return { node: last.node, offset: Math.max(0, last.end - last.start) };
}

function unwrapRenderedHighlights(root: HTMLElement) {
  const wrappers = Array.from(root.querySelectorAll("span.note-highlight[data-note-highlight-id]"));
  for (const wrapper of wrappers) {
    const parent = wrapper.parentNode;
    if (!parent) {
      continue;
    }
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    parent.removeChild(wrapper);
  }
  root.normalize();
}

function applySingleHighlight(root: HTMLElement, highlight: NoteHighlight): boolean {
  const entries = collectTextNodes(root);
  if (!entries.length) {
    return false;
  }

  const total = entries[entries.length - 1].end;
  const startOffset = Math.max(0, Math.min(highlight.startOffset, total));
  const endOffset = Math.max(0, Math.min(highlight.endOffset, total));
  if (endOffset <= startOffset) {
    return false;
  }

  const startPos = findTextPosition(entries, startOffset);
  const endPos = findTextPosition(entries, endOffset);
  if (!startPos || !endPos) {
    return false;
  }

  try {
    let resolvedStart = startOffset;
    let resolvedEnd = endOffset;
    let range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);

    const expectedText = highlight.selectedText.trim();
    if (expectedText && range.toString().trim() !== expectedText) {
      const fullText = root.textContent ?? "";
      let candidateStart = -1;
      let cursor = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      while (cursor < fullText.length) {
        const next = fullText.indexOf(expectedText, cursor);
        if (next < 0) {
          break;
        }
        const distance = Math.abs(next - highlight.startOffset);
        if (distance < bestDistance) {
          bestDistance = distance;
          candidateStart = next;
        }
        cursor = next + 1;
      }

      if (candidateStart >= 0) {
        resolvedStart = candidateStart;
        resolvedEnd = candidateStart + expectedText.length;
        const nextStartPos = findTextPosition(entries, resolvedStart);
        const nextEndPos = findTextPosition(entries, resolvedEnd);
        if (nextStartPos && nextEndPos) {
          range = document.createRange();
          range.setStart(nextStartPos.node, nextStartPos.offset);
          range.setEnd(nextEndPos.node, nextEndPos.offset);
        }
      }
    }

    if (range.collapsed || resolvedEnd <= resolvedStart) {
      return false;
    }

    const wrapper = document.createElement("span");
    wrapper.className = "note-highlight";
    wrapper.dataset.noteHighlightId = String(highlight.id);
    wrapper.dataset.noteHighlightColor = highlight.color || "yellow";
    wrapper.title = "Highlight";

    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    return true;
  } catch {
    return false;
  }
}

function applyHighlightsToRoot(root: HTMLElement, highlights: NoteHighlight[]) {
  unwrapRenderedHighlights(root);
  for (const highlight of sortHighlights(highlights)) {
    applySingleHighlight(root, highlight);
  }
}

function getSelectionOffsets(root: HTMLElement, range: Range): HighlightSelection | null {
  try {
    const beforeStart = document.createRange();
    beforeStart.selectNodeContents(root);
    beforeStart.setEnd(range.startContainer, range.startOffset);
    const startOffset = beforeStart.toString().length;

    const beforeEnd = document.createRange();
    beforeEnd.selectNodeContents(root);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    const endOffset = beforeEnd.toString().length;

    const selectedText = range.toString().trim();
    if (!selectedText || endOffset <= startOffset) {
      return null;
    }

    return {
      startOffset,
      endOffset,
      selectedText,
    };
  } catch {
    return null;
  }
}

function selectionOverlaps(highlights: NoteHighlight[], selection: HighlightSelection): boolean {
  return highlights.some(
    (item) => !(item.endOffset <= selection.startOffset || item.startOffset >= selection.endOffset),
  );
}

function NoteNavLink({ link }: { link: NoteViewNavLink }) {
  return (
    <Link
      href={link.href}
      className="btn-apple-link inline-flex px-4 py-1.5 text-[14px] tracking-tightCaption transition focus-visible:outline-none"
    >
      {link.leadingArrow ? <span className="mr-1">{"<"}</span> : null}
      {link.labelZh}
      <span className="ui-en ml-1">{link.labelEn}</span>
      {link.trailingArrow ? <span className="ml-1">{">"}</span> : null}
    </Link>
  );
}

export function NoteView({ note, headings, nav }: NoteViewProps) {
  const { showEnglish } = useLanguage();
  const { session } = useAuth();
  const authToken = session?.token ?? "";
  const renderedSource = useMemo(
    () => prepareNoteMarkdown(note.noteContent, { showEnglish }),
    [note.noteContent, showEnglish],
  );
  const canSyncHighlights = Boolean(CLOUD_API_BASE && authToken && note.slug);
  const noteContentRef = useRef<HTMLDivElement | null>(null);
  const [highlights, setHighlights] = useState<NoteHighlight[]>([]);
  const [selection, setSelection] = useState<HighlightSelection | null>(null);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [savingHighlight, setSavingHighlight] = useState(false);
  const [highlightError, setHighlightError] = useState("");

  const fetchHighlights = useCallback(async () => {
    if (!canSyncHighlights) {
      setHighlights([]);
      return;
    }

    setLoadingHighlights(true);
    setHighlightError("");
    try {
      const response = await fetch(buildCloudApiUrl(`/notes/${encodeURIComponent(note.slug)}/highlights`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        cache: "no-store",
      });
      const json = (await response.json().catch(() => null)) as HighlightApiResponse | null;
      if (!response.ok || !json?.success || !Array.isArray(json.highlights)) {
        throw new Error(json?.error || "加载高亮失败。");
      }

      const parsed = json.highlights
        .map((item) => toNoteHighlight(item))
        .filter((item): item is NoteHighlight => item !== null);
      setHighlights(sortHighlights(parsed));
    } catch (error) {
      setHighlightError(error instanceof Error ? error.message : "加载高亮失败。");
      setHighlights([]);
    } finally {
      setLoadingHighlights(false);
    }
  }, [authToken, canSyncHighlights, note.slug]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const createHighlight = useCallback(async () => {
    if (!canSyncHighlights || !selection || savingHighlight) {
      return;
    }

    if (selectionOverlaps(highlights, selection)) {
      setHighlightError("该选区与现有高亮重叠，请选择未高亮文本。");
      return;
    }

    setSavingHighlight(true);
    setHighlightError("");
    try {
      const response = await fetch(buildCloudApiUrl(`/notes/${encodeURIComponent(note.slug)}/highlights`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          startOffset: selection.startOffset,
          endOffset: selection.endOffset,
          selectedText: selection.selectedText,
          color: "yellow",
        }),
      });
      const json = (await response.json().catch(() => null)) as HighlightApiResponse | null;
      const parsed = toNoteHighlight(json?.highlight);
      if (!response.ok || !json?.success || !parsed) {
        throw new Error(json?.error || "保存高亮失败。");
      }

      setHighlights((current) => sortHighlights([...current.filter((item) => item.id !== parsed.id), parsed]));
      clearSelection();
    } catch (error) {
      setHighlightError(error instanceof Error ? error.message : "保存高亮失败。");
    } finally {
      setSavingHighlight(false);
    }
  }, [authToken, canSyncHighlights, clearSelection, highlights, note.slug, savingHighlight, selection]);

  const clearHighlights = useCallback(async () => {
    if (!canSyncHighlights || savingHighlight) {
      return;
    }

    setSavingHighlight(true);
    setHighlightError("");
    try {
      const response = await fetch(buildCloudApiUrl(`/notes/${encodeURIComponent(note.slug)}/highlights`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const json = (await response.json().catch(() => null)) as HighlightApiResponse | null;
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "清空高亮失败。");
      }

      setHighlights([]);
      clearSelection();
    } catch (error) {
      setHighlightError(error instanceof Error ? error.message : "清空高亮失败。");
    } finally {
      setSavingHighlight(false);
    }
  }, [authToken, canSyncHighlights, clearSelection, note.slug, savingHighlight]);

  useEffect(() => {
    void fetchHighlights();
  }, [fetchHighlights]);

  useEffect(() => {
    const root = noteContentRef.current;
    if (!root) {
      return;
    }
    applyHighlightsToRoot(root, highlights);
  }, [highlights, renderedSource]);

  useEffect(() => {
    const root = noteContentRef.current;
    if (!root || !canSyncHighlights) {
      setSelection(null);
      return;
    }

    const onSelectionChange = () => {
      const selected = window.getSelection();
      if (!selected || selected.rangeCount === 0 || selected.isCollapsed) {
        setSelection(null);
        return;
      }

      const range = selected.getRangeAt(0);
      const commonNode = range.commonAncestorContainer;
      if (!root.contains(commonNode)) {
        setSelection(null);
        return;
      }
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        setSelection(null);
        return;
      }

      const offsets = getSelectionOffsets(root, range);
      if (!offsets) {
        setSelection(null);
        return;
      }

      setSelection(offsets);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [canSyncHighlights]);

  return (
    <ReadingWorkspace
      headings={headings}
      noteContext={{
        slug: note.slug,
        weekLabelZh: note.topicZh,
        weekLabelEn: note.topicEn,
        zhTitle: note.zhTitle,
        enTitle: note.enTitle,
        noteContent: note.noteContent,
      }}
    >
      <article className="rounded-apple bg-card px-5 py-8 text-card-foreground shadow-card sm:px-8 md:px-10">
        <header className="mb-8 border-b border-border pb-6">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {note.topicZh}
            <span className="ui-en ml-1">{note.topicEn} - Note</span>
          </p>
          {note.tags.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-capsule border border-border px-2 py-0.5 font-text text-[12px] tracking-tightCaption text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
          <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-foreground">
            {note.zhTitle}
            <span className="ui-en mt-1 block font-text text-[0.36em] font-normal leading-[1.35] tracking-tightBody text-muted-foreground">
              {note.enTitle}
            </span>
          </h1>
          <p className="mt-3 font-text text-[17px] leading-[1.47] tracking-tightBody text-muted-foreground">
            {note.descriptionZh}
            <span className="ui-en mt-1 block text-muted-foreground">{note.descriptionEn}</span>
          </p>
        </header>

        <div className="mb-6 rounded-apple border border-border bg-muted/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void createHighlight()}
              disabled={!canSyncHighlights || !selection || savingHighlight}
              className="btn-apple-primary inline-flex items-center rounded-capsule px-3 py-1 text-[12px] font-semibold tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              荧光笔高亮选中
              <span className="ui-en ml-1">Highlight Selection</span>
            </button>
            <button
              type="button"
              onClick={() => void clearHighlights()}
              disabled={!canSyncHighlights || savingHighlight || highlights.length === 0}
              className="inline-flex items-center rounded-capsule border border-border px-3 py-1 text-[12px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              清空本页高亮
              <span className="ui-en ml-1">Clear Highlights</span>
            </button>
            <p className="font-text text-[12px] text-muted-foreground">
              已高亮 {highlights.length} 处
              <span className="ui-en ml-1">{highlights.length} highlights</span>
            </p>
            {!canSyncHighlights ? (
              <p className="font-text text-[12px] text-muted-foreground">
                需登录并连接云端后可同步高亮。
                <span className="ui-en ml-1">Sign in with cloud mode to sync highlights.</span>
              </p>
            ) : null}
            {loadingHighlights ? (
              <p className="font-text text-[12px] text-muted-foreground">
                正在加载高亮...
                <span className="ui-en ml-1">Loading highlights...</span>
              </p>
            ) : null}
          </div>
          {selection ? (
            <p className="mt-2 line-clamp-2 font-text text-[12px] leading-[1.4] text-muted-foreground">
              当前选中：{selection.selectedText}
            </p>
          ) : null}
          {highlightError ? (
            <p className="mt-2 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-2 py-1 font-text text-[12px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
              {highlightError}
            </p>
          ) : null}
        </div>

        <div ref={noteContentRef} className="note-prose drake-theme" data-note-content>
          <NoteMarkdown source={renderedSource} />
        </div>

        {nav?.left || nav?.right ? (
          <nav className="mt-14 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
            <div>{nav.left ? <NoteNavLink link={nav.left} /> : null}</div>
            <div className="sm:text-right">{nav.right ? <NoteNavLink link={nav.right} /> : null}</div>
          </nav>
        ) : null}
      </article>
    </ReadingWorkspace>
  );
}
