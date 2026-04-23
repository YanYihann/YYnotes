"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
  type ReactNode,
} from "react";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import { cn } from "@/lib/utils";

export type NoteEditorMode = "annotation" | "full";

type NoteEditorPanelProps = {
  source: string;
  mode: NoteEditorMode | null;
  saving?: boolean;
  onModeChange: (mode: NoteEditorMode) => void;
  onSave: (nextSource: string) => Promise<void>;
  onCancel: () => void;
};

type EditableBlockKind = "heading" | "paragraph" | "blockquote" | "list" | "code" | "image" | "raw";

type EditableBlock = {
  id: string;
  kind: EditableBlockKind;
  raw: string;
  start: number;
  end: number;
  text?: string;
  lines?: string[];
  level?: number;
  ordered?: boolean;
  fence?: string;
  imageAlt?: string;
  imageSrc?: string;
};

type ImageMarkdown = {
  alt: string;
  src: string;
};

const ANNOTATION_PLACEHOLDER = "在这里写注释，或直接粘贴图片。";

let blockIdSeed = 0;

function createBlockId(): string {
  blockIdSeed += 1;
  return `note-edit-block-${blockIdSeed}`;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read pasted image."));
    reader.readAsDataURL(file);
  });
}

function lineStartOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function getLineEnd(lines: string[], starts: number[], index: number): number {
  return starts[index] + (lines[index]?.length ?? 0);
}

function blockRaw(lines: string[], startLine: number, endLineExclusive: number): string {
  return lines.slice(startLine, endLineExclusive).join("\n");
}

function isSpecialLine(line: string): boolean {
  return (
    /^(#{1,6})\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^(\s*)([-*+]|\d+[.)])\s+/.test(line) ||
    /^```/.test(line) ||
    /^!\[[^\]]*]\([^)]+\)\s*$/.test(line)
  );
}

function parseMarkdownBlocks(source: string): EditableBlock[] {
  const normalized = normalizeNewlines(source).trimEnd();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const starts = lineStartOffsets(normalized);
  const blocks: EditableBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const start = starts[index] ?? 0;

    if (/^```/.test(line)) {
      const fence = line.trim();
      const contentStart = index + 1;
      let endLine = contentStart;
      while (endLine < lines.length && !/^```/.test(lines[endLine])) {
        endLine += 1;
      }
      const closeLine = endLine < lines.length ? endLine : endLine - 1;
      const end = getLineEnd(lines, starts, Math.max(index, closeLine));
      blocks.push({
        id: createBlockId(),
        kind: "code",
        raw: blockRaw(lines, index, Math.min(lines.length, closeLine + 1)),
        start,
        end,
        fence,
        text: lines.slice(contentStart, endLine).join("\n"),
      });
      index = Math.min(lines.length, closeLine + 1);
      continue;
    }

    const imageMatch = line.match(/^!\[([^\]]*)]\(([^)]+)\)\s*$/);
    if (imageMatch) {
      blocks.push({
        id: createBlockId(),
        kind: "image",
        raw: line,
        start,
        end: getLineEnd(lines, starts, index),
        imageAlt: imageMatch[1],
        imageSrc: imageMatch[2],
      });
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        id: createBlockId(),
        kind: "heading",
        raw: line,
        start,
        end: getLineEnd(lines, starts, index),
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      let endLine = index;
      while (endLine < lines.length && /^>\s?/.test(lines[endLine])) {
        endLine += 1;
      }
      blocks.push({
        id: createBlockId(),
        kind: "blockquote",
        raw: blockRaw(lines, index, endLine),
        start,
        end: getLineEnd(lines, starts, endLine - 1),
        lines: lines.slice(index, endLine).map((item) => item.replace(/^>\s?/, "")),
      });
      index = endLine;
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d+[.)]/.test(listMatch[2]);
      let endLine = index;
      const items: string[] = [];
      while (endLine < lines.length) {
        const itemMatch = lines[endLine].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[3]);
        endLine += 1;
      }
      blocks.push({
        id: createBlockId(),
        kind: "list",
        raw: blockRaw(lines, index, endLine),
        start,
        end: getLineEnd(lines, starts, endLine - 1),
        ordered,
        lines: items,
      });
      index = endLine;
      continue;
    }

    let endLine = index;
    while (endLine < lines.length && lines[endLine].trim() && (endLine === index || !isSpecialLine(lines[endLine]))) {
      endLine += 1;
    }
    blocks.push({
      id: createBlockId(),
      kind: "paragraph",
      raw: blockRaw(lines, index, endLine),
      start,
      end: getLineEnd(lines, starts, endLine - 1),
      text: lines.slice(index, endLine).join("\n"),
    });
    index = endLine;
  }

  return blocks;
}

function createEmptyParagraphBlock(): EditableBlock {
  return {
    id: createBlockId(),
    kind: "paragraph",
    raw: "",
    start: 0,
    end: 0,
    text: "",
  };
}

function getInsertionOffset(source: string, blocks: EditableBlock[], insertionIndex: number): number {
  if (!blocks.length || insertionIndex <= 0) {
    return 0;
  }

  if (insertionIndex >= blocks.length) {
    return source.trimEnd().length;
  }

  return blocks[insertionIndex].start;
}

function buildAnnotationBlock(content: string): string {
  const normalized = normalizeNewlines(content).trim();
  if (!normalized) {
    return "";
  }

  const timestamp = new Date().toLocaleString("zh-CN", { hour12: false });
  const quotedLines = normalized.split("\n").map((line) => (line.trim() ? `> ${line}` : ">"));

  return [
    "> **【笔记注释 / Note Annotation】**",
    `> _${timestamp}_`,
    ">",
    ...quotedLines,
  ].join("\n");
}

function insertMarkdownBlock(source: string, block: string, offset: number): string {
  if (!block.trim()) {
    return source;
  }

  const normalized = normalizeNewlines(source).trimEnd();
  const safeOffset = Math.max(0, Math.min(offset, normalized.length));
  const before = normalized.slice(0, safeOffset).trimEnd();
  const after = normalized.slice(safeOffset).trimStart();

  if (!before) {
    return `${block}\n\n${after}`.trimEnd();
  }
  if (!after) {
    return `${before}\n\n${block}`.trimEnd();
  }
  return `${before}\n\n${block}\n\n${after}`.trimEnd();
}

function plainPaste(event: ClipboardEvent<HTMLElement>): boolean {
  const text = event.clipboardData.getData("text/plain");
  if (!text) {
    return false;
  }

  event.preventDefault();
  document.execCommand("insertText", false, text);
  return true;
}

async function getPastedImages(event: ClipboardEvent<HTMLElement>): Promise<ImageMarkdown[]> {
  const imageItems = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  return Promise.all(
    imageItems.map(async (file, index) => {
      const src = await fileToDataUrl(file);
      const alt = file.name?.replace(/[^\w.-]+/g, "-") || `pasted-image-${index + 1}.png`;
      return { alt, src };
    }),
  );
}

function insertImagesIntoEditable(root: HTMLElement, images: ImageMarkdown[]) {
  const selection = window.getSelection();
  const range =
    selection && selection.rangeCount > 0 && root.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0)
      : null;

  const fragment = document.createDocumentFragment();
  for (const image of images) {
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = image.alt;
    img.dataset.markdownImage = "true";
    img.className = "my-4 max-h-[480px] w-auto max-w-full rounded-apple border border-border bg-card object-contain shadow-card";
    fragment.appendChild(document.createElement("br"));
    fragment.appendChild(img);
    fragment.appendChild(document.createElement("br"));
  }

  if (range) {
    range.deleteContents();
    range.insertNode(fragment);
    selection?.removeAllRanges();
    return;
  }

  root.appendChild(fragment);
}

function editableDomToMarkdown(root: HTMLElement): string {
  let output = "";

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += node.textContent ?? "";
      return;
    }

    if (!(node instanceof HTMLElement)) {
      node.childNodes.forEach(walk);
      return;
    }

    if (node.tagName === "BR") {
      output += "\n";
      return;
    }

    if (node.tagName === "IMG") {
      const alt = node.getAttribute("alt") || "pasted-image";
      const src = node.getAttribute("src") || "";
      if (src) {
        output += `\n![${alt}](${src})\n`;
      }
      return;
    }

    node.childNodes.forEach(walk);

    if (["DIV", "P", "LI"].includes(node.tagName)) {
      output += "\n";
    }
  };

  root.childNodes.forEach(walk);
  return normalizeNewlines(output)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderEditableText(text: string): ReactNode {
  return text || "\u00a0";
}

function blockToMarkdown(block: EditableBlock, element: HTMLElement | null): string {
  if (block.kind === "image") {
    const img = element?.querySelector("img");
    const caption = element?.querySelector("figcaption")?.innerText.trim();
    const alt = caption || img?.getAttribute("alt") || block.imageAlt || "image";
    const src = img?.getAttribute("src") || block.imageSrc || "";
    return src ? `![${alt}](${src})` : "";
  }

  const text = normalizeNewlines(element?.innerText ?? block.text ?? block.lines?.join("\n") ?? "").trimEnd();

  if (block.kind === "heading") {
    const level = Math.max(1, Math.min(block.level ?? 2, 6));
    return text.trim() ? `${"#".repeat(level)} ${text.trim()}` : "";
  }

  if (block.kind === "blockquote") {
    const lines = text.split("\n");
    return lines.map((line) => (line.trim() ? `> ${line.trimEnd()}` : ">")).join("\n");
  }

  if (block.kind === "list") {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.map((line, index) => (block.ordered ? `${index + 1}. ${line}` : `- ${line}`)).join("\n");
  }

  if (block.kind === "code") {
    return `${block.fence ?? "```"}\n${text}\n\`\`\``;
  }

  return text.trim();
}

function blocksToMarkdown(blocks: EditableBlock[], refs: Map<string, HTMLElement>): string {
  return blocks
    .map((block) => blockToMarkdown(block, refs.get(block.id) ?? null))
    .filter((block) => block.trim().length > 0)
    .join("\n\n")
    .trimEnd();
}

function syncBlocksFromDom(blocks: EditableBlock[], refs: Map<string, HTMLElement>): EditableBlock[] {
  return blocks.map((block) => {
    if (block.kind === "image") {
      const img = refs.get(block.id)?.querySelector("img");
      return {
        ...block,
        imageAlt: img?.getAttribute("alt") || block.imageAlt,
        imageSrc: img?.getAttribute("src") || block.imageSrc,
      };
    }

    const text = normalizeNewlines(refs.get(block.id)?.innerText ?? block.text ?? block.lines?.join("\n") ?? "").trimEnd();
    if (block.kind === "list" || block.kind === "blockquote") {
      return { ...block, lines: text.split("\n") };
    }
    return { ...block, text };
  });
}

function RenderedReadOnlyBlock({
  block,
  selected,
  onSelect,
}: {
  block: EditableBlock;
  selected: boolean;
  onSelect: (before: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "relative rounded-apple px-2 py-1 transition",
        selected && "ring-2 ring-primary/40",
        "hover:bg-primary/[0.04]",
      )}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSelect(event.clientY < rect.top + rect.height / 2);
      }}
    >
      <NoteMarkdown source={block.raw} />
    </div>
  );
}

function EditableBlockView({
  block,
  setRef,
  onFocus,
  onPaste,
}: {
  block: EditableBlock;
  setRef: (id: string, node: HTMLElement | null) => void;
  onFocus: (id: string) => void;
  onPaste: (event: ClipboardEvent<HTMLElement>, id: string) => void;
}) {
  const editableClass =
    "rounded-apple px-3 py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-primary/35 hover:bg-primary/[0.04]";

  if (block.kind === "heading") {
    const HeadingTag = `h${Math.min(Math.max(block.level ?? 2, 1), 4)}` as "h1" | "h2" | "h3" | "h4";
    return (
      <HeadingTag
        ref={(node) => setRef(block.id, node)}
        contentEditable
        suppressContentEditableWarning
        data-editor-block-id={block.id}
        onFocus={() => onFocus(block.id)}
        onPaste={(event) => onPaste(event, block.id)}
        className={cn(
          editableClass,
          block.level === 1
            ? "mt-6 font-display text-[clamp(2rem,3.8vw,3.5rem)] font-semibold leading-[1.07] tracking-tightDisplay text-foreground"
            : "mt-8 font-display text-[clamp(1.45rem,2.7vw,2.5rem)] font-semibold leading-[1.12] tracking-tightDisplay text-foreground",
        )}
      >
        {renderEditableText(block.text ?? "")}
      </HeadingTag>
    );
  }

  if (block.kind === "blockquote") {
    const text = (block.lines ?? []).join("\n");
    const isAnnotation = text.includes("【笔记注释") || text.includes("【新增内容");
    return (
      <blockquote
        ref={(node) => setRef(block.id, node)}
        contentEditable
        suppressContentEditableWarning
        data-editor-block-id={block.id}
        onFocus={() => onFocus(block.id)}
        onPaste={(event) => onPaste(event, block.id)}
        className={cn(
          "my-7 whitespace-pre-wrap rounded-apple border-l-[3px] border-border bg-card/85 px-4 py-3 font-text text-[16px] italic leading-[1.6] text-muted-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-primary/35",
          isAnnotation && "border-primary/70 bg-primary/[0.08] text-foreground shadow-card/20 ring-1 ring-primary/15",
        )}
      >
        {renderEditableText(text)}
      </blockquote>
    );
  }

  if (block.kind === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        ref={(node) => setRef(block.id, node)}
        contentEditable
        suppressContentEditableWarning
        data-editor-block-id={block.id}
        onFocus={() => onFocus(block.id)}
        onPaste={(event) => onPaste(event, block.id)}
        className={cn(
          editableClass,
          "my-5 space-y-2 pl-8 font-text text-[17px] leading-[1.6] text-muted-foreground",
          block.ordered ? "list-decimal" : "list-disc",
        )}
      >
        {(block.lines?.length ? block.lines : [""]).map((line, index) => (
          <li key={`${block.id}-${index}`}>{renderEditableText(line)}</li>
        ))}
      </ListTag>
    );
  }

  if (block.kind === "image") {
    return (
      <figure
        ref={(node) => setRef(block.id, node)}
        data-editor-block-id={block.id}
        onFocus={() => onFocus(block.id)}
        className="my-6 rounded-apple border border-border bg-card px-3 py-3 shadow-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={block.imageSrc}
          alt={block.imageAlt ?? ""}
          className="max-h-[640px] w-auto max-w-full rounded-apple object-contain"
        />
        <figcaption
          contentEditable
          suppressContentEditableWarning
          onFocus={() => onFocus(block.id)}
          className="mt-2 rounded-capsule px-2 py-1 font-text text-[12px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
        >
          {renderEditableText(block.imageAlt ?? "image")}
        </figcaption>
      </figure>
    );
  }

  if (block.kind === "code") {
    return (
      <pre
        ref={(node) => setRef(block.id, node)}
        contentEditable
        suppressContentEditableWarning
        data-editor-block-id={block.id}
        onFocus={() => onFocus(block.id)}
        onPaste={(event) => onPaste(event, block.id)}
        className="my-7 whitespace-pre-wrap rounded-apple bg-secondary px-4 py-4 font-text text-[15px] leading-[1.6] text-secondary-foreground outline-none shadow-card focus-visible:ring-2 focus-visible:ring-primary/35"
      >
        {renderEditableText(block.text ?? "")}
      </pre>
    );
  }

  return (
    <p
      ref={(node) => setRef(block.id, node)}
      contentEditable
      suppressContentEditableWarning
      data-editor-block-id={block.id}
      onFocus={() => onFocus(block.id)}
      onPaste={(event) => onPaste(event, block.id)}
      className={cn(
        editableClass,
        "my-5 whitespace-pre-wrap font-text text-[17px] leading-[1.7] tracking-tightBody text-muted-foreground",
      )}
    >
      {renderEditableText(block.text ?? "")}
    </p>
  );
}

export function NoteEditorPanel({
  source,
  mode,
  saving = false,
  onModeChange,
  onSave,
  onCancel,
}: NoteEditorPanelProps) {
  const normalizedSource = useMemo(() => normalizeNewlines(source), [source]);
  const parsedBlocks = useMemo(() => parseMarkdownBlocks(normalizedSource), [normalizedSource]);
  const fullBlockRefs = useRef(new Map<string, HTMLElement>());
  const annotationRef = useRef<HTMLDivElement | null>(null);
  const activeBlockIdRef = useRef<string | null>(null);
  const [fullBlocks, setFullBlocks] = useState<EditableBlock[]>(
    parsedBlocks.length ? parsedBlocks : [createEmptyParagraphBlock()],
  );
  const [annotationInsertionIndex, setAnnotationInsertionIndex] = useState(parsedBlocks.length);
  const [error, setError] = useState("");

  useEffect(() => {
    setFullBlocks(parsedBlocks.length ? parsedBlocks : [createEmptyParagraphBlock()]);
    setAnnotationInsertionIndex(parsedBlocks.length);
    setError("");
  }, [parsedBlocks]);

  const setFullBlockRef = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      fullBlockRefs.current.set(id, node);
      return;
    }
    fullBlockRefs.current.delete(id);
  }, []);

  const syncFullBlocks = useCallback(() => {
    setFullBlocks((current) => syncBlocksFromDom(current, fullBlockRefs.current));
  }, []);

  const insertImagesAfterBlock = useCallback((blockId: string | null, images: ImageMarkdown[]) => {
    if (!images.length) {
      return;
    }

    setFullBlocks((current) => {
      const synced = syncBlocksFromDom(current, fullBlockRefs.current);
      const insertAt = blockId ? synced.findIndex((block) => block.id === blockId) + 1 : synced.length;
      const safeIndex = insertAt <= 0 ? synced.length : insertAt;
      const imageBlocks = images.map<EditableBlock>((image) => ({
        id: createBlockId(),
        kind: "image",
        raw: `![${image.alt}](${image.src})`,
        start: 0,
        end: 0,
        imageAlt: image.alt,
        imageSrc: image.src,
      }));
      return [...synced.slice(0, safeIndex), ...imageBlocks, ...synced.slice(safeIndex)];
    });
  }, []);

  const handleFullPaste = useCallback(
    async (event: ClipboardEvent<HTMLElement>, blockId: string) => {
      const images = await getPastedImages(event);
      if (images.length) {
        event.preventDefault();
        insertImagesAfterBlock(blockId, images);
        return;
      }

      plainPaste(event);
    },
    [insertImagesAfterBlock],
  );

  const handleAnnotationPaste = useCallback(async (event: ClipboardEvent<HTMLDivElement>) => {
    const images = await getPastedImages(event);
    if (images.length) {
      event.preventDefault();
      if (annotationRef.current) {
        insertImagesIntoEditable(annotationRef.current, images);
      }
      return;
    }

    plainPaste(event);
  }, []);

  const handleAnnotationFocus = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.innerText.trim() === ANNOTATION_PLACEHOLDER) {
      event.currentTarget.textContent = "";
    }
  }, []);

  const handleAnnotationBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!editableDomToMarkdown(event.currentTarget)) {
      event.currentTarget.textContent = ANNOTATION_PLACEHOLDER;
    }
  }, []);

  const save = useCallback(async () => {
    setError("");

    const nextSource =
      mode === "annotation"
        ? insertMarkdownBlock(
            normalizedSource,
            buildAnnotationBlock(
              annotationRef.current && editableDomToMarkdown(annotationRef.current) !== ANNOTATION_PLACEHOLDER
                ? editableDomToMarkdown(annotationRef.current)
                : "",
            ),
            getInsertionOffset(normalizedSource, parsedBlocks, annotationInsertionIndex),
          )
        : blocksToMarkdown(fullBlocks, fullBlockRefs.current);

    if (!nextSource.trim()) {
      setError("内容不能为空。");
      return;
    }

    if (nextSource.trimEnd() === normalizedSource.trimEnd()) {
      setError(mode === "annotation" ? "请先输入要插入的注释内容。" : "没有可保存的改动。");
      return;
    }

    try {
      await onSave(`${nextSource.trimEnd()}\n`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败，请稍后重试。");
    }
  }, [annotationInsertionIndex, fullBlocks, mode, normalizedSource, onSave, parsedBlocks]);

  if (mode === null) {
    return (
      <section className="rounded-apple border border-primary/25 bg-primary/[0.04] p-4 shadow-card">
        <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          选择编辑方式
          <span className="ui-en ml-1">Choose Edit Mode</span>
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onModeChange("annotation")}
            className="rounded-apple border border-primary/30 bg-card px-4 py-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/70 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block font-display text-[22px] font-semibold tracking-tightDisplay text-foreground">
              笔记注释
              <span className="ui-en ml-2 text-[0.65em] font-normal text-muted-foreground">Annotation</span>
            </span>
            <span className="mt-2 block font-text text-[13px] leading-[1.5] text-muted-foreground">
              原文保持只读；在渲染后的笔记中点击插入位置，然后直接写一个醒目的引用注释。
            </span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange("full")}
            className="rounded-apple border border-border bg-card px-4 py-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block font-display text-[22px] font-semibold tracking-tightDisplay text-foreground">
              全文编辑
              <span className="ui-en ml-2 text-[0.65em] font-normal text-muted-foreground">Full Edit</span>
            </span>
            <span className="mt-2 block font-text text-[13px] leading-[1.5] text-muted-foreground">
              像 Typora 一样在排版后的标题、段落、列表和图片上直接修改。
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="btn-apple-link mt-4 inline-flex px-3 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
        >
          取消
          <span className="ui-en ml-1">Cancel</span>
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-apple border border-primary/25 bg-primary/[0.04] p-4 shadow-card">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {mode === "annotation" ? "笔记注释模式" : "全文编辑模式"}
            <span className="ui-en ml-1">{mode === "annotation" ? "Annotation Mode" : "Full Edit Mode"}</span>
          </p>
          <p className="mt-1 font-text text-[12px] leading-[1.45] text-muted-foreground">
            {mode === "annotation"
              ? "点击正文中的块选择插入位置，然后在出现的引用块里直接编辑；粘贴图片会立即以图片形式显示。"
              : "这里显示的是渲染后的笔记，不是 Markdown 代码框；点击任意块即可直接修改。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onModeChange("annotation")}
            className={`rounded-capsule border px-3 py-1 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mode === "annotation"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            笔记注释
          </button>
          <button
            type="button"
            onClick={() => onModeChange("full")}
            className={`rounded-capsule border px-3 py-1 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mode === "full"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            全文编辑
          </button>
        </div>
      </header>

      {mode === "annotation" ? (
        <div className="note-prose drake-theme rounded-apple border border-border bg-card px-4 py-5">
          {parsedBlocks.length === 0 ? (
            <div
              ref={annotationRef}
              contentEditable
              suppressContentEditableWarning
              onPaste={handleAnnotationPaste}
              onFocus={handleAnnotationFocus}
              onBlur={handleAnnotationBlur}
              className="my-4 min-h-[140px] rounded-apple border-l-[3px] border-primary/70 bg-primary/[0.08] px-4 py-3 font-text text-[16px] italic leading-[1.6] text-foreground outline-none ring-1 ring-primary/15 focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              {ANNOTATION_PLACEHOLDER}
            </div>
          ) : (
            parsedBlocks.map((block, index) => (
              <div key={block.id}>
                {annotationInsertionIndex === index ? (
                  <div
                    ref={annotationRef}
                    contentEditable
                    suppressContentEditableWarning
                    onPaste={handleAnnotationPaste}
                    onFocus={handleAnnotationFocus}
                    onBlur={handleAnnotationBlur}
                    className="my-6 min-h-[120px] rounded-apple border-l-[3px] border-primary/70 bg-primary/[0.08] px-4 py-3 font-text text-[16px] italic leading-[1.6] text-foreground outline-none shadow-card/20 ring-1 ring-primary/15 focus-visible:ring-2 focus-visible:ring-primary/35"
                  >
                    {ANNOTATION_PLACEHOLDER}
                  </div>
                ) : null}
                <RenderedReadOnlyBlock
                  block={block}
                  selected={annotationInsertionIndex === index || annotationInsertionIndex === index + 1}
                  onSelect={(before) => setAnnotationInsertionIndex(before ? index : index + 1)}
                />
                {annotationInsertionIndex === index + 1 && index === parsedBlocks.length - 1 ? (
                  <div
                    ref={annotationRef}
                    contentEditable
                    suppressContentEditableWarning
                    onPaste={handleAnnotationPaste}
                    onFocus={handleAnnotationFocus}
                    onBlur={handleAnnotationBlur}
                    className="my-6 min-h-[120px] rounded-apple border-l-[3px] border-primary/70 bg-primary/[0.08] px-4 py-3 font-text text-[16px] italic leading-[1.6] text-foreground outline-none shadow-card/20 ring-1 ring-primary/15 focus-visible:ring-2 focus-visible:ring-primary/35"
                  >
                    {ANNOTATION_PLACEHOLDER}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="note-prose drake-theme rounded-apple border border-border bg-card px-4 py-5">
          {fullBlocks.length ? (
            fullBlocks.map((block) => (
              <EditableBlockView
                key={block.id}
                block={block}
                setRef={setFullBlockRef}
                onFocus={(id) => {
                  activeBlockIdRef.current = id;
                }}
                onPaste={(event, id) => void handleFullPaste(event, id)}
              />
            ))
          ) : (
            <p
              ref={(node) => setFullBlockRef("empty", node)}
              contentEditable
              suppressContentEditableWarning
              className="my-5 min-h-[160px] rounded-apple px-3 py-2 font-text text-[17px] leading-[1.7] tracking-tightBody text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              开始输入笔记内容...
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              syncFullBlocks();
              setFullBlocks((current) => [
                ...syncBlocksFromDom(current, fullBlockRefs.current),
                {
                  id: createBlockId(),
                  kind: "paragraph",
                  raw: "",
                  start: 0,
                  end: 0,
                  text: "新的段落",
                },
              ]);
            }}
            className="mt-4 rounded-capsule border border-border px-3 py-1 font-text text-[12px] text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            添加段落
            <span className="ui-en ml-1">Add paragraph</span>
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[14px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
        >
          {saving ? "保存中..." : mode === "annotation" ? "保存注释" : "保存全文"}
          <span className="ui-en ml-1">
            {saving ? "Saving..." : mode === "annotation" ? "Save Annotation" : "Save Full Note"}
          </span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
        >
          取消
          <span className="ui-en ml-1">Cancel</span>
        </button>
      </div>
    </section>
  );
}
